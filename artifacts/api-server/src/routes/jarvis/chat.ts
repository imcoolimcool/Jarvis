import { Router } from "express";
import OpenAI from "openai";
import { fileTypeFromBuffer } from "file-type";
import { extractRawText } from "mammoth";
import { PDFParse } from "pdf-parse";
import { jarvisConfig } from "../../config/jarvis";
import { db, conversations, messages, jarvisSettings, userMemories } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { buildLiveContext } from "../../lib/live-context";

/** Personality modifiers appended to the base system prompt. */
const PERSONALITY_MODIFIERS: Record<string, string> = {
  balanced: "",
  talkative:
    "You are a little more conversational and expressive. Use a warm tone, occasionally elaborate when it adds color, and feel free to ask a follow-up question if it feels natural. Still keep voice replies under 4 sentences.",
  helpful:
    "You are maximally helpful and proactive. Anticipate what the user might need next, offer concrete suggestions, and explain your reasoning clearly. Voice replies stay concise but thorough.",
  concise:
    "You are extremely concise. Answer in the fewest words possible. One sentence is usually enough. Never add filler, never ask follow-up questions unless absolutely necessary.",
  terse:
    "You are terse and task-focused. Reply like a command-line assistant: minimal words, no pleasantries, no explanations unless the user asks. For voice mode, one short sentence or phrase.",
};

function getPersonalityModifier(personality: string): string {
  return PERSONALITY_MODIFIERS[personality] ?? PERSONALITY_MODIFIERS["balanced"];
}

async function getWebSearchResults(query: string): Promise<string | null> {
  const apiKey = process.env["TAVILY_API_KEY"] ?? process.env["WEB_SEARCH_API_KEY"];
  if (!apiKey) return null;
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "basic",
        include_answer: true,
        max_results: 5,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      answer?: string;
      results?: { title: string; url: string; content: string }[];
    };
    if (!data.results || data.results.length === 0) return null;
    const sources = data.results
      .map((r) => `- ${r.title} (${r.url})\n${r.content.slice(0, 200)}`)
      .join("\n\n");
    return `Web search results for "${query}":\n\n${data.answer ? `Summary: ${data.answer}\n\n` : ""}Sources:\n${sources}`;
  } catch {
    return null;
  }
}

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

