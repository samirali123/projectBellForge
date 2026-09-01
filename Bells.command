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
PORT_CHECK_RETRIES=10
PORT_CHECK_DELAY=1

port_is_listening() {
  curl -s -o /dev/null "http://localhost:${CDP_PORT}/json/version"
}

wait_for_port() {
  for i in $(seq 1 "$PORT_CHECK_RETRIES"); do
    if port_is_listening; then
      return 0
    fi
    sleep "$PORT_CHECK_DELAY"
  done
  return 1
}

# A browser only actually opens its debug port on a genuinely fresh
# launch — if Edge is already running (from a normal, non-debug launch),
# opening it again with --remote-debugging-port just focuses the existing
# window and silently ignores the flag. So don't just launch and hope:
# force-quit any running Edge first, then launch clean.
relaunch_edge_with_debugging() {
  echo "Making sure no other Edge window is already running (it would"
  echo "block the debug port from opening)..."
  osascript -e 'quit app "Microsoft Edge"' >/dev/null 2>&1
  # Give it a moment to actually exit, then force it if it's still around.
  for i in 1 2 3 4 5; do
    if ! pgrep -f "Microsoft Edge" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
  pkill -f "Microsoft Edge" >/dev/null 2>&1

  echo "Launching a dedicated Edge window with remote debugging enabled..."
  open -a "Microsoft Edge" --args \
    --remote-debugging-port="${CDP_PORT}" \
    --user-data-dir="${EDGE_PROFILE}"
}

cd "$DIR" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "node isn't on PATH in this shell. Install Node.js, or open a normal"
  echo "Terminal where 'node -v' works and run: node engine/bells.js"
  read -rp "Press Enter to close..." _
  exit 1
fi

if ! port_is_listening; then
  echo "Edge isn't listening on port ${CDP_PORT} yet."
  relaunch_edge_with_debugging

  if ! wait_for_port; then
    echo "Edge still isn't listening on port ${CDP_PORT} after a clean relaunch."
    echo "This usually isn't the 'already running' problem (we just force-quit"
    echo "and relaunched) — something else is blocking it. Check:"
    echo "  curl -s http://localhost:${CDP_PORT}/json/version"
    echo "and see the README's troubleshooting section."
    read -rp "Press Enter to close..." _
    exit 1
  fi

  echo
  echo "In the Edge window that just opened:"
  echo "  1. Log into CyberData"
  echo "  2. Navigate to the 2026-27_Bells calendar"
  echo
  read -rp "Press Enter here once you're on the calendar page... " _

  if ! port_is_listening; then
    echo "Edge's debug port stopped responding — was the window closed?"
    read -rp "Press Enter to close..." _
    exit 1
  fi
fi

echo
node "$DIR/engine/bells.js"

echo
read -rp "Done. Press Enter to close this window..." _
