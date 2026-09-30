import { existsSync, mkdirSync, statSync } from "node:fs";
import { isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { badRequest } from "./errors.js";

export const MAX_PATH_DEPTH = 32;

export function dataRoot() {
  return resolve(process.env.DATA_DIR || join(process.cwd(), "data"));
}

export function workspaceRoot() {
  return join(dataRoot(), "workspaces");
}

export function projectDir(projectId) {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(String(projectId))) {
    throw badRequest("Invalid project id.");
  }
  return join(workspaceRoot(), String(projectId));
}

export function dshHome() {
  const home = process.env.DSH_HOME || join(dataRoot(), "dsh-home");
  if (!existsSync(home)) mkdirSync(home, { recursive: true, mode: 0o700 });
  return home;
}

export function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

/**
 * Resolve a user supplied relative path inside `base`, rejecting traversal.
 * Returns the absolute path or throws a validation error.
 */
export function resolveInside(base, userPath) {
  const raw = String(userPath ?? "");
  if (raw.includes("\0")) throw badRequest("Invalid file path.");
  if (isAbsolute(raw)) throw badRequest("File path must be relative.");
  const cleaned = normalize(raw).replace(/^(\.\.(\/|\\|$))+/, "");
  if (cleaned.startsWith("..")) throw badRequest("File path escapes the workspace.");

  const target = resolve(base, cleaned);
  const rel = relative(base, target);
  if (rel.startsWith("..") || isAbsolute(rel)) throw badRequest("File path escapes the workspace.");
  if (rel.split(sep).length > MAX_PATH_DEPTH) throw badRequest("File path is too deep.");
  return target;
}

export function isInside(base, target) {
  const rel = relative(resolve(base), resolve(target));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export function statOrNull(path) {
  try {
    return statSync(path);
  } catch {
    return null;
  }
}
