import { useState } from "react";
import { useAuth } from "../store.jsx";
import { useRouter } from "../router.jsx";

export default function Login() {
  const { supabase, config, setUser } = useAuth();
  const { navigate, query } = useRouter();
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  const redirectTo = query.get("next") || "/dashboard";
  const configured = Boolean(config?.supabase?.url);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setInfo("");
    if (!configured) {
      setUser({ id: "local", email: "local@development" });
      navigate(redirectTo, { replace: true });
      return;
    }
    setBusy(true);
    try {
      if (mode === "signin") {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
        setUser({ id: data.user.id, email: data.user.email });
      } else {
        const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) throw signUpError;
        if (!data.session) {
          setInfo("Check your inbox to confirm your email address, then sign in.");
          setMode("signin");
          return;
        }
        setUser({ id: data.user.id, email: data.user.email });
      }
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err.message || "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={submit}>
        <div className="brand">
          <span className="brand-mark">◆</span>
          <span>DeepSeek Harness Web</span>
        </div>
        <h1>{mode === "signin" ? "Sign in" : "Create account"}</h1>
        <p className="muted">
          Personal AI coding workspace backed by DeepSeek Harness, Supabase and Render.
        </p>

        {!configured && (
          <div className="notice">
            Supabase is not configured, running in local development mode.
          </div>
        )}

        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
            disabled={!configured}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            minLength={8}
            required
            disabled={!configured}
          />
        </label>

        {error && <div className="alert error">{error}</div>}
        {info && <div className="alert info">{info}</div>}

        <button className="btn primary block" type="submit" disabled={busy}>
          {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Sign up"}
        </button>

        <button
          className="btn link"
          type="button"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError("");
          }}
        >
          {mode === "signin" ? "Need an account? Sign up" : "Have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}
