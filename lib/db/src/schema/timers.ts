import { pgTable, text, timestamp, uuid, integer } from "drizzle-orm/pg-core";

/**
 * Server-side timers + alarms.
 *
 * Unlike the old client-only implementation (which died the moment the tab
 * closed), timers live here and are scheduled by the API server's
 * timer-scheduler. When a timer fires the server sends a web-push notification
 * ("⏰ Timer done") so the user is alerted even with the tab closed; an open
 * tab rehydrates the remaining time from the server on load.
 */
export const timers = pgTable("timers", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Original duration in seconds (used for progress display). */
  durationSeconds: integer("duration_seconds").notNull(),
  /** Wall-clock time the timer fires while it's active. Null when paused/done. */
  fireAt: timestamp("fire_at"),
  /** Time left (seconds) captured when the timer was paused. Null otherwise. */
  remainingSeconds: integer("remaining_seconds"),
  /** active | paused | done | cancelled */
  status: text("status", { enum: ["active", "paused", "done", "cancelled"] })
    .notNull()
    .default("active"),
  /** Optional human label, e.g. "pasta" from "set a timer for pasta". */
  label: text("label"),
  /** Conversation this timer was created in, if any. */
  conversationId: uuid("conversation_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});

export type Timer = typeof timers.$inferSelect;
