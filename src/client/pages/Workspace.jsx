import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, sse } from "../api.js";
import { useRouter } from "../router.jsx";
import Shell from "../components/Shell.jsx";
import Editor from "../components/Editor.jsx";

const AUTOSAVE_MS = 1200;

export default function Workspace() {
  const { match, navigate } = useRouter();
  const projectId = match.params.id;

  const [project, setProject] = useState(null);
  const [files, setFiles] = useState([]);
  const [openPath, setOpenPath] = useState(null);
  const [content, setContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [binary, setBinary] = useState(false);
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState("files");
  const [session, setSession] = useState(null);
  const [harness, setHarness] = useState(null);
  const [starting, setStarting] = useState(false);
  const [panel, setPanel] = useState(true);

  const autosaveRef = useRef(null);
  const editorValueRef = useRef("");

  const loadTree = useCallback(async () => {
    try {
      const payload = await api.get(`/api/projects/${projectId}/files`);
      setFiles(payload.files);
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }, [projectId]);

  useEffect(() => {
    api
      .get(`/api/projects/${projectId}`)
      .then((payload) => setProject(payload.project))
      .catch((err) => setError(err.message));
    loadTree();
    api
      .get(`/api/sessions?projectId=${projectId}`)
      .then((payload) => setSession(payload.sessions[0] || null))
      .catch(() => {});
    api
      .get("/api/harness/status")
      .then((payload) => setHarness(payload.harness))
      .catch(() => {});
  }, [projectId, loadTree]);

  useEffect(() => {
    if (!session) return undefined;
    const source = sse(`/api/sessions/${session.id}/events`, {
      onStatus: (payload) => setHarness(payload.harness),
    });
    return () => source.close();
  }, [session?.id]);

  const openFile = useCallback(
    async (path) => {
      if (dirty && !window.confirm("Discard unsaved changes?")) return;
      try {
        const payload = await api.get(`/api/projects/${projectId}/files/content?path=${encodeURIComponent(path)}`);
        setBinary(payload.file.binary);
        setOpenPath(path);
        setContent(payload.file.text ?? "");
        editorValueRef.current = payload.file.text ?? "";
        setDirty(false);
        setTab("editor");
        setError("");
      } catch (err) {
        setError(err.message);
      }
    },
    [projectId, dirty],
  );

  function onEditorChange(value) {
    editorValueRef.current = value;
    setDirty(true);
    if (autosaveRef.current) clearTimeout(autosaveRef.current);
    autosaveRef.current = setTimeout(() => save(true), AUTOSAVE_MS);
  }

  const save = useCallback(
    async (silent = false) => {
      if (!openPath || binary) return;
      setSaving(true);
      try {
        await api.put(`/api/projects/${projectId}/files`, {
          path: openPath,
          content: editorValueRef.current,
        });
        setDirty(false);
        if (!silent) setNotice("Saved");
      } catch (err) {
        setError(err.message);
      } finally {
        setSaving(false);
      }
    },
    [openPath, projectId, binary],
  );

  useEffect(() => {
    const onKey = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "s") {
        event.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  async function startSession() {
    setStarting(true);
    setError("");
    try {
      const payload = await api.post("/api/sessions", { projectId });
      setSession(payload.session);
      setHarness(payload.harness);
      setTab("ai");
      setNotice("AI engine started.");
    } catch (err) {
      setError(err.message);
    } finally {
      setStarting(false);
    }
  }

  async function syncNow() {
    setNotice("Saving project to cloud storage…");
    try {
      const payload = await api.post(`/api/projects/${projectId}/sync`, {});
      setNotice(`Saved ${payload.uploaded} file${payload.uploaded === 1 ? "" : "s"} to Supabase Storage.`);
    } catch (err) {
      setError(err.message);
      setNotice("");
    }
  }

  async function createEntry(type) {
    const path = window.prompt(type === "dir" ? "New folder path" : "New file path");
    if (!path) return;
    try {
      await api.post(`/api/projects/${projectId}/files`, { path: path.replace(/^\/+/, ""), type });
      await loadTree();
      if (type === "file") await openFile(path.replace(/^\/+/, ""));
    } catch (err) {
      setError(err.message);
    }
  }

  async function renameEntry(path) {
    const to = window.prompt("Rename to", path);
    if (!to || to === path) return;
    try {
      await api.post(`/api/projects/${projectId}/files/rename`, { from: path, to });
      if (openPath === path) setOpenPath(to);
      await loadTree();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteEntry(path) {
    if (!window.confirm(`Delete “${path}”?`)) return;
    try {
      await api.del(`/api/projects/${projectId}/files?path=${encodeURIComponent(path)}`);
      if (openPath === path) {
        setOpenPath(null);
        setContent("");
        setDirty(false);
      }
      await loadTree();
    } catch (err) {
      setError(err.message);
    }
  }

  async function uploadZip(file) {
    if (!file) return;
    const buffer = await file.arrayBuffer();
    setNotice("Uploading project archive…");
    try {
      const response = await fetch(`/api/projects/${projectId}/upload`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/zip" },
        body: buffer,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || "Upload failed.");
      setNotice(`Imported ${payload.extracted} file${payload.extracted === 1 ? "" : "s"}.`);
      await loadTree();
    } catch (err) {
      setError(err.message);
      setNotice("");
    }
  }

  const tree = useMemo(() => buildTree(files, collapsed), [files, collapsed]);

  function toggleDir(path) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  useEffect(() => {
    if (!notice && !error) return undefined;
    const timer = setTimeout(() => {
      setNotice("");
      setError("");
    }, 4000);
    return () => clearTimeout(timer);
  }, [notice, error]);

  const aiReady = Boolean(session) && harness?.ready;

  return (
    <Shell
      title={project?.name || "Project"}
      right={
        <div className="row">
          <button className="btn small" onClick={() => navigate("/dashboard")}>
            ← Projects
          </button>
          <button className="btn small" onClick={syncNow}>
            Save to cloud
          </button>
        </div>
      }
    >
      <div className="workspace">
        <div className="mobile-tabs">
          {["files", "editor", "ai"].map((value) => (
            <button
              key={value}
              className={tab === value ? "tab active" : "tab"}
              onClick={() => setTab(value)}
            >
              {value === "files" ? "Files" : value === "editor" ? "Editor" : "AI Chat"}
            </button>
          ))}
        </div>

        <aside className={`pane files-pane ${tab === "files" ? "visible" : ""}`}>
          <div className="pane-head">
            <span>Explorer</span>
            <div className="row">
              <button className="icon-btn" title="New file" onClick={() => createEntry("file")}>
                +F
              </button>
              <button className="icon-btn" title="New folder" onClick={() => createEntry("dir")}>
                +D
              </button>
              <label className="icon-btn" title="Import zip">
                ⇧
                <input
                  type="file"
                  accept=".zip"
                  hidden
                  onChange={(event) => uploadZip(event.target.files?.[0])}
                />
              </label>
            </div>
          </div>
          <div className="file-tree">
            {tree.length === 0 && <p className="muted small pad">No files yet. Create one or import a zip.</p>}
            {tree.map((node) => (
              <div key={node.path} className="tree-row" style={{ paddingLeft: 8 + node.depth * 14 }}>
                <button
                  className={`tree-item ${openPath === node.path ? "active" : ""}`}
                  onClick={() => (node.type === "dir" ? toggleDir(node.path) : openFile(node.path))}
                >
                  <span className="tree-icon">{node.type === "dir" ? (collapsed.has(node.path) ? "▸" : "▾") : "·"}</span>
                  <span className="tree-name">{node.name}</span>
                </button>
                <span className="tree-actions">
                  <button className="icon-btn" title="Rename" onClick={() => renameEntry(node.path)}>
                    ✎
                  </button>
                  <a
                    className="icon-btn"
                    title="Download"
                    href={`/api/projects/${projectId}/files/raw?path=${encodeURIComponent(node.path)}`}
                  >
                    ↓
                  </a>
                  <button className="icon-btn" title="Delete" onClick={() => deleteEntry(node.path)}>
                    ✕
                  </button>
                </span>
              </div>
            ))}
          </div>
        </aside>

        <section className={`pane editor-pane ${tab === "editor" ? "visible" : ""}`}>
          <div className="pane-head">
            <span className="file-title">
              {openPath || "No file open"}
              {dirty && <em className="dirty"> ●</em>}
              {saving && <em className="muted"> saving…</em>}
            </span>
            <div className="row">
              <button className="btn small" onClick={() => save()} disabled={!dirty || binary}>
                Save
              </button>
            </div>
          </div>
          {openPath === null ? (
            <div className="empty subtle">Select a file from the explorer to edit it.</div>
          ) : binary ? (
            <div className="empty subtle">
              This file is too large or binary to edit in the browser.
              <div className="pad-top">
                <a
                  className="btn small"
                  href={`/api/projects/${projectId}/files/raw?path=${encodeURIComponent(openPath)}`}
                >
                  Download file
                </a>
              </div>
            </div>
          ) : (
            <Editor path={openPath} value={content} onChange={onEditorChange} onSave={() => save()} />
          )}
        </section>

        <section className={`pane ai-pane ${tab === "ai" ? "visible" : ""}`}>
          <div className="pane-head">
            <span>AI Chat</span>
            <div className="row">
              <span className={`status-dot ${harness?.running ? "on" : ""}`} />
              <span className="muted small">
                {harness?.starting ? "starting…" : harness?.ready ? "ready" : "stopped"}
              </span>
              {!session && (
                <button className="btn small primary" onClick={startSession} disabled={starting}>
                  {starting ? "Starting…" : "Start AI session"}
                </button>
              )}
              {session && harness?.ready && (
                <button
                  className="btn small"
                  onClick={() => {
                    setPanel((value) => !value);
                    setTab("ai");
                  }}
                >
                  {panel ? "Hide panel" : "Open chat"}
                </button>
              )}
            </div>
          </div>

          {!session && (
            <div className="empty subtle">
              <p>The AI engine runs one session at a time inside this project workspace.</p>
              <button className="btn primary" onClick={startSession} disabled={starting}>
                {starting ? "Starting AI engine…" : "Start AI session"}
              </button>
            </div>
          )}

          {session && !harness?.ready && (
            <div className="empty subtle">
              <p>{harness?.starting ? "Starting the DeepSeek Harness engine…" : "The engine is stopped."}</p>
              {!harness?.starting && (
                <button className="btn primary" onClick={startSession} disabled={starting}>
                  Start again
                </button>
              )}
            </div>
          )}

          {aiReady && (
            <div className="chat-frame">
              {panel && <iframe title="DeepSeek Harness" src="/app/" className="harness-frame" />}
            </div>
          )}
        </section>
      </div>

      {(error || notice) && (
        <div className={`toast ${error ? "error" : ""}`}>{error || notice}</div>
      )}
    </Shell>
  );
}

function buildTree(files, collapsed) {
  const nodes = [];
  for (const file of files) {
    const parts = file.path.split("/");
    let skip = false;
    for (let i = 1; i < parts.length; i += 1) {
      const parent = parts.slice(0, i).join("/");
      if (collapsed.has(parent)) {
        skip = true;
        break;
      }
    }
    if (skip) continue;
    nodes.push({ ...file, depth: parts.length - 1 });
  }
  return nodes;
}
