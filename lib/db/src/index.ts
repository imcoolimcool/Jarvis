import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

// Do NOT crash the whole server at import time when DATABASE_URL is missing.
// Instead, construct a pool that fails fast on connect: the health route
// reports `db: disconnected` and chat/settings routes surface a clear,
// detailed error (with the exact fix) instead of taking the entire app down
// with "server unreachable".
export const pool = new Pool(
  connectionString
    ? { connectionString }
    : { connectionTimeoutMillis: 2000, idleTimeoutMillis: 2000, max: 1 },
);

// Required when the DB is down: pg emits an "error" event for idle-client
// failures, and an unhandled one crashes the whole Node process. Swallow and
// log instead — the app stays up and the health check reports disconnected.
pool.on("error", (err) => {
  console.error(`[db] pool error (${connectionString ? "configured" : "DATABASE_URL missing"}):`, err.message);
});

export const db = drizzle(pool, { schema });

export const databaseConfigured = !!connectionString;

export * from "./schema";
