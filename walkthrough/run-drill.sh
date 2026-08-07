#!/bin/sh
# run-drill.sh <PHASE> — start the Jarvis stack, run one exhaustive button-drill
# phase (F|G|H|I), tear down. Everything inside one invocation because background
# processes do not survive across terminal commands in this sandbox.
set -u
cd /home/daytona/codebase || exit 1
PHASE=${1:-F}

pkill -f 'pnpm --filter @workspace/jarvis' 2>/dev/null
pkill -f 'tsx watch' 2>/dev/null
pkill -f 'api-server' 2>/dev/null
sleep 1

sh scripts/start-dev.sh > /tmp/wt-drill.log 2>&1 &
DEVPID=$!

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
  tail -20 /tmp/wt-drill.log
  exit 2
fi

DRILL_PHASE=$PHASE PUPPETEER_CACHE_DIR=/home/daytona/.cache/puppeteer node walkthrough/drill-buttons.mjs
RC=$?

pkill -f 'pnpm --filter @workspace/jarvis' 2>/dev/null
pkill -f 'tsx watch' 2>/dev/null
pkill -f 'api-server' 2>/dev/null
kill "$DEVPID" 2>/dev/null
exit $RC
