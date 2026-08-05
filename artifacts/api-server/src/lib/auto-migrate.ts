/**
 * Auto-migration: creates all PostgreSQL tables and keeps their columns in
 * sync with the Drizzle schema on API server startup.
 *
 * Two layers, both idempotent:
 *  1. `CREATE TABLE IF NOT EXISTS`, fresh databases get every table.
 *  2. `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, pre-existing tables that
 *     predate newer columns (e.g. `conversations.kind` added for gems) get
 *     their missing columns without touching existing data.
 */
import { pool } from "@workspace/db";

const CREATE_TABLES = [
  // ── Core chat ────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "conversations" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "title" text NOT NULL DEFAULT 'New Conversation',
    "kind" text NOT NULL DEFAULT 'chat',
    "system_prompt" text,
    "created_at" timestamp NOT NULL DEFAULT now(),
    "updated_at" timestamp NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS "messages" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "conversation_id" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
    "role" text NOT NULL,
    "content" text NOT NULL,
    "created_at" timestamp NOT NULL DEFAULT now()
  )`,

  // ── Settings (key → value store) ────────────────────────────
  `CREATE TABLE IF NOT EXISTS "jarvis_settings" (
    "key" text PRIMARY KEY,
    "value" text NOT NULL,
    "updated_at" timestamp NOT NULL DEFAULT now()
  )`,

  // ── Cross-chat memory ───────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "user_memories" (
    "topic" text PRIMARY KEY,
    "value" text NOT NULL,
    "updated_at" timestamp NOT NULL DEFAULT now()
  )`,

  // ── OAuth tokens ────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "gmail_tokens" (
    "id" text PRIMARY KEY DEFAULT 'default',
    "access_token" text NOT NULL,
    "refresh_token" text NOT NULL,
    "expires_at" bigint NOT NULL,
    "email" text NOT NULL,
    "updated_at" timestamp NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS "spotify_tokens" (
    "id" text PRIMARY KEY DEFAULT 'default',
    "access_token" text NOT NULL,
    "refresh_token" text NOT NULL,
    "expires_at" bigint NOT NULL,
    "display_name" text,
    "updated_at" timestamp NOT NULL DEFAULT now()
  )`,

  // ── Deep research engine ────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "research_jobs" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "title" text NOT NULL,
    "prompt" text NOT NULL,
    "mode" text NOT NULL DEFAULT 'agent',
    "depth" text NOT NULL DEFAULT 'deep',
    "status" text NOT NULL DEFAULT 'queued',
    "progress" integer NOT NULL DEFAULT 0,
    "phase" text NOT NULL DEFAULT 'Queued…',
    "log" text NOT NULL DEFAULT '',
    "notes" text NOT NULL DEFAULT '',
    "report" text NOT NULL DEFAULT '',
    "gem_system_prompt" text NOT NULL DEFAULT '',
    "gem_conversation_id" uuid,
    "phases_completed" integer NOT NULL DEFAULT 0,
    "error" text,
    "heartbeat_at" timestamp NOT NULL DEFAULT now(),
    "created_at" timestamp NOT NULL DEFAULT now(),
    "started_at" timestamp,
    "completed_at" timestamp
  )`,

  // ── Web push subscriptions ──────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "push_subscriptions" (
    "endpoint" text PRIMARY KEY,
    "p256dh" text NOT NULL,
    "auth" text NOT NULL,
    "user_agent" text NOT NULL DEFAULT '',
    "created_at" timestamp NOT NULL DEFAULT now()
  )`,

  // ── LLM key rotation pool ───────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "llm_keys" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "name" text NOT NULL,
    "base_url" text NOT NULL,
    "api_key" text NOT NULL,
    "model" text NOT NULL,
    "enabled" boolean NOT NULL DEFAULT true,
    "priority" integer NOT NULL DEFAULT 0,
    "status" text NOT NULL DEFAULT 'healthy',
    "cool_down_until" timestamp,
    "uses" integer NOT NULL DEFAULT 0,
    "failures" integer NOT NULL DEFAULT 0,
    "last_used_at" timestamp,
    "created_at" timestamp NOT NULL DEFAULT now()
  )`,

  // ── In-app API keys (Freebuff-Keys-tab-free secret store) ──
  `CREATE TABLE IF NOT EXISTS "app_secrets" (
    "key" text PRIMARY KEY,
    "value" text NOT NULL,
    "description" text,
    "updated_at" timestamp NOT NULL DEFAULT now()
  )`,
];

/**
 * ALTER statements, fill in any columns missing from pre-existing tables.
 * Each is a no-op when the column already exists.
 */
