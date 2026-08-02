import { Router } from "express";
import OpenAI from "openai";
import { JarvisBrowser } from "../../lib/puppeteer-browser";
import { jarvisConfig } from "../../config/jarvis";
import * as cheerio from "cheerio";
import { buildErrorDetail } from "../../lib/error-detail";
import { pooledClient } from "../../lib/llm-client";

const router = Router();

/** Global browser instance — shared across all browse requests */
let browserInstance: JarvisBrowser | null = null;
let browserInitializing = false;

/** Agent pause control — set by POST /browse/pause (or auto on manual takeover). */
let agentPaused = false;

/**
 * Get or create the shared browser instance.
 * Lazy-initialized on first request.
 */
async function getBrowser(): Promise<JarvisBrowser> {
  if (!browserInstance && !browserInitializing) {
    browserInitializing = true;
    try {
      browserInstance = new JarvisBrowser();
      await browserInstance.launch();
    } catch (err) {
      browserInstance = null;
      console.error("[Jarvis Browser] Launch failed:", err);
      throw err;
    } finally {
      browserInitializing = false;
    }
  } else if (browserInitializing) {
    // Wait for initialization to complete
    await new Promise<void>((resolve) => {
      const check = () => {
        if (browserInstance && !browserInitializing) {
          resolve();
        } else {
          setTimeout(check, 200);
        }
      };
      check();
    });
  }
  return browserInstance!;
}

// ── Static HTML fetch (original lightweight approach) ──

router.post("/fetch", async (req, res) => {
  const startMs = Date.now();
  const { url, maxLength } = req.body as {
    url?: string;
    maxLength?: number;
  };

  if (!url || typeof url !== "string") {
    res.status(400).json({ error: "url is required" });
    return;
  }

  try {
    new URL(url);
  } catch {
    res.status(400).json({ error: "Invalid URL" });
    return;
  }

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      res.status(502).json({ error: `Page returned status ${response.status}` });
      return;
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      const text = await response.text();
      const snippet = text.slice(0, 500);
      res.json({
        url,
        contentType,
        content: `[Content type: ${contentType}]\n\n${snippet}${text.length > 500 ? "\n… (truncated)" : ""}`,
        truncated: text.length > 500,
      });
      return;
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    $("script, style, nav, footer, header, noscript, iframe, svg").remove();

    const title = $("title").first().text().trim();

    const main =
      $("main, article, [role='main'], .content, .post, .article").first() ||
      $("body");
    let text = main.text();

    text = text.replace(/\s+/g, " ").replace(/\n\s*\n/g, "\n\n").trim();

    const limit = maxLength && maxLength > 0 ? Math.min(maxLength, 50000) : 8000;
    const truncated = text.length > limit;

    res.json({
      url,
      title: title || undefined,
      content: truncated ? text.slice(0, limit) + "\n\n… (content truncated)" : text,
      truncated,
    });
  } catch (err) {
    req.log.error({ err }, "Browse request failed");
    if (err instanceof Error && err.name === "TimeoutError") {
      const detail = buildErrorDetail(err, req, 504, startMs);
      res.status(504).json({ error: "Page load timed out", detail });
    } else {
      const e = err instanceof Error ? err : new Error(String(err));
      const detail = buildErrorDetail(e, req, 502, startMs);
      res.status(502).json({ error: `Failed to fetch page: ${e.message}`, detail });
    }
  }
});

// ── Interactive browser actions (Puppeteer-powered, VISIBLE to user) ──

/**
 * POST /api/jarvis/browse/action
 * Execute an action in Jarvis's personal browser.
 * The user can see the browser in real-time via WebSocket screenshots.
 *
 * Body: { action: string, payload?: any }
 *
 * Actions:
 * - navigate: Go to a URL
 * - click: Click at coordinates or on a selector
 * - type: Type text into focused element
 * - enter: Press the Enter key
 * - scroll: Scroll the page
 * - screenshot: Get a screenshot (base64 JPEG)
 * - back: Go back in history
 * - forward: Go forward in history
 * - status: Get current browser state (URL, title, etc.)
 * - content: Get page text content
 */
router.post("/action", async (req, res) => {
  const startMs = Date.now();
  try {
    const browser = await getBrowser();

    const { action, payload } = req.body as {
      action?: string;
      payload?: any;
    };

    if (!action || typeof action !== "string") {
      res.status(400).json({ error: "action is required" });
      return;
    }

    // Manual takeover: if an agent run is active, a manual action pauses it
    // so the loop stops stepping and the human keeps control.
    agentPaused = true;

    const result = await browser.executeAction({ action, payload } as any);

    if (result.success) {
      res.json({
        success: true,
        data: result.data,
        browserState: browser.getState(),
      });
    } else {
      res.json({
        success: false,
        error: result.error,
        browserState: browser.getState(),
      });
    }
  } catch (err) {
    req.log.error({ err }, "Browser action failed");
    const e = err instanceof Error ? err : new Error(String(err));
    const detail = buildErrorDetail(e, req, 500, startMs);
    res.status(500).json({ error: `Browser action failed: ${e.message}`, detail });
  }
});

