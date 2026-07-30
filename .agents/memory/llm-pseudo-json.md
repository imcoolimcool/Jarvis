---
name: LLM pseudo-JSON titles
description: LLMs may return structured-looking blobs with single quotes that break JSON.parse when asked for titles or plain strings.
---

When asking an LLM for a short title, plain string, or single value, it may return something that looks like JSON but uses single quotes or mixes quoting styles, e.g. `{"type": 'text', 'text': 'Some title'}`.

**Rule:** Always try a lenient regex extraction for the target field (`text`, `title`, `message`, `content`) before falling back to `JSON.parse`. This recovers the human-readable value even when the blob is not valid JSON.

**Why:** `JSON.parse` will throw on single-quoted keys/values, and that failure leaves a raw, ugly blob visible in the UI (conversation titles in this case).

**How to apply:** In any code that consumes an LLM output that should be a string:
1. Strip markdown fences and surrounding quotes.
2. If the result looks like an object/array, run a regex like `/['"]?(text|title|message|content)['"]?\s*[:=]\s*['"]([^'"]+)['"]/i` first.
3. If that fails, try `JSON.parse` and fall back to the raw trimmed string.
