import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadDotEnv() {
  const file = resolve(process.cwd(), ".env");
  if (!existsSync(file)) return false;
  try {
    process.loadEnvFile(file);
    return true;
  } catch {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (!(key in process.env)) process.env[key] = value;
    }
    return true;
  }
}

function int(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : fallback;
}

export function loadEnv() {
  loadDotEnv();
}

loadEnv();

const nodeEnv = process.env.NODE_ENV || "development";
const isProduction = nodeEnv === "production";

export const config = {
  nodeEnv,
  isProduction,
  port: int("PORT", 3000),
  harnessPort: int("HARNESS_PORT", 3099),

  supabase: {
    url: process.env.SUPABASE_URL || "",
    anonKey: process.env.SUPABASE_ANON_KEY || "",
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  },

  ai: {
    provider: process.env.AI_PROVIDER || "deepseek",
    apiKey: process.env.DEEPSEEK_API_KEY || process.env.AI_API_KEY || "",
    baseUrl: process.env.AI_BASE_URL || "",
    model: process.env.AI_MODEL || "",
  },

  github: {
    clientId: process.env.GITHUB_CLIENT_ID || "",
    clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
  },

  trustedHost: process.env.TRUSTED_HOST || process.env.RENDER_EXTERNAL_HOSTNAME || "",

  limits: {
    maxUploadMb: int("MAX_UPLOAD_MB", 50),
    maxActiveSessions: int("MAX_ACTIVE_SESSIONS", 1),
    sessionTimeoutMinutes: int("SESSION_TIMEOUT_MINUTES", 30),
    maxChatRequestsPerMinute: int("MAX_CHAT_REQUESTS_PER_MINUTE", 10),
    maxPromptChars: int("MAX_PROMPT_CHARS", 20000),
    maxToolOutputChars: int("MAX_TOOL_OUTPUT_CHARS", 20000),
  },
};

export function missingRequiredEnv() {
  if (!isProduction) return [];
  const missing = [];
  if (!config.supabase.url) missing.push("SUPABASE_URL");
  if (!config.supabase.anonKey) missing.push("SUPABASE_ANON_KEY");
  if (!config.supabase.serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  return missing;
}

export const features = {
  supabase: Boolean(config.supabase.url && config.supabase.anonKey),
  github: Boolean(config.github.clientId && config.github.clientSecret),
  ai: Boolean(config.ai.apiKey),
};
