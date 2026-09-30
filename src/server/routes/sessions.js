import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { authenticate } from "../middleware/authenticate.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { config } from "../config.js";
import {
  createSession,
  getSession,
  getProject,
  listMessages,
  listSessions,
  setSessionStatus,
} from "../services/db.js";
import { harness } from "../services/harness.js";
import { restoreWorkspace } from "../services/workspace.js";
import { badRequest } from "../utils/errors.js";
import { projectDir } from "../utils/paths.js";

export const sessionsRouter = Router();
// Scoped to /api, see the note in projects.js.
sessionsRouter.use("/api", authenticate);

async function requireSession(req) {
  return getSession(req.user.id, req.params.id);
}

function clampInt(value, min, max, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function trustedHostsFrom(req) {
  const hosts = new Set();
  const host = req.get("host");
  const origin = req.get("origin");
  if (host) hosts.add(host);
  if (origin) {
    try {
      const url = new URL(origin);
      hosts.add(url.host);
      hosts.add(url.hostname);
    } catch {
      /* ignore malformed origin */
    }
  }
  return [...hosts];
}

sessionsRouter.post(
  "/api/sessions",
  rateLimit({ max: 10, key: "session-start" }),
  asyncHandler(async (req, res) => {
    const projectId = String(req.body?.projectId || "");
    if (!projectId) throw badRequest("projectId is required.");
    const project = await getProject(req.user.id, projectId);

    await restoreWorkspace(req.user.id, project.id);
    const status = await harness.ensure({
      cwd: projectDir(project.id),
      projectId: project.id,
      userId: req.user.id,
      trustedHosts: trustedHostsFrom(req),
    });

    const session = await createSession(req.user.id, project.id, String(req.body?.title || project.name));
    res.status(201).json({ session, harness: status });
  }),
);

sessionsRouter.get(
  "/api/sessions",
  asyncHandler(async (req, res) => {
    const projectId = req.query.projectId ? String(req.query.projectId) : undefined;
    if (projectId) await getProject(req.user.id, projectId);
    const sessions = await listSessions(req.user.id, projectId);
    res.json({ sessions });
  }),
);

sessionsRouter.get(
  "/api/sessions/:id/messages",
  asyncHandler(async (req, res) => {
    const session = await requireSession(req);
    const limit = clampInt(req.query.limit, 1, 100, 50);
    const offset = clampInt(req.query.offset, 0, 100000, 0);
    const messages = await listMessages(req.user.id, session.id, { limit, offset });
    res.json({ messages, limit, offset, total: messages.length });
  }),
);

sessionsRouter.get(
  "/api/sessions/:id",
  asyncHandler(async (req, res) => {
    const session = await requireSession(req);
    res.json({ session, harness: harness.status(), logs: harness.recentOutput() });
  }),
);

sessionsRouter.delete(
  "/api/sessions/:id",
  asyncHandler(async (req, res) => {
    const session = await requireSession(req);
    await setSessionStatus(req.user.id, session.id, "stopped");
    if (harness.status().projectId === session.project_id) {
      await harness.stop("user-request");
    }
    res.json({ ok: true });
  }),
);

sessionsRouter.post(
  "/api/sessions/:id/message",
  rateLimit({ max: config.limits.maxChatRequestsPerMinute, key: "chat" }),
  (_req, res) => {
    res.status(501).json({
      error: {
        code: "chat_via_harness_gui",
        message:
          "Chat streaming is provided by the DeepSeek Harness GUI embedded in the workspace. Open the AI Chat panel to talk to the agent.",
      },
    });
  },
);

sessionsRouter.get("/api/sessions/:id/events", async (req, res) => {
  await requireSession(req);

  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  let lastPayload = "";
  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const snapshot = () => JSON.stringify({ harness: harness.status(), logs: harness.recentOutput() });
  send("status", JSON.parse(snapshot()));
  lastPayload = snapshot();

  const timer = setInterval(() => {
    const payload = snapshot();
    if (payload !== lastPayload) {
      lastPayload = payload;
      send("status", JSON.parse(payload));
    }
    res.write(": keep-alive\n\n");
  }, 1500);

  const onClose = () => {
    clearInterval(timer);
    res.end();
  };
  req.on("close", onClose);
  res.on("close", onClose);
});

export const harnessRouter = Router();

harnessRouter.get("/api/harness/status", (_req, res) => {
  res.json({ harness: harness.status(), logs: harness.recentOutput() });
});

harnessRouter.post(
  "/api/harness/stop",
  authenticate,
  asyncHandler(async (_req, res) => {
    await harness.stop("user-request");
    res.json({ ok: true });
  }),
);
