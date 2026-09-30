import http from "node:http";
import zlib from "node:zlib";
import { promisify } from "node:util";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { harness } from "../services/harness.js";

export const HARNESS_PREFIX = "/app";

const gzip = promisify(zlib.gzip);
const deflate = promisify(zlib.deflate);
const brotli = promisify(zlib.brotliCompress);
const gunzip = promisify(zlib.gunzip);
const inflate = promisify(zlib.inflate);
const brotliDecompress = promisify(zlib.brotliDecompress);

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
]);

const REWRITABLE = /(text\/html|javascript|application\/x-javascript)/i;
const MAX_REWRITABLE_BYTES = 8 * 1024 * 1024;

function targetPort() {
  return config.harnessPort;
}

function buildHeaders(req) {
  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (HOP_BY_HOP.has(key.toLowerCase())) continue;
    headers[key] = value;
  }
  headers["x-forwarded-host"] = req.headers.host || "";
  headers["x-forwarded-proto"] = req.protocol || "https";
  return headers;
}

function stripPrefix(url) {
  if (!url.startsWith(HARNESS_PREFIX)) return url;
  const rest = url.slice(HARNESS_PREFIX.length);
  return rest === "" || rest.startsWith("/") || rest.startsWith("?") ? rest || "/" : url;
}

function hasHarnessCookie(req) {
  const cookie = req.headers.cookie || "";
  return /(?:^|;\s*)dsh-auth-[^=]*=/.test(cookie);
}

function withToken(path, token) {
  if (!token) return path;
  const [pathname, query = ""] = path.split("?");
  if (pathname !== "/" && pathname !== "/index.html") return path;
  const params = new URLSearchParams(query);
  if (params.has("token")) return path;
  params.set("token", token);
  return `${pathname}?${params.toString()}`;
}

