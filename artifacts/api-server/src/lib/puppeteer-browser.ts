/**
 * Jarvis's Personal Browser — Puppeteer-based visible browser.
 * The user can see exactly what Jarvis is browsing, and can take control at any time.
 *
 * Architecture:
 * - Backend: Puppeteer browser instance, screenshot streaming via WebSocket
 * - Frontend: Browser viewer component showing live screenshots
 * - User can: watch Jarvis browse, see clicks/cursor, take over control
 */

import puppeteer, { Browser, Page } from "puppeteer";
import { WebSocketServer, WebSocket } from "ws";
import { createServer, Server as HttpServer } from "http";
import { EventEmitter } from "events";

export interface BrowserState {
  url: string;
  title: string;
  loading: boolean;
  cursorX: number;
  cursorY: number;
  viewportWidth: number;
  viewportHeight: number;
}

export interface BrowseAction {
  action: "navigate" | "click" | "type" | "scroll" | "screenshot" | "back" | "forward" | "close";
  payload?: string | { selector?: string; x?: number; y?: number; text?: string; dx?: number; dy?: number };
}

export class JarvisBrowser extends EventEmitter {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private wss: WebSocketServer | null = null;
  private screenshotInterval: ReturnType<typeof setInterval> | null = null;
  private state: BrowserState = {
    url: "",
    title: "",
    loading: false,
    cursorX: 0,
    cursorY: 0,
    viewportWidth: 1280,
    viewportHeight: 720,
  };
  private wsClients: Set<WebSocket> = new Set();
  private httpServer: HttpServer | null = null;

  constructor(private wsPort: number = 3002) {
    super();
  }

  /** Launch the browser and WebSocket server */
  async launch(): Promise<void> {
    // Use Playwright's bundled Chrome if system Chrome isn't available
    const fs = await import("fs");
    const playwrightChrome = "/home/kasperkal1970/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome";
    const hasPlaywright = fs.existsSync(playwrightChrome);

    this.browser = await puppeteer.launch({
      headless: true,
      executablePath: hasPlaywright ? playwrightChrome : undefined,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
      defaultViewport: {
        width: this.state.viewportWidth,
        height: this.state.viewportHeight,
      },
    });

    this.page = await this.browser.newPage();

    // Navigate to default page
    await this.page.goto("about:blank");

    // Set up page event listeners
    this.page.on("load", () => {
      this.state.loading = false;
      this.updateState();
    });

    this.page.on("framenavigated", () => {
      this.state.url = this.page?.url() ?? "";
      this.updateState();
    });

    // Start WebSocket server for screenshot streaming
    this.startWebSocketServer();

    // Start screenshot capture loop
    this.startScreenshotLoop();

    this.emit("ready");
  }

  /** Start WebSocket server for streaming screenshots to the frontend */
  private startWebSocketServer(): void {
    this.httpServer = createServer();
    this.wss = new WebSocketServer({ server: this.httpServer });

    this.wss.on("connection", (ws) => {
      this.wsClients.add(ws);
      this.emit("client-connected", this.wsClients.size);

      ws.on("close", () => {
        this.wsClients.delete(ws);
        this.emit("client-disconnected", this.wsClients.size);
      });

      // Send current state immediately on connect
      this.sendState(ws);
    });

    this.httpServer.listen(this.wsPort, () => {
      console.log(`[Jarvis Browser] WebSocket server on ws://localhost:${this.wsPort}`);
    });
  }

