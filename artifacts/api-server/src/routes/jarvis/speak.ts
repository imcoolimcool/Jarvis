import { Router } from "express";

const router = Router();

// George — British male voice on ElevenLabs
const ELEVENLABS_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";
const ELEVENLABS_MODEL    = "eleven_multilingual_v2";

router.post("/speak", async (req, res) => {
  const { text } = req.body as { text: string };

  if (!text || typeof text !== "string") {
    res.status(400).json({ error: "text is required" });
    return;
  }

  const apiKey = process.env["ELEVENLABS_API_KEY"];
  if (!apiKey) {
    res.status(500).json({ error: "ELEVENLABS_API_KEY is not set" });
    return;
  }

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          "Accept": "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: ELEVENLABS_MODEL,
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      req.log.error({ status: response.status, errText }, "ElevenLabs TTS failed");
      res.status(500).json({ error: "Speech synthesis failed. Please try again." });
      return;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const audioBase64 = buffer.toString("base64");

    res.json({ audio: audioBase64, contentType: "audio/mpeg" });
  } catch (err) {
    req.log.error({ err }, "ElevenLabs TTS failed");
    res.status(500).json({ error: "Speech synthesis failed. Please try again." });
  }
});

export default router;
