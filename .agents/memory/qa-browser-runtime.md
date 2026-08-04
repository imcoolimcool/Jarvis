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