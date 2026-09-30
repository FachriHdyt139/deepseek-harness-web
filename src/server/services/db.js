import { randomUUID } from "node:crypto";
import { features } from "../config.js";
import { getAdminSupabase } from "./supabase.js";
import { notFound } from "../utils/errors.js";
import * as dev from "./devStore.js";

export async function listProjects(userId, limit = 100) {
  if (!features.supabase) return dev.devListProjects(limit);
  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data || [];
}

export async function getProject(userId, projectId) {
  if (!features.supabase) {
    const project = dev.devGetProject(projectId);
    if (project.user_id !== userId) throw notFound("Project not found.");
    return project;
  }
  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw notFound("Project not found.");
  return data;
}

export async function createProject(userId, { name, description = "", repositoryUrl = "" }) {
  if (!features.supabase) return dev.devCreateProject(userId, { name, description, repositoryUrl });
  const supabase = getAdminSupabase();
  const id = randomUUID();
  const now = new Date().toISOString();
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
  const { data, error } = await supabase.from("projects").insert(row).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function touchProject(userId, projectId) {
  if (!features.supabase) return dev.devTouchProject(projectId);
  const supabase = getAdminSupabase();
  await supabase
    .from("projects")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", projectId)
    .eq("user_id", userId);
}

export async function deleteProject(userId, projectId) {
  if (!features.supabase) return dev.devDeleteProject(projectId);
  const supabase = getAdminSupabase();
  const { error } = await supabase.from("projects").delete().eq("id", projectId).eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function createSession(userId, projectId, title = "Session") {
  if (!features.supabase) return dev.devCreateSession(userId, projectId, title);
  const supabase = getAdminSupabase();
  const id = randomUUID();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("sessions")
    .insert({ id, project_id: projectId, user_id: userId, title, status: "active", created_at: now, updated_at: now })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function setSessionStatus(userId, sessionId, status) {
  if (!features.supabase) return dev.devSetSessionStatus(sessionId, status);
  const supabase = getAdminSupabase();
  await supabase
    .from("sessions")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("user_id", userId);
}

export async function listSessions(userId, projectId) {
  if (!features.supabase) {
    const rows = dev.devListSessions(projectId || null).filter((row) => row.user_id === userId);
    return rows.slice(0, 50);
  }
  const supabase = getAdminSupabase();
  let query = supabase
    .from("sessions")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (projectId) query = query.eq("project_id", projectId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

export async function getSession(userId, sessionId) {
  if (!features.supabase) {
    const session = dev.devGetSession(sessionId);
    if (session.user_id !== userId) throw notFound("Session not found.");
    return session;
  }
  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw notFound("Session not found.");
  return data;
}

export async function listMessages(userId, sessionId, { limit = 50, offset = 0 } = {}) {
  if (!features.supabase) return dev.devListMessages(sessionId, userId);
  await getSession(userId, sessionId);
  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  return data || [];
}
