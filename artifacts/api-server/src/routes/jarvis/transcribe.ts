import { Router } from "express";
import multer from "multer";
import OpenAI, { toFile } from "openai";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

function getWhisperClient(): OpenAI {
  const apiKey = process.env["OPENAI_WHISPER_API_KEY"];
  if (!apiKey) {
    throw new Error("OPENAI_WHISPER_API_KEY environment variable is not set");
  }
  return new OpenAI({ apiKey });
}

router.post(
  "/transcribe",
  upload.single("audio"),
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "No audio file provided" });
      return;
    }

    try {
      const client = getWhisperClient();
      const mimeType = req.file.mimetype || "audio/webm";
      const extension = mimeType.includes("mp4")
        ? "mp4"
        : mimeType.includes("wav")
          ? "wav"
          : mimeType.includes("ogg")
            ? "ogg"
            : "webm";

      const file = await toFile(req.file.buffer, `audio.${extension}`, {
        type: mimeType,
      });

      const transcription = await client.audio.transcriptions.create({
        file,
        model: "whisper-1",
      });

      res.json({ transcript: transcription.text });
    } catch (err) {
      req.log.error({ err }, "Whisper transcription failed");
      res.status(500).json({ error: "Transcription failed. Please try again." });
    }
  },
);

export default router;
