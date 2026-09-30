import { config, features } from "../config.js";
import { getSupabase } from "../services/supabase.js";
import { forbidden } from "../utils/errors.js";

export async function authenticate(req, _res, next) {
  try {
    if (!features.supabase) {
      req.user = { id: "dev-local", email: "local@development" };
      return next();
    }
    const header = req.get("authorization") || "";
    const [scheme, token] = header.split(" ");
    if (!token || scheme?.toLowerCase() !== "bearer") {
      const sessionToken = readCookie(req, "dhw-access") || readCookie(req, "sb-access-token");
      if (!sessionToken) {
        const error = new Error("Authentication required.");
        error.status = 401;
        error.code = "unauthorized";
        throw error;
      }
      return attachUser(req, sessionToken, next);
    }
    return attachUser(req, token, next);
  } catch (error) {
    return next(error);
  }
}

async function attachUser(req, token, next) {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      const err = new Error("Your session has expired. Please sign in again.");
      err.status = 401;
      err.code = "unauthorized";
      throw err;
    }
    req.user = { id: data.user.id, email: data.user.email };
    return next();
  } catch (error) {
    return next(error);
  }
}

function readCookie(req, name) {
  const header = req.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

export function requireConfigured(what) {
  return (_req, _res, next) => {
    if (what === "github" && !features.github) {
      return next(new Error("GitHub OAuth is not configured."));
    }
    return next();
  };
}

export function assertOwnership(resource, req) {
  if (!resource || resource.user_id !== req.user.id) {
    throw forbidden();
  }
}

export { config };
