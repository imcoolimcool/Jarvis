# JARVIS — FINAL IMPLEMENTATION PROMPT (definitive)

This is the LAST prompt. Execute it to completion. When it is done, the website is DONE:
a ChatGPT / Gemini / Claude / Grok competitor for chat and research, a Suno competitor for
music, a Canva-AI competitor for design, a Replit competitor for building, plus a
personal-assistant layer (voice, camera, timers, web agent, widgets) none of them have.
Every section is a requirement. Verify with the acceptance matrix at the end. Do not stop at
"good enough" on any studio or any button. If something in this spec is ambiguous, make the
most professional product decision and move on.

---

## 1. THE PRODUCT (north star)

One input. The user types or speaks ONE thing. Jarvis decides everything else: mode, tool,
search, depth, image, music, design, build, research. No mode picker, no studio chooser, no
toggles in the default flow. Tool selection is replaced by automatic intent routing; panels
become hidden overrides.

The studios are NOT stubs. Each must reach real feature parity for its niche:
- **Research Studio**: match Gemini/Deep Research quality: multi-phase, sources, an estimate,
  deep and standard depths, honest limits.
- **Music Studio**: match Suno: prompt to a real generated track with playback, download, and
  parameter controls (genre, mood, duration).
- **Design Studio**: match Canva AI: generate images, edit existing images, style presets,
  export. (This already receives edits from the chat; make the studio itself complete.)
- **Build Studio / Build Mode**: match Replit: a real Linux terminal + workspace in the
  browser, clone GitHub repos, run commands, see output, ask Jarvis to write code and run it.

## 2. GLOBAL HARD RULES (apply everywhere, first)

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
  rule, suggestion prompt, rate-limit error, title prompt; `widget-detector.ts`;
  `research-engine.ts`; `browse.ts` SSE/notification strings; `home.tsx` "AGENT MODE ON";
  `jarvis-browser.tsx` placeholders/titles; `app-overlays.tsx`; `settings-panel.tsx`;
  `research-panel.tsx`; the whole `i18n.tsx` label set.
- Gate: `grep -rn "—" src --include=*.ts --include=*.tsx` must show zero hits in string
  literals.

### 2.2 Everything else
- Every new/changed label goes in BOTH languages in `lib/i18n.tsx` (en + nl), used via
  `t('...')`, never hardcoded.
- Match surrounding style. No new console.log spam. No `any` unless the file already uses it.
- Nothing in this prompt may regress the locked list in section 13.

## 3. THE INTENT ROUTER (one input, AI does the thinking)

Extend `lib/widget-detector.ts`'s LLM-fallback pattern (2s time-box, failure-safe null) into a
full capability router that runs BEFORE the main LLM call in `chat.ts`. High confidence
auto-invokes; low confidence answers normally plus an optional suggestion chip. The existing
18-widget engine (alarm, calculator, calendar, clock, currency, date, define, figma, file
edit, image, map, music, random, timer, unit converter, weather, plus cards) stays as-is and
is part of this router.

| Capability | Signals | Behavior |
|---|---|---|
| simple_answer | default | existing chat |
| live_search | "latest/news/today/stats/price/score" or time-sensitive | auto web search (Tavily), zero UI |
| deep_research | "research", "deep dive", big multi-part | auto research job, auto depth, estimate + confirm |
| image_gen | "make/draw/generate an image of..." | image confirmation card, then generate |
| music_gen | "make a song / music about..." | route to Music Studio with the prompt prefilled |
| design | "design a poster / edit this image / make a logo" | Design Studio with prompt/image prefilled |
| build | "build an app / code a game / clone this repo" | Build Studio with the request prefilled |
| timer / alarm | existing | existing widget path |
| web_agent | EXPLICIT only: "browse", "open the browser", "use agent mode" | browser agent (tightened trigger) |
| camera | "take a photo / look at me" | camera mode |
| send_message | "call/text/email X" | confirmation only; never actually send |

Combo support ("research X and remind me"). Quantum/Omni research depth is NEVER auto-chosen.

## 4. CHAT BOX (what stays, what moves)

The input area currently has ~10 buttons around the text box plus toggles. Reduce it:
- KEEP in the chat box: the plus button (+), the mic button, the voice button. Nothing else.
- MOVE everything else into a PLUGIN menu, opened by an "@" button in the chat box. The plugin
  menu lists: Web search, Thinking mode, Agent mode, Share screen, WhatsApp, Generate image,
  Dictate, Camera, and any other moved control. The "@" key also triggers a quick-autocomplete
  of plugin names while typing. Selecting a plugin toggles or launches it, exactly like the old
  button did.
- Remove the web-search toggle, thinking toggle, agent-mode toggle, personality menu, and
  plus-menu from the default input row. They live in the plugin menu and/or Settings Advanced.

