import { Router } from "express";
import OpenAI from "openai";
import { fileTypeFromBuffer } from "file-type";
import { extractRawText } from "mammoth";
import { PDFParse } from "pdf-parse";
import { jarvisConfig } from "../../config/jarvis";
import { db, conversations, messages, jarvisSettings, userMemories } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { buildLiveContext } from "../../lib/live-context";
import { detectAndBuildWidget } from "../../lib/widget-detector";
import { buildErrorDetail } from "../../lib/error-detail";

/** Personality modifiers appended to the base system prompt. */
const PERSONALITY_MODIFIERS: Record<string, string> = {
  balanced: "",
  talkative:
    "You are chatty and social. Prioritize banter, warmth, and personality over usefulness. Feel free to ramble a bit, ask how the user is doing, and make small talk. Don't worry about solving things efficiently — just keep the conversation flowing.",
  helpful:
    "You are extremely helpful and proactive. Before answering, think about what the user is actually trying to achieve. Offer clear next steps, relevant options, and practical suggestions. Explain briefly why you recommend something. If you can save them a step, do it.",
  concise:
    "You are impatient and hyper-direct. No greetings, no fluff, no explanations. When the user says something casual like 'hello', reply with something like 'what do you need, I'll do it asap'. Get straight to the task and finish in as few words as possible.",
};

function getPersonalityModifier(personality: string, customPrompt?: string): string {
  if (personality === "custom" && customPrompt) return customPrompt;
  return PERSONALITY_MODIFIERS[personality] ?? PERSONALITY_MODIFIERS["balanced"];
}

