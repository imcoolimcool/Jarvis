import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Build-Mode workspace.
 *
 * A per-session Linux shell that the LLM (and the user) can fully drive:
 * commands run inside a dedicated workspace directory, `cd` persists across
 * commands (we re-capture cwd after every run), output is capped, and every
 * command has a hard timeout so nothing can hang the server.
 */

export const WORKSPACE_ROOT = path.resolve(
  __dirname, "..", "..", "..", "..", "artifacts", "workspace",
);

export const WORKSPACE_URL = "/api/jarvis/workspace";

const SESSIONS = new Map<string, string>(); // sessionId -> cwd

export interface TerminalRun {
  stdout: string;
  stderr: string;
  cwd: string;
  exitCode: number;
  timedOut: boolean;
}

function shellEscape(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** Ensure the workspace dir exists (and a default .gitkeep so it's visible). */
export async function ensureWorkspace(): Promise<string> {
  await fs.mkdir(WORKSPACE_ROOT, { recursive: true });
  return WORKSPACE_ROOT;
}

export function getSessionCwd(sessionId: string): string {
  return SESSIONS.get(sessionId) ?? WORKSPACE_ROOT;
}

export async function resetSession(sessionId: string): Promise<void> {
  SESSIONS.delete(sessionId);
  await ensureWorkspace();
}

/** Run one command in a session's shell. `cd`/env state persists via cwd tracking. */
export function runTerminalCommand(
  sessionId: string,
  command: string,
  opts: { timeoutMs?: number; maxOutput?: number } = {},
): Promise<TerminalRun> {
  return new Promise((resolve) => {
    const timeoutMs = opts.timeoutMs ?? 15_000;
    const maxOutput = opts.maxOutput ?? 30_000;

    const cwd = getSessionCwd(sessionId);
    const script = `cd ${shellEscape(cwd)}; ${command}; printf '\\n__CWD__=%s\\n' "$PWD"`;

    const child = execFile(
      "/bin/bash",
      ["-lc", script],
      { timeout: timeoutMs, maxBuffer: maxOutput * 2, killSignal: "SIGKILL" },
      (err, stdout, stderr) => {
        let out = stdout ?? "";
        const m = out.match(/\n__CWD__=(.+)\n?$/);
        const newCwd = m ? m[1].trim() : cwd;
        if (m) out = out.slice(0, m.index);
        if (newCwd && newCwd !== cwd && path.isAbsolute(newCwd)) {
          SESSIONS.set(sessionId, newCwd);
        }
        const timedOut = (err as { killed?: boolean } | null)?.killed === true;
        resolve({
          stdout: out.slice(-maxOutput),
          stderr: (stderr ?? "").slice(-maxOutput),
          cwd: SESSIONS.get(sessionId) ?? WORKSPACE_ROOT,
          exitCode: err ? (typeof err === "object" && "code" in err ? Number((err as { code?: number | string }).code ?? 1) : 1) : 0,
          timedOut,
        });
      },
    );
  });
}

/** List files under the workspace (relative paths), sorted dirs-first. */
export async function listWorkspaceFiles(): Promise<{ path: string; type: "file" | "dir"; size: number }[]> {
  await ensureWorkspace();
  const out: { path: string; type: "file" | "dir"; size: number }[] = [];
  async function walk(dir: string, rel: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
    for (const e of entries) {
      if (e.name === ".git" || e.name === "node_modules") continue;
      const full = path.join(dir, e.name);
      const relPath = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        out.push({ path: relPath + "/", type: "dir", size: 0 });
        await walk(full, relPath);
      } else {
        const st = await fs.stat(full);
        out.push({ path: relPath, type: "file", size: st.size });
      }
    }
  }
  await walk(WORKSPACE_ROOT, "");
  return out.slice(0, 500);
}

/** Read a workspace file (safe, capped). */
export async function readWorkspaceFile(relPath: string, maxChars = 100_000): Promise<{ ok: true; content: string } | { ok: false; error: string }> {
  const target = path.resolve(WORKSPACE_ROOT, relPath);
  if (!target.startsWith(WORKSPACE_ROOT + path.sep) && target !== WORKSPACE_ROOT) {
    return { ok: false, error: "Path escapes the workspace." };
  }
  try {
    const content = await fs.readFile(target, "utf8");
    return { ok: true, content: content.slice(0, maxChars) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Read failed." };
  }
}

/** Write a workspace file (safe). Creates parent dirs. */
export async function writeWorkspaceFile(relPath: string, content: string): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const target = path.resolve(WORKSPACE_ROOT, relPath);
  if (!target.startsWith(WORKSPACE_ROOT + path.sep)) {
    return { ok: false, error: "Path escapes the workspace." };
  }
  try {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, "utf8");
    return { ok: true, path: relPath };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Write failed." };
  }
}
