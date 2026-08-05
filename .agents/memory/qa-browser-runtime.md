---
name: QA browser runtime
description: Imported Puppeteer QA scripts may contain machine-specific browser paths and screenshot directories that do not work in Replit.
---

When running imported browser walkthroughs in Replit, verify the browser executable, runtime libraries, frontend artifact port, and screenshot output path before treating runner failures as application failures.

**Why:** Imported projects commonly preserve absolute paths from the original developer machine, while Replit artifact workflows may use a different port and browser runtime.

**How to apply:** Prefer a project-relative, configurable runner and distinguish test-harness startup failures from frontend/API defects in QA reports.

For interactive coverage, isolate each major UI surface in a fresh page and re-scan controls after every activation. Stateful overlays and data-backed rows can otherwise invalidate coordinates or create unbounded rediscovery loops.

**Why:** A single linear sweep through this app repeatedly invalidated stale targets and kept rediscovering conversation rows as navigation changed the DOM.

**How to apply:** Bound semantic control coverage per state, treat repeated data rows as one control type, and record blocked external/mutating requests separately from product failures.

For mobile chat screenshots, explicitly set the persisted app mode to `chat` before loading the page; the preview may otherwise reopen in saved voice mode and hide the chat composer.

**Why:** The app persists its mode in local storage, so a normal preview load can show a valid but unrelated full-screen voice surface during chat-layout QA.

**How to apply:** Use a fresh page, set the mode before reload, then open overlays such as the plus menu and capture the target viewport.

For end-to-end claims, DOM activation counts are not completion evidence. Each
major surface and mutually exclusive action needs an isolated fresh state,
post-action assertion, and a status of PASS, FAIL, BLOCKED, NOT TESTED, or
SOURCE REVIEW ONLY.

**Why:** A broad Jarvis sweep reported hundreds of successful activations even
though Settings persistence, provider flows, media workflows, and resulting
feature states were not conclusively completed.

**How to apply:** Never headline a QA report with click totals as a pass rate;
publish a per-workflow coverage matrix and keep harness failures separate from
application failures.