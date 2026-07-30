#!/bin/bash
# ═════════════════════════════════════════════════════════════════
# JARVIS AUTO-LAUNCH — Full autonomous mode
# ═════════════════════════════════════════════════════════════════
# What this does:
# 1. Creates a tmux terminal session (fully automated)
# 2. Types "omniroute" in the terminal (activates API routing)
# 3. Launches Claude Code
# 4. Types "go" automatically after Claude loads → resumes work
# 5. If crash → detects it → loops back to step 1
# 6. Runs forever, no user input needed after launch
# ═════════════════════════════════════════════════════════════════

PROJECT_DIR="/home/kasperkal1970/jarvis"
LOG_FILE="$PROJECT_DIR/.launch.log"
TMUX_SESSION="jarvis"
LOCK_FILE="$PROJECT_DIR/.jarvis.lock"
RESUME_PROMPT_FILE="$PROJECT_DIR/.resume_prompt.txt"

echo "$(date) — ⚡ Jarvis Auto-Launch starting" >> "$LOG_FILE"
cd "$PROJECT_DIR" || { echo "Project dir not found!"; exit 1; }

# ── Step 1: Ensure tmux is installed ────────────────────────────
if ! command -v tmux &> /dev/null; then
  echo "📦 Installing tmux (terminal multiplexer)..."
  sudo apt-get install -y -qq tmux 2>/dev/null || {
    echo "❌ tmux install failed. Trying screen..."
    if command -v screen &> /dev/null; then
      echo "   Using screen instead"
    else
      echo "⚠️  Neither tmux nor screen available — installing screen"
      sudo apt-get install -y -qq screen 2>/dev/null
    fi
  }
fi

# ── Step 2: Ensure omniroute is running ─────────────────────────
echo "🔌 Activating omniroute (AI router)..."
if command -v omniroute &> /dev/null; then
  # Check if server is alive
  OMNI_PID_FILE="/home/kasperkal1970/.omniroute/server/.pid"
  if [ -f "$OMNI_PID_FILE" ]; then
    OMNI_PID=$(sudo cat "$OMNI_PID_FILE" 2>/dev/null)
    if [ -n "$OMNI_PID" ] && kill -0 "$OMNI_PID" 2>/dev/null; then
      echo "   ✅ omniroute already running (PID $OMNI_PID)"
    else
      echo "   ⚡ Starting omniroute daemon..."
      omniroute --daemon &>/dev/null &
      sleep 3
    fi
  else
    echo "   ⚡ Starting omniroute daemon..."
    nohup omniroute --daemon &>/dev/null &
    sleep 3
  fi
else
  echo "   ⚠️  omniroute binary not found — continuing"
fi

# ── Step 3: Create the resume prompt ────────────────────────────
# This gets sent to Claude as the first message after restart
cat > "$RESUME_PROMPT_FILE" << 'RPEOF'
go
RPEOF

# ── Step 4: Ensure tmux runner script exists ─────────────────
# .tmux_runner.sh is tracked in git — it runs claude in an
# endless restart loop inside the tmux session
if [ ! -f "$PROJECT_DIR/.tmux_runner.sh" ]; then
  echo "⚠️  .tmux_runner.sh missing — re-clone repo"
  exit 1
fi
chmod +x "$PROJECT_DIR/.tmux_runner.sh"

# ── Step 5: Main loop ──────────────────────────────────────────
# Creates/kills tmux session, sends omniroute + claude + go

MAX_CRASHES=9999
CRASH_COUNT=0

while [ $CRASH_COUNT -lt $MAX_CRASHES ]; do
  echo "" >> "$LOG_FILE"
  echo "$(date) — ═══ Main loop cycle $((CRASH_COUNT + 1)) ═══" >> "$LOG_FILE"

  # Kill any stale tmux session
  tmux kill-session -t "$TMUX_SESSION" 2>/dev/null || true
  sleep 1

  # Create a fresh tmux session (detached)
  tmux new-session -d -s "$TMUX_SESSION" -x 120 -y 40
  echo "$(date) — tmux session created" >> "$LOG_FILE"

  # ── Type "omniroute" in the terminal ──
  # This activates the API key / AI router
  echo "   → typing 'omniroute' in terminal..." | tee -a "$LOG_FILE"
  tmux send-keys -t "$TMUX_SESSION" "omniroute" Enter
  sleep 2

  # ── Launch Claude Code ──
  echo "   → launching Claude..." | tee -a "$LOG_FILE"
  tmux send-keys -t "$TMUX_SESSION" "cd $PROJECT_DIR && bash .tmux_runner.sh" Enter

  # ── Wait for Claude to start, then send "go" ──
  # Give it time to initialize (varies by machine)
  echo "   → waiting for Claude to initialize..." | tee -a "$LOG_FILE"
  sleep 15  # Wait for Claude to fully load

  # ── Type "go" automatically ──
  # This triggers the resume: Claude reads .session_state.md
  # and starts working from the first unchecked box
  echo "   → typing 'go' (resume command)..." | tee -a "$LOG_FILE"
  tmux send-keys -t "$TMUX_SESSION" "go" Enter

  echo "$(date) — ✅ Claude launched and 'go' sent" >> "$LOG_FILE"

  # ── Monitor for crash ──
  # Watch the tmux session. If Claude dies, the .tmux_runner.sh
  # restarts it. But if tmux itself dies, we restart from scratch.
  while tmux has-session -t "$TMUX_SESSION" 2>/dev/null; do
    sleep 10

    # Check if the tmux window still has a claude process
    # If .tmux_runner.sh exits for any reason, the session will
    # still exist but be idle — so we check for active processes
    if tmux list-panes -t "$TMUX_SESSION" -F '#{pane_pid}' 2>/dev/null | head -1 | xargs -I{} ps -o pid= --ppid {} 2>/dev/null | grep -q .; then
      # Still running — good
      continue
    else
      # No child processes — tmux is idle/dead
      echo "$(date) — ⚠️  tmux session idle (process died)" >> "$LOG_FILE"
      break
    fi
  done

  CRASH_COUNT=$((CRASH_COUNT + 1))
  echo "$(date) — ❌ Crash detected (cycle $CRASH_COUNT). Restarting..." >> "$LOG_FILE"

  # Kill everything to ensure clean state
  tmux kill-session -t "$TMUX_SESSION" 2>/dev/null || true
  pkill -f "claude" 2>/dev/null || true

  echo "🔄 Full restart in 5s... ($CRASH_COUNT/$MAX_CRASHES)" | tee -a "$LOG_FILE"
  sleep 5
done

echo "Fatal: max crashes reached" | tee -a "$LOG_FILE"
exit 1
