# JARVIS — FINAL IMPLEMENTATION PROMPT (definitive, buildable)

This is the LAST prompt. Execute it in phases, in order. Every phase must leave the app
building and the locked list (section 13) intact. Commit after each phase. When all phases
are done, the project is done: a ChatGPT / Gemini / Claude / Grok competitor for chat and
research, a best-free-technology Suno competitor (music), a best-free Canva-AI competitor
(design), a best-free Replit competitor (build), plus a personal-assistant layer (voice,
camera, timers, web agent, widgets) none of them have.

"Done" is defined per studio by the BEST FREE TECHNOLOGY AVAILABLE, labeled honestly in the
UI (see section 14). No studio is a stub; no studio overclaims.

---

## 0. EXECUTION PLAN (phases + gates)

Work strictly in this order. After each phase: typecheck, build, run the app, commit. Do not
start the next phase until the current one passes its gate. Keep the app green the whole way.

- **Phase A — Foundation.** File storage (section 12.1), all new DB tables + migrations
  (section 12.3), the intent router (section 3), and the global em-dash pass (section 2.1).
  Gate: chat works, files persist, `grep "—"` in strings = 0, build green.
- **Phase B — Chat surface.** Chat box (section 4), chat-header menu (section 5), projects
  (section 6), Gallery (section 7), image scribble (section 8), accent fix (section 9),
  settings restructure (section 10), AI answer style (section 11).
  Gate: every acceptance item in section 15 that is marked B passes.
- **Phase C — Groupchats + accounts.** Accounts and invite codes (section 5c), AI persona
  roundtables, human group chats, group settings.
  Gate: two devices can join a group via code; personas converse; build mode runs unattended.
- **Phase D — Studios to free-parity.** Music, Design, Build (section 14).
  Gate: each studio produces a real artifact end to end.
- **Phase E — Polish + QA.** Full acceptance matrix (section 15), broken-controls audit,
  dedupe, i18n both languages, performance, final grep gates.

---

## 1. THE PRODUCT (north star)

One input. The user types or speaks ONE thing. Jarvis decides everything else: mode, tool,
search, depth, image, music, design, build, research. No mode picker, no studio chooser, no
toggles in the default flow. Tool selection is replaced by automatic intent routing; panels
become hidden overrides.

The studios reach the best possible quality with free technology, and the UI says honestly
what they are (section 14). Nothing is a stub.

## 2. GLOBAL HARD RULES

### 2.1 ZERO EM DASHES, everywhere a human can read it
The codebase currently has 543 em dashes (—); 116 in api-server string literals (AI prompts,
errors, SSE) and 64 in jarvis string literals (labels, placeholders, toasts, aria). The AI
mimics its own prompts, so prompts matter most.
- Remove EVERY em dash from any string that reaches a user: UI text, i18n, placeholders,
  titles, tooltips, toasts, errors, notifications, SSE, AI system prompts, persona text.
  Replace with a comma, colon, period, or restructure. Em dashes in code comments are fine.
- Add to the base system prompt in `chat.ts` and the agent prompt in `browse.ts`: "Never use
  em dashes or en dashes in your responses. Use commas, periods, or colons instead."
- Fix first: `chat.ts` personality prompts, voice-mode modifier, BUILD MODE block, capability
  rule, suggestion prompt, rate-limit error; `widget-detector.ts`; `research-engine.ts`;
  `browse.ts` SSE/notification strings; `home.tsx`; `jarvis-browser.tsx`; `app-overlays.tsx`;
  `settings-panel.tsx`; `research-panel.tsx`; the whole `i18n.tsx` label set.
- Gate: `grep -rn "—" src --include=*.ts --include=*.tsx` must show zero hits in string
  literals. Do this pass in Phase A so later text stays clean.

### 2.2 Everything else
- Every new/changed label goes in BOTH languages in `lib/i18n.tsx` (en + nl), used via
  `t('...')`, never hardcoded.
- Match surrounding style. No new console.log spam. No `any` unless the file already uses it.
- Nothing in this prompt may regress the locked list in section 13.
- Commit after each phase with a clear message.

## 3. THE INTENT ROUTER (one input, AI does the thinking)

Extend `lib/widget-detector.ts`'s LLM-fallback pattern (2s time-box, failure-safe null) into a
full capability router that runs BEFORE the main LLM call in `chat.ts`. High confidence
auto-invokes; low confidence answers normally plus an optional suggestion chip ("Want me to
run this as deep research?"). The existing 18-widget engine (alarm, calculator, calendar,
clock, currency, date, define, figma, file edit, image, map, music, random, timer, unit
converter, weather, plus cards) stays as-is and is part of this router.

