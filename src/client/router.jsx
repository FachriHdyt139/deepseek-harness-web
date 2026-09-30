import { useCallback, useEffect, useMemo, useState } from "react";

function currentLocation() {
  return window.location.pathname + window.location.search;
}

export function useRouter() {
  const [location, setLocation] = useState(currentLocation);

  useEffect(() => {
    const onPop = () => setLocation(currentLocation());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((to, { replace = false } = {}) => {
    if (replace) window.history.replaceState(null, "", to);
    else window.history.pushState(null, "", to);
    setLocation(currentLocation());
  }, []);

  const path = location.split("?")[0];
  const query = useMemo(() => new URLSearchParams(location.includes("?") ? location.split("?")[1] : ""), [location]);

  const match = useMemo(() => {
    const project = path.match(/^\/project\/([^/]+)$/);
    if (project) return { name: "project", params: { id: decodeURIComponent(project[1]) } };
    if (path === "/login") return { name: "login", params: {} };
    if (path === "/settings") return { name: "settings", params: {} };
    if (path === "/dashboard" || path === "/") return { name: "dashboard", params: {} };
    return { name: "notfound", params: {} };
  }, [path]);

  return { location, path, query, match, navigate };
}