const ALTER_TABLES = [
  // conversations, `kind` + `system_prompt` were added after the first deploy
  `ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "kind" text NOT NULL DEFAULT 'chat'`,
  `ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "system_prompt" text`,
  `ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "created_at" timestamp NOT NULL DEFAULT now()`,
  `ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "updated_at" timestamp NOT NULL DEFAULT now()`,

  // messages
  `ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "reasoning" text`,
  `ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "created_at" timestamp NOT NULL DEFAULT now()`,

  // research_jobs, deep research engine columns
  `ALTER TABLE "research_jobs" ADD COLUMN IF NOT EXISTS "mode" text NOT NULL DEFAULT 'agent'`,
  `ALTER TABLE "research_jobs" ADD COLUMN IF NOT EXISTS "depth" text NOT NULL DEFAULT 'deep'`,
  `ALTER TABLE "research_jobs" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'queued'`,
  `ALTER TABLE "research_jobs" ADD COLUMN IF NOT EXISTS "progress" integer NOT NULL DEFAULT 0`,
  `ALTER TABLE "research_jobs" ADD COLUMN IF NOT EXISTS "phase" text NOT NULL DEFAULT 'Queued…'`,
  `ALTER TABLE "research_jobs" ADD COLUMN IF NOT EXISTS "log" text NOT NULL DEFAULT ''`,
  `ALTER TABLE "research_jobs" ADD COLUMN IF NOT EXISTS "notes" text NOT NULL DEFAULT ''`,
  `ALTER TABLE "research_jobs" ADD COLUMN IF NOT EXISTS "report" text NOT NULL DEFAULT ''`,
  `ALTER TABLE "research_jobs" ADD COLUMN IF NOT EXISTS "gem_system_prompt" text NOT NULL DEFAULT ''`,
  `ALTER TABLE "research_jobs" ADD COLUMN IF NOT EXISTS "gem_conversation_id" uuid`,
  `ALTER TABLE "research_jobs" ADD COLUMN IF NOT EXISTS "phases_completed" integer NOT NULL DEFAULT 0`,
  `ALTER TABLE "research_jobs" ADD COLUMN IF NOT EXISTS "error" text`,
  `ALTER TABLE "research_jobs" ADD COLUMN IF NOT EXISTS "heartbeat_at" timestamp NOT NULL DEFAULT now()`,
  `ALTER TABLE "research_jobs" ADD COLUMN IF NOT EXISTS "started_at" timestamp`,
  `ALTER TABLE "research_jobs" ADD COLUMN IF NOT EXISTS "completed_at" timestamp`,

  // llm_keys, rotation pool columns
  `ALTER TABLE "llm_keys" ADD COLUMN IF NOT EXISTS "enabled" boolean NOT NULL DEFAULT true`,
  `ALTER TABLE "llm_keys" ADD COLUMN IF NOT EXISTS "priority" integer NOT NULL DEFAULT 0`,
  `ALTER TABLE "llm_keys" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'healthy'`,
  `ALTER TABLE "llm_keys" ADD COLUMN IF NOT EXISTS "cool_down_until" timestamp`,
  `ALTER TABLE "llm_keys" ADD COLUMN IF NOT EXISTS "uses" integer NOT NULL DEFAULT 0`,
  `ALTER TABLE "llm_keys" ADD COLUMN IF NOT EXISTS "failures" integer NOT NULL DEFAULT 0`,
  `ALTER TABLE "llm_keys" ADD COLUMN IF NOT EXISTS "last_used_at" timestamp`,
  `ALTER TABLE "llm_keys" ADD COLUMN IF NOT EXISTS "created_at" timestamp NOT NULL DEFAULT now()`,

  // push_subscriptions
  `ALTER TABLE "push_subscriptions" ADD COLUMN IF NOT EXISTS "user_agent" text NOT NULL DEFAULT ''`,

  // gmail / spotify
  `ALTER TABLE "gmail_tokens" ADD COLUMN IF NOT EXISTS "email" text NOT NULL DEFAULT ''`,
  `ALTER TABLE "spotify_tokens" ADD COLUMN IF NOT EXISTS "display_name" text`,
];

export async function ensureTables(): Promise<void> {
  const client = await pool.connect();
  try {
    for (const sql of CREATE_TABLES) {
      await client.query(sql);
    }
    for (const sql of ALTER_TABLES) {
      await client.query(sql);
    }
    const { rows } = await client.query(
      `SELECT count(*)::int AS c FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    console.log(`[auto-migrate] ready, ${rows[0]?.c ?? 0} public tables, columns synced`);
  } finally {
    client.release();
  }
}
