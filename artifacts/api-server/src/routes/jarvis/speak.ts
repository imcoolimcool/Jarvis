import { Router } from "express";
import OpenAI from "openai";

const router = Router();

function getTTSClient(): OpenAI {
  const apiKey = process.env["DEAPI_API_KEY"];
  if (!apiKey) {
    throw new Error("DEAPI_API_KEY environment variable is not set");
  }
  return new OpenAI({ apiKey, baseURL: "https://oai.deapi.ai/v1" });
}

router.post("/speak", async (req, res) => {
  const { text } = req.body as { text: string };

  if (!text || typeof text !== "string") {
    res.status(400).json({ error: "text is required" });
    return;
  }

  try {
    const client = getTTSClient();

    const response = await client.audio.speech.create({
      model: "tts-1",
      voice: "onyx",  // deep male voice — closest to Jarvis
      input: text,
      response_format: "mp3",
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    const audioBase64 = buffer.toString("base64");

    res.json({ audio: audioBase64, contentType: "audio/mpeg" });
  } catch (err) {
    req.log.error({ err }, "deAPI TTS failed");
    res.status(500).json({ error: "Speech synthesis failed. Please try again." });
  }
});

export default router;
