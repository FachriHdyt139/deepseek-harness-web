import http from "node:http";
import { config, missingRequiredEnv } from "./src/server/config.js";
import { logger } from "./src/server/logger.js";
import { createApp, handleUpgrade } from "./src/server/app.js";
import { harness } from "./src/server/services/harness.js";

const missing = missingRequiredEnv();
if (missing.length) {
  logger.error("missing_environment", { missing });
  process.exit(1);
}

const app = createApp();
const server = http.createServer(app);
server.on("upgrade", handleUpgrade);

server.listen(config.port, "0.0.0.0", () => {
  logger.info("server_started", {
    port: config.port,
    bind: "0.0.0.0",
    env: config.nodeEnv,
  });
});

server.on("error", (error) => {
  logger.error("server_error", { message: error.message, code: error.code });
  process.exit(1);
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info("shutdown_started", { signal });

  const force = setTimeout(() => {
    logger.warn("shutdown_forced", {});
    process.exit(1);
  }, 20_000);
  force.unref?.();

  server.close(() => {
    logger.info("server_closed", {});
  });

  try {
    await harness.shutdown();
  } catch (error) {
    logger.error("harness_shutdown_failed", { message: error.message });
  }

  clearTimeout(force);
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => {
  logger.error("unhandled_rejection", { message: reason instanceof Error ? reason.message : String(reason) });
});
process.on("uncaughtException", (error) => {
  logger.error("uncaught_exception", { message: error.message, stack: error.stack });
  shutdown("uncaughtException");
});
