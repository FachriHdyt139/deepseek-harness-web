import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { config, features } from "../config.js";
import { logger } from "../logger.js";
import { busy } from "../utils/errors.js";
import { dshHome, workspaceRoot } from "../utils/paths.js";
import { restoreHarnessState, syncHarnessState } from "./harnessState.js";

const require = createRequire(import.meta.url);
const START_TIMEOUT_MS = 90_000;
const STOP_TIMEOUT_MS = 10_000;

function resolveDshEntry() {
  try {
    const manifest = require.resolve("@deepseek-ai/dsh/package.json");
    return join(dirname(manifest), "lib", "bin.js");
  } catch {
    return null;
  }
}

export class HarnessService {
  constructor() {
    this.child = null;
    this.starting = null;
    this.ready = false;
    this.token = null;
    this.cwd = null;
    this.projectId = null;
    this.userId = null;
    this.startedAt = 0;
    this.lastActivity = 0;
    this.idleTimer = null;
    this.exitPromise = null;
    this.output = [];
    this.raw = "";
  }

  status() {
    return {
      running: Boolean(this.child) || Boolean(this.starting),
      starting: Boolean(this.starting) && !this.ready,
      ready: this.ready,
      projectId: this.projectId,
      port: this.child ? config.harnessPort : null,
      hasToken: Boolean(this.token),
      uptimeMs: this.ready ? Date.now() - this.startedAt : 0,
      idleMinutes: config.limits.sessionTimeoutMinutes,
    };
  }

  async ensure({ cwd, projectId, userId = null, trustedHosts = [] }) {
    if (userId) this.userId = userId;
    if (this.ready && this.cwd === cwd && this.child && !this.child.killed) {
      this.touch();
      return this.status();
    }
    if (this.starting) {
      if (this.cwd === cwd) {
        await this.starting;
        return this.status();
      }
      throw busy("Another AI session is starting. Please wait.");
    }
    if (this.child && this.child.pid) {
      if (config.limits.maxActiveSessions <= 1) {
        await this.stop("project-switch");
      } else if (this.cwd !== cwd) {
        throw busy("Server busy. Please wait for the current AI session to finish.");
      }
    }
    this.cwd = cwd;
    this.projectId = projectId;
    this.starting = this.#start(cwd, trustedHosts)
      .catch((error) => {
        this.starting = null;
        throw error;
      })
      .finally(() => {
        this.starting = null;
      });
    await this.starting;
    return this.status();
  }

  async #start(cwd, trustedHosts) {
    if (this.userId) {
      await restoreHarnessState(this.userId).catch((error) => {
        logger.warn("harness_state_restore_error", { message: error.message });
      });
    }
    const entry = resolveDshEntry();
    if (!entry) {
      throw busy("DeepSeek Harness is not installed. Run npm ci first.");
    }
    mkdirSync(cwd, { recursive: true });

    const args = [
      entry,
      "web",
      "--no-open",
      "--port",
      String(config.harnessPort),
      "--host",
      "127.0.0.1",
    ];
    const hosts = new Set([
      ...trustedHosts,
      ...config.trustedHost.split(",").map((value) => value.trim()).filter(Boolean),
      "127.0.0.1",
      "localhost",
      "localhost:5173",
      "127.0.0.1:5173",
      "localhost:3000",
      "127.0.0.1:3000",
    ]);
    args.push("--trusted-host", ...hosts);

    const env = {
      ...process.env,
      DSH_HOME: dshHome(),
      NODE_ENV: config.nodeEnv,
      ...(features.ai
        ? {
            DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || config.ai.apiKey,
            ...(config.ai.baseUrl ? { AI_BASE_URL: config.ai.baseUrl } : {}),
            ...(config.ai.model ? { AI_MODEL: config.ai.model } : {}),
          }
        : {}),
    };

