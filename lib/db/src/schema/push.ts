import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Web Push subscriptions — one row per browser/device that has allowed
 * notifications. Used to send real system notifications (e.g. "deep research
 * finished") even when the tab is closed.
 */
export const pushSubscriptions = pgTable("push_subscriptions", {
  /** The push service endpoint URL (unique per subscription). */
  endpoint: text("endpoint").primaryKey(),
  /** Base64 of the subscriber's raw P-256 public key (from pushManager.getKey('p256dh')). */
  p256dh: text("p256dh").notNull(),
  /** Base64 of the subscriber's auth secret (from pushManager.getKey('auth')). */
  auth: text("auth").notNull(),
  userAgent: text("user_agent").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
