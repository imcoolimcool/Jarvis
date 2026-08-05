/**
 * Figma design-to-code bridge.
 *
 * Reads the REAL design data from a Figma file via the REST API
 * (https://www.figma.com/developers/api) — not a screenshot guess. Extracts:
 *   - font families + weights actually used (from TEXT node styles)
 *   - font sizes used
 *   - solid fill colors (deduped, as hex + rgba)
 *   - frame/page dimensions and structure
 *   - text content samples (so the LLM can reproduce real copy)
 *
 * Auth: X-Figma-Token header with FIGMA_ACCESS_TOKEN (free personal access
 * token, Figma → Settings → Security). The embed iframe does NOT need a
 * token — only this design-data extraction does.
 */

export interface FigmaDesignToken {
  fileKey: string;
  name: string;
  /** The frame/page whose design data was extracted. */
  frameName: string;
  /** Node id of the extracted frame (for image rendering). */
  frameId?: string;
  width: number;
  height: number;
  fonts: { family: string; weight: string; size: number }[];
  fontSizes: number[];
  colors: { hex: string; rgba: string; count: number }[];
  textSamples: { text: string; fontFamily?: string; fontSize?: number }[];
  children: { name: string; type: string; width: number; height: number }[];
}

interface FigmaNode {
  id: string;
  name: string;
  type: string;
  children?: FigmaNode[];
  style?: { fontFamily?: string; fontWeight?: string | number; fontSize?: number; letterSpacing?: string; lineHeightPx?: number };
  characters?: string;
  fills?: { type: string; color?: { r: number; g: number; b: number; a?: number }; opacity?: number }[];
  absoluteBoundingBox?: { width: number; height: number };
  cornerRadius?: number;
}

interface FigmaFileResponse {
  document: FigmaNode;
  name: string;
  err?: string;
  message?: string;
}

