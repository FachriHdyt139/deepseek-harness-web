import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const require = createRequire(import.meta.url);

function dshEntry() {
  try {
    return join(dirname(require.resolve("@deepseek-ai/dsh/package.json")), "lib", "bin.js");
  } catch {
    return null;
  }
}

const entry = dshEntry();
if (!entry) {
  console.log("[harness-init] @deepseek-ai/dsh not installed, skipping profile initialization.");
  process.exit(0);
}

const home = process.env.DSH_HOME || join(resolve(process.cwd(), "data"), "dsh-home");
mkdirSync(home, { recursive: true, mode: 0o700 });

const port = Number(process.env.HARNESS_INIT_PORT || 3997);
const workspace = resolve(process.cwd(), "data", "init-workspace");
mkdirSync(workspace, { recursive: true });

const args = [entry, "web", "--no-open", "--port", String(port), "--host", "127.0.0.1"];
const child = spawn(process.execPath, args, {
  cwd: workspace,
  env: { ...process.env, DSH_HOME: home },
  stdio: ["ignore", "pipe", "pipe"],
});

let output = "";
let ready = false;
const timer = setTimeout(() => finish(ready ? 0 : 1), 180_000);

function finish(code) {
  clearTimeout(timer);
  try {
    child.kill("SIGTERM");
  } catch {
    /* already exited */
  }
  setTimeout(() => {
    try {
      child.kill("SIGKILL");
    } catch {
      /* already exited */
    }
    process.exit(code);
  }, 3000).unref?.();
}

child.stdout.on("data", (chunk) => {
  output += chunk.toString();
  if (!ready && /dsh web:\s+\S+/.test(output)) {
    ready = true;
    console.log("[harness-init] profile ready");
    finish(0);
  }
});
child.stderr.on("data", (chunk) => {
  output += chunk.toString();
});
child.on("error", (error) => {
  console.error(`[harness-init] spawn failed: ${error.message}`);
  if (process.env.HARNESS_INIT_STRICT === "1") process.exit(1);
  process.exit(0);
});
child.on("exit", (code) => {
  if (!ready) {
    console.error(`[harness-init] dsh exited before ready with code ${code}`);
    console.error(output.slice(-4000));
    if (process.env.HARNESS_INIT_STRICT === "1") process.exit(1);
  }
  process.exit(0);
});

console.log(`[harness-init] preparing the DeepSeek Harness profile in ${home}`);
if (existsSync(home)) console.log("[harness-init] DSH_HOME exists");