function rewriteText(text) {
  return text.replace(/(["'`])(\/api|\/plugins)/g, (_match, quote, path) => `${quote}${HARNESS_PREFIX}${path}`);
}

function rewriteLocation(value, port) {
  if (!value) return value;
  const loopback = `http://127.0.0.1:${port}`;
  let path = value;
  if (value.startsWith(loopback)) path = value.slice(loopback.length) || "/";
  else if (/^https?:\/\//i.test(value)) {
    try {
      const parsed = new URL(value);
      if (parsed.host === `127.0.0.1:${port}` || parsed.hostname === "127.0.0.1") path = `${parsed.pathname}${parsed.search}`;
      else return value;
    } catch {
      return value;
    }
  }
  if (!path.startsWith("/")) path = `/${path}`;
  if (path.startsWith(HARNESS_PREFIX + "/") || path === HARNESS_PREFIX) return path;
  return `${HARNESS_PREFIX}${path}`;
}

async function decodeBody(buffer, encoding) {
  if (!encoding) return buffer;
  const value = encoding.toLowerCase();
  if (value === "gzip" || value === "x-gzip") return gunzip(buffer);
  if (value === "deflate") return inflate(buffer);
  if (value === "br") return brotliDecompress(buffer);
  return buffer;
}

async function encodeBody(buffer, encoding) {
  if (!encoding) return buffer;
  const value = encoding.toLowerCase();
  if (value === "gzip" || value === "x-gzip") return gzip(buffer);
  if (value === "deflate") return deflate(buffer);
  if (value === "br") return brotli(buffer);
  return buffer;
}

function proxyRequest(req, res) {
  if (!harness.status().running) {
    res.status(503).json({
      error: {
        message: "The AI engine is not running. Open a project to start a session.",
        code: "harness_offline",
      },
    });
    return;
  }

  const port = targetPort();
  let path = stripPrefix(req.originalUrl || req.url || "/");
  if (harness.token && !hasHarnessCookie(req) && isDocumentRequest(req)) {
    path = withToken(path, harness.token);
  }

  const headers = buildHeaders(req);
  const upstream = http.request(
    { host: "127.0.0.1", port, method: req.method, path, headers, timeout: 120_000 },
    (upstreamRes) => {
      const contentType = upstreamRes.headers["content-type"] || "";
      const contentLength = Number(upstreamRes.headers["content-length"] || 0);
      const canRewrite =
        REWRITABLE.test(contentType) &&
        !upstreamRes.headers["content-encoding"]?.includes("identity") &&
        (contentLength === 0 || contentLength < MAX_REWRITABLE_BYTES);

      const outHeaders = {};
      for (const [key, value] of Object.entries(upstreamRes.headers)) {
        if (HOP_BY_HOP.has(key.toLowerCase())) continue;
        outHeaders[key] = value;
      }
      if (outHeaders.location) outHeaders.location = rewriteLocation(outHeaders.location, port);

      if (!canRewrite) {
        res.writeHead(upstreamRes.statusCode || 502, outHeaders);
        upstreamRes.pipe(res);
        return;
      }

      const chunks = [];
      let size = 0;
      upstreamRes.on("data", (chunk) => {
        size += chunk.length;
        if (size > MAX_REWRITABLE_BYTES) {
          upstreamRes.destroy();
          res.status(502).end();
          return;
        }
        chunks.push(chunk);
      });
      upstreamRes.on("error", () => {
        if (!res.headersSent) res.status(502).end();
      });
      upstreamRes.on("end", async () => {
        if (res.writableEnded) return;
        try {
          const raw = Buffer.concat(chunks);
          const encoding = upstreamRes.headers["content-encoding"];
          const decoded = await decodeBody(raw, encoding);
          const rewritten = rewriteText(decoded.toString("utf8"));
          const out = await encodeBody(Buffer.from(rewritten, "utf8"), encoding);
          delete outHeaders["content-length"];
          if (encoding) outHeaders["content-encoding"] = encoding;
          outHeaders["content-length"] = String(out.length);
          res.writeHead(upstreamRes.statusCode || 200, outHeaders);
          res.end(out);
        } catch (error) {
          logger.error("harness_rewrite_failed", { message: error.message });
          if (!res.headersSent) res.status(502).end();
        }
      });
    },
  );

  upstream.on("timeout", () => upstream.destroy(new Error("upstream timeout")));
  upstream.on("error", (error) => {
    logger.warn("harness_proxy_error", { message: error.message });
    if (!res.headersSent) {
      res.status(502).json({
        error: {
          message: "The AI engine is not responding. It may be restarting, please try again.",
          code: "harness_unreachable",
        },
      });
    } else {
      res.end();
    }
  });

  req.pipe(upstream);
}

function isDocumentRequest(req) {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  if (req.headers["sec-fetch-dest"] === "document") return true;
  const path = stripPrefix(req.originalUrl || req.url || "/").split("?")[0];
  return path === "/" || path === "/index.html";
}

export function harnessProxy(req, res, next) {
  try {
    proxyRequest(req, res);
  } catch (error) {
    next(error);
  }
}

export function handleUpgrade(req, socket, head) {
  if (!harness.status().running || !socket.writable) {
    socket.destroy();
    return;
  }
  const port = targetPort();
  const path = stripPrefix(req.url || "/");
  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (HOP_BY_HOP.has(key.toLowerCase())) continue;
    headers[key] = value;
  }

  const upstream = http.request({ host: "127.0.0.1", port, method: req.method, path, headers });
  upstream.on("upgrade", (upstreamRes, upstreamSocket, upstreamHead) => {
    const lines = [`HTTP/1.1 101 Switching Protocols`];
    for (const [key, value] of Object.entries(upstreamRes.headers)) {
      const values = Array.isArray(value) ? value : [value];
      for (const item of values) lines.push(`${key}: ${item}`);
    }
    socket.write(`${lines.join("\r\n")}\r\n\r\n`);
    if (upstreamHead?.length) socket.write(upstreamHead);
    if (head?.length) upstreamSocket.write(head);
    upstreamSocket.pipe(socket);
    socket.pipe(upstreamSocket);
  });
  upstream.on("response", (upstreamRes) => {
    socket.destroy();
    upstreamRes.resume();
  });
  upstream.on("error", () => socket.destroy());
  upstream.on("close", () => socket.destroy());
  if (head?.length) upstream.write(head);
  upstream.end();
}
