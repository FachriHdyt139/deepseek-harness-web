import express from "express";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config, features, missingRequiredEnv } from "./config.js";
import { logger } from "./logger.js";
import { errorHandler, notFoundHandler, asyncHandler } from "./middleware/errorHandler.js";
import { startRateLimitCleanup } from "./middleware/rateLimit.js";
import { authenticate } from "./middleware/authenticate.js";
import { healthRouter } from "./routes/health.js";
import { configRouter } from "./routes/config.js";
import { authRouter } from "./routes/auth.js";
import { projectsRouter } from "./routes/projects.js";
import { sessionsRouter, harnessRouter } from "./routes/sessions.js";
import { githubRouter } from "./routes/github.js";
import { getSupabase } from "./services/supabase.js";
import { harness } from "./services/harness.js";
import { HARNESS_PREFIX, harnessProxy, handleUpgrade } from "./proxy/harnessProxy.js";

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(process.cwd(), "public");

const SPA_ROUTES = /^\/(login|dashboard|settings|forgot-password)$/;

/**
 * The browser talks to Supabase directly (signInWithPassword, signUp, session
 * refresh), so its origin has to be allowed by connect-src. Without it the
 * browser cancels the request and supabase-js surfaces a bare "Failed to
 * fetch" on sign in and sign up.
 *
 * Derived from SUPABASE_URL so we allow exactly this project's host instead
 * of a blanket *.supabase.co rule.
 */
function supabaseConnectSrc() {
  if (!config.supabase.url) return "";
  try {
    return ` ${new URL(config.supabase.url).origin}`;
  } catch {
    return "";
  }
}

function securityHeaders(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      `connect-src 'self' ws: wss:${supabaseConnectSrc()}`,
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  );
  if (config.isProduction && req.secure) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
}

async function readSessionToken(req) {
  const header = req.get("authorization") || "";
  const [scheme, token] = header.split(" ");
  if (token && scheme?.toLowerCase() === "bearer") return token;
  const cookies = req.get("cookie") || "";
  for (const part of cookies.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === "dhw-access") return decodeURIComponent(rest.join("="));
  }
  return null;
}

function wantsHtml(req) {
  return req.method === "GET" && (req.get("accept") || "").includes("text/html");
}

async function requireBrowserSession(req, res, next) {
  if (!features.supabase) return next();
  try {
    const token = await readSessionToken(req);
    if (!token) throw new Error("missing");
    const { data, error } = await getSupabase().auth.getUser(token);
    if (error || !data?.user) throw new Error("invalid");
    req.user = { id: data.user.id, email: data.user.email };
    return next();
  } catch {
    if (wantsHtml(req)) {
      const next_ = encodeURIComponent(req.originalUrl || "/");
      return res.redirect(`/login?next=${next_}`);
    }
    return res.status(401).json({ error: { message: "Authentication required.", code: "unauthorized" } });
  }
}

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(securityHeaders);
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false, limit: "64kb" }));

  const missing = missingRequiredEnv();
  if (missing.length) {
    logger.error("missing_environment", { missing });
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  startRateLimitCleanup();

  app.use(healthRouter);
  app.use(configRouter);
  app.use(authRouter);
  app.use(harnessRouter);
  app.use(projectsRouter);
  app.use(sessionsRouter);
  app.use(githubRouter);

  app.use("/_app", express.static(join(publicDir, "_app"), { index: false, maxAge: "7d" }));
  app.use(express.static(publicDir, { index: false, maxAge: "7d" }));

  app.get("/", (req, res) => {
    if (wantsHtml(req)) return res.redirect("/dashboard");
    res.status(200).json({ name: "deepseek-harness-web", docs: "/docs/API.md" });
  });

  app.get(
    "/project/:id",
    (req, res, next) => {
      if (!features.supabase) return next();
      return requireBrowserSession(req, res, next);
    },
    serveSpa,
  );

  app.get(SPA_ROUTES, (req, res, next) => {
    if (req.path === "/login") return serveSpa(req, res, next);
    if (!features.supabase) return serveSpa(req, res, next);
    return requireBrowserSession(req, res, next);
  }, serveSpa);

  app.use(HARNESS_PREFIX, requireBrowserSession, harnessProxy);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

function serveSpa(req, res) {
  const index = join(publicDir, "index.html");
  if (!existsSync(index)) {
    res
      .status(503)
      .type("text/plain")
      .send("Frontend build not found. Run `npm run build` first.");
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(index);
}

export { handleUpgrade, asyncHandler, authenticate };
