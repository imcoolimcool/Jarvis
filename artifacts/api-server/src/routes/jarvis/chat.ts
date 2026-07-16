import { Router } from "express";
import OpenAI from "openai";
import { jarvisConfig } from "../../config/jarvis";
import { db, conversations, messages, jarvisSettings } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { buildLiveContext } from "../../lib/live-context";

const router = Router();
const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";

function getLLMClient(): OpenAI {
  const apiKey = process.env["OPENAI_LLM_API_KEY"];
  if (!apiKey) throw new Error("OPENAI_LLM_API_KEY is not set");
  return new OpenAI({ apiKey, baseURL: NVIDIA_BASE_URL });
}

async function getSettings(): Promise<Record<string, string>> {
  const rows = await db.select().from(jarvisSettings);
  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value;
  return map;
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

    if (!convId) {
      const [newConv] = await db
        .insert(conversations)
        .values({ title: "New Conversation" })
        .returning();
      convId = newConv.id;
    }

    // Load history and settings in parallel
    const [history, settings] = await Promise.all([
      db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, convId))
        .orderBy(asc(messages.createdAt)),
      getSettings(),
    ]);

    // Build live context (time always; weather + calendar if configured)
    const liveContext = await buildLiveContext({
      weatherLocation: settings["weather_location"],
      calendarIcsUrl: settings["calendar_ics_url"],
    });

    // Save user message
    await db.insert(messages).values({
      conversationId: convId,
      role: "user",
      content: userMessage,
    });

    const chatMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: jarvisConfig.systemPrompt },
      { role: "system", content: liveContext },
      ...history.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
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

    // Save assistant reply and update conversation in parallel
    const [conv] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, convId));

    await Promise.all([
      db.insert(messages).values({
        conversationId: convId,
        role: "assistant",
        content: response,
      }),
      db.update(conversations).set({
        title:
          conv?.title === "New Conversation"
            ? userMessage.slice(0, 60) + (userMessage.length > 60 ? "…" : "")
            : conv?.title,
        updatedAt: new Date(),
      }).where(eq(conversations.id, convId)),
    ]);

    res.json({ response, conversationId: convId });
  } catch (err) {
    req.log.error({ err }, "LLM chat request failed");
    res.status(500).json({ error: "Chat request failed. Please try again." });
  }
});

export default router;
