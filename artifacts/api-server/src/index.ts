import "dotenv/config";
import app from "./app";
import { logger } from "./lib/logger";
import { ensureTables } from "./lib/auto-migrate";

const rawPort = process.env["PORT"];
const port = rawPort ? Number(rawPort) : 8080;

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Auto-create all tables on first boot (idempotent — fast no-op on subsequent
// boots). NEVER gate app.listen on this: if the DB is down, the server must
// still boot so the health check can report db: disconnected and the frontend
// gets a real, actionable error instead of "server unreachable".
ensureTables().catch((err) => {
  logger.error({ err }, "Database migration skipped — DB unreachable. Server will still start; add DATABASE_URL to bring it online.");
}).finally(() => {
  app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

    logger.info({ port }, "Server listening");
    // NOTE: The Puppeteer browser is intentionally NOT launched at startup.
    // It is lazy-initialized on first browse/screenshot request (see getBrowser()
    // in routes/jarvis/browse.ts). Eagerly launching a full Chrome instance at
    // boot was pushing the sandbox over its memory limit, causing OOM restarts
    // that killed the API server mid-conversation (voice mode errors).
  });
});
