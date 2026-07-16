import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const jarvisSettings = pgTable("jarvis_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
