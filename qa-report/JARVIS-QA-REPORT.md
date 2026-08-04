# Jarvis Voice Assistant — QA Walkthrough Report

**Date:** 2026-08-04  
**Scope:** Local Replit preview, frontend and API startup, responsive visual inspection, source-level control inventory, and non-destructive API checks.  
**Rule followed:** No application code was modified and no application data was intentionally created or deleted.

## Executive summary

The imported project starts successfully after installing its existing lockfile dependencies. The API server reports a healthy database connection, the frontend renders, and the checked read-only endpoints return expected responses.

The most visible product problems are:

1. The default light theme is extremely washed out and has weak text/icon contrast.
2. A microphone-denied wake-word toast appears immediately on page load and occupies a large, prominent area.
3. The default profile falls back to a specific personal name (`Kasper Kal`) even when no profile has been configured.
4. The supplied automated walkthrough scripts are not portable to this Replit environment and cannot run unchanged.

The first three are user-facing findings. The fourth is a QA/tooling finding, not an end-user runtime defect.

## Severity summary

| Severity | Count | Finding |
|---|---:|---|
| High | 0 | No confirmed data-loss, security, or startup-blocking product defect |
| Medium | 2 | Low-contrast default UI; unsolicited microphone-denied toast |
| Low | 2 | Hard-coded default personal profile; non-portable QA scripts |

## Environment and startup verification

### Confirmed working

- `pnpm install --frozen-lockfile` completed successfully for all eight workspace projects.
- API workflow starts and listens on port 8080.
- Frontend workflow starts and listens on port 21662.
- `GET /api/healthz` returned:
  - `status: "ok"`
  - `db: "connected"`
- `GET /api/jarvis/settings` returned `200` with an empty settings object.
- `GET /api/jarvis/research` returned `200` with an empty list.
- `GET /api/jarvis/conversations` returned `200` with an empty list.
- `GET /api/jarvis/memories` returned `200` with an empty list.
- `GET /api/jarvis/gmail/status` returned `200` and `connected: false`.
- `GET /api/jarvis/spotify/status` returned `200` and `connected: false`.
- `GET /api/jarvis/llm-keys` returned `200` and showed one masked, healthy environment-backed LLM key.
- `GET /api/jarvis/browse/status` returned `200` and `running: false`.
- No browser console errors were reported by the app-preview capture.

### Startup warning

The API initially logged `recoverStuckJobs: DB unavailable at boot`, but the subsequent health check reported the database connected. This appears to be a transient boot-order warning rather than a persistent failure.

## Finding QA-001 — Default light theme is too faint to read comfortably

**Severity:** Medium  
**Category:** Accessibility / visual design / usability  
**Status:** Confirmed in live preview

### Evidence

- [Desktop home screenshot](./01-home-desktop.jpg)
- [Mobile home screenshot](./02-home-mobile.jpg)
- [Tablet home screenshot](./03-home-tablet.jpg)

The main status text, mode labels, microphone icon, and other controls are rendered in very pale gray over a white background. The blue orb and pastel background also make the page feel overexposed. The same problem is visible at desktop, tablet, and mobile widths.

### Steps to reproduce

1. Open the Jarvis frontend in its default state.
2. Leave the theme at the default light appearance.
3. Inspect the center status area and the mode controls below the orb.
4. Repeat at approximately 390px, 1024px, and 1440px viewport widths.

### Likely cause

The light theme defines `--muted-foreground: 0 0% 55%`, while many components further reduce opacity using classes such as `text-muted-foreground/40`, `/50`, and `/70`. The visual treatment compounds several low-contrast layers.

Relevant files:

- `artifacts/jarvis/src/index.css`
- `artifacts/jarvis/src/pages/home.tsx`
- `artifacts/jarvis/src/components/orb.tsx`
- `artifacts/jarvis/src/components/chat-sidebar.tsx`

### Recommended fix

- Raise contrast for primary status text and interactive controls in the light theme.
- Avoid opacity reductions below roughly 70% for essential labels and icons.
- Keep decorative orb/background opacity low enough that it does not compete with text.
- Verify the resulting colors against WCAG contrast targets for normal text and controls.

## Finding QA-002 — Microphone-denied toast appears unsolicited on initial load

**Severity:** Medium  
**Category:** UX / permissions / responsive layout  
**Status:** Confirmed in live preview

### Evidence

- [Desktop home screenshot](./01-home-desktop.jpg)
- [Mobile home screenshot](./02-home-mobile.jpg)
- [Tablet home screenshot](./03-home-tablet.jpg)

The toast says **“Wake word needs mic access”** and **“Microphone access denied. Wake word needs the microphone.”** immediately after opening the app. On mobile it takes up a large top portion of the screen and partially overlaps the header area. The user has not yet asked to activate wake-word listening.

### Steps to reproduce

1. Open the app in a browser context where microphone permission is unavailable or denied.
2. Do not click the microphone or enable wake-word mode.
3. Observe the first screen.

### Likely cause

The wake-word hook reports the permission failure during initial setup and the home screen turns that failure into a toast without gating it behind an explicit wake-word action.

Relevant files:

- `artifacts/jarvis/src/hooks/use-wake-word.ts`
- `artifacts/jarvis/src/pages/home.tsx`
- `artifacts/jarvis/src/hooks/use-toast.ts`

### Recommended fix