Design requirements:
- A single `classify(request)` that returns one primary capability plus optional secondary
  intents, with a confidence score. Classify fast (small model, 2s cap) and fail safe (null
  on any error, then treat as simple_answer).
- The router never adds more than ~2s of latency; the main call streams immediately after.
- Table:

| Capability | Signals | Behavior |
|---|---|---|
| simple_answer | default | existing chat |
| live_search | "latest/news/today/stats/price/score" or time-sensitive | auto web search (Tavily), zero UI |
| deep_research | "research", "deep dive", big multi-part | auto research job, auto depth, estimate + confirm |
| image_gen | "make/draw/generate an image of..." | image confirmation card, then generate |
| music_gen | "make a song / music about..." | Music Studio prefilled with prompt |
| design | "design a poster / edit this image / make a logo" | Design Studio prefilled |
| build | "build an app / code a game / clone this repo" | Build Studio prefilled |
| timer / alarm | existing | existing widget path |
| web_agent | EXPLICIT only: "browse", "open the browser", "use agent mode" | browser agent (tightened trigger) |
| camera | "take a photo / look at me" | camera mode |
| send_message | "call/text/email X" | confirmation only; never actually send |

Combo support ("research X and remind me"). Quantum/Omni research depth is NEVER auto-chosen.

## 4. CHAT BOX

- KEEP in the chat box: the plus button (+), the mic button, the voice button. Nothing else.
- MOVE everything else into a PLUGIN menu opened by an "@" button: Web search, Thinking,
  Agent mode, Share screen, WhatsApp, Generate image, Dictate, Camera, and any other moved
  control. The "@" key offers quick-autocomplete of plugin names while typing.
- Remove web-search, thinking, agent-mode toggles and the personality menu from the default
  input row. They live in the plugin menu and/or Settings Advanced.

## 5. CHAT-HEADER MENU (replaces the current 3-dot menu)

Remove the Settings entry. New contents, all working:

1. **Share chat** — tap Share; a confirmation states clearly "Anyone with this link can view
   this ENTIRE conversation, including any personal context in it." On confirm, copy a public
   read-only link to the whole conversation. Full content, nothing stripped.
2. **Export as .txt** — downloads the chat as a readable text file. ALSO remove the Export
   button from the sidebar (it lives here now).
3. **Groupchat** — see 5b below.
4. **Pin** — pins the chat to the top of the history; pinned sort above all, with an
   indicator; toggle unpins.
5. **Files** — every file uploaded or received in THIS chat, preview and open.
6. **Search in chat** — filters this chat's messages and jumps to matches.
7. **Add to project** — attaches the chat to a project (section 6), or "New project".

### 5b. GROUPCHATS (two modes, one feature)
A groupchat is a conversation with multiple participants. Creating one opens Group Settings
(a dedicated button that appears NEXT TO the 3-dot menu while a group chat is open).

Two ways to start a groupchat:
- **AI persona roundtable.** Pick 2+ Jarvis personas (Researcher, Designer, Skeptic, Builder,
  Journalist, or custom). They ACTUALLY TALK TO EACH OTHER without the user driving: an
  orchestrator decides whose turn it is next, each persona responds in its own voice, and the
  loop runs until the task is done, the user interjects, or a stop condition hits. The Builder
  persona can operate build mode autonomously (runs terminal commands itself), so "build a
  snake game and have Researcher review it" happens without the user typing anything.
- **Human group.** Other real people join via a **4-digit invite code** shown in Group
  Settings (regenerate anytime). People with accounts join by entering the code. Everyone in
  the group can message; Jarvis participates per the AI toggle.

