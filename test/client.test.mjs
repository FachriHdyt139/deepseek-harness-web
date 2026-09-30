import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

/**
 * Client smoke tests: load the real React app through Vite's SSR module
 * loader (JSX + imports resolved exactly like the production build) and render
 * it inside jsdom. This catches crashes in login, dashboard and workspace
 * without needing a browser.
 */

const API = {
  "/api/config": () => ({
    supabase: null,
    features: { supabase: false, github: false, ai: false },
    limits: {
      maxUploadMb: 50,
      maxActiveSessions: 1,
      sessionTimeoutMinutes: 30,
      maxChatRequestsPerMinute: 10,
      maxPromptChars: 20000,
      maxToolOutputChars: 20000,
    },
    github: null,
  }),
  "/api/projects": () => ({ projects: [] }),
  "/api/harness/status": () => ({
    harness: { running: false, starting: false, ready: false },
    logs: [],
  }),
  "/api/auth/me": () => ({ user: { id: "local", email: "local@development" } }),
};

let dom;
let vite;
let App;
let AppProviders;
let react;
let createRoot;

function jsonResponse(body) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => "application/json" },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

before(async () => {
  dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: "http://localhost:3000/dashboard",
    pretendToBeVisual: true,
  });

  const w = dom.window;
  const define = (key, value) => Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  define("window", w);
  define("document", w.document);
  define("navigator", w.navigator);
  define("location", w.location);
  define("history", w.history);
  define("localStorage", w.localStorage);
  define("HTMLElement", w.HTMLElement);
  define("Element", w.Element);
  define("Node", w.Node);
  define("Event", w.Event);
  define("MouseEvent", w.MouseEvent);
  define("KeyboardEvent", w.KeyboardEvent);
  define("CustomEvent", w.CustomEvent);
  define("getComputedStyle", w.getComputedStyle.bind(w));
  define("MutationObserver", w.MutationObserver);
  define("Range", w.Range);
  define("getSelection", w.getSelection.bind(w));
  define("DOMRect", w.DOMRect);
  define("Window", w.Window);
  // jsdom has no layout: scheduling real animation frames only produces
  // getClientRects noise from CodeMirror, so keep them as no-ops.
  define("requestAnimationFrame", () => 0);
  define("cancelAnimationFrame", () => {});
  if (!w.ResizeObserver) {
    class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    define("ResizeObserver", ResizeObserver);
  }
  define(
    "EventSource",
    class EventSource {
      constructor() {
        this.readyState = 1;
      }
      addEventListener() {}
      removeEventListener() {}
      close() {}
    },
  );

  globalThis.fetch = async (input) => {
    const url = typeof input === "string" ? input : String(input?.url || "");
    const path = url.replace(/^https?:\/\/[^/]+/, "").split("?")[0];
    const handler = API[path];
    if (handler) return jsonResponse(handler());
    return jsonResponse({ projects: [], files: [], sessions: [], messages: [] });
  };

  vite = await createServer({
    configFile: false,
    root: resolve(process.cwd(), "src/client"),
    logLevel: "error",
    appType: "custom",
    server: { middlewareMode: true, hmr: false, watch: null },
  });

  react = await import("react");
  ({ createRoot } = await import("react-dom/client"));
  ({ AppProviders } = await vite.ssrLoadModule("/store.jsx"));
  ({ default: App } = await vite.ssrLoadModule("/App.jsx"));
});

after(async () => {
  await vite?.close();
});

function render(url) {
  dom.reconfigure({ url });
  const container = document.getElementById("root");
  container.innerHTML = "";
  const root = createRoot(container);
  root.render(react.createElement(AppProviders, null, react.createElement(App)));
  return { container, root };
}

async function settle(ms = 120) {
  await new Promise((r) => setTimeout(r, ms));
}

function buttonByText(text) {
  return [...document.querySelectorAll("button, a")].find((el) =>
    el.textContent.trim().toLowerCase().includes(text.toLowerCase()),
  );
}


function workspaceFetch(input) {
  const url = typeof input === "string" ? input : String(input?.url || "");
  const path = url.replace(/^https?:\/\/[^/]+/, "").split("?")[0];
  if (path === "/api/config") return jsonResponse(API["/api/config"]());
  if (/^\/api\/projects\/[^/]+$/.test(path)) {
    return jsonResponse({
      project: {
        id: "00000000-0000-0000-0000-000000000001",
        name: "demo",
        description: "test",
      },
    });
  }
  if (path.endsWith("/files/content")) {
    return jsonResponse({ file: { path: "a.txt", text: "hello world\n", size: 12, binary: false } });
  }
  if (path.endsWith("/files")) return jsonResponse({ files: [{ path: "a.txt", name: "a.txt", type: "file", size: 3 }] });
  if (path === "/api/sessions") return jsonResponse({ sessions: [] });
  return jsonResponse(API[path]?.() ?? {});
}

describe("client", () => {
  it("renders the projects dashboard", async () => {
    const { root } = render("http://localhost:3000/dashboard");
    await settle();
    assert.match(document.body.textContent, /My Projects/);
    assert.match(document.body.textContent, /New Project/);
    root.unmount();
  });

  it("logs out into the sign in screen", async () => {
    const { root } = render("http://localhost:3000/dashboard");
    await settle();
    const logout = buttonByText("Logout");
    assert.ok(logout, "logout button must exist");
    logout.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
    await settle();
    assert.match(document.body.textContent, /Sign in/);
    root.unmount();
  });

  it("opens a project workspace with explorer, editor and AI panel", async () => {
    dom.reconfigure({ url: "http://localhost:3000/project/00000000-0000-0000-0000-000000000001" });
    const container = document.getElementById("root");
    container.innerHTML = "";

    globalThis.fetch = async (input) => workspaceFetch(input);

    const root = createRoot(container);
    root.render(react.createElement(AppProviders, null, react.createElement(App)));
    await settle(200);

    assert.match(document.body.textContent, /Explorer/);
    assert.match(document.body.textContent, /AI Chat/);
    assert.match(document.body.textContent, /Start AI session/);
    root.unmount();
    globalThis.fetch = async () => jsonResponse(API["/api/config"]());
  });

  it("opens a file in the code editor", async () => {
    globalThis.fetch = async (input) => workspaceFetch(input);
    const { root } = render("http://localhost:3000/project/00000000-0000-0000-0000-000000000001");
    await settle(200);

    const file = [...document.querySelectorAll(".tree-item")].find((el) =>
      el.textContent.includes("a.txt"),
    );
    assert.ok(file, "file entry must be listed in the explorer");
    file.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
    await settle(250);

    assert.match(document.body.textContent, /a\.txt/);
    assert.ok(document.querySelector(".cm-editor"), "CodeMirror editor must mount");
    root.unmount();
  });
});
