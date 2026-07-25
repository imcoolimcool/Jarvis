# Claude Code System Routine

CRITICAL ROUTINE FOR EVERY SINGLE MESSAGE:
1. Read the user's new message carefully.
2. Immediately read 'claude_changes_log.txt' using a tool to verify the last recorded state and history before executing any other tools or writing code.
3. Perform the requested work.
4. After EVERY single code change you make, you must immediately append a summary of that change to 'claude_changes_log.txt' before doing anything else, ensuring no progress is lost if a crash occurs.

CRITICAL BUDGET CONSTRAINT:
- EVERY SINGLE THING created, used, or suggested MUST be on a 0 euro budget.
- STRICTLY ZERO FREE TRIALS allowed. Every service, API, hosting, or library must be permanently 100% free.
