import { pgTable, text, timestamp, uuid, integer } from "drizzle-orm/pg-core";

/**
 * Long-running background deep-research jobs.
 *
 * A research job runs in the background on the API server for a very long
 * time (hours → days). The engine writes progress, phase logs and distilled
 * notes into this table on every step, so the frontend can poll status and
 * so a server restart can resume a job from where it left off.
 */
export const researchJobs = pgTable("research_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  prompt: text("prompt").notNull(),
  /** "agent" = full autonomous search + page reading, "normal" = search + synthesis only */
  mode: text("mode", { enum: ["agent", "normal"] }).notNull().default("agent"),
  /** "standard" | "deep" | "quantum" — scales the number of phases and pacing */
  depth: text("depth", { enum: ["standard", "deep", "quantum"] }).notNull().default("deep"),
  /** queued | running | completed | failed | cancelled */
  status: text("status", { enum: ["queued", "running", "completed", "failed", "cancelled"] })
    .notNull()
    .default("queued"),
  /** 0-100 progress */
  progress: integer("progress").notNull().default(0),
  /** Current phase label, e.g. "Phase 4/18 — Quantum error correction foundations" */
  phase: text("phase").notNull().default("Queued…"),
  /** Append-only human-readable log of every step the engine took */
  log: text("log").notNull().default(""),
  /** Accumulated distilled knowledge (markdown), the raw research corpus */
  notes: text("notes").notNull().default(""),
  /** Final synthesized report — written when the job completes */
  report: text("report").notNull().default(""),
  /** Custom system prompt for the finished gem chat */
  gemSystemPrompt: text("gem_system_prompt").notNull().default(""),
  /** Conversation created for this gem (kind = "gem") */
  gemConversationId: uuid("gem_conversation_id"),
  /** Number of phases actually executed (replanning can grow this) */
  phasesCompleted: integer("phases_completed").notNull().default(0),
  error: text("error"),
  /** Heartbeat timestamp — a job whose heartbeat is stale gets resumed on boot */
  heartbeatAt: timestamp("heartbeat_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
});

export type ResearchJob = typeof researchJobs.$inferSelect;
