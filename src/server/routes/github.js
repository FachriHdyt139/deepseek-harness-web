import { Router } from "express";
import { features, config } from "../config.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { authenticate } from "../middleware/authenticate.js";
import { badRequest, unauthorized, unavailable } from "../utils/errors.js";

export const githubRouter = Router();

githubRouter.get("/api/github/status", (_req, res) => {
  res.json({ configured: features.github });
});

githubRouter.get(
  "/api/github/auth",
  authenticate,
  asyncHandler(async (req, res) => {
    if (!features.github) {
      throw unavailable("GitHub OAuth is not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.");
    }
    const state = `${req.user.id}.${Date.now()}`;
    res.cookie("dhw-gh-state", state, {
      httpOnly: true,
      sameSite: "lax",
      secure: config.isProduction,
      path: "/api/github",
      maxAge: 10 * 60 * 1000,
    });
    const params = new URLSearchParams({
      client_id: config.github.clientId,
      redirect_uri: buildRedirectUri(req),
      scope: "repo read:user",
      state,
    });
    res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
  }),
);

githubRouter.get(
  "/api/github/callback",
  asyncHandler(async (req, res) => {
    if (!features.github) throw unavailable("GitHub OAuth is not configured.");
    const { code, state } = req.query;
    const cookieState = readCookie(req, "dhw-gh-state");
    if (!code || !state || !cookieState || state !== cookieState || !String(state).startsWith(".")) {
      throw badRequest("Invalid GitHub OAuth response.");
    }
    res.clearCookie("dhw-gh-state", { path: "/api/github" });

    const token = await exchangeCode(String(code), buildRedirectUri(req));
    // Keep the token out of the URL: it would otherwise leak into browser
    // history, referrers and access logs.
    res.cookie("dhw-gh-token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: config.isProduction,
      path: "/",
      maxAge: 8 * 60 * 60 * 1000,
    });
    res.redirect("/dashboard?github=connected");
  }),
);

githubRouter.get(
  "/api/github/connection",
  authenticate,
  asyncHandler((req, res) => {
    res.json({ connected: Boolean(readCookie(req, "dhw-gh-token")) });
  }),
);

githubRouter.delete(
  "/api/github/connection",
  authenticate,
  asyncHandler((_req, res) => {
    res.clearCookie("dhw-gh-token", { path: "/" });
    res.json({ ok: true });
  }),
);

function buildRedirectUri(req) {
  const host = req.get("x-forwarded-host") || req.get("host");
  const proto = req.get("x-forwarded-proto") || req.protocol || "https";
  return `${proto}://${host}/api/github/callback`;
}

function readCookie(req, name) {
  const header = req.get("cookie") || "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

async function exchangeCode(code, redirectUri) {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: config.github.clientId,
      client_secret: config.github.clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw unavailable("GitHub did not accept the OAuth exchange.");
  const payload = await response.json();
  if (!payload.access_token) throw unauthorized("GitHub did not return an access token.");
  return payload.access_token;
}
