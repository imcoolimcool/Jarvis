import { Router } from "express";
import {
  ensureWorkspace,
  runTerminalCommand,
  resetSession,
  listWorkspaceFiles,
  readWorkspaceFile,
  writeWorkspaceFile,
  WORKSPACE_ROOT,
} from "../../lib/workspace";

const router = Router();

/**
 * POST /api/jarvis/terminal { sessionId, command }
 * Run a Linux command in the sandboxed workspace shell. Stateful per session.
 */
router.post("/terminal", async (req, res) => {
  const { sessionId, command } = (req.body ?? {}) as { sessionId?: unknown; command?: unknown };
  if (typeof command !== "string" || !command.trim()) {
    res.status(400).json({ error: "command is required" });
    return;
  }
  const sid = typeof sessionId === "string" && sessionId ? sessionId : "default";
  try {
    await ensureWorkspace();
    const result = await runTerminalCommand(sid, command);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Terminal failed" });
  }
});

/** POST /api/jarvis/terminal/reset { sessionId }, reset shell state to workspace root. */
router.post("/terminal/reset", async (_req, res) => {
  await resetSession("default");
  res.json({ ok: true });
});

/**
 * GET /api/jarvis/workspace            → list files in the workspace
 * GET /api/jarvis/workspace?path=X     → read a file's contents
 * POST /api/jarvis/workspace { path, content } → write a file
 */
router.get("/workspace", async (req, res) => {
  const rel = (req.query.path as string | undefined) ?? "";
  try {
    if (!rel) {
      const files = await listWorkspaceFiles();
      res.json({ root: WORKSPACE_ROOT, files });
      return;
    }
    const result = await readWorkspaceFile(rel);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({ path: rel, content: result.content });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Workspace failed" });
  }
});

router.post("/workspace", async (req, res) => {
  const { path: rel, content } = (req.body ?? {}) as { path?: unknown; content?: unknown };
  if (typeof rel !== "string" || !rel) {
    res.status(400).json({ error: "path is required" });
    return;
  }
  const result = await writeWorkspaceFile(rel, typeof content === "string" ? content : "");
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json({ ok: true, path: result.path });
});

export default router;
