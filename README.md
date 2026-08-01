# 🟢 Jarvis — Your Personal AI Voice Assistant

A polished, full-featured voice AI assistant you talk to — **Jarvis hears you, thinks, and speaks back** in a natural British-sounding voice. Built as a monorepo with a React frontend, an Express API backend, and a PostgreSQL database.

> **Speak → Jarvis transcribes → thinks → acts → speaks back.**

---

## ✨ Features

### 🎙️ Voice & Chat
- **Voice mode** — press the mic, speak, and Jarvis answers out loud (Whisper STT → LLM → ElevenLabs TTS)
- **Chat mode** — fast, streaming markdown conversations with SSE token-by-token output
- **Wake word + clap detection** — hands-free activation (Chrome/Edge)
- **British male TTS** via ElevenLabs (never the robotic Web Speech API)

### 🤖 Agent Mode — Autonomous Web Browsing
- Give Jarvis a goal ("search for the best pizza in London") and it **drives a real, visible browser itself**
- The vision LLM (`llama-3.2-11b-vision-instruct`) looks at a live screenshot and clicks, types, scrolls, and navigates — step by step — until the task is done
- **Tiny-cube click grid**: the screen is overlaid with small grid cells (16–32px, selectable) so even tiny buttons are hit precisely
- Live picture-in-picture viewer streams screenshots over WebSocket at ~4fps — you watch everything it does and can take over anytime
- Live action log shows each step and why the AI chose it

### 🧠 Smart Widgets (auto-detected from conversation)
- **Weather**, **Timers**, **Alarms**, **World clocks**
- **Spotify** — play, pause, skip (OAuth)
- **Gmail / Calendar** — summaries of your day (Google OAuth)
- **Image generation** — Flux via NVIDIA NIM, with a confirm-before-render card
- **Screen sharing** — Jarvis looks at your screen
- **Camera mode** — live object detection

### 🗃️ Long-term memory
- Jarvis extracts and remembers durable facts about you ("my name is…", "I live in…") and injects them into future conversations
- 8 personality modes, custom system prompts, and full settings panel

---

## 🏗️ Architecture

Monorepo with **pnpm workspaces**:

```
├── artifacts/
│   ├── jarvis/            # React + Vite frontend (the Jarvis UI)
│   └── api-server/        # Express 5 backend (port 8080)
├── lib/
│   ├── api-client-react/  # Generated React hooks from the OpenAPI spec
│   ├── api-spec/          # OpenAPI contract (single source of truth)
│   ├── api-zod/           # Generated Zod schemas
│   └── db/                # Drizzle ORM + PostgreSQL schema
└── scripts/
    ├── start-dev.sh       # One-command dev launcher (deps → API → frontend)
    └── chrome-deps.sh     # Installs Chrome's system libs for the agent browser
```

**Stack:** React 19 · Vite 7 · TypeScript 5.9 · Tailwind CSS 4 · Framer Motion · Express 5 · Drizzle ORM · Neon PostgreSQL · OpenAI-compatible NVIDIA NIM · Puppeteer

### How the pieces talk

- **Frontend** (`artifacts/jarvis`, port 5173) → proxies `/api/*` to the API server (port 8080)
- **API server** (`artifacts/api-server`) → all AI calls, DB access, and OAuth live here — **API keys never reach the browser**
- **Agent browser** → Puppeteer runs a visible browser; screenshots stream over a WebSocket (`/browser-ws`, port 3002 proxied through Vite) and the vision LLM drives it via `POST /api/jarvis/browse/agent-run`

### Key backend routes (`artifacts/api-server/src/routes/jarvis/`)

| Route | Purpose |
|---|---|
| `/chat` | Streaming LLM conversation (SSE) |
| `/transcribe` | Whisper speech-to-text |
| `/speak` | ElevenLabs text-to-speech |
| `/browse/agent-run` | **Autonomous agent loop** (SSE) |
| `/browse/action` | Manual browser control (click/type/navigate) |
| `/spotify` · `/gmail` | OAuth integrations |
| `/generate-image` | Flux image generation |
| `/memories` · `/conversations` · `/settings` | Persistence |

---

## 🚀 Getting Started

### 1. Install

```bash
pnpm install
```