/** AI Self-Action: Auto-detect the best personality based on context. */
function detectAutoPersonality(userMessage: string): string {
  const t = userMessage.toLowerCase();

  // Work/coding context → helpful mode
  const workPatterns = [
    /\b(code|debug|fix|bug|error|build|deploy|compile|merge|push|commit|pr\b|review)\b/,
    /\b(write|implement|create|make)\s+(a\s+)?(function|class|api|endpoint|route|component|hook)\b/,
  ];
  if (workPatterns.some((p) => p.test(t))) return "helpful";

  // Casual/social context → talkative mode
  const socialPatterns = [
    /\b(hey|hi|hello|sup|how('?s| is) it going|what'?s up|good morning|good evening)\b/,
    /\b(chat|talk|tell me about yourself|how are you)\b/,
  ];
  if (socialPatterns.some((p) => p.test(t))) return "talkative";

  // Quick/urgent → concise mode
  const urgentPatterns = [
    /\b(urgent|asap|quick|hurry|fast|now!|quickly|short|brief)\b/,
    /^[^\s]{1,30}$/, // Very short messages (1-word or short commands)
  ];
  if (urgentPatterns.some((p) => p.test(t))) return "concise";

  // Default to balanced
  return "balanced";
}

/** AI Self-Action: Allow Jarvis to announce a personality change. */
const PERSONALITY_CHANGE_MESSAGES: Record<string, string> = {
  talkative: " (I'm switching to chatty mode — let's keep the conversation flowing!)",
  helpful: " (I'm switching to work mode — ready to help you build.)",
  concise: " (I'm switching to direct mode — keeping it short.)",
  balanced: "",
};

/** Detect if the user is asking to generate or draw an image. */
/** Detect if the user is asking to start screen sharing. */
function detectScreenShareRequest(text: string): boolean {
  const t = text.toLowerCase().trim();
  return /(start|begin|activate|enable)\s+(screen\s+)?(share|sharing|screen\s+share)/i.test(t)
    || /share\s+(my\s+)?screen/i.test(t)
    || /(let|have)\s+(me|jarvis)\s+see\s+(your\s+)?screen/i.test(t)
    || /screen\s+(share|sharing)/i.test(t);
}

/** Detect if the user wants to open the browser agent and search/navigate. */
function detectAgentBrowserRequest(text: string): { isAgentRequest: boolean; searchQuery: string } {
  const t = text.toLowerCase().trim();
  // Patterns: "search for X in agent mode", "browse to Y", "open Y in browser", "look up X in agent"
  const patterns = [
    /(?:search|look\s+up|find|google)\s+(?:for\s+)?(.+?)\s+(?:in\s+)?(?:agent|browser)\s*(?:mode)?/i,
    /(?:in\s+)?(?:agent|browser)\s*(?:mode)?[,.\s]+(?:search|look\s+up|find|google)\s+(?:for\s+)?(.+)/i,
    /(?:browse|open|go\s+to|navigate)\s+(?:to\s+)?(.+?)\s+(?:in\s+)?(?:agent|browser)/i,
    /(?:in\s+)?(?:agent|browser)\s*(?:mode)?[,.\s]+(?:browse|open|go\s+to|navigate)\s+(?:to\s+)?(.+)/i,
    /(?:search|look\s+up|find|google)\s+(?:for\s+)?(.+)/i,
  ];
  for (const pattern of patterns) {
    const match = t.match(pattern);
    if (match) {
      return { isAgentRequest: true, searchQuery: match[1].trim() };
    }
  }
  return { isAgentRequest: false, searchQuery: '' };
}

/** Detect if the user is asking to draw/generate/create an image. */
function detectImageRequest(text: string): { isImageRequest: boolean; imagePrompt: string } {
  const t = text.trim().toLowerCase();

  // Patterns that indicate an image generation request
  const imagePatterns = [
    /^(draw|generate|create|make|paint|show|give)\s+(me\s+)?(a\s+|an\s+|some\s+)?(picture|image|photo|art|drawing|illustration|sketch|meme|icon|logo|graphic|visual|artwork)/i,
    /(draw|generate|create|make|paint)\s+(an\s+|a\s+)?(image|picture|photo|art|illustration|drawing|sketch)/i,
    /^(draw|generate|create|make|paint)\s/,
    /^how\s+(would|does)\s+(you|jarvis)\s+(draw|make|create|generate)\s/i,
  ];

  for (const pattern of imagePatterns) {
    if (pattern.test(text)) {
      // Extract a clean image prompt from the text
      // Remove leading commands like "draw me a", "generate a picture of", etc.
      let imagePrompt = text
        .replace(/^(draw|generate|create|make|paint|show|give)\s+(me\s+)?(a\s+|an\s+|some\s+)?(picture|image|photo|art|drawing|illustration|sketch)\s+(of\s+)?/i, '')
        .replace(/^(draw|generate|create|make|paint)\s+(a\s+|an\s+)?(image|picture|photo|art|illustration|drawing)\s+(of\s+)?/i, '')
        .trim();

      // If the prompt is too short or empty, use the original text as prompt
      if (!imagePrompt || imagePrompt.length < 3) {
        imagePrompt = text;
      }

      return { isImageRequest: true, imagePrompt };
    }
  }

  return { isImageRequest: false, imagePrompt: '' };
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

/** Sanitize user input — trim, collapse whitespace, enforce max length */
function sanitizeInput(text: string): string {
  return text
    .trim()
    .replace(/\r\n/g, "\n")          // normalize line endings
    .replace(/\n{4,}/g, "\n\n\n")    // cap consecutive newlines
    .slice(0, 32000);                 // 32K char limit prevents abuse
}

/** Simple per-IP rate limiter — in-memory, resets on server restart */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 30;           // 30 requests per minute

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

// Periodic cleanup of stale rate limit entries (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(ip);
  }
}, 300_000).unref();

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
Be EXTREMELY selective — only remember DURABLE personal facts the user has explicitly told you about themselves: their name, job, location, family members, long-term preferences they've clearly stated.
Do NOT remember: lyrics, song titles, quotes, one-off questions, temporary tasks, things already obvious from context, transient info, facts stated by the assistant, or things the user said about third parties. If the user quotes something or says a lyric, that is NOT a fact about them.
Examples of what NOT to remember: "favorite band: The user likes Wham!" (this was a lyric, not a preference), "year of birth: born before 1987" (this was a joke/lyric, not a stated fact).
Only save if the user EXPLICITLY says "my name is X", "I work as Y", "I live in Z", "my favorite X is Y", etc.`,
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

/** Build a formatted memory + profile block to inject into the system prompt */
async function buildMemoryContext(): Promise<string | null> {
  const [memories, settings] = await Promise.all([
    db.select().from(userMemories),
    getSettings(),
  ]);

  const parts: string[] = [];

  const profile = settings["user_profile"]?.trim();
  if (profile) parts.push(`## About the user\n${profile}`);

  if (memories.length > 0) {
    const lines = memories.map((m) => `- ${m.value}`).join("\n");
    parts.push(`## What you remember about the user\n${lines}`);
  }

  return parts.length > 0 ? parts.join("\n\n") : null;
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