/**
 * GET /api/jarvis/browse/status
 * Get the current browser state (URL, title, loading status).
 */
router.get("/status", async (_req, res) => {
  const startMs = Date.now();
  try {
    if (!browserInstance) {
      res.json({ running: false });
      return;
    }
    res.json({ running: true, state: browserInstance.getState() });
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    const detail = buildErrorDetail(e, _req as any, 500, startMs);
    res.status(500).json({ error: e.message, detail });
  }
});

/**
 * GET /api/jarvis/browse/ws-url
 * Get the WebSocket URL for receiving live screenshots.
 */
/**
 * POST /api/jarvis/browse/pause
 * Pause the running agent loop so the human can take over the browser.
 */
router.post("/pause", async (_req, res) => {
  agentPaused = true;
  res.json({ paused: true });
});

/**
 * POST /api/jarvis/browse/resume
 * Resume a paused agent loop (continues the same goal).
 */
router.post("/resume", async (_req, res) => {
  agentPaused = false;
  res.json({ paused: false });
});

/**
 * GET /api/jarvis/browse/pause-state
 * Current pause state (for UI sync across clients).
 */
router.get("/pause-state", async (_req, res) => {
  res.json({ paused: agentPaused });
});

router.get("/ws-url", async (req, res) => {
  // The browser WebSocket server only exists while a browser instance is
  // running. Since Chrome is lazy-launched (see index.ts — we no longer spawn
  // it eagerly at boot to avoid OOM restarts), kick off the launch here BEFORE
  // the frontend opens /browser-ws, so the proxy has a live WS server to
  // forward to. Best-effort — never throws.
  void ensureBrowserStarted();

  // Derive the WebSocket URL from the current request host.
  // The browser WebSocket is served through the Vite dev proxy at
  // /browser-ws (which forwards to the Puppeteer WS server on port 3002),
  // so the client connects to the SAME origin it is already on — this works
  // behind the preview proxy without needing extra ports to be reachable.
  const protocol = req.protocol === "https" ? "wss" : "ws";
  const host = req.headers.host ?? "localhost:5173";
  res.json({ url: `${protocol}://${host}/browser-ws` });
});

// ── Autonomous agent loop (vision LLM drives the browser) ────────────────

/** System prompt for the autonomous browsing agent. */
const AGENT_SYSTEM_PROMPT = `You are Jarvis, an autonomous web-browsing agent. You are looking at a live screenshot of a browser.

The screenshot has a GRID OVERLAY made of small squares (cells):
- COLUMN numbers run along the TOP edge (1 to N, left to right).
- ROW numbers run along the LEFT edge (1 to M, top to bottom).
- Each cell is a small pixel square. To click a button — even a TINY one — pick the cell that contains the CENTER of that button.

You complete the user's task by issuing ONE JSON command at a time, based only on the current screenshot. You reply with ONLY a JSON object, nothing else — no markdown, no explanations.

Allowed commands:
{"action":"click","x":12,"y":8,"reason":"The search button is centered in this cell"}
{"action":"type","text":"hello world","enter":true,"reason":"Type into the focused text box and press Enter"}
{"action":"navigate","url":"https://example.com","reason":"Go to the website the user asked for"}
{"action":"scroll","dy":500,"reason":"Scroll down to reveal more content"}
{"action":"done","summary":"I found the answer: ...","reason":"Task complete or impossible"}

RULES:
- To type into a field: FIRST click the field (one command), THEN type (next command) — the field must be focused first.
- Set "enter":true when the typed text should submit a search or form.
- Prefer clicking visible elements over navigating to new URLs unless the task needs a specific site.
- When the task is complete (or clearly impossible), reply with {"action":"done","summary":"..."} so the loop stops.
- If the page has not changed for several steps, give up with {"action":"done",...} instead of repeating yourself.
- Never invent URLs — only navigate to addresses that are obviously correct for the task.`;

/** A single decision from the vision LLM. */
interface AgentDecision {
  action: "click" | "type" | "navigate" | "scroll" | "done";
  x?: number; // grid column (1-based)
  y?: number; // grid row (1-based)
  text?: string;
  enter?: boolean;
  url?: string;
  dy?: number;
  reason?: string;
  summary?: string;
}

