#!/bin/bash
# ─────────────────────────────────────────────────────────────────
# Jarvis Launch Script — crash-proof, auto-resume, omniroute-powered
# ─────────────────────────────────────────────────────────────────
# How it works:
#   1. Ensures omniroute (AI router/API proxy) is running
#   2. Launches Claude Code in the Jarvis project
#   3. If Claude crashes → waits 3s → relaunches automatically
#   4. On relaunch, Claude reads .session_state.md and resumes
# ─────────────────────────────────────────────────────────────────

PROJECT_DIR="/home/kasperkal1970/jarvis"
LOG_FILE="$PROJECT_DIR/.launch.log"

echo "$(date) — Jarvis Launch starting..." >> "$LOG_FILE"
cd "$PROJECT_DIR" || { echo "Project dir not found!"; exit 1; }

# ── Step 1: omniroute check ─────────────────────────────────────
echo "🔌 Checking omniroute (AI router)..."
if command -v omniroute &> /dev/null; then
  # Check if server is already running
  if [ -f "/home/kasperkal1970/.omniroute/server/.pid" ]; then
    OMNI_PID=$(cat /home/kasperkal1970/.omniroute/server/.pid 2>/dev/null)
    if kill -0 "$OMNI_PID" 2>/dev/null; then
      echo "   ✅ omniroute running (PID $OMNI_PID)"
    else
      echo "   ⚠️  omniroute PID stale, starting..."
      omniroute &>/dev/null &
      sleep 2
    fi
  else
    echo "   ⚠️  Starting omniroute..."
    omniroute &>/dev/null &
    sleep 2
  fi
else
  echo "   ⚠️  omniroute not found — continuing anyway"
fi

# ── Step 2: Auto-restart loop ────────────────────────────────────
MAX_RESTARTS=50
RESTART_COUNT=0

while [ $RESTART_COUNT -lt $MAX_RESTARTS ]; do
  echo "$(date) — Launch attempt $((RESTART_COUNT + 1))" >> "$LOG_FILE"
  echo ""
  echo "╔══════════════════════════════════════════╗"
  echo "║   Jarvis Auto-Launch (attempt $((RESTART_COUNT + 1)))        ║"
  echo "║   Crash? I'll be right back.            ║"
  echo "╚══════════════════════════════════════════╝"
  echo ""

  # Launch Claude Code
  # It reads CLAUDE.md → which says read .session_state.md FIRST
  # Everything resumes from the last unchecked box
  claude

  # Claude exited — log and restart
  EXIT_CODE=$?
  RESTART_COUNT=$((RESTART_COUNT + 1))
  echo "$(date) — Claude exited with code $EXIT_CODE (restart $RESTART_COUNT)" >> "$LOG_FILE"

  if [ $RESTART_COUNT -ge $MAX_RESTARTS ]; then
    echo "$(date) — Max restarts reached, giving up" >> "$LOG_FILE"
    echo ""
    echo "⚠️  Max restarts ($MAX_RESTARTS) reached."
    echo "   Check log: $LOG_FILE"
    exit 1
  fi

  echo ""
  echo "🔄 Restarting in 3s... ($((RESTART_COUNT + 1))/$MAX_RESTARTS)"
  sleep 3
done
