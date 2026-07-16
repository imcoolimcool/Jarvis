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

/** Generate 3 short follow-up suggestion chips from the latest exchange */
async function generateSuggestions(
  client: OpenAI,
  userMessage: string,
  assistantResponse: string,
): Promise<string[]> {
  try {
    const completion = await client.chat.completions.create({
      model: jarvisConfig.llmModel,
      messages: [
        {
          role: "system",
          content:
            'You generate exactly 3 short follow-up questions or replies (max 7 words each) that a user might naturally say next, given the conversation excerpt below. Return ONLY a valid JSON array of 3 strings — no explanation, no markdown, nothing else. Example: ["Tell me more","What about X?","How does that work?"]',
        },
        {
          role: "user",
          content: `User said: "${userMessage}"\nAssistant replied: "${assistantResponse}"`,
        },
      ],
      temperature: 0.8,
      max_tokens: 80,
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "[]";
    // Extract JSON array from response (model may wrap it in markdown)
    const match = raw.match(/\[.*\]/s);
    if (!match) return [];
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, 3).map((s: unknown) => String(s));
  } catch {
    return [];
  }
}

router.post("/chat", async (req, res) => {
  const {
    userMessage,
    conversationId,
    imageBase64,
    imageMimeType,
  } = req.body as {
    userMessage: string;
    conversationId?: string;
    imageBase64?: string;
    imageMimeType?: string;
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

    const [history, settings] = await Promise.all([
      db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, convId))
        .orderBy(asc(messages.createdAt)),
      getSettings(),
    ]);

    const calendarUrls = [1, 2, 3, 4, 5]
      .map((n) => settings[`calendar_ics_url_${n}`])
      .filter(Boolean) as string[];

    const liveContext = await buildLiveContext({
      weatherLocation: settings["weather_location"],
      calendarIcsUrls: calendarUrls,
    });

    // Save user message to DB (store text only; image is ephemeral)
    await db.insert(messages).values({
      conversationId: convId,
      role: "user",
      content: userMessage,
    });

    // Build current user message — include image if provided
    let currentUserContent: OpenAI.Chat.ChatCompletionContentPart[] | string;
    if (imageBase64 && imageMimeType) {
      currentUserContent = [
        {
          type: "image_url",
          image_url: {
            url: `data:${imageMimeType};base64,${imageBase64}`,
          },
        },
        { type: "text", text: userMessage },
      ];
    } else {
      currentUserContent = userMessage;
    }

    const chatMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: jarvisConfig.systemPrompt },
      { role: "system", content: liveContext },
      ...history.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user", content: currentUserContent },
    ];

    const client = getLLMClient();
    const completion = await client.chat.completions.create({
      model: jarvisConfig.llmModel,
      messages: chatMessages,
      temperature: 0.7,
      max_tokens: 300,
    });

    const response = completion.choices[0]?.message?.content ?? "";

    // Persist assistant reply + update conversation title; generate suggestions in parallel
    const [conv] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, convId));

    const [suggestions] = await Promise.all([
      generateSuggestions(client, userMessage, response),
      db.insert(messages).values({
        conversationId: convId,
        role: "assistant",
        content: response,
      }),
      db
        .update(conversations)
        .set({
          title:
            conv?.title === "New Conversation"
              ? userMessage.slice(0, 60) + (userMessage.length > 60 ? "…" : "")
              : conv?.title,
          updatedAt: new Date(),
        })
        .where(eq(conversations.id, convId)),
    ]);

    res.json({ response, conversationId: convId, suggestions });
  } catch (err) {
    req.log.error({ err }, "LLM chat request failed");
    res.status(500).json({ error: "Chat request failed. Please try again." });
  }
});

export default router;
