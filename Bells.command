#!/usr/bin/env bash
# Bells.command
#
# Double-click this in Finder to run the CyberData bell automation.
# Handles the "launch Edge with remote debugging" step for you, then
# runs the interactive CLI (engine/bells.js).
#
# Uses Microsoft Edge, not Chrome — Playwright's CDP attach works with any
# Chromium-based browser, and Chrome on this machine had an unresolved
# macOS Local Network permission issue that Edge doesn't have.

set -u

DIR="$(cd "$(dirname "$0")" && pwd)"
CDP_PORT=9222
EDGE_PROFILE="$HOME/edge-cyberdata-debug"

cd "$DIR" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "node isn't on PATH in this shell. Install Node.js, or open a normal"
  echo "Terminal where 'node -v' works and run: node engine/bells.js"
  read -rp "Press Enter to close..." _
  exit 1
fi

# Is Edge already listening on the debug port?
if ! curl -s -o /dev/null "http://localhost:${CDP_PORT}/json/version"; then
  echo "Edge isn't listening on port ${CDP_PORT} yet."
  echo "Launching a dedicated Edge window with remote debugging enabled..."
  open -a "Microsoft Edge" --args \
    --remote-debugging-port="${CDP_PORT}" \
    --user-data-dir="${EDGE_PROFILE}"

  echo
  echo "In the Edge window that just opened:"
  echo "  1. Log into CyberData"
  echo "  2. Navigate to the 2026-27_Bells calendar"
  echo
  read -rp "Press Enter here once you're on the calendar page... " _

  if ! curl -s -o /dev/null "http://localhost:${CDP_PORT}/json/version"; then
    echo "Still can't reach Edge's debug port. Something went wrong with the launch."
    read -rp "Press Enter to close..." _
    exit 1
  fi
fi

echo
node "$DIR/engine/bells.js"

echo
read -rp "Done. Press Enter to close this window..." _
