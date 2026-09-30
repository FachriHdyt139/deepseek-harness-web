import { Router } from "express";
import { config } from "../config.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { authenticate } from "../middleware/authenticate.js";
import { getSupabase, supabaseConfigured } from "../services/supabase.js";
import { unauthorized, unavailable } from "../utils/errors.js";

const COOKIE_NAME = "dhw-access";
const ONE_WEEK = 60 * 60 * 24 * 7;

export const authRouter = Router();

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProduction,
    path: "/",
    maxAge: ONE_WEEK * 1000,
  };
}

authRouter.post(
  "/api/auth/session",
  asyncHandler(async (req, res) => {
    if (!supabaseConfigured()) {
      throw unavailable("Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY.");
    }
    const token = req.body?.access_token;
    if (!token) throw unauthorized("Missing access token.");

    const { data, error } = await getSupabase().auth.getUser(token);
    if (error || !data?.user) throw unauthorized("Invalid or expired session.");

    res.cookie(COOKIE_NAME, token, cookieOptions());
    res.json({ user: { id: data.user.id, email: data.user.email } });
  }),
);

authRouter.delete("/api/auth/session", (_req, res) => {
  res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: undefined });
  res.json({ ok: true });
});

authRouter.get(
  "/api/auth/me",
  authenticate,
  asyncHandler(async (req, res) => {
    res.json({ user: req.user });
  }),
);
