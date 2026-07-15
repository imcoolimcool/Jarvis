/**
 * Jarvis configuration — edit this file to customize the assistant.
 * Changes here take effect after restarting the server.
 */
export const jarvisConfig = {
  /**
   * OpenAI model used for conversation.
   * Options: "gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"
   */
  llmModel: "gpt-4o",

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

You are a trusted assistant. Act like it.`,
};
