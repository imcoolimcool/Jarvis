import { Router } from "express";
import { db, conversations, messages } from "@workspace/db";
import { eq, desc, asc, sql, ilike, or, and } from "drizzle-orm";

const router = Router();

/**
 * GET /api/jarvis/conversations/search?q=...
 * Episodic memory search, matches conversation titles AND message content,
 * returning matching conversations with a snippet of the first hit.
 */
router.get("/conversations/search", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (!q) {
    res.json([]);
    return;
  }
  try {
    const pattern = `%${q.replace(/[%_]/g, "\\$&")}%`;

    // Conversations whose title matches.
    const titleMatches = await db
      .select()
      .from(conversations)
      .where(ilike(conversations.title, pattern))
      .orderBy(desc(conversations.updatedAt));

    // Message content matches (join back to their conversations).
    const msgRows = await db
      .select({
        conversationId: messages.conversationId,
        content: messages.content,
        role: messages.role,
      })
      .from(messages)
      .where(ilike(messages.content, pattern))
      .orderBy(desc(messages.createdAt))
      .limit(40);

    const convIds = [...new Set(msgRows.map((m) => m.conversationId))];
    const convMap = new Map<string, { id: string; title: string; createdAt: string; updatedAt: string }>();
    if (convIds.length > 0) {
      const matched = await db
        .select()
        .from(conversations)
        .where(sql`${conversations.id} = ANY(${convIds})`);
      for (const c of matched) convMap.set(c.id, c as any);
    }

    const snippetFor = new Map<string, string>();
    for (const m of msgRows) {
      if (!snippetFor.has(m.conversationId)) {
        const idx = (m.content ?? "").toLowerCase().indexOf(q.toLowerCase());
        const start = Math.max(0, idx - 60);
        snippetFor.set(
          m.conversationId,
          (m.content ?? "").slice(start, start + 180).replace(/\s+/g, " "),
        );
      }
    }

    const seen = new Set<string>();
    const results: { id: string; title: string; createdAt: string; updatedAt: string; snippet?: string }[] = [];
    for (const c of titleMatches) {
      seen.add(c.id);
      results.push({ ...(c as any), snippet: `Title matches: ${c.title}` });
    }
    for (const c of convMap.values()) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      results.push({ ...c, snippet: snippetFor.get(c.id) });
    }
    res.json(results.slice(0, 30));
  } catch (err) {
    req.log.error({ err }, "Failed to search conversations");
    res.status(500).json({ error: "Failed to search conversations" });
  }
});

/** List all conversations, newest first */
router.get("/conversations", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(conversations)
      .orderBy(desc(conversations.updatedAt));
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to list conversations");
    res.status(500).json({ error: "Failed to list conversations" });
  }
});

/** Create a new empty conversation */
router.post("/conversations", async (req, res) => {
  try {
    const [row] = await db
      .insert(conversations)
      .values({ title: "New Conversation" })
      .returning();
    res.json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to create conversation");
    res.status(500).json({ error: "Failed to create conversation" });
  }
});

/**
 * POST /conversations/gem
 * Create a user-defined expert gem, a conversation with kind "gem" and a
 * custom system prompt. The chat route already prefers systemPrompt when set,
 * so chatting in this conversation makes Jarvis behave as the crafted expert.
 */
router.post("/conversations/gem", async (req, res) => {
  try {
    const { title, systemPrompt } = req.body as {
      title?: string;
      systemPrompt?: string;
    };
    const cleanTitle = (title ?? "").trim().slice(0, 120);
    const cleanPrompt = (systemPrompt ?? "").trim();
    if (!cleanPrompt) {
      res.status(400).json({ error: "systemPrompt is required" });
      return;
    }
    if (cleanPrompt.length > 12000) {
      res.status(400).json({ error: "systemPrompt is too long (max 12000 chars)" });
      return;
    }
    const [row] = await db
      .insert(conversations)
      .values({
        title: cleanTitle || "New gem",
        kind: "gem",
        systemPrompt: cleanPrompt,
      })
      .returning();
    res.json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to create gem");
    res.status(500).json({ error: "Failed to create gem" });
  }
});

/** Get a single conversation with its messages */
router.get("/conversations/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const [conv] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id));

    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    const msgs = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(asc(messages.createdAt));

    res.json({ ...conv, messages: msgs });
  } catch (err) {
    req.log.error({ err }, "Failed to get conversation");
    res.status(500).json({ error: "Failed to get conversation" });
  }
});

/** Delete a conversation (messages cascade) */
router.delete("/conversations/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await db.delete(conversations).where(eq(conversations.id, id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete conversation");
    res.status(500).json({ error: "Failed to delete conversation" });
  }
});

/** Delete all conversations (messages cascade) */
router.delete("/conversations", async (req, res) => {
  try {
    // Delete all messages first, then all conversations
    await db.delete(messages);
    await db.delete(conversations);
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete all conversations");
    res.status(500).json({ error: "Failed to delete all conversations" });
  }
});

export default router;
