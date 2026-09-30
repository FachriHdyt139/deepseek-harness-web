import { Router } from "express";
import { config, features } from "../config.js";

const startedAt = Date.now();

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({
    status: "ok",
    uptime_seconds: Math.round((Date.now() - startedAt) / 1000),
    node_env: config.nodeEnv,
    features: Object.fromEntries(Object.entries(features).map(([key, value]) => [key, value])),
  });
});
