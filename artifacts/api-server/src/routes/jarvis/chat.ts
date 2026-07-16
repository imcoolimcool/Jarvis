import { Router } from "express";
import OpenAI from "openai";
import { jarvisConfig } from "../../config/jarvis";
import { db, conversations, messages } from "@workspace/db";
import { eq, asc } from "drizzle-orm";

const router = Router();

const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";

function getLLMClient(): OpenAI {
  const apiKey = process.env["OPENAI_LLM_API_KEY"];
  if (!apiKey) throw new Error("OPENAI_LLM_API_KEY is not set");
  return new OpenAI({ apiKey, baseURL: NVIDIA_BASE_URL });
}

router.post("/chat", async (req, res) => {
  const { userMessage, conversationId } = req.body as {
    userMessage: string;
    conversationId?: string;
  };

  if (!userMessage || typeof userMessage !== "string") {
    res.status(400).json({ error: "userMessage is required" });
    return;
  }

  try {
    let convId = conversationId;

    // Ensure there's a conversation row to attach messages to
    if (!convId) {
      const [newConv] = await db
        .insert(conversations)
        .values({ title: "New Conversation" })
        .returning();
      convId = newConv.id;
    }

    // Load full message history from DB for this conversation
    const history = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, convId))
      .orderBy(asc(messages.createdAt));

    // Save the incoming user message
    await db.insert(messages).values({
      conversationId: convId,
      role: "user",
      content: userMessage,
    });

    // Build the LLM context
    const chatMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: jarvisConfig.systemPrompt },
      ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user", content: userMessage },
    ];

    const client = getLLMClient();
    const completion = await client.chat.completions.create({
      model: jarvisConfig.llmModel,
      messages: chatMessages,
      temperature: 0.7,
      max_tokens: 300,
    });

    const response = completion.choices[0]?.message?.content ?? "";

    // Save the assistant reply
    await db.insert(messages).values({
      conversationId: convId,
      role: "assistant",
      content: response,
    });

    // Auto-title from first user message if still default
    const [conv] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, convId));

    if (conv && (conv.title === "New Conversation" || !conv.title)) {
      const title = userMessage.slice(0, 60) + (userMessage.length > 60 ? "…" : "");
      await db
        .update(conversations)
        .set({ title, updatedAt: new Date() })
        .where(eq(conversations.id, convId));
    } else if (conv) {
      // Bump updatedAt so it sorts to top
      await db
        .update(conversations)
        .set({ updatedAt: new Date() })
        .where(eq(conversations.id, convId));
    }

    res.json({ response, conversationId: convId });
  } catch (err) {
    req.log.error({ err }, "LLM chat request failed");
    res.status(500).json({ error: "Chat request failed. Please try again." });
  }
});

export default router;
