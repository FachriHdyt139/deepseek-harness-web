import { useEffect } from "react";
import { useAuth } from "./store.jsx";
import { useRouter } from "./router.jsx";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Workspace from "./pages/Workspace.jsx";
import Settings, { applyTheme } from "./pages/Settings.jsx";

export default function App() {
  const { ready, user } = useAuth();
  const { match, navigate, path } = useRouter();

  useEffect(() => {
    let stored = "dark";
    try {
      stored = localStorage.getItem("dhw-theme") || "dark";
    } catch {
      stored = "dark";
    }
    applyTheme(stored);
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!user && match.name !== "login") {
      navigate(`/login?next=${encodeURIComponent(path)}`, { replace: true });
    }
    if (user && match.name === "login") {
      navigate("/dashboard", { replace: true });
    }
  }, [ready, user, match.name, path, navigate]);

  if (!ready) return <div className="boot-screen">Loading workspace…</div>;
  if (!user) return <Login />;

  switch (match.name) {
    case "project":
      return <Workspace key={match.params.id} />;
    case "settings":
      return <Settings />;
    case "login":
    case "dashboard":
    case "notfound":
    default:
      return match.name === "notfound" ? <NotFound /> : <Dashboard />;
  }
}

function NotFound() {
  const { navigate } = useRouter();
  return (
    <div className="boot-screen">
      <p>Page not found.</p>
      <button className="btn primary" onClick={() => navigate("/dashboard")}>
        Back to projects
      </button>
    </div>
  );
}
