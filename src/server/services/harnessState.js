import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import AdmZip from "adm-zip";
import { features } from "../config.js";
import { logger } from "../logger.js";
import { getAdminSupabase } from "./supabase.js";
import { dshHome } from "../utils/paths.js";

/**
 * Chat history and harness profile persistence.
 *
 * The harness keeps threads, settings and plugin state under DSH_HOME. Render
 * has no persistent disk, so that folder is mirrored to Supabase Storage and
 * restored on the next cold start.
 */

const BUCKET = "harness-state";
const SKIP_DIRS = new Set(["node_modules", ".git", ".cache", ".tmp", "logs", "log"]);
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 24 * 1024 * 1024;
const RESTORE_MARKER = ".dhw-restored";

function statePath(userId) {
  return `${userId}/state.zip`;
}

function walk(base, visit, skipDirs) {
  const stack = [base];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (skipDirs.has(entry.name)) continue;
        stack.push(full);
        continue;
      }
      if (entry.isFile()) visit(full);
    }
  }
}

export function hasHarnessState() {
  const home = dshHome();
  if (existsSync(join(home, RESTORE_MARKER))) return true;
  try {
    return readdirSync(home).length > 0;
  } catch {
    return false;
  }
}

export async function restoreHarnessState(userId) {
  if (!features.supabase || !userId || hasHarnessState()) return false;

  let blob;
  try {
    const { data, error } = await getAdminSupabase().storage.from(BUCKET).download(statePath(userId));
    if (error || !data) return false;
    blob = Buffer.from(await data.arrayBuffer());
  } catch (error) {
    logger.warn("harness_state_restore_failed", { message: error.message });
    return false;
  }

  try {
    const home = dshHome();
    mkdirSync(home, { recursive: true, mode: 0o700 });
    const zip = new AdmZip(blob);
    let files = 0;
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue;
      const name = entry.entryName;
      if (name.includes("\0") || name.startsWith("/") || /(^|\/)\.\.(\/|$)/.test(name)) continue;
      const target = join(home, name);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, entry.getData());
      files += 1;
    }
    writeFileSync(join(home, RESTORE_MARKER), new Date().toISOString());
    logger.info("harness_state_restored", { files, bytes: blob.length });
    return true;
  } catch (error) {
    logger.warn("harness_state_extract_failed", { message: error.message });
    return false;
  }
}

export async function syncHarnessState(userId) {
  if (!features.supabase || !userId) return { uploaded: 0, skipped: true };

  const home = dshHome();
  if (!existsSync(home)) return { uploaded: 0, skipped: true };

  const zip = new AdmZip();
  let total = 0;
  let files = 0;
  try {
    walk(
      home,
      (full) => {
        const info = statSync(full);
        if (info.size > MAX_FILE_BYTES || total + info.size > MAX_TOTAL_BYTES) return;
        const rel = relative(home, full).split(sep).join("/");
        if (rel === RESTORE_MARKER) return;
        zip.addFile(rel, readFileSync(full));
        total += info.size;
        files += 1;
      },
      SKIP_DIRS,
    );
  } catch (error) {
    logger.warn("harness_state_pack_failed", { message: error.message });
    return { uploaded: 0, skipped: true };
  }

  if (files === 0) return { uploaded: 0, skipped: true };

  try {
    const buffer = zip.toBuffer();
    const { error } = await getAdminSupabase()
      .storage.from(BUCKET)
      .upload(statePath(userId), buffer, { upsert: true, contentType: "application/zip" });
    if (error) throw new Error(error.message);
    logger.info("harness_state_synced", { files, bytes: buffer.length });
    return { uploaded: buffer.length, files };
  } catch (error) {
    logger.warn("harness_state_sync_failed", { message: error.message });
    return { uploaded: 0, skipped: true, error: error.message };
  }
}

export const HARNESS_STATE_BUCKET = BUCKET;