### 2. Configure environment variables

Copy the template and fill in your keys (see table below). The dev launcher copies `.env` into the API server's working directory automatically.

```bash
cp .env.local .env   # or create .env from the table below
```

### 3. Apply the database schema

```bash
pnpm --filter @workspace/db run push
```

### 4. Run

**One command (recommended):** installs Chrome's system libs, copies env, and starts both servers:

```bash
sh scripts/start-dev.sh
```

Or run the two services separately:

```bash
pnpm --filter @workspace/api-server run dev   # API server on :8080
pnpm --filter @workspace/jarvis run dev       # Frontend on :5173
```

Open **http://localhost:5173** and start talking.

> **Agent browser note:** the first launch may take a few seconds while Chrome boots. If you're on a minimal container, `scripts/chrome-deps.sh` installs the required shared libraries automatically.

### Useful commands

| Command | Purpose |
|---|---|
| `pnpm run typecheck` | Typecheck all workspaces |
| `pnpm run build` | Typecheck + build everything |
| `pnpm --filter @workspace/api-spec run codegen` | Regenerate API hooks/schemas after editing the OpenAPI spec |

---

## 🔑 Environment Variables

Set these via your secret manager / `.env` — **never commit them**.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `OPENAI_LLM_API_KEY` | NVIDIA NIM key — LLM chat + agent vision (`meta/llama-3.2-11b-vision-instruct`) |
| `OPENAI_WHISPER_API_KEY` | NVIDIA NIM key — Whisper large-v3 speech-to-text |
| `NVIDIA_IMAGE_API_KEY` | NVIDIA NIM key — Flux image generation |
| `ELEVENLABS_API_KEY` | ElevenLabs TTS |
| `TAVILY_API_KEY` | Tavily web search |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | Spotify OAuth |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Cloud OAuth 2.0 (Gmail/Calendar) |

### NVIDIA endpoints used

- **LLM (chat + vision):** `https://integrate.api.nvidia.com/v1` — model configurable in `artifacts/api-server/src/config/jarvis.ts`
- **STT:** `https://ai.api.nvidia.com/v1` — `openai/whisper-large-v3`

---

## 🔐 OAuth Redirect URIs

Spotify and Google compute their redirect URIs from the current host automatically in dev. For production, set these explicitly:

| Env var | Value (replace `<YOUR_DOMAIN>`) |
|---|---|
| `SPOTIFY_REDIRECT_URI` | `https://<YOUR_DOMAIN>/api/jarvis/spotify/callback` |
| `GOOGLE_REDIRECT_URI` | `https://<YOUR_DOMAIN>/api/jarvis/gmail/callback` |

Register the same URIs in your [Spotify app](https://developer.spotify.com) and [Google Cloud OAuth client](https://console.cloud.google.com).

---

## 🧪 How the Agent Loop Works

1. **Look** — Jarvis captures a screenshot of its browser overlaid with a fine grid (tiny cubes, numbered columns/rows)
2. **Think** — the vision LLM (`llama-3.2-11b-vision-instruct`) sees the page and returns one JSON command: `click cell (x,y)`, `type "..."`, `navigate`, `scroll`, or `done`
3. **Act** — the command executes on the real browser; the live viewer updates so you watch in real time
4. **Repeat** — up to 20 steps, with stall detection to stop loops and a running action log

Grid cell size is selectable in the UI (16/24/32 px) — smaller cells let the AI click even the tiniest buttons.

---

## 📁 Project Structure Details

- **`artifacts/api-server/src/config/jarvis.ts`** — **edit this** to change the LLM model, voice ID, or Jarvis's system prompt
- **`lib/api-spec/openapi.yaml`** — API contract; run codegen after changing it
- **`lib/db/src/schema/`** — Drizzle tables: `conversations`, `messages`, `memories`, `settings`, `spotifyTokens`, `gmailTokens`

---

## 🤝 Credits & Tech

Jarvis is built on **NVIDIA NIM** (hosted OpenAI-compatible inference), **ElevenLabs**, **Tavily**, **Neon Postgres**, **Puppeteer**, and a React/Tailwind/Framer Motion frontend — with API keys kept strictly server-side.

---

## 📄 License

MIT — free to use, modify, and extend.
