# Claude Code System Routine

CRITICAL ROUTINE FOR EVERY SINGLE MESSAGE:
1. Read the user's new message carefully.
2. Immediately read 'claude_changes_log.txt' using a tool to verify the last recorded state and history before executing any other tools or writing code.
3. Perform the requested work.
4. After EVERY single code change you make, you must immediately append a summary of that change to 'claude_changes_log.txt' before doing anything else, ensuring no progress is lost if a crash occurs.

CRITICAL BUDGET CONSTRAINT:
- EVERY SINGLE THING created, used, or suggested MUST be on a 0 euro budget.
- STRICTLY ZERO FREE TRIALS allowed. Every service, API, hosting, or library must be permanently 100% free.

!== PENDING FULL REDESIGN — WAITING FOR USER "go" SIGNAL ==!
THIS IS NOT STARTED YET. DO NOT PROCEED UNTIL USER SAYS "go" OR "start".

The user invoked /apple-design and wants:
1. Research iOS 26 design first (search web for screenshots)
2. Full error audit + fix (console, TS, runtime, broken imports)
3. Fix Camera mode (camera-feed.tsx, use-object-detection.ts)
4. Fix Agent mode (chat route, API communication)
5. British male TTS via ElevenLabs ONLY (NEVER Web Speech API)
6. Full Apple Design UI overhaul (springs, translucency, etc.)
7. Verification screenshots
8. Log + push to GitHub

User is rebooting their Chromebook. Full plan in memory file: pending-redesign
Run `crostini-fix.sh` if user hasn't yet (at /home/kasperkal1970/jarvis/crostini-fix.sh)
GitHub: imcoolimcool/Jarvis — user is Kasper Kal (kasperkal1970@gmail.com)
