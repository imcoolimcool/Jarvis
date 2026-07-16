import { Router } from "express";
import { db, conversations, messages } from "@workspace/db";
import { eq, desc, asc } from "drizzle-orm";

const router = Router();

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

export default router;