    logger.info("harness_starting", { port: config.harnessPort, projectId: this.projectId });
    const child = spawn(process.execPath, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.child = child;
    this.ready = false;
    this.token = null;
    this.output = [];
    this.raw = "";

    const captured = { token: null };
    const onData = (chunk) => {
      const text = chunk.toString();
      this.#record(text);
      const match = text.match(/dsh web:\s+(\S+)/);
      if (match) captured.token = extractToken(match[1]);
      if (match && !this.ready) {
        this.ready = true;
        this.token = captured.token;
        this.startedAt = Date.now();
        this.touch();
        logger.info("harness_ready", { port: config.harnessPort, hasToken: Boolean(this.token) });
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", (chunk) => this.#record(chunk.toString()));

    this.exitPromise = new Promise((resolveExit) => {
      child.once("exit", (code, signal) => {
        logger.warn("harness_exited", { code, signal });
        this.child = null;
        this.ready = false;
        this.token = null;
        this.clearIdleTimer();
        resolveExit({ code, signal });
      });
      child.once("error", (error) => {
        logger.error("harness_spawn_error", { message: error.message });
        this.child = null;
        this.ready = false;
        resolveExit({ error: error.message });
      });
    });

    try {
      await waitFor(() => this.ready || !this.child, START_TIMEOUT_MS);
    } catch (error) {
      await this.stop("start-timeout");
      throw busy(
        `The AI engine did not start: ${error.message}. Check the server logs and environment variables.`,
      );
    }
    if (!this.ready) {
      const detail = extractFailure(this.raw);
      await this.stop("start-failed");
      throw busy(
        `The AI engine exited before it was ready.${detail ? ` ${detail}` : " Check the server logs."}`,
      );
    }
  }

  #record(text) {
    this.raw = `${this.raw}${text}`.slice(-8000);
    const lines = text.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      this.output.push(trimmed);
      if (this.output.length > 60) this.output.shift();
      logger.info("harness_output", { line: trimmed.slice(0, 500) });
    }
  }

  touch() {
    this.lastActivity = Date.now();
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (!this.child) return;
    this.idleTimer = setTimeout(() => {
      const idleMs = Date.now() - this.lastActivity;
      if (idleMs >= config.limits.sessionTimeoutMinutes * 60_000) {
        this.stop("idle-timeout").catch(() => {});
      }
    }, config.limits.sessionTimeoutMinutes * 60_000);
    this.idleTimer.unref?.();
  }

  clearIdleTimer() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  async stop(reason = "shutdown") {
    this.clearIdleTimer();
    const child = this.child;
    if (!child) {
      this.ready = false;
      this.token = null;
      return;
    }
    logger.info("harness_stopping", { reason });
    const exited = this.exitPromise;
    try {
      child.kill("SIGTERM");
    } catch {
      /* already gone */
    }
    const timeout = new Promise((resolveTimer) =>
      setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          /* already gone */
        }
        resolveTimer();
      }, STOP_TIMEOUT_MS),
    );
    await Promise.race([exited, timeout]);
    this.child = null;
    this.ready = false;
    this.token = null;
    this.cwd = null;
    this.projectId = null;
    this.userId = null;
  }

  async shutdown() {
    await this.stop("shutdown");
  }

  recentOutput() {
    return this.output.slice(-20);
  }
}

function extractFailure(raw) {
  const jsonMessage = raw.match(/"message"\s*:\s*"([^"]{1,400})"/);
  if (jsonMessage) return jsonMessage[1].slice(0, 300);
  const errorLine = raw.match(/(Error[^\n]{1,300})/);
  if (errorLine) return errorLine[1].trim().slice(0, 300);
  const lines = raw.split("\n").map((line) => line.trim()).filter(Boolean);
  return (lines.at(-1) || "").slice(0, 300);
}

function extractToken(url) {
  try {
    const parsed = new URL(url, "http://127.0.0.1");
    return parsed.searchParams.get("token");
  } catch {
    return null;
  }
}

function waitFor(predicate, timeoutMs) {
  return new Promise((resolvePromise, rejectPromise) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (predicate()) {
        clearInterval(timer);
        resolvePromise();
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        rejectPromise(new Error("startup timeout"));
      }
    }, 250);
    timer.unref?.();
  });
}

export function cleanWorkspace(projectId) {
  const dir = join(workspaceRoot(), projectId);
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
}

export const harness = new HarnessService();