- Request microphone access only when the user explicitly enables wake-word or voice capture.
- If permission is denied during passive initialization, keep the state quiet or show a small, dismissible status indicator.
- If a toast is necessary, delay it until the user taps the related control and ensure it does not cover primary mobile navigation.
- Include a direct “Open browser permissions” or “Try again” action.

## Finding QA-003 — Unconfigured users see a hard-coded personal profile name

**Severity:** Low  
**Category:** Personalization / confusing UX  
**Status:** Confirmed by source inspection

### Steps to reproduce

1. Clear `localStorage` or open the app in a fresh browser profile.
2. Open Settings.
3. Observe the profile header.

### Expected

An unconfigured profile should show a neutral placeholder such as “Your profile” or ask the user to set a name.

### Actual

The settings component falls back to the specific name **“Kasper Kal”** and initials **“KK”** when no `jarvis-profile` value exists.

### Likely cause

`getProfile()` in `settings-panel.tsx` contains a personal fallback value.

Relevant file:

- `artifacts/jarvis/src/components/settings-panel.tsx`

### Recommended fix

- Replace the personal fallback with a neutral placeholder.
- Provide an explicit profile setup/edit action.
- Add a test for a fresh local-storage state.

## Finding QA-004 — Imported walkthrough scripts are not portable to this environment

**Severity:** Low  
**Category:** QA tooling / maintainability  
**Status:** Confirmed

### Steps to reproduce

1. Run `node ui-walkthrough.mjs`.
2. Observe the failure:
   - configured executable path `/usr/local/bin/google-chrome` does not exist.
3. Run `node screenshot-test.mjs`.
4. Observe the failure:
   - hard-coded output path `/home/kasperkal1970/jarvis/screenshots` does not exist.
5. Attempt to use Puppeteer’s bundled Chromium.
6. Observe that Chromium cannot start until the container exposes `libgbm.so.1` and `libudev.so.1`.

### Likely cause

The imported scripts contain machine-specific absolute paths:

- `ui-walkthrough.mjs` hard-codes `/usr/local/bin/google-chrome`.
- `screenshot-test.mjs` hard-codes `/home/kasperkal1970/jarvis/screenshots`.
- Both scripts target `http://localhost:5173`, while the configured artifact workflow serves the frontend on port 21662.

### Recommended fix

- Resolve the browser executable dynamically or let Puppeteer choose its installed browser.
- Use a project-relative output directory.
- Read the frontend URL from a command-line argument or environment variable.
- Keep the browser runner separate from application code and add a short Replit-specific invocation to the README.

## Additional UX observations

These are observations from the visual/source pass and are not counted as separate confirmed defects unless reproduced interactively:

- The interface is intentionally very minimal, but the large empty canvas leaves the main controls visually disconnected from navigation and settings.
- Essential controls are represented primarily by icons or very small labels. This is especially difficult in the light theme where labels are already faint.
- Several feature surfaces are nested behind the plus menu, Studios hub, command palette, or settings subviews. This creates a discoverability cost for first-time users.
- “Fact Check” in the Studios hub routes back to chat because fact checking lives on individual messages. The label can imply a dedicated workspace, so the hub copy should clarify the behavior.
- The UI uses many tiny `10px`–`12px` labels and low-opacity mono text in menus and studio cards. This contributes to the faint/technical appearance and may not suit a voice assistant intended for broad use.

## Feature/control coverage

### Visually/source-audited surfaces

- Voice home state
- Chat mode entry point
- Agent mode entry point
- Camera mode entry point
- Plus menu:
  - Attach file
  - Camera
  - New Gem
  - Generate image
  - All Studios
  - Design Studio
  - Music Studio
- Studios hub:
  - Chat
  - Voice
  - Camera
  - Deep Research
  - Build Mode
  - Design Studio
  - Music Studio
  - Fact Check
  - Data Lab
- Command palette:
  - mode switching
  - Deep Research
  - New Gem
  - Data Lab
  - image action
  - new chat
  - web-search toggle
  - theme toggle
  - settings
  - conversation search
- Settings categories:
  - Personalization
  - Memory
  - Language
  - Gmail
  - Spotify
  - Appearance
  - Accent color
  - Web search/data
  - LLM keys
  - About
- Research panel controls and confirmation path
- Data Lab upload/column/ask controls
- Design Studio upload, crop, transform, text, reset, save/export controls
- Music Studio compose controls
- Chat sidebar search, new chat, conversation actions, delete-all action
- Browser status/control endpoints
- Camera and screen-share entry points
- Timer, alarm, weather, clock, and other widget source paths

### Not fully click-verified

The environment did not permit a true interactive browser run:

- The provided runner’s Chrome path was missing.
- Bundled Chromium was initially missing runtime libraries.
- The screenshot tool available for the live artifact is static and cannot click through overlays.
- OAuth flows were not completed because they require external provider interaction and redirect handling.
- Audio, camera, screen-sharing, file-upload, image-generation, TTS, and external OAuth flows were not exercised end-to-end.

These are test coverage limitations, not claims that those features are broken.

## Screenshots

- [Home — desktop](./01-home-desktop.jpg)
- [Home — mobile](./02-home-mobile.jpg)
- [Home — tablet](./03-home-tablet.jpg)

## Final assessment

The project is runnable locally and the backend/frontend wiring is in place. The highest-value fixes are visual accessibility and permission UX: make the default interface readable, and do not interrupt the initial screen with a microphone error before the user asks for wake-word functionality. After those changes, the next QA pass should use a portable browser runner to complete the interactive flows that could not be clicked in this environment.