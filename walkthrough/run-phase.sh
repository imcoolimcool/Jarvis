#!/bin/sh
# run-phase.sh <PHASE> — start the Jarvis stack, run one walkthrough phase, tear down.
# Everything happens inside one invocation because background processes do not
# survive across terminal commands in this sandbox.
set -u
cd /home/daytona/codebase || exit 1
PHASE=${1:-A}

# Clean up any leftovers from a previous run.
pkill -f 'pnpm --filter @workspace/jarvis' 2>/dev/null
pkill -f 'tsx watch' 2>/dev/null
pkill -f 'api-server' 2>/dev/null
sleep 1

# Start the stack (API server 8080 + Vite 5173) in the background.
sh scripts/start-dev.sh > /tmp/wt-dev.log 2>&1 &
DEVPID=$!

# Wait for readiness.
READY=0
i=0
while [ $i -lt 30 ]; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 http://localhost:5173/ 2>/dev/null)
  if [ "$code" = "200" ]; then
    READY=1
    break
  fi
  i=$((i + 1))
  sleep 2
done
echo "readiness: http=$code tries=$i"
if [ "$READY" != "1" ]; then
  echo '--- dev log tail ---'
  tail -20 /tmp/wt-dev.log
  exit 2
fi

# Run the phase.
PHASE=$PHASE PUPPETEER_CACHE_DIR=/home/daytona/.cache/puppeteer node walkthrough/run-walkthrough.mjs
RC=$?

# Tear down.
pkill -f 'pnpm --filter @workspace/jarvis' 2>/dev/null
pkill -f 'tsx watch' 2>/dev/null
pkill -f 'api-server' 2>/dev/null
kill "$DEVPID" 2>/dev/null
exit $RC
