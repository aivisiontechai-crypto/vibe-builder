#!/bin/bash
# ralph-heartbeat.sh — model- and token-free watchdog for the ralph loop.
# Pure shell (ps / kill / file sizes). Every POLL seconds it classifies the
# build and ACTS:
#   RUNNING  — driver alive and current iteration is producing output
#   IDLE     — iteration process alive but ralph.log silent > IDLE_TTL ⇒
#              kill it (and its children); the driver's wait returns and the
#              loop moves to a fresh iteration (self-heal, no model needed)
#   DEAD     — driver process gone but stories remain ⇒ relaunch the loop
#   DONE     — every story passes ⇒ exit 0
#   FAILED   — relaunch cap hit ⇒ exit 1 (stop being silent about it)
# Run from anywhere; PROJECT_ROOT = the directory above scripts/ralph.
# Usage: ./ralph-heartbeat.sh   (env: HEARTBEAT_POLL_SECS, HEARTBEAT_IDLE_TTL,
#                                 HEARTBEAT_MAX_RELAUNCH)
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DRIVER="$SCRIPT_DIR/ralph-opencode.sh"
PRD_FILE="$PROJECT_ROOT/prd.json"
LOG_FILE="$SCRIPT_DIR/ralph.log"
PID_FILE="$SCRIPT_DIR/.ralph.pid"
ITER_PID_FILE="$SCRIPT_DIR/.iteration.pid"
STATE_FILE="$SCRIPT_DIR/heartbeat.state"

POLL_SECS="${HEARTBEAT_POLL_SECS:-30}"
IDLE_TTL="${HEARTBEAT_IDLE_TTL:-900}"
MAX_RELAUNCH="${HEARTBEAT_MAX_RELAUNCH:-6}"

command -v jq >/dev/null 2>&1 || { echo "jq is required (brew install jq)"; exit 1; }

log_state() { # status detail
  echo "$(date +%FT%T) $*" | tee -a "$STATE_FILE"
}

open_stories() {
  jq '[.userStories[] | select(.passes == false)] | length' "$PRD_FILE" 2>/dev/null || echo ""
}

log_size() { # portable size (macOS stat -f, GNU stat -c)
  stat -f %z "$LOG_FILE" 2>/dev/null || stat -c %s "$LOG_FILE" 2>/dev/null || echo 0
}

kill_tree() { # pid + all descendants, hard
  local p="$1"
  kill -9 "$p" 2>/dev/null || true
  while :; do
    local kids; kids=$(pgrep -P "$p" 2>/dev/null || true)
    [ -z "$kids" ] && break
    for k in $kids; do kill -9 "$k" 2>/dev/null || true; done
    sleep 1
  done
}

LAST_SIZE=""
LAST_CHANGE="$(date +%s)"
LAST_RELAUNCH=0
RELAUNCHES=0

log_state "heartbeat started poll=${POLL_SECS}s idle_ttl=${IDLE_TTL}s max_relaunch=${MAX_RELAUNCH}"

while :; do
  OPEN=$(open_stories)
  if [ -z "$OPEN" ]; then
    log_state "FAILED prd.json unreadable"
    exit 1
  fi
  if [ "$OPEN" -eq 0 ]; then
    log_state "DONE all stories pass"
    exit 0
  fi

  LPID="$(cat "$PID_FILE" 2>/dev/null || true)"
  IPID="$(cat "$ITER_PID_FILE" 2>/dev/null || true)"

  if [ -n "$LPID" ] && kill -0 "$LPID" 2>/dev/null; then
    # driver alive: classify the current iteration
    if [ -n "$IPID" ] && kill -0 "$IPID" 2>/dev/null; then
      SIZE="$(log_size)"
      NOW="$(date +%s)"
      if [ "$SIZE" != "$LAST_SIZE" ]; then
        LAST_SIZE="$SIZE"; LAST_CHANGE="$NOW"
      fi
      if [ $((NOW - LAST_CHANGE)) -ge "$IDLE_TTL" ]; then
        log_state "IDLE iteration $IPID silent > ${IDLE_TTL}s — killing to force a fresh iteration"
        kill_tree "$IPID"
        LAST_CHANGE="$(date +%s)"
      else
        log_state "RUNNING iteration $IPID (silent ${NOW}|${LAST_CHANGE}s, ${IDLE_TTL}s ttl)"
      fi
    else
      log_state "RUNNING no active iteration (loop between stories, ${OPEN} open)"
    fi
  else
    # driver gone but stories remain → relaunch (unless recently done)
    NOW="$(date +%s)"
    if [ $((NOW - LAST_RELAUNCH)) -lt 90 ]; then
      log_state "RECHECK driver reappearing (relaunch grace window)"
    elif [ "$RELAUNCHES" -ge "$MAX_RELAUNCH" ]; then
      log_state "FAILED relaunch cap (${MAX_RELAUNCH}) hit with ${OPEN} stories open"
      exit 1
    else
      RELAUNCHES=$((RELAUNCHES + 1))
      LAST_RELAUNCH="$NOW"
      MARGIN=$((OPEN + 5))
      log_state "DEAD driver gone, ${OPEN} stories open — relaunch attempt ${RELAUNCHES} (max ${MARGIN})"
      nohup "$DRIVER" "$MARGIN" >> "$LOG_FILE" 2>&1 &
    fi
  fi

  sleep "$POLL_SECS"
done