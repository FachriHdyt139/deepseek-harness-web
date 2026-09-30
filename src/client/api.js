const BASE = "";

export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${BASE}${path}`, {
    credentials: "same-origin",
    ...options,
    headers,
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    const message =
      payload && typeof payload === "object"
        ? payload.error?.message || "Request failed."
        : "Request failed.";
    const code = payload && typeof payload === "object" ? payload.error?.code : undefined;
    throw new ApiError(message, response.status, code);
  }
  return payload;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: "POST", body: JSON.stringify(body || {}) }),
  put: (path, body) => request(path, { method: "PUT", body: JSON.stringify(body || {}) }),
  del: (path) => request(path, { method: "DELETE" }),
};

export function sse(path, handlers) {
  const source = new EventSource(`${BASE}${path}`, { withCredentials: true });
  source.addEventListener("status", (event) => handlers.onStatus?.(JSON.parse(event.data)));
  source.addEventListener("message", (event) => handlers.onMessage?.(JSON.parse(event.data)));
  source.addEventListener("error", () => handlers.onError?.());
  return source;
}
