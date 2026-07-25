/**
 * Build an extremely detailed error response object for debugging.
 * This is sent alongside the user-friendly error message so the
 * frontend can display a "Show Details" panel with full diagnostics.
 */

import type { Request } from "express";

export interface ErrorDetail {
  /** Human-readable error message */
  message: string;
  /** Error code (e.g. "LLM_AUTH_FAILED", "DB_CONNECTION_LOST") */
  code: string;
  /** ISO timestamp */
  timestamp: string;
  /** HTTP status code */
  statusCode: number;
  /** Original error name (e.g. "TypeError", "Error") */
  errorName: string;
  /** Original error message (before sanitization) */
  originalMessage: string;
  /** Stack trace (sanitized — internal paths only) */
  stack: string;
  /** Request info */
  request: {
    method: string;
    url: string;
    path: string;
    query: Record<string, unknown>;
    params: Record<string, unknown>;
    bodyKeys: string[];
    bodySizeBytes: number;
    contentType: string | undefined;
    userAgent: string | undefined;
    origin: string | undefined;
    referer: string | undefined;
    ip: string | undefined;
  };
  /** Environment snapshot (safe vars only) */
  environment: {
    nodeEnv: string | undefined;
    port: string | undefined;
    llmModel: string | undefined;
    llmApiKeyConfigured: boolean;
    elevenLabsConfigured: boolean;
    tavilyConfigured: boolean;
    databaseUrlConfigured: boolean;
    uptimeSeconds: number;
    memoryUsageMB: {
      rss: number;
      heapUsed: number;
      heapTotal: number;
      external: number;
    };
  };
  /** Request duration in milliseconds (if measurable) */
  durationMs: number | null;
  /** LLM-specific details (if the error came from an LLM call) */
  llm?: {
    model: string;
    endpoint: string;
    apiErrorCode: string | undefined;
    apiErrorMessage: string | undefined;
    apiErrorStatus: number | undefined;
    tokensUsed: number | undefined;
    requestId: string | undefined;
  };
}

/** Sanitize a stack trace to only include project-internal paths */
function sanitizeStack(stack: string | undefined): string {
  if (!stack) return "No stack trace available";
  return stack
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => {
      // Keep lines that reference our project
      return (
        line.includes("/api-server/") ||
        line.includes("/jarvis/") ||
        line.includes("node:") ||
        line.includes("at async") ||
        line === line.split("(")[0] // anonymous functions
      );
    })
    .join("\n");
}

/** Determine an error code from the error message and type */
function deriveErrorCode(err: Error, msg: string): string {
  const name = err.name.toLowerCase();
  const m = msg.toLowerCase();

  if (m.includes("api key") || m.includes("authentication") || m.includes("401") || m.includes("unauthorized"))
    return "LLM_AUTH_FAILED";
  if (m.includes("rate limit") || m.includes("429"))
    return "LLM_RATE_LIMITED";
  if (m.includes("timeout") || m.includes("abort"))
    return "REQUEST_TIMEOUT";
  if (m.includes("network") || m.includes("econnrefused") || m.includes("fetch"))
    return "NETWORK_ERROR";
  if (m.includes("database") || m.includes("sqlite") || m.includes("drizzle"))
    return "DATABASE_ERROR";
  if (m.includes("openai") || m.includes("nvidia") || m.includes("llm"))
    return "LLM_ERROR";
  if (name === "typeerror")
    return "TYPE_ERROR";
  if (name === "referenceerror")
    return "REFERENCE_ERROR";
  if (name === "syntaxerror")
    return "SYNTAX_ERROR";
  if (m.includes("file") || m.includes("pdf") || m.includes("mammoth"))
    return "FILE_PROCESSING_ERROR";
  if (m.includes("browser") || m.includes("puppeteer"))
    return "BROWSER_ERROR";
  if (m.includes("tts") || m.includes("speech") || m.includes("elevenlabs"))
    return "TTS_ERROR";

  return "INTERNAL_ERROR";
}

/** Extract LLM-specific error details if present */
function extractLLMDetails(err: Error): ErrorDetail["llm"] {
  const msg = err.message;

  // Try to extract HTTP status from error message
  const statusMatch = msg.match(/status[:\s]*(\d{3})/i);
  const apiStatus = statusMatch ? parseInt(statusMatch[1], 10) : undefined;

  // Try to extract request ID
  const requestIdMatch = msg.match(/request[_-]?id[:\s]*([a-zA-Z0-9_-]+)/i);

  return {
    model: process.env["OPENAI_LLM_MODEL"] ?? "unknown",
    endpoint: "https://integrate.api.nvidia.com/v1",
    apiErrorCode: undefined,
    apiErrorMessage: msg.length > 500 ? msg.slice(0, 500) + "..." : msg,
    apiErrorStatus: apiStatus,
    tokensUsed: undefined,
    requestId: requestIdMatch?.[1],
  };
}