  /** Send current browser state to a specific client */
  private sendState(ws: WebSocket): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "state", data: this.state }));
    }
  }

  /** Broadcast browser state to all connected clients */
  private broadcastState(): void {
    const msg = JSON.stringify({ type: "state", data: this.state });
    for (const ws of this.wsClients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(msg);
      }
    }
  }

  /** Broadcast a screenshot to all connected clients */
  private async broadcastScreenshot(): Promise<void> {
    if (!this.page || this.wsClients.size === 0) return;
    try {
      const screenshot = await this.page.screenshot({
        type: "jpeg",
        quality: 70,
        encoding: "base64",
      });
      const msg = JSON.stringify({ type: "screenshot", data: screenshot });
      for (const ws of this.wsClients) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(msg);
        }
      }
    } catch {
      // Page might be navigating — skip this frame
    }
  }

  /** Start periodic screenshot capture */
  private startScreenshotLoop(): void {
    // Capture screenshots at ~4 fps
    this.screenshotInterval = setInterval(() => {
      this.broadcastScreenshot().catch(() => {});
    }, 250);
  }

  /** Update browser state and notify clients */
  private updateState(): void {
    this.broadcastState();
    this.emit("state-changed", this.state);
  }

  /** Simulate a real cursor moving to a position */
  async moveCursor(x: number, y: number): Promise<void> {
    if (!this.page) return;
    this.state.cursorX = x;
    this.state.cursorY = y;
    await this.page.mouse.move(x, y);
    this.updateState();
  }

  // ── Actions that Jarvis (or the user) can perform ──

  /** Navigate to a URL */
  async navigate(url: string): Promise<void> {
    if (!this.page) throw new Error("Browser not launched");
    this.state.loading = true;
    this.updateState();
    await this.page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
    this.state.title = await this.page.title();
    this.state.url = this.page.url();
    this.state.loading = false;
    this.updateState();
  }

  /** Click at coordinates or on a selector */
  async click(target: { selector?: string; x?: number; y?: number }): Promise<void> {
    if (!this.page) throw new Error("Browser not launched");

    if (target.selector) {
      const el = await this.page.$(target.selector);
      if (!el) throw new Error(`Element not found: ${target.selector}`);
      const box = await el.boundingBox();
      if (box) {
        const cx = box.x + box.width / 2;
        const cy = box.y + box.height / 2;
        await this.moveCursor(cx, cy);
        await this.page.mouse.click(cx, cy);
      }
    } else if (target.x !== undefined && target.y !== undefined) {
      await this.moveCursor(target.x, target.y);
      await this.page.mouse.click(target.x, target.y);
    }
    this.updateState();
  }

  /** Type text into the currently focused element */
  async type(text: string): Promise<void> {
    if (!this.page) throw new Error("Browser not launched");
    await this.page.keyboard.type(text, { delay: 30 }); // Type like a human
    this.updateState();
  }

  /** Scroll the page */
  async scroll(dx: number, dy: number): Promise<void> {
    if (!this.page) throw new Error("Browser not launched");
    await this.page.evaluate(`window.scrollBy(${dx}, ${dy})`);
    this.updateState();
  }

  /** Go back in history */
  async goBack(): Promise<void> {
    if (!this.page) throw new Error("Browser not launched");
    await this.page.goBack({ waitUntil: "networkidle2" });
    this.state.title = await this.page.title();
    this.state.url = this.page.url();
    this.updateState();
  }

  /** Go forward in history */
  async goForward(): Promise<void> {
    if (!this.page) throw new Error("Browser not launched");
    await this.page.goForward({ waitUntil: "networkidle2" });
    this.state.title = await this.page.title();
    this.state.url = this.page.url();
    this.updateState();
  }

  /** Get the current page content as text */
  async getContent(maxLength = 8000): Promise<string> {
    if (!this.page) return "";
    const text = await this.page.evaluate("document.body?.innerText ?? ''");
    return text.slice(0, maxLength);
  }

  /** Get current state */
  getState(): BrowserState {
    return { ...this.state };
  }

  /** Execute an action and return the result */
  async executeAction(action: BrowseAction): Promise<{ success: boolean; error?: string; data?: any }> {
    try {
      switch (action.action) {
        case "navigate":
          await this.navigate(action.payload as string);
          return { success: true, data: { url: this.state.url, title: this.state.title } };
        case "click":
          await this.click(action.payload as any);
          return { success: true };
        case "type":
          await this.type((action.payload as any)?.text ?? "");
          return { success: true };
        case "scroll":
          await this.scroll((action.payload as any)?.dx ?? 0, (action.payload as any)?.dy ?? 200);
          return { success: true };
        case "back":
          await this.goBack();
          return { success: true, data: { url: this.state.url } };
        case "forward":
          await this.goForward();
          return { success: true, data: { url: this.state.url } };
        case "screenshot":
          return { success: true };
        case "close":
          await this.close();
          return { success: true };
        default:
          return { success: false, error: `Unknown action: ${(action as any).action}` };
      }
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  /** Close the browser and clean up */
  async close(): Promise<void> {
    if (this.screenshotInterval) {
      clearInterval(this.screenshotInterval);
      this.screenshotInterval = null;
    }
    if (this.page) {
      await this.page.close().catch(() => {});
      this.page = null;
    }
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
    if (this.httpServer) {
      this.httpServer.close();
      this.httpServer = null;
    }
    this.wsClients.clear();
    this.emit("closed");
  }
}
