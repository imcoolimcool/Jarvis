import { pgTable, text, timestamp, uuid, jsonb } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Saved Build Studio projects ("build-apps"). Each app's file bundle lives in
 * the files database (fileId); metadata (ports, run command, env keys) is
 * stored here as JSON.
 */
export const buildApps = pgTable("build_apps", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  /** Bundle file in the files database (zip or workspace manifest). */
  fileId: uuid("file_id"),
  metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type BuildApp = typeof buildApps.$inferSelect;
