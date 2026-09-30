export class AppError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code || "error";
  }
}

export const badRequest = (message) => new AppError(400, message, "bad_request");
export const unauthorized = (message = "Authentication required.") =>
  new AppError(401, message, "unauthorized");
export const forbidden = (message = "You do not own this resource.") =>
  new AppError(403, message, "forbidden");
export const notFound = (message = "Not found.") => new AppError(404, message, "not_found");
export const conflict = (message) => new AppError(409, message, "conflict");
export const tooLarge = (message = "Payload too large.") => new AppError(413, message, "too_large");
export const rateLimited = (message = "Too many requests. Please slow down.") =>
  new AppError(429, message, "rate_limited");
export const unavailable = (message = "Service temporarily unavailable.") =>
  new AppError(503, message, "unavailable");
export const busy = (message = "Server busy. Please wait for the current AI session to finish.") =>
  new AppError(503, message, "busy");
