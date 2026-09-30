import { useAuth } from "../store.jsx";
import { useRouter } from "../router.jsx";
import Shell from "../components/Shell.jsx";

export default function Settings() {
  const { config, logout } = useAuth();
  const { navigate } = useRouter();
  const theme = document.documentElement.dataset.theme || "dark";

  function toggleTheme() {
    const next = theme === "dark" ? "light" : theme === "light" ? "system" : "dark";
    applyTheme(next);
  }

  return (
    <Shell title="Settings">
      <div className="page narrow">
        <section className="card">
          <h2>Appearance</h2>
          <div className="row between">
            <div>
              <strong>Theme</strong>
              <p className="muted small">Dark is the default. System follows your device setting.</p>
            </div>
            <button className="btn" onClick={toggleTheme}>
              {theme}
            </button>
          </div>
        </section>

        <section className="card">
          <h2>AI engine</h2>
          <dl className="kv">
            <dt>Engine</dt>
            <dd>DeepSeek Harness (@deepseek-ai/dsh)</dd>
            <dt>API key</dt>
            <dd>{config?.features?.ai ? "Configured" : "Not configured (set AI_API_KEY)"}</dd>
            <dt>Active sessions</dt>
            <dd>{config?.limits?.maxActiveSessions ?? 1}</dd>
            <dt>Session timeout</dt>
            <dd>{config?.limits?.sessionTimeoutMinutes ?? 30} minutes</dd>
          </dl>
        </section>

        <section className="card">
          <h2>Integrations</h2>
          <dl className="kv">
            <dt>Supabase</dt>
            <dd>{config?.features?.supabase ? "Connected" : "Not configured"}</dd>
            <dt>GitHub</dt>
            <dd>{config?.features?.github ? "OAuth configured" : "Not configured"}</dd>
          </dl>
          {config?.features?.github && (
            <a className="btn" href="/api/github/auth">
              Connect GitHub
            </a>
          )}
        </section>

        <section className="card">
          <h2>Session</h2>
          <div className="row">
            <button className="btn" onClick={() => navigate("/dashboard")}>
              Back to projects
            </button>
            <button className="btn danger" onClick={() => logout()}>
              Sign out
            </button>
          </div>
        </section>
      </div>
    </Shell>
  );
}

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === "system") {
    delete root.dataset.theme;
    root.style.colorScheme = "";
  } else {
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
  }
  try {
    localStorage.setItem("dhw-theme", theme);
  } catch {
    /* storage unavailable */
  }
}
