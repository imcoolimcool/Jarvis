import { Router } from "express";
import multer from "multer";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// NVIDIA NIM endpoint for Whisper (OpenAI-compatible)
const NVIDIA_WHISPER_URL =
  "https://integrate.api.nvidia.com/v1/audio/transcriptions";

router.post(
  "/transcribe",
  upload.single("audio"),
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "No audio file provided" });
      return;
    }

    const apiKey = process.env["OPENAI_WHISPER_API_KEY"];
    if (!apiKey) {
      res.status(500).json({ error: "OPENAI_WHISPER_API_KEY is not set" });
      return;
    }

    try {
      const mimeType = req.file.mimetype || "audio/webm";
      const extension = mimeType.includes("mp4")
        ? "mp4"
        : mimeType.includes("wav")
          ? "wav"
          : mimeType.includes("ogg")
            ? "ogg"
            : "webm";

      const formData = new FormData();
      const blob = new Blob([req.file.buffer], { type: mimeType });
      formData.append("file", blob, `audio.${extension}`);
      formData.append("model", "openai/whisper-large-v3");

      req.log.info({ url: NVIDIA_WHISPER_URL, model: "openai/whisper-large-v3" }, "Sending Whisper request");

      const response = await fetch(NVIDIA_WHISPER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        req.log.error(
          { status: response.status, body: errorText },
          "Whisper API error",
        );
        res
          .status(500)
          .json({ error: `Transcription failed (${response.status}): ${errorText}` });
        return;
      }

      const data = (await response.json()) as { text: string };
      res.json({ transcript: data.text });
    } catch (err) {
      req.log.error({ err }, "Whisper transcription failed");
      res
        .status(500)
        .json({ error: "Transcription failed. Please try again." });
    }
  },
);

export default router;
