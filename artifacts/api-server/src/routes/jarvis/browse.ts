import { Router } from "express";
import { JarvisBrowser } from "../../lib/puppeteer-browser";
import * as cheerio from "cheerio";
import { buildErrorDetail } from "../../lib/error-detail";

const router = Router();

/** Global browser instance — shared across all browse requests */
let browserInstance: JarvisBrowser | null = null;
let browserInitializing = false;

/**
 * Get or create the shared browser instance.
 * Lazy-initialized on first request.
 */
async function getBrowser(): Promise<JarvisBrowser> {
  if (!browserInstance && !browserInitializing) {
    browserInitializing = true;
    browserInstance = new JarvisBrowser();
    await browserInstance.launch();
    browserInitializing = false;
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
router.get("/ws-url", (req, res) => {
  // Derive the WebSocket URL from the current request host
  const protocol = req.protocol === "https" ? "wss" : "ws";
  const host = req.headers.host ?? "localhost:3001";
  // The browser WebSocket runs on the same host but a different port (3002)
  // In production behind a reverse proxy, the WS is accessible from the same host
  const wsPort = process.env["BROWSER_WS_PORT"] ?? "3002";
  const wsHost = host.replace(/:\d+$/, "");
  res.json({ url: `${protocol}://${wsHost}:${wsPort}` });
});

export default router;
