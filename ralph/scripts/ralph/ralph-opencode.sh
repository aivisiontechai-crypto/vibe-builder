#!/bin/bash
# ralph-opencode.sh — the ralph loop, backend-agnostic (opencode/claude/codex).
# Spawns a FRESH headless instance of the detected backend per iteration;
# memory persists via git history, progress.txt, and prd.json (passes).
# Stops when every story passes: true (`<promise>COMPLETE</promise>`).
# Run from anywhere; PROJECT_ROOT = the directory above scripts/ralph.
# Usage: ./ralph-opencode.sh [max_iterations] [--tool opencode|claude|codex]
# Companion: ralph-heartbeat.sh watches .ralph.pid/.iteration.pid + ralph.log
# and self-heals this loop (kill hung iterations, relaunch on death).
set -e

MAX_ITERATIONS=200
FORCE_BACKEND=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --tool)
      case "$2" in
        opencode|claude|codex) FORCE_BACKEND="$2" ;;
        *) echo "driver supports --tool opencode|claude|codex (got '$2')"; exit 1 ;;
      esac
      shift 2
      ;;
    *) if [[ "$1" =~ ^[0-9]+$ ]]; then MAX_ITERATIONS="$1"; fi; shift ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PRD_FILE="$PROJECT_ROOT/prd.json"
PROGRESS_FILE="$PROJECT_ROOT/progress.txt"
LOG_FILE="$SCRIPT_DIR/ralph.log"
PROMPT_FILE="$SCRIPT_DIR/OPENCODE.md"
ITERATION_SCRIPT="$SCRIPT_DIR/ralph-iteration.sh"
LAST_BRANCH_FILE="$SCRIPT_DIR/.last-branch"
ARCHIVE_DIR="$SCRIPT_DIR/archive"
PID_FILE="$SCRIPT_DIR/.ralph.pid"
ITER_PID_FILE="$SCRIPT_DIR/.iteration.pid"
BACKEND_FILE="$SCRIPT_DIR/.backend"

# Backend resolution: explicit --tool wins; else reuse a previously
# recorded backend (so a resumed run never silently switches CLIs
# mid-build); else auto-detect in opencode -> claude -> codex order.
if [ -n "$FORCE_BACKEND" ]; then
  BACKEND="$FORCE_BACKEND"
elif [ -f "$BACKEND_FILE" ]; then
  BACKEND="$(cat "$BACKEND_FILE")"
elif command -v opencode >/dev/null 2>&1; then
  BACKEND="opencode"
elif command -v claude >/dev/null 2>&1; then
  BACKEND="claude"
elif command -v codex >/dev/null 2>&1; then
  BACKEND="codex"
else
  echo "no supported headless backend found on PATH (need one of: opencode, claude, codex)"
  exit 1
fi
command -v "$BACKEND" >/dev/null 2>&1 || { echo "$BACKEND CLI is required on PATH"; exit 1; }
printf '%s\n' "$BACKEND" > "$BACKEND_FILE"

command -v jq       >/dev/null 2>&1 || { echo "jq is required (brew install jq)"; exit 1; }
[ -f "$PROMPT_FILE" ]        || { echo "missing $PROMPT_FILE"; exit 1; }
[ -f "$PRD_FILE" ]           || { echo "missing $PRD_FILE — generate it via vibe-docs first"; exit 1; }
[ -f "$ITERATION_SCRIPT" ]   || { echo "missing $ITERATION_SCRIPT"; exit 1; }
[ -x "$ITERATION_SCRIPT" ]   || { echo "$ITERATION_SCRIPT not executable (chmod +x)"; exit 1; }
[ -d "$PROJECT_ROOT/.git" ]  || { echo "not a git repo: $PROJECT_ROOT"; exit 1; }

# light shape check: must be ralph-shaped before we start
jq -e '.project and .branchName and (.userStories | length > 0)' "$PRD_FILE" >/dev/null 2>&1 \
  || { echo "prd.json is not ralph-shaped (needs project, branchName, userStories[])"; exit 1; }

# publish our PID for the heartbeat, clean it up on every exit
echo "$$" > "$PID_FILE"
trap 'rm -f "$PID_FILE" "$ITER_PID_FILE"' EXIT

# archive the previous run when the branch changed (matches upstream ralph)
CURRENT_BRANCH="$(jq -r '.branchName // empty' "$PRD_FILE")"
LAST_BRANCH="$(cat "$LAST_BRANCH_FILE" 2>/dev/null || true)"
if [ -n "$CURRENT_BRANCH" ] && [ -n "$LAST_BRANCH" ] && [ "$CURRENT_BRANCH" != "$LAST_BRANCH" ]; then
  DATE="$(date +%Y-%m-%d)"
  FOLDER_NAME="${LAST_BRANCH#ralph/}"
  DEST="$ARCHIVE_DIR/$DATE-$FOLDER_NAME"
  mkdir -p "$DEST"
  [ -f "$PRD_FILE" ]      && cp "$PRD_FILE"      "$DEST/"
  [ -f "$PROGRESS_FILE" ] && cp "$PROGRESS_FILE" "$DEST/"
  echo "Archived previous run ($LAST_BRANCH) -> $DEST"
  printf '# Ralph Progress Log\nStarted: %s\n---\n' "$(date)" > "$PROGRESS_FILE"