Group Settings contains: participants list, AI participation toggle (**"Jarvis always
responds"** vs **"Jarvis responds only when @Jarvis"**), invite code (human groups),
persona list (AI groups), rename, leave.

### 5c. ACCOUNTS + INVITE CODES (Phase C)
- Minimal but real account system: email/password (or passkey) signup + login, session
  cookies, a profile name + avatar. No third-party auth required unless already in the stack.
- The primary user keeps their existing setup. Invited users get accounts too.
- Invite codes are 4 digits, scoped to one group, regenerable, expire on use or on revoke.
- Multi-device: messages in a group must arrive live on all open sessions (WebSocket or
  polling is acceptable; prefer the existing WebSocket infra).
- The app must remain runnable as single-user: group features degrade gracefully when there
  are no other accounts yet.

## 6. PROJECT SYSTEM (copy ChatGPT Projects)

A Project is a named, colored folder that groups related chats. Chats created inside a
project inherit its context.
- Project: name, cover color, optional attached files/folders used as shared context for
  every chat in the project, optional custom instructions, and a chat list.
- UI: a project switcher in the sidebar (above the chat list), create / rename / delete /
  archive, "Add to project" from the chat-header menu, project indicator per chat. Chats not
  in a project live under "no project".
- When a project is active, new chats are created inside it.
- Backend: projects + project_chats + project_files tables; context (files as content,
  instructions as system text) injected into chat prompts for chats in the project.
- Reference ChatGPT Projects as the model.

## 7. GALLERY (sidebar)

Every image, file, and build-app uploaded or created by any of us (the user, Jarvis, or
invited participants), across ALL conversations, newest first. Include: generated images,
uploads, received files, edited/annotated images, screenshots, artifacts, and apps made in
Build Mode (each build saved with name + preview/launch).
- Filter by type (images / documents / code / audio / apps) and search by name.
- Click to open/preview; images re-annotatable (section 8); build apps open in Build Studio.
- Reads from the file storage layer (12.1) and the build store.

## 8. IMAGE SCRIBBLE / ANNOTATE

- Tapping the tiny attached-image preview opens a full-size overlay with a drawing canvas.
- Controls: brush THICKNESS (slider), brush COLOUR (palette), Undo, Clear, Close, Save.
- Save renders the annotated image and attaches it to the chat as a new image message
  (persisted via 12.1, shown in the feed and Gallery).
- Lightweight scribble tool; the Design Studio remains for AI edits.

## 9. ACCENT COLOUR: FIX IT (currently fake)

The accent picker applies `--primary` and `--ring` ONLY from inside the settings panel's
useEffect, so the colour does not appear until the panel is opened and does not persist across
loads.
- Move accent application to app-load scope (global hook or app root): read
  `localStorage['jarvis-accent']` on startup, apply `--primary` and `--ring` on every load,
  update live on picker change.
- Verify the WHOLE UI responds (buttons, links, orb tint, focus rings, active states). Route
  any hardcoded accent through the CSS variable.
- The picker must visibly change the app with no reload.

## 10. UI DECLUTTER + SETTINGS + DEDUPE + BROKEN CONTROLS

### 10.1 Default view
Sidebar (conversations + projects + gallery) + orb + one input. Nothing else.

### 10.2 Settings restructure
Reorganize into: 1. General (appearance, language). 2. Assistant (personality, memory,
hidden defaults, Advanced with research depth; Quantum/Omni strictly opt-in). 3. Connections
(Gmail, Spotify, each one place). 4. Developer (API keys / LLM, app and server info, merged
from the scattered app/llm/about views). Every row navigates to real content. No dead rows.

### 10.3 Dedupe
- Personality: one source of truth.
- Web search: server default, router overrides per request; no UI toggle.
- Thinking: internal flag only; natural language enables it.
- Studios: the hub is the single manual entry; router and command palette reference it.

### 10.4 Broken/dead controls
Open and verify every settings view, every integration flow (OAuth completes and status
updates), every command palette action, every plus/plugin action, every widget card, every
studio. Fix anything that does nothing, goes nowhere, or never finishes loading.

## 11. AI ANSWER STYLE (server)

Never use em dashes. Chat mode uses markdown headers, lists, bold/italic, sources. Voice mode
is 1-3 short sentences, no markdown. Answer in the user's language. Be honest about
capabilities; never pretend to have done something.

## 12. BACKEND

### 12.1 FILE STORAGE
Two free providers, env-configurable, with a clean abstraction and a local-disk fallback:
- Metadata: a SEPARATE Neon database (the user's explicit choice), Drizzle `files` table: id,
  conversation_id, kind (image / document / audio / build-app / code), name, mime, size,
  storage_key, bucket, created_at, owner (user / jarvis / account). Provide the schema
  snippet and `DATABASE_URL_FILES` env wiring as part of the deliverable.
- Blobs: Cloudflare R2 (10GB free, zero egress, S3-compatible). Serve via `/api/files/:key`.
  Env: R2_ACCOUNT_ID, R2_ACCESS_KEY, R2_SECRET_KEY, R2_BUCKET.
- Fallback: if R2 is unconfigured, store on local disk under `data/files/` with the same
  route, so the app works before cloud keys exist.
- Uploads, generated images, scribbled images, and build apps all write here; Gallery reads
  from here.

### 12.2 The router and chat
- `chat.ts`: intent router before the main call; auto web search; auto research depth; chat
  titles from the starting message (2-4 words, already implemented, keep); strip em dashes;
  no-em-dash instruction.
- `browse.ts`: keep isolation + guardrails + captcha cycle + sensitive-page + adult blocklist;
  strip em dashes; human pacing (variable 150-400ms delays, occasional scroll).

### 12.3 New tables + migrations
Projects, project_chats, project_files, files, pins, share_links, group_members, group_chats,
invite_codes, accounts/sessions, build_apps. Drizzle migrations; additive; no destructive
changes. The files DB lives in the separate Neon database; everything else in the existing DB.

## 13. NON-NEGOTIABLES (locked; verify after every change)

- Agent browser isolation (no memories/profile/location/calendar/gmail/emotion; task + page
  only).
- Agent guardrails: adult + chrome:// request blocking, sensitive-page handover, SAFETY rules
  in the agent prompt, captcha auto-pause + 5x20s then 5-min push reminder cycle, persistent
  profile, uBlock support, extensions locked.
- Server-side timers/alarms + web-push; TimerStrip pill; survive reload.
- Recharging toast on `code:"llm_cooling"`.
- Deep-research estimate before launch.
- Identity honesty on injection-style prompts.
- Voice-first: wake word, conversational loop, mic-intent gating.
- `use-chat-stream.ts` hook contract and the `processUserText` flow.
- Group/account features degrade gracefully when single-user.

## 14. STUDIOS — BEST FREE TECH, HONEST LABELS

Each studio is labeled honestly about what it is. "Done" = a complete studio at the best
free/local quality, producing a real artifact end to end. None is a stub; none overclaims.

- **Music Studio** ("free AI music, lo-fi/ambient/electronic focus"). Pluggable provider:
  - PRIMARY: local MusicGen worker. `scripts/music-gen-worker/` (Python FastAPI +
    transformers, `facebook/musicgen-small` or `medium`). api-server calls it via
    `MUSIC_GEN_WORKER_URL`. Free and unlimited; runs on the user's machine.
  - FALLBACK: HuggingFace Inference API with a free HF token (`HF_API_TOKEN`), MusicGen
    model, pay-as-you-go, with graceful "out of free credits" handling.
  - UI: prompt, genre/mood/duration controls, playback, download, history/queue, provider
    selector in studio settings.
- **Design Studio** ("AI image studio"). Generate images, edit existing images, style
  presets, export. Receives edits from chat (onEditImage). Complete, not a stub.
- **Build Studio** ("code + terminal workspace"). Real terminal + workspace, clone GitHub
  repos, run commands, stream output, write and run code, save each build as a build-app
  (stored via 12.1, listed in the Gallery with name + preview + launch).
- **Research Studio** ("deep multi-source research"). Multi-phase, sources, estimate,
  deep/standard, cancellation, honest limits.

## 15. ACCEPTANCE CRITERIA (run per phase; no tool selection allowed)

Phase B (chat surface):
1. "What's the latest on the iPhone launch?" auto web search, cited answer, no toggle.
2. "Set a 10 minute timer" timer pill appears. No plus menu.
3. "Draw an image of a cat in a spacesuit" image confirm, generates.
4. First-run screen: sidebar, orb, one input, nothing else.
5. Chat box shows only +, mic, voice; "@" opens the plugin menu with the rest.
6. Chat-header menu has Share, Export .txt, Groupchat, Pin, Files, Search, Add to project.
   No Settings entry. Sidebar Export button is gone.
6a. Share shows the full-chat confirmation; the link opens the whole chat read-only.
7. Project: create, add chat, switch project, new chat lands in project, context flows.
8. Gallery lists every uploaded/created file and build app across all chats, filterable.
9. Tapping an attached image opens the scribble overlay; thickness and colour work; Save
   attaches the annotated image.
10. Accent colour visibly changes the whole app on pick and persists across reload.
11. Settings: every view has real content, nothing duplicated, Quantum/Omni behind Advanced.
12. Chat titles from the starting message, 2-4 words, never "New Conversation".
13. Zero em dashes in any UI string, any AI answer, any notification (grep gate + live chat).

Phase C (groupchats + accounts):
14. AI persona roundtable: 3 personas converse with each other autonomously; a build task
    completes without the user typing.
15. Human group: a second account joins via a 4-digit invite code and messages land live;
    the AI toggle (always vs @Jarvis) changes behavior.
16. Group Settings button appears next to the 3-dot menu for group chats.

Phase D (studios):
17. Music Studio generates playable audio via the worker, plays, downloads; 30+ tracks a
    month cost nothing.
18. Design Studio generates and edits images end to end.
19. Build Studio runs code, clones a repo, and saves a build-app visible in the Gallery.

Phase E (polish):
20. Broken-controls audit clean; dedupe done; both languages complete; app is fast.

## 16. OUT OF SCOPE (never)

- No captcha bypass, no adult-filter or chrome:// evasions, no extension-unlocking.
- No sending emails/messages/actions on the user's behalf; confirmations only.
- No paid APIs by default; studios use the best FREE/local technology (the user chose this).
- No removal of the privacy isolation in agent mode.
