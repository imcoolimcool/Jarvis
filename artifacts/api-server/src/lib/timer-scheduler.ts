/**
 * Server-side timer scheduler.
 *
 * Loads active timers from Postgres and schedules a `setTimeout` for each,
 * keyed by wall-clock `fireAt`. When a timer fires it is marked `done` and a
 * web-push notification is sent, so the user is alerted even with the tab
 * closed. An open tab rehydrates the remaining time from `GET /timers` on load.
 *
 * The scheduler is an in-process Map — the assumption is a single long-running
 * localhost server. On boot, `startTimerScheduler()` re-schedules every active
 * timer (mirroring `recoverStuckJobs` in the research engine).
 */

import { db, timers, type Timer } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { notifyAll } from "./web-push";

/** setTimeout's maximum delay (~24.8 days). Timers past this re-schedule in a loop. */
const MAX_SETTIMEOUT_MS = 2_147_483_000;

const pending = new Map<string, NodeJS.Timeout>();

/** Resume every active timer after a server restart. */
export async function startTimerScheduler(): Promise<void> {
  try {
    const active = await db.select().from(timers).where(eq(timers.status, "active"));
    for (const t of active) scheduleTimer(t);
    if (active.length > 0) logger.info(`[timers] resumed ${active.length} active timer(s) on boot`);
  } catch (err) {
    logger.warn({ err }, "[timers] failed to resume active timers on boot");
  }
}

/** Schedule (or re-schedule) a timer's setTimeout from its `fireAt`. */
export function scheduleTimer(t: Timer): void {
  if (t.status !== "active" || !t.fireAt) return;
  cancelScheduledTimer(t.id);
  const delay = new Date(t.fireAt).getTime() - Date.now();
  if (delay <= 0) {
    // Already due — fire immediately.
    void fireTimer(t.id);
    return;
  }
  const timeout = setTimeout(() => {
    void fireTimer(t.id);
  }, Math.min(delay, MAX_SETTIMEOUT_MS));
  pending.set(t.id, timeout);
}

/** Remove a timer's pending setTimeout (pause/cancel/extend). */
export function cancelScheduledTimer(id: string): void {
  const existing = pending.get(id);
  if (existing) {
    clearTimeout(existing);
    pending.delete(id);
  }
}

/** Mark the timer done and notify the user. */
async function fireTimer(id: string): Promise<void> {
  pending.delete(id);
  try {
    const [row] = await db.select().from(timers).where(eq(timers.id, id));
    if (!row || row.status !== "active") return; // cancelled/paused in the meantime
    await db
      .update(timers)
      .set({ status: "done", completedAt: new Date(), remainingSeconds: 0 })
      .where(eq(timers.id, id));
    logger.info({ timerId: id, label: row.label ?? undefined }, "[timers] fired");
    const body = row.label ? `Timer done — ${row.label}` : "Timer done";
    await notifyAll("⏰ Timer done", body);
  } catch (err) {
    logger.error({ err, timerId: id }, "[timers] fire failed");
  }
}