/** Parse the LLM's JSON reply into a validated decision. */
function parseAgentAction(raw: string, cols: number, rows: number): AgentDecision | null {
  const cleaned = raw
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const obj = JSON.parse(match[0]) as Record<string, unknown>;
    const action = String(obj.action ?? "").toLowerCase();
    const allowed = ["click", "type", "navigate", "scroll", "done"];
    if (!allowed.includes(action)) return null;

    const decision: AgentDecision = {
      action: action as AgentDecision["action"],
      reason: typeof obj.reason === "string" ? obj.reason : undefined,
    };

    switch (action) {
      case "click": {
        const x = Math.round(Number(obj.x) || Number(obj.col) || 0);
        const y = Math.round(Number(obj.y) || Number(obj.row) || 0);
        if (x < 1 || y < 1 || x > cols || y > rows) return null;
        decision.x = x;
        decision.y = y;
        break;
      }
      case "type": {
        decision.text = typeof obj.text === "string" ? obj.text : "";
        decision.enter = Boolean(obj.enter);
        break;
      }
      case "navigate": {
        const url = typeof obj.url === "string" ? obj.url.trim() : "";
        if (!url) return null;
        decision.url = /^https?:\/\//i.test(url) ? url : `https://${url}`;
        break;
      }
      case "scroll": {
        decision.dy = Math.round(Number(obj.dy) || 500);
        break;
      }
      case "done": {
        decision.summary =
          typeof obj.summary === "string" ? obj.summary : "Task complete.";
        break;
      }
    }
    return decision;
  } catch {
    return null;
  }
}

/** Execute a decision against the real browser. Grid cell → pixel center. */
async function executeAgentAction(
  browser: JarvisBrowser,
  decision: AgentDecision,
  grid: { cellSize: number; cols: number; rows: number },
): Promise<{ success: boolean; error?: string }> {
  switch (decision.action) {
    case "click": {
      const px = decision.x! * grid.cellSize - grid.cellSize / 2;
      const py = decision.y! * grid.cellSize - grid.cellSize / 2;
      return browser.executeAction({ action: "click", payload: { x: px, y: py } });
    }
    case "type": {
      const res = await browser.executeAction({
        action: "type",
        payload: { text: decision.text ?? "" },
      });
      if (!res.success) return res;
      if (decision.enter) return browser.executeAction({ action: "enter" });
      return res;
    }
    case "navigate":
      return browser.executeAction({ action: "navigate", payload: decision.url });
    case "scroll":
      return browser.executeAction({ action: "scroll", payload: { dx: 0, dy: decision.dy ?? 500 } });
    default:
      return { success: false, error: "No executable action" };
  }
}

/**
 * POST /api/jarvis/browse/agent-run
 * Run the autonomous agent loop: look (grid screenshot) → think (vision LLM)
 * → act (click/type/navigate/scroll) → repeat until done or step limit.
 *
 * Streams Server-Sent Events:
 *   {type:"start", goal, maxSteps, cellSize}
 *   {type:"step", step, action, x, y, text, url, dy, reason}
 *   {type:"action", step, action, success, error, url}
 *   {type:"done", summary, steps, url}
 *   {type:"error", message}
 *
 * Body: { goal: string, maxSteps?: number, cellSize?: number, initialUrl?: string }
 */
