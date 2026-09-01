# CyberData Bell Schedule Automation

Drives an already-logged-in browser session to create bell schedule events
in CyberData (O'Dea High School's InformaCast-based bell/paging system) —
either a single day, or a whole date range walked through one date at a
time. This version is built specifically for O'Dea's CyberData instance
(real bell times, real device IP, real confirmed page selectors baked in)
— it is not yet a generic multi-school tool.

Tagged `v1-single-school` in this repo as a fixed, working checkpoint.

---

## What you need before you start

- **macOS** (this has only been set up/tested on macOS; the automation
  logic itself is cross-platform, but the launcher script is not)
- **Node.js** (any reasonably recent LTS version) — check with:
  ```bash
  node -v
  ```
  If that fails, install Node from https://nodejs.org (the LTS installer)
  or via Homebrew: `brew install node`
- **Git** (to clone this repo) — check with:
  ```bash
  git -v
  ```
- **Microsoft Edge** installed — download from
  https://www.microsoft.com/edge if it isn't already on the machine.
  (Not Chrome — see "Why Edge, not Chrome" below.)
- A CyberData account with permission to create calendar events, and
  network access to the device (`10.0.30.230` — only reachable when
  physically on O'Dea's local network, or via VPN if remote).

---

## Install

Clone the repo and install dependencies:

```bash
git clone <this-repo-url>
cd CyberDataAutomation
npm install
```

`npm install` pulls in the `playwright` package (used only for its Node
API to drive an already-running browser — nothing here launches Playwright's
own bundled browser). The install may download some browser binaries as a
side effect of installing the `playwright` package; that's harmless and
unused by this tool, just slower/bigger than strictly necessary.

---

## Running it

### Easiest: double-click `Bells.command`

In Finder, double-click **`Bells.command`**. It will:
1. Open Terminal
2. Check whether Edge is already listening on the CDP debug port
   (`9222`) — if not, launch a dedicated Edge window for you with the
   right flags and a separate profile (won't touch your normal Edge
   logins/history)
3. Pause and ask you to log into CyberData and navigate to the
   `2026-27_Bells` calendar in that window
4. Once you hit Enter, run the interactive CLI right there

### Manual

```bash
# 1. Fully quit Edge first if it's already running
osascript -e 'quit app "Microsoft Edge"'

# 2. Launch Edge with remote debugging + a dedicated profile
open -a "Microsoft Edge" --args --remote-debugging-port=9222 --user-data-dir="$HOME/edge-cyberdata-debug"

# 3. Confirm the debug port is actually listening (should return JSON with a webSocketDebuggerUrl)
curl -s http://localhost:9222/json/version

# 4. In that Edge window: log into CyberData, navigate to the 2026-27_Bells calendar

# 5. Run the CLI
cd src && node bells.js
```

The CLI first asks **1) Single day** or **2) Date range**:

- **Single day** — pick a schedule type, enter a date, confirm.
- **Date range** — enter a start and end date; you're walked through every
  date in that range one at a time and asked which of the 14 real
  schedule types it is (or **0) Blank** for weekends/holidays/no-school
  days). One summary confirmation shows every date + schedule + total
  event count before anything is created.

Nothing touches CyberData until you explicitly confirm. Progress prints as
each event is created; the whole run halts immediately on the first
failure — it never silently skips a date or an event.

---

## Why Edge, not Chrome

Playwright's CDP attach (`chromium.connectOverCDP`) works with any
Chromium-based browser, not Chrome specifically — this project uses Edge
because Chrome, on the machine this was built on, had an unresolved macOS
**Local Network permission** issue (`ERR_ADDRESS_UNREACHABLE` reaching
CyberData's LAN IP) that survived a full reinstall, and Edge didn't have
the same problem. If you hit the same error in Edge:

System Settings → Privacy & Security → **Local Network** → make sure the
browser you're using is toggled on. If it shows as already on but still
fails, force a clean re-prompt:
```bash
tccutil reset LocalNetworkGranted com.microsoft.edgemac
```
(needs Terminal to have its own Full Disk Access permission — System
Settings → Privacy & Security → Full Disk Access — to actually take
effect) then fully quit and relaunch the browser.

---

## Project structure

```
CyberDataAutomation/
├── Bells.command          double-click launcher (handles Edge + CDP for you)
├── package.json           top-level dependency manifest (playwright)
└── src/
    ├── bells.js            entry point — interactive CLI (menu, dates, progress)
    ├── playwright.js       automation engine — CDP attach, event creation
    ├── schedules.js        every bell schedule, expressed as data (real, confirmed times)
    ├── colors.js           semantic color name -> CyberData color-picker button label
    ├── config.js           tunable settings (CDP port, device IP, delays, retries)
    ├── inspect.js          one-off helper: opens the Playwright Inspector against the
    │                       real, logged-in CyberData page, to (re-)confirm selectors
    │                       if CyberData's markup ever changes
    ├── README.md           original quick-start notes for src/ specifically
    └── PROJECT_SPEC.md     original design spec/history
```

## What's specific to O'Dea in here (read before reusing for another school)

Everything below currently has O'Dea's real values hardcoded — this is
what a future multi-school version needs to pull out into per-school
config instead of editing in place:

- **`config.js`** — `cyberDataHost` (`10.0.30.230`, O'Dea's device IP),
  `audioFile` (`odeabell.wav`)
- **`schedules.js`** — O'Dea's actual bell times for all 17 schedule types
- **`colors.js`** — O'Dea's confirmed color-picker button labels
- **`playwright.js`** — the `SELECTORS`/`DIALOG_LABEL` block, confirmed
  against O'Dea's specific CyberData page — another school's CyberData
  instance may render differently and need these re-confirmed with
  `inspect.js`

## Known limitations (by design, not bugs)

- No login automation — you log into CyberData yourself, every time.
- No editing or deleting existing calendar events — creation only.
- No auto-detection of "what kind of day is it" — the operator picks the
  schedule type manually for every date.
- Single school only — see the note above.
