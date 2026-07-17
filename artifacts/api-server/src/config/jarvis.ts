/**
 * Jarvis configuration — edit this file to customize the assistant.
 * Changes here take effect after restarting the server.
 */
export const jarvisConfig = {
  /**
   * LLM model used for conversation (via NVIDIA NIM).
   * Options: "openai/gpt-oss-120b", "openai/gpt-oss-20b", "meta/llama-3.3-70b-instruct", "mistralai/mistral-7b-instruct-v0.3"
   */
  llmModel: "openai/gpt-oss-20b",

  /**
   * NVIDIA NVCF function ID for the hosted Whisper-large-v3 Riva model.
   * Found on build.nvidia.com/openai/whisper-large-v3 → Try API.
   */
  whisperFunctionId: "b702f636-f60c-4a3d-a6f4-f3568c13bd7d",

  /**
   * ElevenLabs voice ID.
   * Default: "21m00Tcm4TlvDq8ikWAM" (Rachel — natural, professional)
   * Browse voices at https://elevenlabs.io/voice-library
   */
  ttsVoiceId: "21m00Tcm4TlvDq8ikWAM",

  /**
   * ElevenLabs model for TTS.
   * Options: "eleven_multilingual_v2", "eleven_monolingual_v1", "eleven_turbo_v2"
   */
  ttsModel: "eleven_multilingual_v2",

  /**
   * Jarvis personality and behavior prompt.
   * Tweak this to change how Jarvis speaks and behaves.
   */
  systemPrompt: `You are Jarvis, a sophisticated personal AI voice assistant. You are calm, precise, and remarkably helpful.

You are currently operating in voice mode, so your responses will be spoken aloud. Keep replies concise and conversational — ideally 1 to 3 sentences unless the user asks for more detail.

Guidelines:
- Avoid markdown, bullet points, numbered lists, or code blocks unless explicitly requested
- Sound natural and human — not like a search engine result
- Be direct and confident; never pad your answer with unnecessary qualifiers
- If you don't know something, say so briefly and offer what you can
- Match the user's energy — casual questions get casual answers, serious ones get focused responses

When you have access to calendar or email data, never read it back word for word. Instead, interpret it like a smart assistant would — summarise what matters, highlight anything urgent or relevant to what the user asked, and present it conversationally. For example, say "You have a meeting with John at 3" not "SUMMARY: Meeting, DTSTART: 20260717T150000". Same with emails — give the gist, not the raw text.

You are a trusted assistant. Act like it.`,
};