router.post("/agent-run", async (req, res) => {
  const startMs = Date.now();
  const { goal, maxSteps, cellSize, initialUrl } = req.body as {
    goal?: string;
    maxSteps?: number;
    cellSize?: number;
    initialUrl?: string;
  };

  if (!goal || typeof goal !== "string" || !goal.trim()) {
    res.status(400).json({ error: "goal is required" });
    return;
  }

  const stepsLimit = Math.min(Math.max(Number(maxSteps) || 15, 3), 40);
  const gridCell = Math.min(Math.max(Number(cellSize) || 24, 16), 48);

  // ── SSE streaming ───────────────────────────────────────────────
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (payload: unknown) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  const client = pooledClient();

  let browser: JarvisBrowser;
  try {
    browser = await getBrowser();
  } catch (err) {
    send({ type: "error", message: (err as Error).message });
    send({ type: "done", summary: "The browser could not be started.", steps: 0 });
    res.write("data: [DONE]\n\n");
    res.end();
    return;
  }

  const aborted = { value: false };
  req.on("close", () => {
    aborted.value = true;
  });

  send({ type: "start", goal: goal.trim(), maxSteps: stepsLimit, cellSize: gridCell });

  // Fresh run always starts unpaused (manual takeover may re-pause it).
  agentPaused = false;

  // Optional head start: navigate first so the LLM sees a real page.
  if (initialUrl && typeof initialUrl === "string") {
    try {
      await browser.navigate(initialUrl);
    } catch {
      // Non-fatal — the LLM can still decide to navigate itself.
    }
  }

  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  let lastActionKey = "";
  let stallCount = 0;

  for (let step = 1; step <= stepsLimit; step++) {
    if (aborted.value) break;

    // 1. Look — capture the tiny-cube grid screenshot + page text.
    let grid: { image: string; cellSize: number; cols: number; rows: number };
    let content = "";
    try {
      grid = await browser.takeGridScreenshot(gridCell);
      content = await browser.getContent(6000);
    } catch (err) {
      send({ type: "error", message: `Browser screenshot failed: ${(err as Error).message}` });
      break;
    }

    const state = browser.getState();

    // 2. Think — ask the vision LLM for the next action.
    const userPrompt =
      `TASK: ${goal.trim()}\n\n` +
      `Current page: ${state.url || "(blank)"}\n` +
      `Grid is ${grid.cols} columns × ${grid.rows} rows (each cell ${grid.cellSize}px).\n\n` +
      (content ? `Visible page text (may be truncated):\n${content.slice(0, 3000)}\n\n` : "") +
      `Step ${step} of ${stepsLimit}. Choose the single best next command.`;

    let raw = "";
    try {
      const completion = await client.chat.completions.create({
        model: jarvisConfig.llmModel,
        messages: [
          { role: "system", content: AGENT_SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: `data:image/jpeg;base64,${grid.image}` },
              },
              { type: "text", text: userPrompt },
            ] as OpenAI.Chat.ChatCompletionContentPart[],
          },
        ],
        temperature: 0.2,
        max_tokens: 400,
      });
      raw = completion.choices[0]?.message?.content?.trim() ?? "";
    } catch (err) {
      send({ type: "error", message: `Vision LLM failed: ${(err as Error).message}` });
      break;
    }

    // 3. Parse the decision.
    const decision = parseAgentAction(raw, grid.cols, grid.rows);
    if (!decision) {
      send({ type: "error", message: `Could not parse agent action: ${raw.slice(0, 200)}` });
      send({ type: "done", summary: "I could not understand what to do next.", steps: step, url: state.url });
      break;
    }

    // Stall guard — the same action twice in a row usually means the loop is stuck.
    const actionKey = `${decision.action}|${decision.x}|${decision.y}|${decision.text ?? ""}|${decision.url ?? ""}|${decision.dy ?? ""}`;
    if (actionKey === lastActionKey) stallCount++;
    else stallCount = 0;
    lastActionKey = actionKey;
    if (stallCount >= 2) {
      send({ type: "done", summary: "I seem to be stuck on the same action, so I stopped.", steps: step, url: state.url });
      break;
    }

    send({
      type: "step",
      step,
      maxSteps: stepsLimit,
      action: decision.action,
      x: decision.x,
      y: decision.y,
      text: decision.text,
      url: decision.url,
      dy: decision.dy,
      reason: decision.reason,
    });

    // 4. Act — or finish.
    if (decision.action === "done") {
      send({ type: "done", summary: decision.summary ?? "Task complete.", steps: step, url: state.url });
      break;
    }

    try {
      const result = await executeAgentAction(browser, decision, grid);
      send({
        type: "action",
        step,
        action: decision.action,
        success: result.success,
        error: result.error,
        url: browser.getState().url,
      });
      if (!result.success) {
        send({ type: "error", message: `Action failed: ${result.error}` });
      }
    } catch (err) {
      send({ type: "error", message: `Action error: ${(err as Error).message}` });
    }

    await sleep(1400);

    // Human takeover: hold here until resumed or stopped.
    if (agentPaused && !aborted.value) {
      send({ type: "paused" });
      let notifiedResume = false;
      while (agentPaused && !aborted.value) {
        if (!notifiedResume) {
          send({ type: "step", step, maxSteps: stepsLimit, action: "paused", reason: "You have control - press Resume to hand it back" });
          notifiedResume = true;
        }
        await sleep(500);
      }
      if (!aborted.value) send({ type: "resumed" });
    }
  }

  if (!aborted.value && !res.writableEnded) {
    send({ type: "done", summary: "I reached the step limit.", steps: stepsLimit, url: browser.getState().url });
  }
  res.write("data: [DONE]\n\n");
  res.end();
  console.log(`[Agent] run finished (${Date.now() - startMs}ms): "${goal.trim()}"`);
});

/**
 * Eagerly start the shared browser at API server startup so its WebSocket
 * server is already listening when the frontend connects.
 * Best-effort: failures are logged but never crash the API server.
 */
export async function ensureBrowserStarted(): Promise<void> {
  try {
    await getBrowser();
  } catch (err) {
    console.error(
      "[Jarvis Browser] Eager start failed — will retry on first action:",
      err,
    );
  }
}

export default router;