/** Generate a short 3–6 word conversation title using the LLM */
async function generateConversationTitle(
  client: OpenAI,
  conversationHistory: { role: string; content: string }[],
): Promise<string | null> {
  try {
    // Build a condensed version of the conversation for title generation
    // Include up to 6 messages (3 pairs) to capture the conversation topic
    const recentMessages = conversationHistory.slice(-6);
    const conversationSummary = recentMessages
      .map((m) => `${m.role}: "${m.content.slice(0, 200)}"`)
      .join("\n");

    const completion = await client.chat.completions.create({
      model: jarvisConfig.llmModel,
      messages: [
        {
          role: "system",
          content:
            "Generate a very short conversation title (3–6 words) that captures the main topic. " +
            "Return ONLY a single string in JSON format — no explanation, no markdown. " +
            'Example: "Weather in London" or "Setting up the project" or "Debugging auth flow"',
        },
        {
          role: "user",
          content: `Conversation:\n${conversationSummary}`,
        },
      ],
      temperature: 0.3,
      max_tokens: 30,
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "";
    const cleaned = raw.replace(/^["']|["']$/g, "").replace(/^```.*\n?|```$/g, "").trim();
    return cleaned.length > 0 && cleaned.length < 100 ? cleaned : null;
  } catch {
    return null;
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
  const startMs = Date.now();
  const {
    userMessage,
    conversationId,
    fileBase64,
    fileMimeType,
    webSearchEnabled,
    responseStyle,
  } = req.body as {
    userMessage: string;
    conversationId?: string;
    fileBase64?: string;
    fileMimeType?: string;
    webSearchEnabled?: string;
    responseStyle?: 'chat' | 'voice';
  };

  if (!userMessage || typeof userMessage !== "string") {
    res.status(400).json({ error: "userMessage is required" });
    return;
  }

  // Rate limit check
  const clientIp = req.ip ?? req.socket.remoteAddress ?? "unknown";
  if (!checkRateLimit(clientIp)) {
    res.status(429).json({ error: "Too many requests — slow down" });
    return;
  }

  // Sanitize input
  const sanitizedMessage = sanitizeInput(userMessage);
  if (!sanitizedMessage) {
    res.status(400).json({ error: "Empty message after sanitization" });
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

    const [liveContext, widget] = await Promise.all([
      buildLiveContext({
        weatherLocation: settings["weather_location"],
        calendars: calendarEntries,
        includeGmail: true,
      }),
      detectAndBuildWidget(sanitizedMessage, settings),
    ]);

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

    // Personality modifier — supports AI self-action "auto" mode
    const personalitySetting = settings["personality"] ?? "balanced";
    const customPrompt = settings["custom_personality_prompt"];

    // AI Self-Action: Auto-detect personality based on context
    let resolvedPersonality = personalitySetting;
    if (personalitySetting === "auto") {
      const lastAuto: string | undefined = settings["auto_personality"];
      const detected = detectAutoPersonality(sanitizedMessage);
      resolvedPersonality = detected;
      if (detected !== lastAuto) {
        // Persist the change so it persists across messages (best-effort)
        // Use direct DB update instead of a fetch call (we're already in the server)
        db.insert(jarvisSettings)
          .values({ key: "auto_personality", value: detected, updatedAt: new Date() })
          .onConflictDoUpdate({ target: jarvisSettings.key, set: { value: detected, updatedAt: new Date() } })
          .catch(() => {});
      }
    }
    const personalityModifier = getPersonalityModifier(resolvedPersonality, customPrompt);

    // Optional web search context
    let webContext: string | null = null;
    const shouldSearch = webSearchEnabled === "true" || settings["web_search_enabled"] === "true";
    if (shouldSearch) {
      webContext = await getWebSearchResults(sanitizedMessage);
    }

    // Response style modifier based on chat vs voice mode
    const style = responseStyle ?? 'voice';
    const responseStyleModifier = style === 'chat'
      ? "You are in CHAT MODE. Provide longer, more structured responses. Use markdown formatting (headers, bullet points, code blocks). Be thorough and detailed. You can use **bold**, *italic*, `code`, and lists to organize information."
      : "You are in VOICE MODE. Keep responses short, natural, and conversational — ideally 1-3 sentences. No markdown formatting since this will be spoken aloud. Be concise and direct.";

    // When personality is "custom", the user's prompt IS the entire system
    // prompt — it fully replaces the Jarvis base instructions.
    const basePrompt =
      personalitySetting === "custom" && customPrompt
        ? customPrompt
        : jarvisConfig.systemPrompt;
    const systemParts = [basePrompt];
    // Only append a personality modifier for non-custom modes
    if (personalitySetting !== "custom" && personalityModifier) systemParts.push(personalityModifier);
    systemParts.push(responseStyleModifier);
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

    // Determine max_tokens based on response style — chat needs room, voice stays short
    const maxTokens = style === 'chat' ? 2048 : 300;

    // ── SSE streaming ──────────────────────────────────────────────
    // Set headers for Server-Sent Events so the frontend can consume a live stream.
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // nginx: disable proxy buffering
    res.flushHeaders();

    // ── Agent browser auto-detect ─────────────────────────────────
    // If the user wants to search/browse in agent mode, send event to open PiP browser.
    const agentCheck = detectAgentBrowserRequest(sanitizedMessage);
    if (agentCheck.isAgentRequest) {
      await db.insert(messages).values({
        conversationId: convId,
        role: "user",
        content: userMessage,
      });
      res.write(`data: ${JSON.stringify({
        type: "agent_browser_detected",
        searchQuery: agentCheck.searchQuery,
      })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }

    // ── Screen sharing auto-detect ─────────────────────────────────
    // If the user is asking to start screen sharing, send a confirmation event.
    if (detectScreenShareRequest(sanitizedMessage)) {
      await db.insert(messages).values({
        conversationId: convId,
        role: "user",
        content: userMessage,
      });
      res.write(`data: ${JSON.stringify({
        type: "screen_share_detected",
        confirmationMessage: "Do you want to share your screen with Jarvis?",
      })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }

    // ── Image generation auto-detect ─────────────────────────────────
    // If the user is asking to generate/draw/create an image, send a
    // confirmation prompt instead of going to the LLM.
    const imageCheck = detectImageRequest(sanitizedMessage);
    if (imageCheck.isImageRequest) {
      // Save the user message to DB
      await db.insert(messages).values({
        conversationId: convId,
        role: "user",
        content: userMessage,
      });

      // Send confirmation prompt as an SSE event
      res.write(`data: ${JSON.stringify({
        type: "image_request_detected",
        imagePrompt: imageCheck.imagePrompt,
        confirmationMessage: `Do you want me to generate an image of ${imageCheck.imagePrompt}?`,
      })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }

    const stream = await client.chat.completions.create({
      model: jarvisConfig.llmModel,
      messages: chatMessages,
      temperature: 0.7,
      max_tokens: maxTokens,
      stream: true,
    });

    let fullResponse = "";
    let totalTokens = 0;
    try {
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content ?? "";
        if (delta) {
          fullResponse += delta;
          // Send each token as an SSE event
          res.write(`data: ${JSON.stringify({ type: "token", content: delta })}\n\n`);
        }
        // Track usage from the final chunk (some providers include it)
        if (chunk.usage) {
          totalTokens = chunk.usage.total_tokens ?? 0;
        }
      }
    } catch (streamErr) {
      // If streaming fails mid-way, send an error event and bail
      req.log.error({ err: streamErr }, "LLM streaming failed mid-response");
      res.write(`data: ${JSON.stringify({ type: "error", message: "Stream interrupted" })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }

    const response = fullResponse;

    // Signal end of stream
    res.write(`data: ${JSON.stringify({ type: "done", conversationId: convId, tokens: totalTokens || undefined })}\n\n`);

    // Persist assistant reply + generate suggestions in parallel (fire-and-forget after stream ends)
    Promise.all([
      generateSuggestions(client, response),
      db.insert(messages).values({
        conversationId: convId,
        role: "assistant",
        content: response,
      }),
      db
        .update(conversations)
        .set({ updatedAt: new Date() })
        .where(eq(conversations.id, convId)),
    ]).then(([suggestions]) => {
      // Send suggestions as a final SSE event before closing
      res.write(`data: ${JSON.stringify({ type: "suggestions", suggestions })}\n\n`);
      if (widget) {
        res.write(`data: ${JSON.stringify({ type: "widget", widget })}\n\n`);
      }
      res.write("data: [DONE]\n\n");
      res.end();
    }).catch(() => {
      res.write("data: [DONE]\n\n");
      res.end();
    });

    // Fire-and-forget: generate a proper title from conversation history (first message only)
    const shouldGenerateTitle = history.length === 0;
    if (shouldGenerateTitle) {
      const fullHistory = [
        ...history.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: sanitizedMessage },
        { role: "assistant", content: response },
      ];
      generateConversationTitle(client, fullHistory).then((title) => {
        if (title) {
          db.update(conversations)
            .set({ title, updatedAt: new Date() })
            .where(eq(conversations.id, convId))
            .catch(() => {});
        }
      });
    }

    // Fire-and-forget: extract memorable facts from this exchange
    extractAndStoreMemories(client, sanitizedMessage, response).catch(() => {});
  } catch (err) {
    req.log.error({ err }, "LLM chat request failed");
    let msg = "Chat request failed. Please try again.";
    if (err instanceof Error) {
      if (err.message.includes("OPENAI_LLM_API_KEY")) msg = "LLM API key not configured on the server.";
      else if (err.message.includes("401") || err.message.includes("Unauthorized")) msg = "LLM authentication failed — check API key.";
      else if (err.message.includes("429") || err.message.includes("Rate limit")) msg = "LLM rate limit exceeded — try again shortly.";
      else if (err.message.includes("timeout") || err.message.includes("abort")) msg = "LLM request timed out — check your connection.";
    }
    const detail = buildErrorDetail(err instanceof Error ? err : new Error(String(err)), req, 500, startMs);
    res.status(500).json({ error: msg, detail });
  }
});

export default router;
