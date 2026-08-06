import { pgTable, text, timestamp, uuid, index } from "drizzle-orm/pg-core";
import { conversations } from "./conversations";

/** Public read-only share link for a whole conversation. */
export const shareLinks = pgTable("share_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  token: text("token").notNull().unique(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at"),
});

export type ShareLink = typeof shareLinks.$inferSelect;
