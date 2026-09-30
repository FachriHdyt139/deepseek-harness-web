import { logger } from "../logger.js";
import { AppError } from "../utils/errors.js";

export function errorHandler(err, _req, res, _next) {
  if (err?.type === "entity.too.large") {
    err.status = 413;
    err.code = "too_large";
    err.message = "The payload is too large.";
  }
  const status = Number.isFinite(err.status) ? err.status : 500;
  const code = err.code || (status >= 500 ? "internal_error" : "error");
  // Intentional AppError messages are safe to show; unexpected 5xx are masked.
  const message =
    err instanceof AppError || status < 500
      ? err.message || "Request failed."
      : "Something went wrong on the server. Please try again.";

  if (status >= 500 && !(err instanceof AppError)) {
    logger.error("request_failed", { message: err.message, stack: err.stack, code });
  }

  if (res.headersSent) return;
  res.status(status).json({ error: { message, code } });
}

export function notFoundHandler(_req, res) {
  res.status(404).json({ error: { message: "Not found.", code: "not_found" } });
}

export function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}
