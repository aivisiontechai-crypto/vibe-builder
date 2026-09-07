#!/bin/bash
# ralph-setup.sh — installs the ralph build-loop driver into ~/.agents/ralph/
# so it's available machine-wide (the fast path #1 in vibe-build's resolution
# order) rather than re-bundling it into every project.
#
# Usage:
#   ./bin/ralph-setup.sh                 # install to ~/.agents/ralph (default)
#   ./bin/ralph-setup.sh /custom/path    # install to a custom target
#
# Source resolution (first match wins):
#   1. this skill's bundled copy: <repo>/skills/vibe-build/ralph/  (default)
#   2. a driver already at the target (re-copies/refreshes it)
#
# Requires: bash, and the ralph driver files bundled with the vibe-build skill.
set -euo pipefail

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../skills/vibe-build/ralph" && pwd)"
TARGET_ROOT="${1:-$HOME/.agents/ralph/scripts/ralph}"

[ -d "$SOURCE_ROOT" ] || { echo "bundled ralph driver not found at $SOURCE_ROOT"; exit 1; }

DRIVER_FILES="ralph-driver.sh ralph-iteration.sh ralph-heartbeat.sh ralph-runner.mjs ralph-heartbeat.mjs ralph-runner-parallel.mjs RALPH.md"

echo "Installing ralph driver -> $TARGET_ROOT"
mkdir -p "$TARGET_ROOT"

for f in $DRIVER_FILES; do
  if [ -f "$SOURCE_ROOT/$f" ]; then
    cp "$SOURCE_ROOT/$f" "$TARGET_ROOT/$f"
    echo "  installed $f"
  fi
done

chmod +x "$TARGET_ROOT/ralph-driver.sh" \
         "$TARGET_ROOT/ralph-iteration.sh" \
         "$TARGET_ROOT/ralph-heartbeat.sh" \
         "$TARGET_ROOT/ralph-runner.mjs" \
         "$TARGET_ROOT/ralph-heartbeat.mjs" \
         "$TARGET_ROOT/ralph-runner-parallel.mjs" 2>/dev/null || true

echo ""
echo "Done. Driver installed to: $TARGET_ROOT"
echo "The next project built will automatically reuse this (resolution path #1)."
