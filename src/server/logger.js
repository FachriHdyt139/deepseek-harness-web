const REDACT = /(authorization|cookie|api[_-]?key|token|secret|password|set-cookie)/i;
const MAX_STRING = 4000;

function redact(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…[${value.length} chars]` : value;
  }
  if (typeof value !== "object" || depth > 4) return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => redact(item, depth + 1));
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = REDACT.test(key) ? "[redacted]" : redact(item, depth + 1);
  }
  return out;
}

function write(level, message, meta) {
  const line = {
    time: new Date().toISOString(),
    level,
    message,
    ...(meta ? redact(meta) : {}),
  };
  const text = JSON.stringify(line);
  if (level === "error") process.stderr.write(`${text}\n`);
  else process.stdout.write(`${text}\n`);
}

export const logger = {
  info: (message, meta) => write("info", message, meta),
  warn: (message, meta) => write("warn", message, meta),
  error: (message, meta) => write("error", message, meta),
};
