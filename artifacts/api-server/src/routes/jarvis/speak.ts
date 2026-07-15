import { Router } from "express";
import { ElevenLabsClient } from "elevenlabs";
import { jarvisConfig } from "../../config/jarvis";

const router = Router();

function getTTSClient(): ElevenLabsClient {
  const apiKey = process.env["ELEVENLABS_API_KEY"];
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY environment variable is not set");
  }
  return new ElevenLabsClient({ apiKey });
}

router.post("/speak", async (req, res) => {
  const { text } = req.body as { text: string };

  if (!text || typeof text !== "string") {
    res.status(400).json({ error: "text is required" });
    return;
  }

  try {
    const client = getTTSClient();

    const audioStream = await client.textToSpeech.convert(
      jarvisConfig.ttsVoiceId,
      {
        text,
        model_id: jarvisConfig.ttsModel,
        output_format: "mp3_44100_128",
      },
    );

    // Collect stream chunks into a single buffer
    const chunks: Buffer[] = [];
    for await (const chunk of audioStream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const audioBuffer = Buffer.concat(chunks);
    const audioBase64 = audioBuffer.toString("base64");

    res.json({ audio: audioBase64, contentType: "audio/mpeg" });
  } catch (err) {
    req.log.error({ err }, "ElevenLabs TTS failed");
    res.status(500).json({ error: "Speech synthesis failed. Please try again." });
  }
});

export default router;