/** Build a complete ErrorDetail object from an error + request */
export function buildErrorDetail(
  err: Error,
  req: Request,
  statusCode: number,
  startMs: number,
): ErrorDetail {
  const now = Date.now();
  const msg = err.message || "Unknown error";

  // Sanitize request body — remove sensitive fields
  const body = req.body as Record<string, unknown> | undefined;
  const bodyKeys = body ? Object.keys(body) : [];
  const sensitiveKeys = new Set(["fileBase64", "password", "token", "secret", "apiKey", "api_key"]);
  const sanitizedBodySize = body
    ? JSON.stringify(
        Object.fromEntries(
          Object.entries(body).map(([k, v]) =>
            sensitiveKeys.has(k)
              ? [k, `[REDACTED - ${(v as string)?.length ?? 0} chars]`]
              : [k, typeof v === "string" && v.length > 200 ? v.slice(0, 200) + "..." : v]
          )
        )
      ).length
    : 0;

  const mem = process.memoryUsage();

  const detail: ErrorDetail = {
    message: deriveUserMessage(err, msg),
    code: deriveErrorCode(err, msg),
    timestamp: new Date().toISOString(),
    statusCode,
    errorName: err.name,
    originalMessage: msg,
    stack: sanitizeStack(err.stack),
    request: {
      method: req.method,
      url: req.originalUrl,
      path: req.path,
      query: req.query as Record<string, unknown>,
      params: req.params,
      bodyKeys,
      bodySizeBytes: sanitizedBodySize,
      contentType: req.headers["content-type"],
      userAgent: req.headers["user-agent"],
      origin: req.headers["origin"],
      referer: req.headers["referer"],
      ip: req.ip,
    },
    environment: {
      nodeEnv: process.env["NODE_ENV"],
      port: process.env["PORT"],
      llmModel: process.env["OPENAI_LLM_MODEL"],
      llmApiKeyConfigured: !!process.env["OPENAI_LLM_API_KEY"],
      elevenLabsConfigured: !!process.env["ELEVENLABS_API_KEY"],
      tavilyConfigured: !!(process.env["TAVILY_API_KEY"] || process.env["WEB_SEARCH_API_KEY"]),
      databaseUrlConfigured: !!process.env["DATABASE_URL"],
      uptimeSeconds: Math.floor(process.uptime()),
      memoryUsageMB: {
        rss: Math.round(mem.rss / 1024 / 1024),
        heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
        external: Math.round(mem.external / 1024 / 1024),
      },
    },
    durationMs: now - startMs,
    llm: extractLLMDetails(err),
  };

  return detail;
}

/** Derive a user-friendly message from the error (used in detail.message) */
function deriveUserMessage(err: Error, msg: string): string {
  if (msg.includes("OPENAI_LLM_API_KEY")) return "LLM API key not configured on the server.";
  if (msg.includes("401") || msg.includes("Unauthorized")) return "LLM authentication failed — check API key.";
  if (msg.includes("429") || msg.includes("Rate limit")) return "LLM rate limit exceeded — try again shortly.";
  if (msg.includes("timeout") || msg.includes("abort")) return "Request timed out — check your connection.";
  if (msg.includes("ECONNREFUSED")) return "Backend service unreachable — server may be down.";
  if (msg.includes("fetch failed") || msg.includes("network")) return "Network error — unable to reach the server.";
  return msg;
}

/** Lightweight version for routes that don't have a full Express Request */
export function buildSimpleErrorDetail(
  err: Error,
  context: string,
  statusCode: number,
  startMs: number,
): ErrorDetail {
  const now = Date.now();
  const msg = err.message || "Unknown error";
  const mem = process.memoryUsage();

  return {
    message: msg,
    code: deriveErrorCode(err, msg),
    timestamp: new Date().toISOString(),
    statusCode,
    errorName: err.name,
    originalMessage: msg,
    stack: sanitizeStack(err.stack),
    request: {
      method: "UNKNOWN",
      url: context,
      path: context,
      query: {},
      params: {},
      bodyKeys: [],
      bodySizeBytes: 0,
      contentType: undefined,
      userAgent: undefined,
      origin: undefined,
      referer: undefined,
      ip: undefined,
    },
    environment: {
      nodeEnv: process.env["NODE_ENV"],
      port: process.env["PORT"],
      llmModel: process.env["OPENAI_LLM_MODEL"],
      llmApiKeyConfigured: !!process.env["OPENAI_LLM_API_KEY"],
      elevenLabsConfigured: !!process.env["ELEVENLABS_API_KEY"],
      tavilyConfigured: !!(process.env["TAVILY_API_KEY"] || process.env["WEB_SEARCH_API_KEY"]),
      databaseUrlConfigured: !!process.env["DATABASE_URL"],
      uptimeSeconds: Math.floor(process.uptime()),
      memoryUsageMB: {
        rss: Math.round(mem.rss / 1024 / 1024),
        heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
        external: Math.round(mem.external / 1024 / 1024),
      },
    },
    durationMs: now - startMs,
    llm: extractLLMDetails(err),
  };
}
