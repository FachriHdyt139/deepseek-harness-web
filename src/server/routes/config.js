import { Router } from "express";
import { config, features } from "../config.js";
import { authRouter } from "./auth.js";

export const configRouter = Router();

configRouter.get("/api/config", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({
    supabase: features.supabase
      ? { url: config.supabase.url, anonKey: config.supabase.anonKey }
      : null,
    features,
    limits: config.limits,
    github: features.github ? { clientId: config.github.clientId } : null,
  });
});

export { authRouter };
