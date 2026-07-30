#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# JARVIS LAUNCH — Crostini-ready, 2-tab tmux, fully autonomous
# ═══════════════════════════════════════════════════════════════════
#
# Creates TWO tmux windows in one session:
#   Window 0: "omniroute" — runs the AI router
#   Window 1: "claude"    — runs Claude Code, auto-resumes
#
# No user input needed after launch. Works on Crostini.
#
# Usage:
#   bash ~/jarvis/jarvis-launch.sh
#   tmux attach -t jarvis     (to watch both windows)
#   Ctrl+b then 0 or 1        (switch between windows inside tmux)
# ═══════════════════════════════════════════════════════════════════

PROJECT_DIR="/home/kasperkal1970/jarvis"
TMUX_SESSION="jarvis"
LOG_FILE="$PROJECT_DIR/.launch.log"

echo "" >> "$LOG_FILE"
echo "$(date) — ═══ JARVIS LAUNCH v3 ═══" >> "$LOG_FILE"

cd "$PROJECT_DIR" || { echo "❌ Project not found"; exit 1; }

# ── 1. Install tmux if missing ──────────────────────────────────
if ! command -v tmux &> /dev/null; then
  echo "📦 Installing tmux..."
  sudo apt-get install -y -qq tmux 2>/dev/null
fi

# ── 2. Kill any stale session ───────────────────────────────────
tmux kill-session -t "$TMUX_SESSION" 2>/dev/null || true
sleep 1

# ── 3. Create tmux session with TWO windows ─────────────────────
# Window 0: omniroute (the AI router / API proxy)
# Window 1: claude (Claude Code with auto-resume)

tmux new-session -d -s "$TMUX_SESSION" -n omniroute
tmux rename-window -t "$TMUX_SESSION:0" omniroute
tmux send-keys -t "$TMUX_SESSION:0" "cd $PROJECT_DIR" Enter
tmux send-keys -t "$TMUX_SESSION:0" "clear && echo '=== OMNIROUTE ===' && omniroute" Enter

tmux new-window -t "$TMUX_SESSION" -n claude
tmux send-keys -t "$TMUX_SESSION:1" "cd $PROJECT_DIR" Enter
tmux send-keys -t "$TMUX_SESSION:1" "clear && echo '=== CLAUDE ==='" Enter
tmux send-keys -t "$TMUX_SESSION:1" "bash .tmux_runner.sh" Enter

# ── 4. Wait for Claude to start, then type "go" ─────────────────
echo "⏳ Waiting 20s for Claude to fully load on Crostini..."
sleep 20
tmux send-keys -t "$TMUX_SESSION:1" "go" Enter

echo "✅ Claude launched in tmux window 1 — 'go' sent automatically"
echo ""
echo "   ┌─────────────────────────────────────────────────────┐"
echo "   │  tmux session 'jarvis' running with 2 windows:    │"
echo "   │                                                    │"
echo "   │   0 — omniroute  (AI router / API key source)      │"
echo "   │   1 — claude     (Claude Code, auto-resuming)      │"
echo "   │                                                    │"
echo "   │  Watch:  tmux attach -t jarvis                     │"
echo "   │  Switch: Ctrl+b then 0  or  Ctrl+b then 1          │"
echo "   │  Detach: Ctrl+b then d                              │"
echo "   └─────────────────────────────────────────────────────┘"
echo ""
echo "📝 Log: $LOG_FILE"

# ── 5. Monitor forever ─────────────────────────────────────────
# If tmux dies (crash, OOM, container restart), restart the
# whole thing. If only Claude dies, .tmux_runner.sh handles it.
while true; do
  if ! tmux has-session -t "$TMUX_SESSION" 2>/dev/null; then
    echo "$(date) — ❌ tmux session died. Restarting..." | tee -a "$LOG_FILE"
    exec bash "$0"  # Restart this script from scratch
  fi
  sleep 15
done
