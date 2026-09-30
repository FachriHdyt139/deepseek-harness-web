import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import express, { Router } from "express";
import AdmZip from "adm-zip";
import { config } from "../config.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { authenticate } from "../middleware/authenticate.js";
import { rateLimit } from "../middleware/rateLimit.js";
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  touchProject,
} from "../services/db.js";
import { cleanWorkspace } from "../services/harness.js";
import {
  createEntry,
  deleteEntry,
  deleteProjectStorage,
  downloadPath,
  listTree,
  readTextFile,
  renameEntry,
  restoreWorkspace,
  syncWorkspace,
  writeTextFile,
} from "../services/workspace.js";
import { badRequest, conflict, tooLarge } from "../utils/errors.js";
import { projectDir, resolveInside, ensureDir } from "../utils/paths.js";

export const projectsRouter = Router();
// Scoped to /api: without the prefix this guard ran for every request that
// reached the router (mounted at "/"), which blocked the SPA shell, /login
// and static assets with a 401 before they were ever served.
projectsRouter.use("/api", authenticate);

async function requireProject(req) {
  return getProject(req.user.id, req.params.id);
}

async function ensureWorkspace(userId, projectId) {
  const dir = projectDir(projectId);
  const hasFiles = existsSync(dir) && readdirSync(dir).length > 0;
  if (!hasFiles) await restoreWorkspace(userId, projectId);
  ensureDir(dir);
  return dir;
}

projectsRouter.get(
  "/api/projects",
  asyncHandler(async (req, res) => {
    const projects = await listProjects(req.user.id);
    res.json({ projects });
  }),
);

projectsRouter.post(
  "/api/projects",
  rateLimit({ max: 20, key: "project-create" }),
  asyncHandler(async (req, res) => {
    const name = String(req.body?.name || "").trim();
    if (!name) throw badRequest("Project name is required.");
    if (name.length > 80) throw badRequest("Project name is too long.");
    const project = await createProject(req.user.id, {
      name,
      description: String(req.body?.description || "").slice(0, 500),
      repositoryUrl: String(req.body?.repository_url || "").slice(0, 300),
    });
    ensureDir(projectDir(project.id));
    res.status(201).json({ project });
  }),
);

projectsRouter.get(
  "/api/projects/:id",
  asyncHandler(async (req, res) => {
    const project = await requireProject(req);
    res.json({ project });
  }),
);

projectsRouter.delete(
  "/api/projects/:id",
  asyncHandler(async (req, res) => {
    const project = await requireProject(req);
    await deleteProject(req.user.id, project.id);
    await deleteProjectStorage(req.user.id, project.id).catch(() => {});
    cleanWorkspace(project.id);
    res.json({ ok: true });
  }),
);

projectsRouter.get(
  "/api/projects/:id/files",
  asyncHandler(async (req, res) => {
    const project = await requireProject(req);
    await ensureWorkspace(req.user.id, project.id);
    const files = await listTree(project.id);
    res.json({ files });
  }),
);

projectsRouter.get(
  "/api/projects/:id/files/content",
  asyncHandler(async (req, res) => {
    const project = await requireProject(req);
    await ensureWorkspace(req.user.id, project.id);
    const path = String(req.query.path || "");
    if (!path) throw badRequest("path is required.");
    const file = await readTextFile(project.id, path);
    res.json({ file });
  }),
);

projectsRouter.get(
  "/api/projects/:id/files/raw",
  asyncHandler(async (req, res) => {
    const project = await requireProject(req);
    await ensureWorkspace(req.user.id, project.id);
    const path = String(req.query.path || "");
    if (!path) throw badRequest("path is required.");
    const { target, name } = downloadPath(project.id, path);
    res.download(target, name);
  }),
);

