# Jarvis Voice Assistant

A polished voice AI assistant prototype. Speak → Jarvis transcribes → thinks → speaks back. Built with OpenAI Whisper (STT), OpenAI GPT-4o (LLM), and ElevenLabs (TTS).

## Run & Operate

- `pnpm --filter @workspace/jarvis run dev` — run the frontend (port auto-assigned)
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, Tailwind CSS, Framer Motion, Orbitron/Inter/Space Mono fonts
- API: Express 5
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- STT: OpenAI Whisper (`whisper-1`)
- LLM: OpenAI GPT-4o
- TTS: ElevenLabs (`eleven_multilingual_v2`)

## Where things live

- `artifacts/jarvis/` — React frontend (the Jarvis UI)
- `artifacts/api-server/src/routes/jarvis/` — backend route handlers
  - `transcribe.ts` — Whisper STT endpoint
  - `chat.ts` — GPT-4o conversation endpoint
  - `speak.ts` — ElevenLabs TTS endpoint
- `artifacts/api-server/src/config/jarvis.ts` — **edit this to change model, voice, or system prompt**
- `lib/api-spec/openapi.yaml` — single source of truth for API contracts

## Architecture decisions

- API keys are never exposed to the frontend — all AI calls go through the Express backend
- Three separate env vars for Whisper vs LLM keys (user may have different rate limits/billing)
- TTS audio is returned as base64 JSON (not a binary stream) for simplicity and caching friendliness
- Conversation history is held client-side in React state (no DB needed for v1)
- Multipart audio upload uses multer with memory storage — no temp files on disk

## Customization

Edit `artifacts/api-server/src/config/jarvis.ts` to change:
- `llmModel` — GPT model (e.g. `"gpt-4o-mini"` for lower cost)
- `ttsVoiceId` — ElevenLabs voice ID (browse at elevenlabs.io/voice-library)
- `ttsModel` — ElevenLabs model
- `systemPrompt` — Jarvis personality and behavior

## Required secrets

Set these via the Replit Secrets panel (never committed to git):

| Secret | Purpose |
|--------|---------|
| `OPENAI_WHISPER_API_KEY` | NVIDIA NIM key for Whisper Large v3 STT (build.nvidia.com) |
| `OPENAI_LLM_API_KEY` | NVIDIA NIM key for gpt-oss-20b LLM (build.nvidia.com) |
| `ELEVENLABS_API_KEY` | ElevenLabs TTS |
| `SPOTIFY_CLIENT_ID` | Spotify OAuth client ID |
| `SPOTIFY_CLIENT_SECRET` | Spotify OAuth client secret |
| `GOOGLE_CLIENT_ID` | Google Cloud OAuth 2.0 client ID |
| `GOOGLE_CLIENT_SECRET` | Google Cloud OAuth 2.0 client secret |
| `TAVILY_API_KEY` | Tavily web search |

## OAuth redirect URIs

Both Spotify and Google OAuth compute redirect URIs dynamically from `REPLIT_DEV_DOMAIN` in development, so no extra config is needed for local dev. For deployment, set these env vars to the stable production domain:

| Env var | Value (replace `<YOUR_DOMAIN>`) |
|---------|--------------------------------|
| `SPOTIFY_REDIRECT_URI` | `https://<YOUR_DOMAIN>/api/jarvis/spotify/callback` |
| `GOOGLE_REDIRECT_URI` | `https://<YOUR_DOMAIN>/api/jarvis/gmail/callback` |

Register the same URIs in your Spotify app (developer.spotify.com) and Google Cloud OAuth client (console.cloud.google.com). Development URIs use the current `REPLIT_DEV_DOMAIN` automatically — no manual registration needed for dev.

## First-time setup

```bash
# 1. Install all workspace dependencies
pnpm install

# 2. Apply the database schema (idempotent — safe to re-run)
pnpm --filter @workspace/db run push
```

The post-merge script (`scripts/post-merge.sh`) runs both steps automatically after any task merge. For a fresh clone or environment reset, run them manually once before starting the workflows.

## NVIDIA API configuration

This project uses NVIDIA's hosted NIM endpoints (OpenAI-compatible):
- **STT base URL**: `https://ai.api.nvidia.com/v1` — model `openai/whisper-large-v3`
- **LLM base URL**: `https://integrate.api.nvidia.com/v1` — model configurable in `artifacts/api-server/src/config/jarvis.ts`

Both base URLs are hardcoded in the respective route handlers (`transcribe.ts`, `chat.ts`). The active LLM model is `openai/gpt-oss-20b`.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- After any change to `lib/api-spec/openapi.yaml`, run codegen before building the frontend
- The api-zod tsconfig includes `"lib": ["esnext", "dom"]` — needed for `File`/`Blob` types in the generated Whisper input schema
- MediaRecorder uses `audio/webm;codecs=opus` as the primary MIME type (Safari fallback: `audio/webm`)
- Spotify and Google redirect URIs auto-compute from `REPLIT_DEV_DOMAIN` in dev; set `SPOTIFY_REDIRECT_URI` / `GOOGLE_REDIRECT_URI` explicitly for production
