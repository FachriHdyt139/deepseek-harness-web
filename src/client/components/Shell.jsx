import { useAuth } from "../store.jsx";
import { useRouter } from "../router.jsx";

export default function Shell({ title, children, right }) {
  const { user, logout } = useAuth();
  const { navigate, path } = useRouter();

  return (
    <div className="shell">
      <header className="topbar">
        <button className="brand" onClick={() => navigate("/dashboard")}>
          <span className="brand-mark">◆</span>
          <span className="brand-text">DeepSeek Harness Web</span>
        </button>
        <nav className="topnav">
          <button
            className={path.startsWith("/dashboard") || path === "/" ? "nav-item active" : "nav-item"}
            onClick={() => navigate("/dashboard")}
          >
            Projects
          </button>
          <button
            className={path.startsWith("/settings") ? "nav-item active" : "nav-item"}
            onClick={() => navigate("/settings")}
          >
            Settings
          </button>
        </nav>
        <div className="topbar-right">
          {right}
          <span className="user-chip" title={user?.email}>
            {initials(user?.email)}
          </span>
          <button className="btn small" onClick={() => logout()}>
            Logout
          </button>
        </div>
      </header>
      {title ? <div className="shell-title">{title}</div> : null}
      <main className="shell-main">{children}</main>
    </div>
  );
}

function initials(email) {
  if (!email) return "?";
  const name = email.split("@")[0];
  return name.slice(0, 2).toUpperCase();
}
