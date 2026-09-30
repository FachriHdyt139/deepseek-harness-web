import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { readFile, writeFile, mkdir, rm, readdir, rename, stat } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { getAdminSupabase } from "./supabase.js";
import { config, features } from "../config.js";
import { badRequest, notFound, tooLarge, unavailable } from "../utils/errors.js";
import { ensureDir, projectDir, resolveInside, workspaceRoot } from "../utils/paths.js";

const SKIP_DIRS = new Set(["node_modules", ".git", ".cache", ".tmp", "__pycache__", ".next", "dist"]);
const TEXT_LIMIT_BYTES = 2 * 1024 * 1024;
const MAX_TREE_ENTRIES = 4000;

export async function restoreWorkspace(userId, projectId) {
  const base = ensureDir(projectDir(projectId));
  if (!features.supabase) return base;
  const bucket = "projects";
  const prefix = `${userId}/${projectId}/`;
  const supabase = getAdminSupabase();

  let offset = 0;
  const page = 100;
  for (;;) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: page, offset });
    if (error) throw unavailable(`Could not read project storage: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const entry of data) {
      if (entry.id === null) continue; // folder marker
      const storagePath = `${prefix}${entry.name}`;
      const { data: blob, error: downloadError } = await supabase.storage.from(bucket).download(storagePath);
      if (downloadError) throw unavailable(`Could not download ${entry.name}: ${downloadError.message}`);
      const target = resolveInside(base, entry.name);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, Buffer.from(await blob.arrayBuffer()));
    }

    offset += data.length;
    if (data.length < page) break;
  }
  return base;
}

export async function syncWorkspace(userId, projectId) {
  const base = projectDir(projectId);
  if (!existsSync(base)) return { uploaded: 0 };
  if (!features.supabase) return { uploaded: 0, skipped: true };
  const bucket = "projects";
  const supabase = getAdminSupabase();
  let uploaded = 0;

  const walk = async (dir) => {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".env.example") continue;
      const full = join(dir, entry.name);
      const rel = relative(base, full).split(sep).join("/");
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      const info = await stat(full);
      if (info.size > config.limits.maxUploadMb * 1024 * 1024) continue;
      const buffer = await readFile(full);
      const { error } = await supabase.storage
        .from(bucket)
        .upload(`${userId}/${projectId}/${rel}`, buffer, { upsert: true, contentType: mimeFor(entry.name) });
      if (error) throw unavailable(`Could not save ${rel}: ${error.message}`);
      uploaded += 1;
    }
  };

  await walk(base);
  await upsertFiles(userId, projectId, base);
  return { uploaded };
}

export async function deleteProjectStorage(userId, projectId) {
  if (!features.supabase) return;
  const supabase = getAdminSupabase();
  const prefix = `${userId}/${projectId}/`;
  const { data } = await supabase.storage.from("projects").list(prefix, { limit: 1000 });
  if (data?.length) {
    await supabase.storage.from("projects").remove(data.map((entry) => `${prefix}${entry.name}`));
  }
}

async function upsertFiles(userId, projectId, base) {
  const supabase = getAdminSupabase();
  const rows = [];
  const walk = async (dir) => {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      const info = await stat(full);
      const rel = relative(base, full).split(sep).join("/");
      rows.push({
        project_id: projectId,
        user_id: userId,
        path: rel,
        storage_path: `${userId}/${projectId}/${rel}`,
        size: info.size,
        updated_at: new Date().toISOString(),
      });
    }
  };
  await walk(base);
  if (!rows.length) return;
  const { error } = await supabase.from("files").upsert(rows, { onConflict: "project_id,path" });
  if (error) loggerSafe(error);
}

function loggerSafe(error) {
  // Metadata writes must never break the workspace flow.
  process.stderr.write(`[WARN] files upsert failed: ${error.message}\n`);
}

export function mimeFor(name) {
  const ext = name.toLowerCase().split(".").pop();
  const map = {
    html: "text/html",
    htm: "text/html",
    css: "text/css",
    js: "text/javascript",
    mjs: "text/javascript",
    jsx: "text/javascript",
    ts: "text/plain",
    tsx: "text/plain",
    json: "application/json",
    md: "text/markdown",
    txt: "text/plain",
    py: "text/x-python",
    sh: "text/x-shellscript",
    yaml: "text/yaml",
    yml: "text/yaml",
    svg: "image/svg+xml",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    pdf: "application/pdf",
    zip: "application/zip",
  };
  return map[ext] || "application/octet-stream";
}

export function isTextFile(name, size) {
  if (size > TEXT_LIMIT_BYTES) return false;
  return !/\.(png|jpe?g|gif|webp|ico|bmp|pdf|zip|gz|tar|xz|7z|rar|apk|exe|dll|so|dylib|bin|woff2?|ttf|eot|mp3|mp4|wav|ogg|webm|class|jar|pyc)$/i.test(
    name,
  );
}

export async function listTree(projectId) {
  const base = projectDir(projectId);
  if (!existsSync(base)) return [];
  const entries = [];
  let count = 0;

  const walk = async (dir, depth) => {
    if (depth > 12 || count >= MAX_TREE_ENTRIES) return;
    let items;
    try {
      items = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    items.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const item of items) {
      if (count >= MAX_TREE_ENTRIES) return;
      const full = join(dir, item.name);
      const rel = relative(base, full).split(sep).join("/");
      if (item.isDirectory()) {
        entries.push({ path: rel, name: item.name, type: "dir", size: 0 });
        count += 1;
        await walk(full, depth + 1);
      } else if (item.isFile()) {
        const info = await statOrNull(full);
        entries.push({ path: rel, name: item.name, type: "file", size: info?.size || 0 });
        count += 1;
      }
    }
  };

  await walk(base, 0);
  return entries;
}

async function statOrNull(path) {
  try {
    return await stat(path);
  } catch {
    return null;
  }
}

export function readTextFile(projectId, filePath) {
  const base = projectDir(projectId);
  const target = resolveInside(base, filePath);
  if (!existsSync(target)) throw notFound("File not found.");
  const info = statSync(target);
  if (!isTextFile(target, info.size)) {
    return { path: filePath, text: null, size: info.size, binary: true };
  }
  const text = readFile(target, "utf8");
  return text.then((value) => ({ path: filePath, text: value, size: info.size, binary: false }));
}

export async function writeTextFile(projectId, filePath, content) {
  if (typeof content !== "string") throw badRequest("File content must be a string.");
  const base = projectDir(projectId);
  const target = resolveInside(base, filePath);
  if (existsSync(target)) {
    const info = statSync(target);
    if (info.size > TEXT_LIMIT_BYTES) throw tooLarge("This file is too large to edit in the browser.");
  }
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
  return { path: filePath, size: Buffer.byteLength(content, "utf8") };
}

export async function createEntry(projectId, filePath, type) {
  const base = projectDir(projectId);
  const target = resolveInside(base, filePath);
  if (existsSync(target)) throw new Error("already exists");
  if (type === "dir") {
    await mkdir(target, { recursive: true });
  } else {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, "", "utf8");
  }
  return { path: filePath, type };
}

export async function renameEntry(projectId, from, to) {
  const base = projectDir(projectId);
  const source = resolveInside(base, from);
  const target = resolveInside(base, to);
  if (!existsSync(source)) throw notFound("File not found.");
  if (existsSync(target)) throw new Error("already exists");
  await mkdir(dirname(target), { recursive: true });
  await rename(source, target);
  return { from, to };
}

export async function deleteEntry(projectId, filePath) {
  const base = projectDir(projectId);
  const target = resolveInside(base, filePath);
  if (!existsSync(target)) throw notFound("File not found.");
  if (target === base) throw badRequest("The project root cannot be deleted.");
  await rm(target, { recursive: true, force: true });
  return { path: filePath };
}

export function downloadPath(projectId, filePath) {
  const base = projectDir(projectId);
  const target = resolveInside(base, filePath);
  if (!existsSync(target)) throw notFound("File not found.");
  const info = statSync(target);
  if (info.isDirectory()) throw badRequest("Cannot download a directory.");
  return { target, size: info.size, name: filePath.split("/").pop() || "download" };
}

export { createReadStream, createWriteStream, mkdirSync, workspaceRoot, readdirSync };
