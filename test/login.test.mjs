import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Regression test for the production 401 that hid the whole SPA.
 *
 * `projectsRouter.use(authenticate)` and `sessionsRouter.use(authenticate)`
 * were mounted without a path prefix on routers that are themselves mounted
 * at "/". The guard therefore ran for *every* request that reached them —
 * including /login, /dashboard and static assets — so a browser got a 401
 * JSON body instead of the SPA shell.
 *
 * This test enables Supabase (features.supabase === true) with dummy values
 * so `authenticate` takes its real production branch. No network call happens
 * for the requests below: they are rejected before `attachUser` is reached.
 */

const workDir = mkdtempSync(join(tmpdir(), "dhw-login-test-"));
let server;
let base;

process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_ANON_KEY = "dummy-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "dummy-service-role-key";
process.env.DATA_DIR = workDir;

const { createApp } = await import("../src/server/app.js");
const { features } = await import("../src/server/config.js");

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

async function get(path, accept = "text/html") {
  const response = await fetch(`${base}${path}`, {
    redirect: "manual",
    headers: { accept },
  });
  const type = response.headers.get("content-type") || "";
  const body = type.includes("json") ? await response.json() : await response.text();
  return { status: response.status, body, headers: response.headers };
}

describe("SPA is reachable while supabase auth is enabled", () => {
  it("confirms the guard is actually active in this run", () => {
    assert.equal(features.supabase, true, "this test is meaningless without supabase enabled");
  });

  it("GET /login serves the SPA instead of 401", async () => {
    const res = await get("/login");
    assert.notEqual(res.status, 401, "/login must not require a session");
    if (existsSync(join(process.cwd(), "public", "index.html"))) {
      assert.equal(res.status, 200);
      assert.match(String(res.body), /<div id="root">/);
    } else {
      assert.equal(res.status, 503, "without a build /login must reach the SPA handler");
    }
  });

  it("GET /dashboard redirects to /login instead of returning 401", async () => {
    const res = await get("/dashboard");
    assert.equal(res.status, 302, "unauthenticated HTML gets a redirect, not a 401");
    assert.match(res.headers.get("location") || "", /^\/login/);
  });

  it("GET / redirects toward the dashboard", async () => {
    const res = await get("/");
    assert.equal(res.status, 302);
    assert.match(res.headers.get("location") || "", /^\/dashboard/);
  });

  it("still protects the API with 401", async () => {
    for (const path of ["/api/projects", "/api/sessions"]) {
      const res = await get(path, "application/json");
      assert.equal(res.status, 401, `${path} must stay protected`);
      assert.equal(res.body.error.code, "unauthorized");
    }
  });
});

describe("content security policy allows the browser supabase client", () => {
  // The SPA calls supabase.auth.signInWithPassword() directly against
  // SUPABASE_URL. If connect-src omits that origin the browser aborts the
  // request and supabase-js reports a bare "Failed to fetch" on sign in/up.
  const supabaseOrigin = new URL(process.env.SUPABASE_URL).origin;

  function connectSrcOf(header) {
    const directive = String(header)
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("connect-src"));
    assert.ok(directive, "CSP must declare connect-src");
    return directive.slice("connect-src".length).trim().split(/\s+/);
  }

  it("includes the configured supabase origin in connect-src", async () => {
    const res = await get("/login");
    const sources = connectSrcOf(res.headers.get("content-security-policy"));
    assert.ok(
      sources.includes(supabaseOrigin),
      `connect-src must allow ${supabaseOrigin}, got: ${sources.join(" ")}`,
    );
  });

  it("keeps connect-src restrictive rather than opening everything", async () => {
    const res = await get("/login");
    const sources = connectSrcOf(res.headers.get("content-security-policy"));
    assert.ok(!sources.includes("*"), "connect-src must not be a wildcard");
    assert.ok(sources.includes("'self'"), "connect-src must keep 'self'");
  });
});