## 5. CHAT-HEADER MENU (replaces the current 3-dot menu)

Find the current chat-header menu (the one that contains a Settings entry; if it is not a
3-dot menu today, make it one). Remove the Settings entry from it. Replace the menu contents
with these, and make every one actually work:
1. **Share chat** — copies a shareable link to this conversation.
2. **Export as .txt** — downloads the chat as a readable text file. ALSO remove the Export
   button from the sidebar menu (it lives here now).
3. **Groupchat** — creates a group chat from this chat (new conversation shared with the
   participants/context of this one).
4. **Pin** — pins the chat to the top of the conversation history; pinned chats sort above
   all others, with a pin indicator; toggle unpins.
5. **Files** — shows every file uploaded or received in THIS chat, with preview and open.
6. **Search in chat** — a search box that filters the messages in this chat and jumps to
   matches.
7. **Add to project** — attaches this chat to a project (section 6), or offers "New project".
- The Settings entry is NOT removed from Settings itself; it is only removed from this menu
  (Settings stays reachable via the sidebar and command palette).

## 6. PROJECT SYSTEM (copy ChatGPT Projects)

Implement a Projects concept modeled on ChatGPT Projects:
- A Project is a named, colored folder that groups related chats. Chats created inside a
  project automatically inherit the project's context.
- Project has: name, optional cover color, optional attached files/folders used as shared
  context for every chat in the project, optional custom instructions, and a chat list.
- UI: a project switcher section in the sidebar (above the chat list), create / rename /
  delete / archive project, "Add to project" from the chat-header menu, project indicator on
  each chat. Chats not in a project live under "no project".
- Add "New Project" to the sidebar and to the "Add to project" menu. When a project is active,
  new chats are created inside it.
- Backend: a projects table + project_chats join + project_files, routes for CRUD and
  context injection into the chat prompt (files as context, instructions as system text).
- Copy ChatGPT's Projects behavior as the reference model.

## 7. GALLERY (new, in the sidebar)

Add a Gallery entry to the sidebar. It shows EVERY image and file that has been uploaded or
created by either side, across ALL conversations, newest first. Include: generated images,
uploaded attachments, received files, edited/annotated images, screenshots, artifacts.
- Filter by type (images / documents / code / audio) and search by name.
- Click an item to open/preview it; images open in the viewer and can be re-annotated
  (section 8).
- It reads from the existing message/file data; a gallery route/aggregation endpoint if needed.

## 8. IMAGE SCRIBBLE / ANNOTATE (new)

- Tapping the tiny attached-image preview (currently a 10x10 thumbnail in the feed) opens a
  full-size overlay of that image with a drawing canvas on top.
- Controls: brush THICKNESS (slider), brush COLOUR (palette), Undo, Clear, Close, Save.
- Save renders the annotated image and attaches it to the chat as a new image message
  (uploaded back to the conversation, shown in the feed and in the Gallery).
- This is a lightweight scribble tool. The Design Studio remains for AI edits.

## 9. ACCENT COLOUR: FIX IT (currently fake)

The accent picker in Settings applies `--primary` and `--ring` CSS variables ONLY from inside
the settings panel component (its own useEffect), so the colour does not appear until the
panel is opened and does not persist visually across page loads.
- Move accent application to app-load scope (a global hook or the app root): read
  `localStorage['jarvis-accent']` on startup, apply `--primary` and `--ring` immediately on
  every load, update them live when the picker changes.
- Verify the WHOLE UI responds: primary buttons, links, the orb tint, focus rings, accents,
  chips, the active sidebar state. If any component uses a hardcoded accent, route it through
  the CSS variable.
- The picker itself must persist and visibly change the app with no reload.

## 10. UI DECLUTTER + SETTINGS + DEDUPE + BROKEN CONTROLS

### 10.1 Default view
Sidebar (conversations + projects + gallery) + orb + one input. Nothing else.

### 10.2 Settings restructure
Current structure is confusing (Customize / Account / Theme / Accent, 10 views, with the real
app settings buried). Reorganize into:
1. General: appearance (theme + accent), language.
2. Assistant: personality, memory, hidden defaults (web search, thinking), Advanced (research
   depth; Quantum/Omni strictly opt-in).
3. Connections: Gmail, Spotify, each one place with connect/disconnect and status.
4. Developer: API keys / LLM providers, app and server info (merge the scattered app/llm/about
   views).
Every row navigates to real content. No dead rows.

### 10.3 Dedupe
- Personality: one source of truth (header menu and Settings point to it).
- Web search: server default, router overrides per request; no UI toggle.
- Thinking: internal flag only; natural language enables it.
- Studios: the hub is the single manual entry; router and command palette reference it.

### 10.4 Broken/dead controls
No empty onClick handlers were found by grep; the dead controls are subtler. Open and verify
every settings view, every integration flow (OAuth round trip completes and status updates),
every command palette action, every plus/plugin menu action, every widget card, every studio.
Fix anything that does nothing, goes nowhere, or never finishes loading.

