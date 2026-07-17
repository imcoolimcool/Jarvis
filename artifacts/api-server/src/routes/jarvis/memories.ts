import { Router } from "express";
import { db, userMemories } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

/** GET /api/jarvis/memories — list all remembered facts */
router.get("/memories", async (_req, res) => {
  try {
    const rows = await db.select().from(userMemories).orderBy(userMemories.updatedAt);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to load memories" });
  }
});

/** DELETE /api/jarvis/memories/:topic — forget a specific fact */
router.delete("/memories/:topic", async (req, res) => {
  const topic = req.params["topic"];
  if (!topic) {
    res.status(400).json({ error: "topic is required" });
    return;
  }
  try {
    await db.delete(userMemories).where(eq(userMemories.topic, topic));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete memory" });
  }
});

export default router;
