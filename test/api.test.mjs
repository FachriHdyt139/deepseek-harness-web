import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Smoke tests that run without Supabase or an API key.
 * They cover the public surface of the server: health, config, projects,
 * files, uploads, session endpoints and the harness proxy gate.
 */

const workDir = mkdtempSync(join(tmpdir(), "dhw-test-"));
let server;
let base;

process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = "";
process.env.SUPABASE_ANON_KEY = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";
process.env.DATA_DIR = workDir;

// Imported after the environment above so config.js sees the test values.
const { createApp } = await import("../src/server/app.js");

before(async () => {
  const app = createApp();
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(workDir, { recursive: true, force: true });
});

async function call(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    credentials: "same-origin",
    ...options,
    headers: { ...(options.headers || {}) },
  });
  const type = response.headers.get("content-type") || "";
  const body = type.includes("application/json") ? await response.json() : await response.text();
  return { status: response.status, body, headers: response.headers };
}

function json(path, method = "GET", body) {
  return call(path, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("health and configuration", () => {
  it("GET /health returns 200 quickly without touching the AI provider", async () => {
    const started = Date.now();
    const res = await call("/health");
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "ok");
    assert.ok(Date.now() - started < 2000, "health must be fast");
  });

  it("GET /api/config exposes feature flags and limits", async () => {
    const res = await json("/api/config");
    assert.equal(res.status, 200);
    assert.equal(res.body.features.supabase, false);
    assert.equal(res.body.limits.maxActiveSessions, 1);
  });
});

describe("projects", () => {
  let projectId;

  it("rejects a project without a name", async () => {
    const res = await json("/api/projects", "POST", { name: "" });
    assert.equal(res.status, 400);
  });

  it("creates a project", async () => {
    const res = await json("/api/projects", "POST", { name: "demo", description: "test" });
    assert.equal(res.status, 201);
    assert.ok(res.body.project.id);
    projectId = res.body.project.id;
  });

  it("lists and reads the project", async () => {
    const list = await json("/api/projects");
    assert.equal(list.status, 200);
    assert.ok(list.body.projects.some((p) => p.id === projectId));

    const one = await json(`/api/projects/${projectId}`);
    assert.equal(one.status, 200);
    assert.equal(one.body.project.name, "demo");
  });

  it("returns 404 for an unknown project", async () => {
    const res = await json("/api/projects/00000000-0000-0000-0000-000000000000");
    assert.equal(res.status, 404);
  });

  it("deletes the project", async () => {
    const res = await call(`/api/projects/${projectId}`, { method: "DELETE" });
    assert.equal(res.status, 200);
    const list = await json("/api/projects");
    assert.ok(!list.body.projects.some((p) => p.id === projectId));
  });
});

describe("files", () => {
  let projectId;

  before(async () => {
    const res = await json("/api/projects", "POST", { name: "files-demo" });
    projectId = res.body.project.id;
  });

  it("creates, reads, updates and deletes a file", async () => {
    const created = await json(`/api/projects/${projectId}/files`, "POST", {
      path: "src/app.js",
      type: "file",
    });
    assert.equal(created.status, 201);

    const written = await json(`/api/projects/${projectId}/files`, "PUT", {
      path: "src/app.js",
      content: "export const answer = 42;\n",
    });
    assert.equal(written.status, 200);

    const read = await call(`/api/projects/${projectId}/files/content?path=src/app.js`);
    assert.equal(read.status, 200);
    assert.match(read.body.file.text, /answer = 42/);

    const tree = await call(`/api/projects/${projectId}/files`);
    assert.ok(tree.body.files.some((f) => f.path === "src/app.js"));

    const removed = await call(`/api/projects/${projectId}/files?path=src/app.js`, {
      method: "DELETE",
    });
    assert.equal(removed.status, 200);
  });

  it("blocks path traversal", async () => {
    for (const path of ["../../etc/passwd", "..%2f..%2fetc%2fpasswd", "/etc/passwd"]) {
      const res = await call(
        `/api/projects/${projectId}/files/content?path=${encodeURIComponent(path)}`,
      );
      assert.ok(res.status >= 400, `traversal ${path} must fail, got ${res.status}`);
      assert.ok(res.status === 400 || res.status === 404, `unexpected status ${res.status}`);
    }
  });

  it("rejects an invalid zip upload", async () => {
    const res = await call(`/api/projects/${projectId}/upload`, {
      method: "POST",
      headers: { "content-type": "application/zip" },
      body: Buffer.from("not a zip"),
    });
    assert.equal(res.status, 400);
  });

  it("rejects a project id that is not a uuid-like slug", async () => {
    const res = await call("/api/projects/..%2Fescape/files");
    assert.ok(res.status >= 400);
  });
});

describe("sessions and harness", () => {
  it("reports the harness as stopped", async () => {
    const res = await json("/api/harness/status");
    assert.equal(res.status, 200);
    assert.equal(res.body.harness.ready, false);
  });

  it("keeps chat on the harness GUI endpoint (501 with a documented code)", async () => {
    const res = await json("/api/sessions/any-id/message", "POST", { content: "hi" });
    assert.equal(res.status, 501);
    assert.equal(res.body.error.code, "chat_via_harness_gui");
  });

  it("does not serve the harness GUI while the engine is offline", async () => {
    const res = await call("/app/");
    assert.equal(res.status, 503);
    assert.equal(res.body.error.code, "harness_offline");
  });

  it("returns 404 for an unknown session", async () => {
    const res = await json("/api/sessions/00000000-0000-0000-0000-000000000000/messages");
    assert.equal(res.status, 404);
  });
});

describe("frontend", () => {
  it("serves the SPA shell for app routes", async () => {
    if (!existsSync(join(process.cwd(), "public", "index.html"))) {
      return; // build output not present (npm run build has not run yet)
    }
    for (const route of ["/dashboard", "/settings", "/login"]) {
      const res = await call(route, { headers: { accept: "text/html" } });
      assert.equal(res.status, 200, route);
      assert.match(res.body, /<div id="root">/);
    }
  });

  it("serves built assets", async () => {
    if (!existsSync(join(process.cwd(), "public", "index.html"))) return;
    const html = await call("/", { headers: { accept: "text/html" } });
    const asset = String(html.body).match(/src="(\/_app\/[^"]+)"/);
    assert.ok(asset, "index.html must reference a built bundle");
    const res = await call(asset[1]);
    assert.equal(res.status, 200);
  });
});

describe("workspace scratch", () => {
  it("keeps temporary files outside the repo", () => {
    writeFileSync(join(workDir, "scratch.txt"), "ok");
    assert.ok(existsSync(join(workDir, "scratch.txt")));
  });
});
