import { createClient } from "@supabase/supabase-js";
import { config } from "../config.js";
import { unavailable } from "../utils/errors.js";

let anonClient = null;
let adminClient = null;

function ensureConfigured() {
  if (!config.supabase.url || !config.supabase.anonKey) {
    throw unavailable(
      "Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in the environment.",
    );
  }
}

export function getSupabase() {
  ensureConfigured();
  if (!anonClient) {
    anonClient = createClient(config.supabase.url, config.supabase.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return anonClient;
}

export function getAdminSupabase() {
  ensureConfigured();
  if (!config.supabase.serviceRoleKey) {
    throw unavailable("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  }
  if (!adminClient) {
    adminClient = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return adminClient;
}

export function supabaseConfigured() {
  return Boolean(config.supabase.url && config.supabase.anonKey);
}
