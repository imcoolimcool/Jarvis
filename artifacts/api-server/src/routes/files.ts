/**
 * File API (product spec 12.1), mounted at /api/files.
 *
 *  POST /api/files           multipart upload (field "file"), optional
 *                            conversationId / kind / owner form fields
 *  GET  /api/files/:key      serve the blob (R2 or local disk), sniffs mime
 *  GET  /api/files           list metadata, ?conversation_id= filters
 */
import { Router } from "express";
import multer from "multer";
import { fileTypeFromBuffer } from "file-type";
import { filesDb, files } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { getStorage, persistFile, storageBackend, type FileKind, type FileOwner } from "../lib/storage";
import { buildErrorDetail } from "../lib/error-detail";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB per file
});

const VALID_KINDS: FileKind[] = ["image", "document", "audio", "build-app", "code"];
const VALID_OWNERS: FileOwner[] = ["user", "jarvis", "account"];

router.post("/", upload.single("file"), async (req, res) => {
  const startMs = Date.now();
  if (!req.file) {
    res.status(400).json({ error: "file is required (multipart field \"file\")" });
    return;
  }
  try {
    let mime = req.file.mimetype || undefined;
    if (!mime || mime === "application/octet-stream") {
      const sniffed = await fileTypeFromBuffer(req.file.buffer);
      if (sniffed) mime = sniffed.mime;
    }
    const kindRaw = String(req.body?.kind ?? "").trim();
    const kind = (VALID_KINDS as string[]).includes(kindRaw) ? (kindRaw as FileKind) : undefined;
    const ownerRaw = String(req.body?.owner ?? "user").trim();
    const owner = (VALID_OWNERS as string[]).includes(ownerRaw) ? (ownerRaw as FileOwner) : "user";
    const conversationId = String(req.body?.conversationId ?? "").trim() || undefined;

    const result = await persistFile({
      data: req.file.buffer,
      mimeType: mime,
      name: req.file.originalname || undefined,
      kind,
      conversationId,
      owner,
    });
    if (!result) {
      res.status(500).json({ error: "Failed to store file" });
      return;
    }
    req.log.info({ key: result.key, bytes: req.file.size, backend: storageBackend() }, "File stored");
    res.status(201).json({ file: result });
  } catch (err) {
    req.log.error({ err }, "File upload failed");
    const detail = buildErrorDetail(err instanceof Error ? err : new Error(String(err)), req, 500, startMs);
    res.status(500).json({ error: "File upload failed", detail });
  }
});

router.get("/", async (req, res) => {
  try {
    const conversationId = String(req.query?.conversation_id ?? "").trim() || undefined;
    const where = conversationId ? and(eq(files.conversationId, conversationId)) : undefined;
    const rows = await filesDb
      .select()
      .from(files)
      .where(where ?? undefined)
      .orderBy(desc(files.createdAt))
      .limit(200);
    res.json({
      files: rows.map((r) => ({
        id: r.id,
        name: r.name,
        kind: r.kind,
        mime: r.mime,
        size: r.size,
        conversationId: r.conversationId,
        owner: r.owner,
        bucket: r.bucket,
        createdAt: r.createdAt,
        url: `/api/files/${encodeURIComponent(r.storageKey)}`,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "File list failed");
    res.status(500).json({ error: "File list failed" });
  }
});

router.get("/:key", async (req, res) => {
  try {
    const key = decodeURIComponent(req.params.key ?? "");
    if (!key) {
      res.status(400).json({ error: "key is required" });
      return;
    }
    // Metadata first (mime + friendly name), blob second. Both are optional
    // so a missing metadata row still serves the blob.
    const [row] = await filesDb
      .select()
      .from(files)
      .where(eq(files.storageKey, key))
      .limit(1)
      .catch(() => []);

    const blob = await getStorage().get(key);
    if (!blob) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    let contentType = row?.mime ?? blob.contentType;
    if (!contentType || contentType === "application/octet-stream") {
      const sniffed = await fileTypeFromBuffer(blob.data);
      if (sniffed) contentType = sniffed.mime;
    }
    res.setHeader("Content-Type", contentType ?? "application/octet-stream");
    res.setHeader("Content-Length", String(blob.data.length));
    if (row?.name) {
      res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(row.name)}"`);
    }
    res.send(blob.data);
  } catch (err) {
    req.log.error({ err }, "File serve failed");
    res.status(500).json({ error: "File serve failed" });
  }
});

export default router;