## 11. AI ANSWER STYLE (server)

In the base system prompt(s): never use em dashes; chat mode uses markdown headers, lists,
bold/italic, sources; voice mode is 1-3 short sentences with no markdown; answer in the user's
language; be honest about capabilities; never pretend to have done something.

## 12. BACKEND CHANGES SUMMARY

- `chat.ts`: intent router before the main call; auto web search; auto research depth; chat
  titles from the starting message (2-4 words, already implemented: deterministic
  `titleFromMessage` + LLM polish); strip em dashes; no-em-dash instruction.
- `lib/intent-router.ts` (or extend widget-detector): the capability router.
- `research.ts`: auto depth; estimate stays; Quantum/Omni opt-in only.
- `browse.ts`: keep isolation + guardrails + captcha cycle + sensitive-page + adult blocklist;
  strip em dashes; add human pacing (variable 150-400ms delays, occasional scroll).
- Projects: new tables/routes for projects, chat membership, project context injection.
- Share/export: share-link route, chat text export.
- Gallery: aggregation endpoint for all files/images across conversations.
- Keep everything in section 13 intact.

## 13. NON-NEGOTIABLES (locked; verify after every change)

- Agent browser isolation (no memories/profile/location/calendar/gmail/emotion; task + page
  only).
- Agent guardrails: adult + chrome:// request blocking, sensitive-page handover, SAFETY rules
  in the agent prompt, captcha auto-pause + 5x20s then 5-min push reminder cycle, persistent
  profile, uBlock support, extensions locked (no chrome:// access for the agent).
- Server-side timers/alarms + web-push; TimerStrip pill; survive reload.
- Recharging toast on `code:"llm_cooling"`.
- Deep-research estimate before launch.
- Identity honesty on injection-style prompts.
- Voice-first: wake word, conversational loop, mic-intent gating.
- `use-chat-stream.ts` hook contract and the `processUserText` flow.

## 14. STUDIO COMPETITOR PARITY (what "done" means)

- Music Studio (Suno): prompt to track, real playback, download, genre/mood/duration controls,
  a queue/history of past generations. Not a stub.
- Design Studio (Canva AI): image generation, edit existing images, style presets, export,
  receive edits from chat (already wired via onEditImage). Make the studio complete.
- Build Studio (Replit): real terminal + workspace, clone GitHub repos, run commands, stream
  output, ask Jarvis to write and run code, see results.
- Research Studio (Gemini): multi-phase research, sources, estimate, deep/standard, honest
  limits, cancellation.
- Chat (ChatGPT/Gemini/Claude/Grok): the one-input router, markdown answers, web search,
  memory, personality, voice, projects, gallery, share, pin, groupchat, files. The full spec
  above.

## 15. ACCEPTANCE CRITERIA (run all; no tool selection allowed)

1. "What's the latest on the iPhone launch?" auto web search, cited answer, no toggle.
2. "Set a 10 minute timer" timer pill appears. No plus menu.
3. "Research the history of coffee" auto research, auto depth, estimate, confirms.
4. "Draw an image of a cat in a spacesuit" image confirm, generates.
5. "Make a lo-fi beat about rain" Music Studio opens prefilled, generates, plays.
6. "Design a poster for a coffee shop" Design Studio opens prefilled, generates.
7. "Build me a snake game" Build Studio opens prefilled, terminal runs it.
8. "Find the best price for a PS5" normal answer. "Use the browser to find it" agent mode.
9. First-run screen: sidebar, orb, one input, nothing else.
10. Chat box shows only +, mic, voice; "@" opens the plugin menu with the rest.
11. Chat-header menu has: Share, Export .txt, Groupchat, Pin, Files, Search, Add to project.
    No Settings entry. Sidebar Export button is gone.
12. Project: create, add chat, switch project, new chat lands in project, context flows.
13. Gallery lists every uploaded/created file across all chats, filterable.
14. Tapping an attached image opens the scribble overlay; thickness and colour work; Save
    attaches the annotated image to the chat.
15. Accent colour visibly changes the whole app on pick, persists across reload, no fake.
16. Settings: every view has real content, nothing duplicated, Quantum/Omni behind Advanced.
17. Chat titles: from the starting message, 2-4 words, never "New Conversation".
18. Zero em dashes in any UI string, any AI answer, any notification (grep gate + live chat).
19. Music/Design/Build studios all complete end-to-end, none a stub.

## 16. OUT OF SCOPE (never)

- No captcha bypass, no adult-filter or chrome:// evasions, no extension-unlocking.
- No sending emails/messages/actions on the user's behalf; confirmations only.
- No new external services beyond what exists; no new databases beyond the projects tables.
- No removal of the privacy isolation in agent mode.
