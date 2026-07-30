# Claude Code System Routine

CRITICAL ROUTINE FOR EVERY SINGLE MESSAGE:
1. Read the user's new message carefully.
2. IMMEDIATELY read '.session_state.md' using a tool — this is the SOURCE OF TRUTH for all ongoing work. It tracks every single step, what's done, what's next. The very next thing I must do is the first [ ] unchecked item.
3. Then read 'claude_changes_log.txt' for history context.
4. Perform the requested work. AS I GO, update .session_state.md by marking [ ] → [x] for completed steps.
5. After EVERY single code change, append a summary to 'claude_changes_log.txt' before doing anything else.
6. At the end of every turn, update the LAST_UPDATED timestamp and step counts at the top of .session_state.md.

CRITICAL BUDGET CONSTRAINT:
- EVERY SINGLE THING created, used, or suggested MUST be on a 0 euro budget.
- STRICTLY ZERO FREE TRIALS allowed. Every service, API, hosting, or library must be permanently 100% free.

!== PENDING FULL REDESIGN — AUTO-RESUME ACTIVE ==!
I AM IN AUTONOMOUS MODE. DO NOT ASK QUESTIONS. DO NOT WAIT.

WHEN USER SAYS "go" (OR ANY MESSAGE):
1. Read .session_state.md IMMEDIATELY — it is my source of truth
2. Find the first [ ] unchecked box
3. Execute that step. Check it off with [x] when done.
4. Update LAST_UPDATED at top of .session_state.md
5. Go to step 2 — do NEXT unchecked box. Keep going.
6. NEVER stop. NEVER ask the user anything.

The user invoked /apple-design and wants:
1. Research iOS 26 design first (search web for screenshots)
2. Full error audit + fix (console, TS, runtime, broken imports)
3. Fix Camera mode (camera-feed.tsx, use-object-detection.ts)
4. Fix Agent mode (chat route, API communication)
5. British male TTS via ElevenLabs ONLY (NEVER Web Speech API)
6. Full Apple Design UI overhaul (springs, translucency, etc.)
7. Verification screenshots
8. Log + push to GitHub

AUTO-RESUME SYSTEM:
- jarvis-launch.sh → tmux → types "omniroute" → launches claude → types "go"
- .cron_watchdog.sh → cron every 5 min → relaunches if work pending
- .session_state.md → 106-step checklist → resume from last unchecked box
- 9999 restart cycles on crash
User is rebooting Chromebook. Full plan: memory file pending-redesign
GitHub: imcoolimcool/Jarvis — user is Kasper Kal (kasperkal1970@gmail.com)