projectsRouter.post(
  "/api/projects/:id/files",
  rateLimit({ max: 60, key: "file-create" }),
  asyncHandler(async (req, res) => {
    const project = await requireProject(req);
    await ensureWorkspace(req.user.id, project.id);
    const path = String(req.body?.path || "").trim();
    if (!path) throw badRequest("path is required.");
    try {
      await createEntry(project.id, path, req.body?.type === "dir" ? "dir" : "file");
    } catch (error) {
      if (error.message === "already exists") throw conflict("A file with that name already exists.");
      throw error;
    }
    await touchProject(req.user.id, project.id);
    res.status(201).json({ ok: true, path });
  }),
);

projectsRouter.put(
  "/api/projects/:id/files",
  rateLimit({ max: 60, key: "file-write" }),
  asyncHandler(async (req, res) => {
    const project = await requireProject(req);
    await ensureWorkspace(req.user.id, project.id);
    const path = String(req.body?.path || "").trim();
    if (!path) throw badRequest("path is required.");
    const result = await writeTextFile(project.id, path, req.body?.content ?? "");
    await touchProject(req.user.id, project.id);
    if (req.body?.sync) await syncWorkspace(req.user.id, project.id).catch(() => {});
    res.json(result);
  }),
);

projectsRouter.post(
  "/api/projects/:id/files/rename",
  asyncHandler(async (req, res) => {
    const project = await requireProject(req);
    const from = String(req.body?.from || "");
    const to = String(req.body?.to || "");
    if (!from || !to) throw badRequest("from and to are required.");
    try {
      await renameEntry(project.id, from, to);
    } catch (error) {
      if (error.message === "already exists") throw conflict("A file with that name already exists.");
      if (error.status === 404) throw error;
      throw error;
    }
    await touchProject(req.user.id, project.id);
    res.json({ ok: true });
  }),
);

projectsRouter.delete(
  "/api/projects/:id/files",
  asyncHandler(async (req, res) => {
    const project = await requireProject(req);
    const path = String(req.query.path || "");
    if (!path) throw badRequest("path is required.");
    await deleteEntry(project.id, path);
    await touchProject(req.user.id, project.id);
    res.json({ ok: true });
  }),
);

projectsRouter.post(
  "/api/projects/:id/sync",
  rateLimit({ max: 20, key: "project-sync" }),
  asyncHandler(async (req, res) => {
    const project = await requireProject(req);
    await ensureWorkspace(req.user.id, project.id);
    const result = await syncWorkspace(req.user.id, project.id);
    await touchProject(req.user.id, project.id);
    res.json(result);
  }),
);

projectsRouter.post(
  "/api/projects/:id/upload",
  rateLimit({ max: 10, key: "project-upload" }),
  express.raw({
    type: ["application/zip", "application/x-zip-compressed", "application/octet-stream"],
    limit: `${config.limits.maxUploadMb}mb`,
  }),
  asyncHandler(async (req, res) => {
    const project = await requireProject(req);
    const buffer = req.body;
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw badRequest("Zip file is required.");
    if (buffer.length > config.limits.maxUploadMb * 1024 * 1024) {
      throw tooLarge(`Upload is limited to ${config.limits.maxUploadMb} MB.`);
    }

    let zip;
    try {
      zip = new AdmZip(buffer);
    } catch {
      throw badRequest("The uploaded file is not a valid zip archive.");
    }

    const base = ensureDir(projectDir(project.id));
    const entries = zip.getEntries();
    let extracted = 0;
    for (const entry of entries) {
      if (entry.isDirectory) continue;
      const name = entry.entryName;
      if (name.includes("\0") || name.startsWith("/") || /(^|\/)\.\.(\/|$)/.test(name)) {
        throw badRequest("The zip archive contains an unsafe path.");
      }
      const target = resolveInside(base, name);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, entry.getData());
      extracted += 1;
      if (extracted > 5000) throw badRequest("The zip archive contains too many files.");
    }

    await syncWorkspace(req.user.id, project.id).catch(() => {});
    await touchProject(req.user.id, project.id);
    res.json({ ok: true, extracted });
  }),
);
