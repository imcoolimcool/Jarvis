---
name: QA browser runtime
description: Imported Puppeteer QA scripts may contain machine-specific browser paths and screenshot directories that do not work in Replit.
---

When running imported browser walkthroughs in Replit, verify the browser executable, runtime libraries, frontend artifact port, and screenshot output path before treating runner failures as application failures.

**Why:** Imported projects commonly preserve absolute paths from the original developer machine, while Replit artifact workflows may use a different port and browser runtime.

**How to apply:** Prefer a project-relative, configurable runner and distinguish test-harness startup failures from frontend/API defects in QA reports.