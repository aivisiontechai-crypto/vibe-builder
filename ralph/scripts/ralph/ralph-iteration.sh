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

# Backend dispatch: read the backend recorded by the driver (defaults to
# opencode for back-compat with runs started before this was added).
BACKEND_FILE="$SCRIPT_DIR/.backend"
BACKEND="opencode"
[ -f "$BACKEND_FILE" ] && BACKEND="$(cat "$BACKEND_FILE")"

case "$BACKEND" in
  opencode)
    # --auto auto-approves edits/commands for autonomous operation (mirrors
    # ralph's --dangerously-skip-permissions). Fresh context every iteration.
    $TIMER opencode run --dir "$PROJECT_ROOT" --auto --format default "$PROMPT" >> "$LOG_FILE" 2>&1 || true
    ;;
  claude)
    $TIMER claude -p "$(cat "$PROMPT")" --dangerously-skip-permissions --add-dir "$PROJECT_ROOT" >> "$LOG_FILE" 2>&1 || true
    ;;
  codex)
    $TIMER codex exec --cd "$PROJECT_ROOT" --full-auto "$(cat "$PROMPT")" >> "$LOG_FILE" 2>&1 || true
    ;;
  *)
    echo "unrecognized backend '$BACKEND' in $BACKEND_FILE — falling back to opencode" >> "$LOG_FILE"
    $TIMER opencode run --dir "$PROJECT_ROOT" --auto --format default "$PROMPT" >> "$LOG_FILE" 2>&1 || true
    ;;
esac

echo "----- iteration end $(date +%FT%T) -----" >> "$LOG_FILE"