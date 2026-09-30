import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { notFound } from "../utils/errors.js";
import { dataRoot } from "../utils/paths.js";

/**
 * Local file store used only when Supabase is not configured (development).
 * Production refuses to boot without Supabase credentials, so this never runs
 * on the deployed service.
 */

const storeFile = join(dataRoot(), "dev-store.json");
let cache = null;

function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(readFileSync(storeFile, "utf8"));
  } catch {
    cache = { projects: [], sessions: [], messages: [] };
  }
  cache.projects ||= [];
  cache.sessions ||= [];
  cache.messages ||= [];
  return cache;
}

function persist() {
  mkdirSync(dirname(storeFile), { recursive: true });
  writeFileSync(storeFile, JSON.stringify(cache, null, 2));
}

function touch() {
  load();
  persist();
}

export function devListProjects(limit = 100) {
  return load()
    .projects.slice()
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
    .slice(0, limit);
}

export function devGetProject(projectId) {
  const project = load().projects.find((row) => row.id === projectId);
  if (!project) throw notFound("Project not found.");
  return project;
}

export function devCreateProject(userId, { name, description = "", repositoryUrl = "" }) {
  const data = load();
  const now = new Date().toISOString();
  const id = randomUUID();
  const row = {
    id,
    user_id: userId,
    name,
    description,
    repository_url: repositoryUrl || null,
    storage_path: `${userId}/${id}`,
    created_at: now,
    updated_at: now,
  };
  data.projects.push(row);
  touch();
  return row;
}

export function devTouchProject(projectId) {
  const project = devGetProject(projectId);
  project.updated_at = new Date().toISOString();
  touch();
}

export function devDeleteProject(projectId) {
  const data = load();
  data.projects = data.projects.filter((row) => row.id !== projectId);
  data.sessions = data.sessions.filter((row) => row.project_id !== projectId);
  touch();
}

export function devCreateSession(userId, projectId, title = "Session") {
  const data = load();
  const now = new Date().toISOString();
  const row = {
    id: randomUUID(),
    user_id: userId,
    project_id: projectId,
    title,
    status: "active",
    created_at: now,
    updated_at: now,
  };
  data.sessions.push(row);
  touch();
  return row;
}

export function devSetSessionStatus(sessionId, status) {
  const session = load().sessions.find((row) => row.id === sessionId);
  if (!session) throw notFound("Session not found.");
  session.status = status;
  session.updated_at = new Date().toISOString();
  touch();
  return session;
}

export function devListSessions(projectId) {
  return load()
    .sessions.filter((row) => !projectId || row.project_id === projectId)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export function devGetSession(sessionId) {
  const session = load().sessions.find((row) => row.id === sessionId);
  if (!session) throw notFound("Session not found.");
  return session;
}

export function devFileExists() {
  return existsSync(storeFile);
}

export function devListMessages(sessionId, userId) {
  return load()
    .messages.filter((row) => row.session_id === sessionId && row.user_id === userId)
    .sort((a, b) => (a.created_at > b.created_at ? 1 : -1));
}
