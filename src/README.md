# CyberData Bell Schedule Automation

Interactive tool that drives an already-logged-in Microsoft Edge session to
create bell schedule events in CyberData — a single day, or a whole date
range at once. See `PROJECT_SPEC.md` for the full design; this file is just
the quick-start.

(Uses Edge, not Chrome — Playwright's CDP attach works with any
Chromium-based browser, and Chrome had an unresolved macOS Local Network
permission issue on the machine this was built on. `chromium.connectOverCDP`
in `playwright.js` doesn't care which one it's talking to.)

## Easiest way to run it

Double-click **`Bells.command`** (one level up, in `CyberDataAutomation/`).
It launches Edge with remote debugging enabled for you, waits for you to
log into CyberData and get to the `2026-27_Bells` calendar, then runs the
CLI — no manual steps below required.

## Manual setup

```bash
npm install
```

Launch Edge yourself with remote debugging enabled, and log into CyberData
manually:

```bash
open -a "Microsoft Edge" --args --remote-debugging-port=9222 --user-data-dir="$HOME/edge-cyberdata-debug"
```

(On Windows: `msedge --remote-debugging-port=9222`.)

## Run

```bash
node bells.js
```

You'll first choose **1) Single day** or **2) Date range**:

- **Single day** — pick a schedule type, enter a date, confirm. Same as
  before.
- **Date range** — enter a start and end date, then you're walked through
  every date in between one at a time and asked which schedule type it is
  (14 real types, plus a **Blank** option for weekends/holidays/no-school
  days). Once every date's been assigned, you get one summary confirmation
  showing every date + schedule + total event count before anything is
  created.

Either way, nothing touches CyberData until you confirm. Progress prints as
each event is added; the whole run halts immediately on the first failure
(never silently skips a date or an event).

## Data status

`schedules.js` has real, confirmed bell times for all 14 schedule types
(sourced from O'Dea's published Bell Schedule page). `colors.js` and the
`SELECTORS` in `playwright.js` are confirmed against the live CyberData
page — not guesses. `inspect.js` is the tool used to (re-)confirm selectors
if CyberData's markup ever changes; see the comment at the top of that file.

## Tuning

`config.js` holds the few values you're likely to want to adjust: the CDP
port, the delay after each save, dialog timeouts, and retry count.
