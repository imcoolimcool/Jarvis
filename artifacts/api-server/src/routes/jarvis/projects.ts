import { Router } from "express";
import { randomBytes } from "node:crypto";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  db,
  conversations,
  messages,
  pins,
  projectChats,
  projects,
  shareLinks,
} from "@workspace/db";

const router = Router();

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

router.get("/projects", async (_req, res) => {
  try {
    const rows = await db.select().from(projects).orderBy(desc(projects.updatedAt));
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to load projects" });
  }
});

router.post("/projects", async (req, res) => {
  const name = cleanText(req.body?.name, 80);
  if (!name) {
    res.status(400).json({ error: "Project name is required" });
    return;
  }
  try {
    const [row] = await db.insert(projects).values({
      name,
      color: cleanText(req.body?.color, 32) || "#0ea5e9",
      instructions: cleanText(req.body?.instructions, 4000) || null,
    }).returning();
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: "Failed to create project" });
  }
});

router.patch("/projects/:id", async (req, res) => {
  const name = cleanText(req.body?.name, 80);
  const color = cleanText(req.body?.color, 32);
  const instructions = cleanText(req.body?.instructions, 4000);
  const archived = typeof req.body?.archived === "boolean" ? req.body.archived : undefined;
  try {
    const [row] = await db.update(projects).set({
      ...(name ? { name } : {}),
      ...(color ? { color } : {}),
      ...(instructions ? { instructions } : {}),
      ...(archived === undefined ? {} : { archived }),
      updatedAt: new Date(),
    }).where(eq(projects.id, req.params.id)).returning();
    if (!row) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: "Failed to update project" });
  }
});

router.delete("/projects/:id", async (req, res) => {
  try {
    await db.delete(projects).where(eq(projects.id, req.params.id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete project" });
  }
});

router.get("/projects/:id/chats", async (req, res) => {
  try {
    const rows = await db.select({
      id: conversations.id,
      title: conversations.title,
      createdAt: conversations.createdAt,
      updatedAt: conversations.updatedAt,
    })
      .from(projectChats)
      .innerJoin(conversations, eq(projectChats.conversationId, conversations.id))
      .where(eq(projectChats.projectId, req.params.id))
      .orderBy(asc(conversations.updatedAt));
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to load project chats" });
  }
});

router.post("/projects/:id/chats", async (req, res) => {
  const conversationId = cleanText(req.body?.conversationId, 80);
  if (!conversationId) {
    res.status(400).json({ error: "conversationId is required" });
    return;
  }
  try {
    const [row] = await db.insert(projectChats).values({
      projectId: req.params.id,
      conversationId,
    }).returning();
    await db.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, req.params.id));
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: "Failed to add chat to project" });
  }
});

router.delete("/projects/:id/chats/:conversationId", async (req, res) => {
  try {
    await db.delete(projectChats).where(and(
      eq(projectChats.projectId, req.params.id),
      eq(projectChats.conversationId, req.params.conversationId),
    ));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to remove chat from project" });
  }
});

router.post("/conversations/:id/pin", async (req, res) => {
  try {
    const [existing] = await db.select().from(pins).where(eq(pins.conversationId, req.params.id));
    if (existing) {
      await db.delete(pins).where(eq(pins.conversationId, req.params.id));
      res.json({ pinned: false });
    } else {
      await db.insert(pins).values({ conversationId: req.params.id });
      res.json({ pinned: true });
    }
  } catch (err) {
    res.status(500).json({ error: "Failed to toggle pin" });
  }
});

router.get("/conversations/:id/pin", async (req, res) => {
  try {
    const [row] = await db.select().from(pins).where(eq(pins.conversationId, req.params.id));
    res.json({ pinned: Boolean(row) });
  } catch (err) {
    res.status(500).json({ error: "Failed to read pin" });
  }
});

router.post("/conversations/:id/share", async (req, res) => {
  try {
    const [conversation] = await db.select({ id: conversations.id }).from(conversations).where(eq(conversations.id, req.params.id));
    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    const token = randomBytes(18).toString("base64url");
    const [row] = await db.insert(shareLinks).values({ conversationId: req.params.id, token }).returning();
    res.status(201).json({ token: row.token, url: `/api/jarvis/share/${row.token}` });
  } catch (err) {
    res.status(500).json({ error: "Failed to create share link" });
  }
});

router.get("/share/:token", async (req, res) => {
  try {
    const [link] = await db.select().from(shareLinks).where(eq(shareLinks.token, req.params.token));
    if (!link || (link.expiresAt && link.expiresAt < new Date())) {
      res.status(404).json({ error: "Share link not found or expired" });
      return;
    }
    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, link.conversationId));
    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    const rows = await db.select().from(messages).where(eq(messages.conversationId, link.conversationId)).orderBy(asc(messages.createdAt));
    res.json({ ...conversation, messages: rows });
  } catch (err) {
    res.status(500).json({ error: "Failed to load shared conversation" });
  }
});

export default router;
