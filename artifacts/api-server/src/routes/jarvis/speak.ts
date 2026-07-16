import { Router } from "express";
import OpenAI from "openai";

const router = Router();

function getTTSClient(): OpenAI {
  const apiKey = process.env["GROQ_API_KEY"];
  if (!apiKey) {
    throw new Error("GROQ_API_KEY environment variable is not set");
  }
  return new OpenAI({ apiKey, baseURL: "https://api.groq.com/openai/v1" });
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
      model: "canopylabs/orpheus-v1-english",
      voice: "daniel",   // deep male voice
      input: text,
      response_format: "wav",
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    const audioBase64 = buffer.toString("base64");

    res.json({ audio: audioBase64, contentType: "audio/wav" });
  } catch (err) {
    req.log.error({ err }, "Groq TTS failed");
    res.status(500).json({ error: "Speech synthesis failed. Please try again." });
  }
});

export default router;
