---
name: SpeechRecognition types in Vite
description: Fixing TypeScript errors for Web Speech API in a React + Vite project.
---

## Rule

To type the Web Speech API (`SpeechRecognition`, `SpeechRecognitionEvent`, etc.) in a Vite React app, install `@types/dom-speech-recognition` and add it to the `types` array in `tsconfig.json`.

**Why:** When `tsconfig.json` explicitly lists `types` (e.g. `["node", "vite/client"]`), TypeScript no longer auto-includes all `@types/*` packages. The speech recognition types must be listed manually.

**How to apply:**

1. Install the types package:

```bash
pnpm add -D @types/dom-speech-recognition
```

2. Add it to `tsconfig.json`:

```json
"types": ["node", "vite/client", "dom-speech-recognition"]
```

3. Remove or replace any `declare global` hacks that reference `typeof SpeechRecognition` before the type is defined; the package provides the global types directly.