/** Extract memorable facts from the user's message and upsert them into memory */
async function extractAndStoreMemories(
  client: OpenAI,
  userMessage: string,
  assistantResponse: string,
): Promise<void> {
  try {
    const completion = await client.chat.completions.create({
      model: jarvisConfig.llmModel,
      messages: [
        {
          role: "system",
          content: `You extract personal facts worth remembering long-term from a conversation snippet.
Return ONLY a valid JSON array of objects with "topic" and "value" fields — no explanation, no markdown.
Each topic must be a short snake_case label (e.g. "favorite_animal", "name", "home_city").
Each value must be a concise English sentence describing what was learned (e.g. "The user likes frogs").
Return an empty array [] if there is nothing worth remembering.
Only include facts about the USER, not the assistant.
Examples: [{"topic":"favorite_animal","value":"The user likes frogs"},{"topic":"name","value":"The user's name is Alex"}]`,
        },
        {
          role: "user",
          content: `User said: "${userMessage}"\nAssistant replied: "${assistantResponse}"`,
        },
      ],
      temperature: 0.2,
      max_tokens: 200,
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "[]";
    const match = raw.match(/\[.*\]/s);
    if (!match) return;
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return;

    for (const item of parsed) {
      if (typeof item.topic !== "string" || typeof item.value !== "string") continue;
      const topic = item.topic.trim().toLowerCase().replace(/\s+/g, "_").slice(0, 100);
      const value = item.value.trim().slice(0, 500);
      if (!topic || !value) continue;
      await db
        .insert(userMemories)
        .values({ topic, value, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: userMemories.topic,
          set: { value, updatedAt: new Date() },
        });
    }
  } catch {
    // Memory extraction is best-effort — never block the main response
  }
}

/** Build a formatted memory block to inject into the system prompt */
async function buildMemoryContext(): Promise<string | null> {
  const memories = await db.select().from(userMemories);
  if (memories.length === 0) return null;
  const lines = memories.map((m) => `- ${m.value}`).join("\n");
  return `## What you remember about the user\n${lines}`;
}

/** Generate 3 short follow-up suggestion chips from the assistant's last response */
async function generateSuggestions(
  client: OpenAI,
  assistantResponse: string,
): Promise<string[]> {
  try {
    const completion = await client.chat.completions.create({
      model: jarvisConfig.llmModel,
      messages: [
        {
          role: "system",
          content:
            'You generate exactly 3 short follow-up questions or replies (max 7 words each) that a user might naturally say next, based on the assistant\'s last response. Return ONLY a valid JSON array of 3 strings — no explanation, no markdown, nothing else. Example: ["Tell me more","What about X?","How does that work?"]',
        },
        {
          role: "user",
          content: `Assistant said: "${assistantResponse.slice(0, 800)}"`,
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

/** Extract plain text from common document formats. */
async function extractFileText(
  buffer: Buffer,
  mimeType: string,
): Promise<{ text: string; mimeType: string; isImage: boolean }> {
  if (mimeType.startsWith("image/")) {
    return { text: "", mimeType, isImage: true };
  }

  if (mimeType === "application/pdf" || mimeType.includes("pdf")) {
    try {
      const parser = new PDFParse({ data: buffer });
      const parsed = await parser.getText();
      await parser.destroy();
      return { text: parsed.text ?? "", mimeType, isImage: false };
    } catch {
      return { text: "[Could not read PDF contents]", mimeType, isImage: false };
    }
  }

  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType.includes("officedocument") ||
    mimeType === "application/msword"
  ) {
    try {
      const parsed = await extractRawText({ buffer });
      return { text: parsed.value ?? "", mimeType, isImage: false };
    } catch {
      return { text: "[Could not read Word document contents]", mimeType, isImage: false };
    }
  }

  // Plain text / code / markdown
  if (
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType === "application/javascript" ||
    mimeType === "application/typescript" ||
    mimeType.includes("xml") ||
    mimeType.includes("yaml")
  ) {
    return { text: buffer.toString("utf-8"), mimeType, isImage: false };
  }

  return { text: "[Unsupported file type]", mimeType, isImage: false };
}

router.post("/chat", async (req, res) => {
  const {
    userMessage,
    conversationId,
    fileBase64,
    fileMimeType,
  } = req.body as {
    userMessage: string;
    conversationId?: string;
    fileBase64?: string;
    fileMimeType?: string;
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

    const [history, settings, memoryContext] = await Promise.all([
      db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, convId))
        .orderBy(asc(messages.createdAt)),
      getSettings(),
      buildMemoryContext(),
    ]);

    const calendarEntries = [1, 2, 3, 4, 5]
      .map((n) => ({
        url: settings[`calendar_ics_url_${n}`],
        name: settings[`calendar_name_${n}`] || undefined,
      }))
      .filter((c) => c.url) as { url: string; name?: string }[];

    const liveContext = await buildLiveContext({
      weatherLocation: settings["weather_location"],
      calendars: calendarEntries,
      includeGmail: true,
    });

    // Save user message to DB (store text only; file is ephemeral)
    await db.insert(messages).values({
      conversationId: convId,
      role: "user",
      content: userMessage,
    });

    // Build current user message — include image or document content if provided
    let currentUserContent: OpenAI.Chat.ChatCompletionContentPart[] | string;
    if (fileBase64 && fileMimeType) {
      const buffer = Buffer.from(fileBase64, "base64");
      const extracted = await extractFileText(buffer, fileMimeType);

      if (extracted.isImage) {
        currentUserContent = [
          {
            type: "image_url",
            image_url: {
              url: `data:${fileMimeType};base64,${fileBase64}`,
            },
          },
          { type: "text", text: userMessage },
        ];
      } else {
        const fileDescription = extracted.text
          ? `Attached file content:\n\n${extracted.text.slice(0, 12000)}`
          : "[The user attached a file, but no text could be extracted.]";
        currentUserContent = [
          { type: "text", text: `${userMessage}\n\n${fileDescription}` },
        ];
      }
    } else {
      currentUserContent = userMessage;
    }

    // Personality modifier
    const personality = settings["personality"] ?? "balanced";
    const personalityModifier = getPersonalityModifier(personality);

    // Optional web search context
    let webContext: string | null = null;
    if (settings["web_search_enabled"] === "true" && jarvisConfig.llmModel.includes("gpt")) {
      webContext = await getWebSearchResults(userMessage);
    }

    const systemParts = [jarvisConfig.systemPrompt];
    if (personalityModifier) systemParts.push(personalityModifier);
    if (liveContext) systemParts.push(liveContext);
    if (memoryContext) systemParts.push(memoryContext);
    if (webContext) systemParts.push(webContext);

    const chatMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemParts.join("\n\n") },
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
      // Suggestions should flow from the assistant's response, not the user's input
      generateSuggestions(client, response),
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

    // Fire-and-forget: extract memorable facts from this exchange
    extractAndStoreMemories(client, userMessage, response).catch(() => {});
  } catch (err) {
    req.log.error({ err }, "LLM chat request failed");
    res.status(500).json({ error: "Chat request failed. Please try again." });
  }
});

export default router;
