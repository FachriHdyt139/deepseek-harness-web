import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../store.jsx";
import { useRouter } from "../router.jsx";
import Shell from "../components/Shell.jsx";

export default function Dashboard() {
  const { user, logout, config } = useAuth();
  const { navigate } = useRouter();
  const [projects, setProjects] = useState(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = useCallback(async () => {
    try {
      const payload = await api.get("/api/projects");
      setProjects(payload.projects);
      setError("");
    } catch (err) {
      setError(err.message);
      setProjects([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createProject(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = await api.post("/api/projects", { name, description });
      setCreating(false);
      setName("");
      setDescription("");
      navigate(`/project/${payload.project.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeProject(project) {
    try {
      await api.del(`/api/projects/${project.id}`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setConfirmDelete(null);
    }
  }

  return (
    <Shell title="Projects">
      <div className="page">
        <div className="page-head">
          <div>
            <h1>My Projects</h1>
            <p className="muted">
              Signed in as {user?.email || "local"} · {projects?.length ?? 0} project
              {(projects?.length ?? 0) === 1 ? "" : "s"}
            </p>
          </div>
          <button className="btn primary" onClick={() => setCreating(true)}>
            + New Project
          </button>
        </div>

        {error && <div className="alert error">{error}</div>}

        {creating && (
          <form className="card form" onSubmit={createProject}>
            <h2>Create a project</h2>
            <label>
              Name
              <input
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="my-app"
                required
                maxLength={80}
              />
            </label>
            <label>
              Description
              <input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Optional"
                maxLength={500}
              />
            </label>
            <div className="row end">
              <button type="button" className="btn" onClick={() => setCreating(false)}>
                Cancel
              </button>
              <button className="btn primary" type="submit" disabled={busy}>
                {busy ? "Creating…" : "Create"}
              </button>
            </div>
          </form>
        )}

        {projects === null ? (
          <div className="empty">Loading projects…</div>
        ) : projects.length === 0 ? (
          <div className="empty">
            <p>No projects yet.</p>
            <button className="btn primary" onClick={() => setCreating(true)}>
              Create your first project
            </button>
          </div>
        ) : (
          <div className="grid">
            {projects.map((project) => (
              <article className="card project-card" key={project.id}>
                <header onClick={() => navigate(`/project/${project.id}`)}>
                  <h2>{project.name}</h2>
                  <p className="muted">{project.description || "No description"}</p>
                </header>
                <footer>
                  <span className="muted small">
                    Updated {formatTime(project.updated_at)}
                  </span>
                  <div className="row">
                    <button className="btn small" onClick={() => navigate(`/project/${project.id}`)}>
                      Open
                    </button>
                    <button className="btn small danger" onClick={() => setConfirmDelete(project)}>
                      Delete
                    </button>
                  </div>
                </footer>
              </article>
            ))}
          </div>
        )}

        {confirmDelete && (
          <div className="modal-backdrop" onClick={() => setConfirmDelete(null)}>
            <div className="modal" onClick={(event) => event.stopPropagation()}>
              <h2>Delete “{confirmDelete.name}”?</h2>
              <p className="muted">This removes the project and its stored files. It cannot be undone.</p>
              <div className="row end">
                <button className="btn" onClick={() => setConfirmDelete(null)}>
                  Cancel
                </button>
                <button className="btn danger" onClick={() => removeProject(confirmDelete)}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {config?.features?.github === false && (
          <p className="muted small pad-top">
            GitHub integration is optional and can be enabled later with OAuth environment variables.
          </p>
        )}
        <button className="btn link" onClick={() => logout()}>
          Sign out
        </button>
      </div>
    </Shell>
  );
}

function formatTime(value) {
  if (!value) return "never";
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} d ago`;
}