fi
[ -n "$CURRENT_BRANCH" ] && printf '%s\n' "$CURRENT_BRANCH" > "$LAST_BRANCH_FILE"

[ -f "$PROGRESS_FILE" ] || printf '# Ralph Progress Log\nStarted: %s\n---\n' "$(date)" > "$PROGRESS_FILE"

PROMPT="$(cat "$PROMPT_FILE")"
PREV_OPEN=999999
STALLS=0

echo "Starting ralph ($BACKEND) — max $MAX_ITERATIONS iterations — project: $PROJECT_ROOT"
echo "driver pid $$ — heartbeat watches $PID_FILE / $ITER_PID_FILE"

for i in $(seq 1 "$MAX_ITERATIONS"); do
  echo ""
  echo "==============================================================="
  echo "  Ralph iteration $i/$MAX_ITERATIONS ($BACKEND)"
  echo "==============================================================="

  # snapshot passes before the iteration so we can verify exactly one
  # story flipped false->true afterwards (corruption guard).
  SNAPSHOT="$(jq -c '[.userStories[] | {id, passes}]' "$PRD_FILE" 2>/dev/null || true)"

  # iteration runs in its own wrapper: output streams to ralph.log (the
  # heartbeat's liveness signal), pid is exposed for the heartbeat to kill.
  "$ITERATION_SCRIPT" "$PROMPT" &
  ITER_PID=$!
  echo "$ITER_PID" > "$ITER_PID_FILE"
  wait "$ITER_PID" || true
  rm -f "$ITER_PID_FILE"

  # strip ANSI from the log tail and look for the completion marker
  CLEANED=$(tail -c 20000 "$LOG_FILE" 2>/dev/null | sed $'s/\033\[[0-9;]*[a-zA-Z]//g')
  if printf '%s' "$CLEANED" | grep -q "<promise>COMPLETE</promise>"; then
    echo ""
    echo "Ralph completed all stories. Finished at iteration $i."
    exit 0
  fi

  # integrity + progress echo: supervision (human or agent) relies on the
  # log; a corrupted prd.json or a stalled loop must be loud, not silent.
  OPEN=$(jq '[.userStories[] | select(.passes == false)] | length' "$PRD_FILE" 2>/dev/null || true)
  if [ -z "$OPEN" ]; then
    echo "!! prd.json unreadable after iteration $i — aborting (fix/restore, then relaunch)"
    exit 1
  fi
  echo "  -> $OPEN story/stories still open"
  NEW_SNAPSHOT="$(jq -c '[.userStories[] | {id, passes}]' "$PRD_FILE" 2>/dev/null || true)"

  # all stories pass but the marker was missed (e.g. model cut message off):
  # done is done — do not re-loop a completed build or flag it as a stall.
  if [ "$OPEN" -eq 0 ]; then
    echo ""
    echo "Ralph completed all stories. Finished at iteration $i."
    exit 0
  fi

  # post-iteration integrity check: while stories remain, an iteration must
  # flip exactly one story false->true and nothing else (no true->false
  # back-flips, no stories added/removed). Anything else means a corrupted
  # prd.json — restore from git before relaunching, never trust it.
  if [ -n "$NEW_SNAPSHOT" ] && [ -n "$SNAPSHOT" ]; then
    CORRUPT="$(jq -n --argjson b "$SNAPSHOT" --argjson a "$NEW_SNAPSHOT" '
      [$b[] | select(.passes==false)] | length as $ob |
      [$a[] | select(.passes==false)] | length as $oa |
      [$b[] | select(.passes==true )] | length as $tb |
      [$a[] | select(.passes==true )] | length as $ta |
      if ($b|length) != ($a|length) or (($ob-$oa) != 1) or (($ta-$tb) != 1) then "bad" else "" end' 2>/dev/null || true)"
    if [ "$CORRUPT" = "bad" ]; then
      echo ""
      echo "!! iteration $i changed prd.json wrongly (expected exactly one false->true flip)"
      echo "   Fix/restore prd.json — stop and inspect $PROGRESS_FILE, fix the story, relaunch."
      exit 1
    fi
  fi

  # stall detection: a story that cannot pass must be surfaced, not burned
  # through 200 more iterations of the same failure.
  if [ "$OPEN" -ge "$PREV_OPEN" ]; then
    STALLS=$((STALLS + 1))
  else
    STALLS=0
  fi
  PREV_OPEN="$OPEN"
  if [ "$STALLS" -ge 3 ]; then
    echo ""
    echo "!! 3 consecutive iterations with no progress — the highest-priority open story is stuck."
    echo "   Stuck story:"
    jq -r '.userStories[] | select(.passes == false) | "   \(.id) \(.title)"' "$PRD_FILE" | head -1
    echo "   Fix the story/acceptance criteria (or docs), then relaunch. See $PROGRESS_FILE."
    exit 1
  fi

  echo "Iteration $i done. Continuing..."
  sleep 2
done

echo ""
echo "Ralph reached max iterations ($MAX_ITERATIONS) without COMPLETE."
echo "Stories still open:"
jq -r '.userStories[] | select(.passes == false) | "\(.id) \(.title)"' "$PRD_FILE" 2>/dev/null || true
echo "See $PROGRESS_FILE for learnings."
exit 1