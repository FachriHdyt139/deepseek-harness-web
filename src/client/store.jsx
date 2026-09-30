import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { api } from "./api.js";

const ConfigContext = createContext(null);
const AuthContext = createContext(null);

export function AppProviders({ children }) {
  const [config, setConfig] = useState(null);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [supabase, setSupabase] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get("/api/config")
      .then(async (payload) => {
        if (cancelled) return;
        setConfig(payload);
        if (payload.supabase?.url && payload.supabase?.anonKey) {
          const client = createClient(payload.supabase.url, payload.supabase.anonKey, {
            auth: { persistSession: true, autoRefreshToken: true },
          });
          setSupabase(client);
          const { data } = await client.auth.getSession();
          if (data?.session?.user) {
            setUser({ id: data.session.user.id, email: data.session.user.email });
            await api.post("/api/auth/session", { access_token: data.session.access_token }).catch(() => {});
          }
          client.auth.onAuthStateChange((_event, session) => {
            if (session?.user) {
              setUser({ id: session.user.id, email: session.user.email });
              api.post("/api/auth/session", { access_token: session.access_token }).catch(() => {});
            } else {
              setUser(null);
              api.del("/api/auth/session").catch(() => {});
            }
          });
        } else {
          setUser({ id: "local", email: "local@development" });
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setReady(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const logout = useCallback(async () => {
    if (supabase) await supabase.auth.signOut().catch(() => {});
    setUser(null);
    await api.del("/api/auth/session").catch(() => {});
  }, [supabase]);

  const authValue = useMemo(
    () => ({ user, ready, supabase, config, logout, setUser }),
    [user, ready, supabase, config, logout],
  );

  if (error) {
    return (
      <div className="boot-screen">
        <p>Could not reach the server.</p>
        <code>{error}</code>
      </div>
    );
  }

  return (
    <ConfigContext.Provider value={config}>
      <AuthContext.Provider value={authValue}>{children}</AuthContext.Provider>
    </ConfigContext.Provider>
  );
}

export function useConfig() {
  return useContext(ConfigContext);
}

export function useAuth() {
  return useContext(AuthContext);
}