function rgbToHex(r: number, g: number, b: number): string {
  const to = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** Extract a Figma file key (+ optional node-id) from any Figma share URL. */
export function parseFigmaUrl(url: string): { fileKey: string; nodeId?: string } | null {
  const m = url.match(/figma\.com\/(?:file|design)\/([A-Za-z0-9]+)(?:\/([^?]*))?/);
  if (!m) return null;
  const nodeMatch = url.match(/[?&]node-id=([^&]+)/);
  return { fileKey: m[1], nodeId: nodeMatch ? decodeURIComponent(nodeMatch[1]) : undefined };
}

function getFigmaToken(): string {
  return process.env["FIGMA_ACCESS_TOKEN"] ?? "";
}

function walk(nodes: FigmaNode[], visit: (n: FigmaNode) => void): void {
  for (const n of nodes) {
    visit(n);
    if (n.children) walk(n.children, visit);
  }
}

/** Collect real design tokens from the Figma document tree. */
export function extractDesignTokens(file: FigmaFileResponse, targetId?: string): FigmaDesignToken | null {
  // Pick the target frame: the explicit node-id, else the first FRAME node.
  let target: FigmaNode | null = null;
  const all: FigmaNode[] = [];
  walk(file.document.children ?? [], (n) => all.push(n));
  if (targetId) {
    target = all.find((n) => n.id === targetId || n.id === targetId.replace(/-/g, ":")) ?? null;
  }
  if (!target) {
    target = all.find((n) => n.type === "FRAME" || n.type === "CANVAS") ?? null;
  }
  if (!target) return null;

  const box = target.absoluteBoundingBox ?? { width: 1200, height: 800 };
  const fontMap = new Map<string, { family: string; weight: string; size: number }>();
  const fontSizes = new Set<number>();
  const colorMap = new Map<string, { hex: string; rgba: string; count: number }>();
  const textSamples: FigmaDesignToken["textSamples"] = [];
  const children: FigmaDesignToken["children"] = [];

  const visit = (n: FigmaNode): void => {
    if (n.type === "TEXT" && n.style) {
      const family = n.style.fontFamily ?? "Unknown";
      const weight = String(n.style.fontWeight ?? 400);
      const size = n.style.fontSize ?? 16;
      fontMap.set(`${family}-${weight}-${size}`, { family, weight, size });
      fontSizes.add(size);
      if (n.characters && n.characters.trim() && textSamples.length < 12) {
        textSamples.push({ text: n.characters.trim().slice(0, 80), fontFamily: family, fontSize: size });
      }
    }
    if (Array.isArray(n.fills)) {
      for (const f of n.fills) {
        if (f.type === "SOLID" && f.color) {
          const hex = rgbToHex(f.color.r, f.color.g, f.color.b);
          const a = Math.round((f.color.a ?? 1) * 100) / 100;
          const rgba = `rgba(${Math.round(f.color.r * 255)}, ${Math.round(f.color.g * 255)}, ${Math.round(f.color.b * 255)}, ${a})`;
          const key = `${hex}|${a}`;
          const existing = colorMap.get(key);
          colorMap.set(key, existing ? { ...existing, count: existing.count + 1 } : { hex, rgba, count: 1 });
        }
      }
    }
    if (n.children && n.children.length > 0 && children.length < 30) {
      const cBox = n.absoluteBoundingBox;
      if (cBox && (n.type === "FRAME" || n.type === "GROUP" || n.type === "COMPONENT")) {
        children.push({ name: n.name, type: n.type, width: cBox.width, height: cBox.height });
      }
    }
  };
  walk(target.children ?? [], visit);

  const fonts = [...fontMap.values()].sort((a, b) => a.family.localeCompare(b.family) || a.size - b.size);
  const colors = [...colorMap.values()].sort((a, b) => b.count - a.count);

  return {
    fileKey: "", // filled in by fetchFigmaDesignTokens from the URL
    name: file.name,
    frameName: target.name,
    frameId: target.id,
    width: box.width,
    height: box.height,
    fonts,
    fontSizes: [...fontSizes].sort((a, b) => a - b),
    colors,
    textSamples,
    children,
  };
}

/** Fetch + extract design tokens from a Figma URL. Returns error string on failure. */
export async function fetchFigmaDesignTokens(
  url: string,
): Promise<{ ok: true; tokens: FigmaDesignToken } | { ok: false; error: string }> {
  const parsed = parseFigmaUrl(url);
  if (!parsed) return { ok: false, error: "Not a valid Figma URL." };
  const token = getFigmaToken();
  if (!token) {
    return { ok: false, error: "FIGMA_ACCESS_TOKEN not configured — add a Figma personal access token in Settings → API keys." };
  }
  try {
    const res = await fetch(`https://api.figma.com/v1/files/${parsed.fileKey}`, {
      headers: { "X-Figma-Token": token },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `Figma API error ${res.status}: ${body.slice(0, 200)}` };
    }
    const data = (await res.json()) as FigmaFileResponse;
    if (data.err) return { ok: false, error: data.err };
    const tokens = extractDesignTokens(data, parsed.nodeId);
    if (!tokens) return { ok: false, error: "No frame found in the Figma file." };
    tokens.fileKey = parsed.fileKey;
    return { ok: true, tokens };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Figma request failed." };
  }
}

/** Render a design token summary as a compact context block for the LLM. */
export function figmaTokensToContext(tokens: FigmaDesignToken): string {
  const fonts = tokens.fonts.length > 0
    ? tokens.fonts.map((f) => `- ${f.family} ${f.weight} @ ${f.size}px`).join("\n")
    : "- (no text styles found)";
  const colors = tokens.colors.length > 0
    ? tokens.colors.map((c) => `- ${c.hex} (${c.rgba}) — used ${c.count}x`).join("\n")
    : "- (no solid fills found)";
  const samples = tokens.textSamples.length > 0
    ? tokens.textSamples.map((s) => `- "${s.text}" (${s.fontFamily ?? "?"} ${s.fontSize ?? "?"}px)`).join("\n")
    : "- (no text samples)";
  const structure = tokens.children.length > 0
    ? tokens.children.map((c) => `- ${c.name} (${c.type}) ${Math.round(c.width)}×${Math.round(c.height)}`).join("\n")
    : "- (no child frames)";
  return [
    `## FIGMA DESIGN — "${tokens.frameName}" (${tokens.width}×${tokens.height}) from "${tokens.name}"`,
    `These are the REAL design tokens read from the Figma file via the API.`,
    ``,
    `### Fonts used`,
    fonts,
    ``,
    `### Colors used (most frequent first)`,
    colors,
    ``,
    `### Font sizes`,
    tokens.fontSizes.length ? tokens.fontSizes.join("px, ") + "px" : "-",
    ``,
    `### Text content`,
    samples,
    ``,
    `### Frame structure`,
    structure,
    ``,
    `BUILD INSTRUCTION: Reproduce this design as code — use EXACTLY the fonts and colors above (Google Fonts for the families, exact hex/rgba values), the same layout proportions, and the same text content. Write the files with write_source_file.`,
  ].join("\n");
}
