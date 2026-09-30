const buckets = new Map();

export function rateLimit({ windowMs = 60_000, max = 60, key = "global" } = {}) {
  return (req, res, next) => {
    const identity = req.user?.id || req.ip || "unknown";
    const bucketKey = `${key}:${identity}`;
    const now = Date.now();
    let entry = buckets.get(bucketKey);
    if (!entry || now - entry.start >= windowMs) {
      entry = { start: now, count: 0 };
      buckets.set(bucketKey, entry);
    }
    entry.count += 1;
    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, max - entry.count)));
    if (entry.count > max) {
      const error = new Error("Too many requests. Please wait a moment and try again.");
      error.status = 429;
      error.code = "rate_limited";
      return next(error);
    }
    return next();
  };
}

export function startRateLimitCleanup(intervalMs = 60_000) {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of buckets) {
      if (now - entry.start > 10 * 60_000) buckets.delete(key);
    }
  }, intervalMs);
  timer.unref?.();
  return timer;
}
