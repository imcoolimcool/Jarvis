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

!== PENDING FULL REDESIGN — WAITING FOR USER "go" SIGNAL ==!
THIS IS NOT STARTED YET. DO NOT PROCEED UNTIL USER SAYS "go" OR "start".

I WILL READ .session_state.md FIRST — IT IS MY SOURCE OF TRUTH.
Every single step is tracked there with [ ] checkboxes.
I check off steps AS I DO THEM. If I crash, I resume from the first unchecked box.

The user invoked /apple-design and wants:
1. Research iOS 26 design first (search web for screenshots)
2. Full error audit + fix (console, TS, runtime, broken imports)
3. Fix Camera mode (camera-feed.tsx, use-object-detection.ts)
4. Fix Agent mode (chat route, API communication)
5. British male TTS via ElevenLabs ONLY (NEVER Web Speech API)
6. Full Apple Design UI overhaul (springs, translucency, etc.)
7. Verification screenshots
8. Log + push to GitHub

Auto-resume via: bash ~/jarvis/jarvis-launch.sh (restarts on crash + sources omniroute)
User is rebooting their Chromebook. Full plan in memory file: pending-redesign
GitHub: imcoolimcool/Jarvis — user is Kasper Kal (kasperkal1970@gmail.com)
