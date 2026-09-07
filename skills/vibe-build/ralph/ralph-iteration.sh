#!/bin/bash
# ralph-iteration.sh — ONE ralph iteration, its own process (no model/token
# involvement; pure bash). Streams everything to ralph.log so the heartbeat
# can judge liveness from log growth, and publishes its pid so the
# heartbeat can kill a hung iteration (driver's `wait` then moves on).
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOG_FILE="$SCRIPT_DIR/ralph.log"
PROMPT="${1:?prompt file required}"

# optional per-iteration wall-clock cap (GNU coreutils: brew install coreutils).
TIMER=""
if   command -v gtimeout >/dev/null 2>&1; then TIMER="gtimeout 2700"
elif command -v timeout  >/dev/null 2>&1; then TIMER="timeout 2700"
fi

echo "$$" > "$SCRIPT_DIR/.iteration.pid"
echo "" >> "$LOG_FILE"
echo "----- iteration start $(date +%FT%T) pid $$ -----" >> "$LOG_FILE"

# Backend dispatch: read the backend recorded by the driver (assumed to be
# present, but auto-detect as a fallback for runs that predate the .backend
# file so we never silently default to opencode).
BACKEND_FILE="$SCRIPT_DIR/.backend"
if [ -f "$BACKEND_FILE" ]; then
  BACKEND="$(cat "$BACKEND_FILE")"
else
  BACKEND=""
  for cand in opencode claude codex; do
    if command -v "$cand" >/dev/null 2>&1; then BACKEND="$cand"; break; fi
  done
fi

# If the recorded backend is missing/invalid, correct it to the first backend
# actually on PATH (rather than silently defaulting to opencode), then dispatch.
case "$BACKEND" in
  opencode|claude|codex) : ;;
  *)
    echo "unrecognized backend '$BACKEND' in $BACKEND_FILE — re-detecting" >> "$LOG_FILE"
    BACKEND=""
    for cand in opencode claude codex; do
      if command -v "$cand" >/dev/null 2>&1; then BACKEND="$cand"; break; fi
    done
    ;;
esac

case "$BACKEND" in
  opencode)
    # --auto auto-approves edits/commands for autonomous operation (mirrors
    # ralph's --dangerously-skip-permissions). Fresh context every iteration.
    $TIMER opencode run --dir "$PROJECT_ROOT" --auto --format default "$PROMPT" >> "$LOG_FILE" 2>&1 || true
    ;;
  claude)
    $TIMER claude -p "$PROMPT" --dangerously-skip-permissions --add-dir "$PROJECT_ROOT" >> "$LOG_FILE" 2>&1 || true
    ;;
  codex)
    $TIMER codex exec --cd "$PROJECT_ROOT" --full-auto "$PROMPT" >> "$LOG_FILE" 2>&1 || true
    ;;
  *)
    echo "no supported headless backend found on PATH (need one of: opencode, claude, codex)" >> "$LOG_FILE"
    echo "aborting this iteration; fix by installing one of the above or re-running ralph-driver.sh --tool <backend>" >> "$LOG_FILE"
    exit 1
    ;;
esac

echo "----- iteration end $(date +%FT%T) -----" >> "$LOG_FILE"