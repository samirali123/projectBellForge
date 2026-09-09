# CyberData Bell Schedule Automation

Drives an already-logged-in browser session to create bell schedule events
in CyberData (an InformaCast-based bell/paging system) — either a single
day, or a whole date range walked through one date at a time.

Multi-school: a school is just a folder under `schools/` with its own bell
times, colors, device IP, and confirmed page selectors. The app asks which
school before anything else, then runs the same engine against that
school's data. See "Adding a new school" below.

The fully-working, O'Dea-only version (before this multi-school
restructure) is tagged `v1-single-school` in this repo if you need to
reference or roll back to it.

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
- A CyberData account for whichever school you're running, with
  permission to create calendar events, and network access to that
  school's device (each school's `config.js` has its LAN IP — only
  reachable when physically on that school's network, or via VPN).

---

## Install

Clone the repo and install dependencies:

```bash
git clone <this-repo-url>
cd CyberDataAutomation
cd engine && npm install && cd ..
```

The `engine/` folder installs its own dependencies (`playwright-core`, used
only for its Node API to attach to an already-running browser — nothing
here launches its own bundled browser).

---

## Running it

### Easiest: double-click `Bells.command`

In Finder, double-click **`Bells.command`**. It will:
1. Open Terminal
2. Check whether Edge is already listening on the CDP debug port
   (`9222`) — if not, launch a dedicated Edge window for you with the
   right flags and a separate profile (won't touch your normal Edge
   logins/history)
3. Pause and ask you to log into the correct school's CyberData and
   navigate to its calendar in that window
4. Once you hit Enter, run the interactive CLI right there

### Manual

```bash
# 1. Fully quit Edge first if it's already running
osascript -e 'quit app "Microsoft Edge"'

# 2. Launch Edge with remote debugging + a dedicated profile
open -a "Microsoft Edge" --args --remote-debugging-port=9222 --user-data-dir="$HOME/edge-cyberdata-debug"

# 3. Confirm the debug port is actually listening (should return JSON with a webSocketDebuggerUrl)
curl -s http://localhost:9222/json/version

# 4. In that Edge window: log into the correct school's CyberData, navigate to its calendar

# 5. Run the CLI
cd engine && node bells.js
```

The CLI first asks **which school**, then **1) Single day** or
**2) Date range**:

- **Single day** — pick a schedule type, enter a date, confirm.
- **Date range** — enter a start and end date; you're walked through every
  date in that range one at a time and asked which schedule type it is
  (or **0) Blank** for weekends/holidays/no-school days). One summary
  confirmation shows every date + schedule + total event count before
  anything is created.

Nothing touches CyberData until you explicitly confirm. Progress prints as
each event is created; the whole run halts immediately on the first
failure — it never silently skips a date or an event.

---

## Installing the packaged app

BellForge is also distributed as a plain installer (`.exe` on Windows,
`.dmg` on Mac) built from `app/` via electron-builder — no `npm install`
or terminal needed for that version. It's unsigned for now, so the OS
will flag it on first launch:

- **Windows**: SmartScreen shows "Windows protected your PC." Click
  "More info," then "Run anyway."
- **Mac**: Gatekeeper blocks the first open. Right-click (or Control-click)
  the app and choose "Open," then confirm in the dialog that appears. After
  that first approval, it opens normally.

The packaged app still needs Microsoft Edge installed on the machine — see
"Why Edge, not Chrome" below.

### Cutting a release

1. Bump `"version"` in `app/package.json` (e.g. `0.1.0` -> `0.1.1`).
2. `git tag v0.1.1 && git push origin v0.1.1`
3. GitHub Actions builds both installers and creates a **draft** Release
   with them attached — nothing is public yet.
4. On GitHub, open the draft under **Releases**, check it over, then
   click **Publish release**.
5. Send clients the Release page link. They click the installer for
   their OS, run it, done — no GitHub account or terminal needed.

---

## Why Edge, not Chrome

Playwright's CDP attach (`chromium.connectOverCDP`) works with any
Chromium-based browser, not Chrome specifically — this project uses Edge
because Chrome, on the machine this was built on, had an unresolved macOS
**Local Network permission** issue (`ERR_ADDRESS_UNREACHABLE` reaching a
school's LAN IP) that survived a full reinstall, and Edge didn't have the
same problem. If you hit the same error in Edge:

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
├── Bells.command              double-click launcher (handles Edge + CDP for you)
├── package.json                top-level dependency manifest (playwright)
├── engine/                     school-agnostic app code
│   ├── bells.js                 entry point — interactive CLI (school picker, menu, dates, progress)
│   ├── school-loader.js         discovers schools/, loads one school's full config + a ready engine
│   ├── inspect.js               one-off helper: pick a school, then opens the Playwright Inspector
│   │                            against that school's real, logged-in page to (re-)confirm selectors
│   ├── platforms/
│   │   └── cyberdata.js         the actual automation engine for any CyberData/InformaCast school —
│   │                            takes a school's selectors/colors/config, contains no school's data itself
│   ├── README.md                 historical quick-start notes
│   └── PROJECT_SPEC.md           original design spec/history (single-school era — some of it,
│                                  e.g. the file layout it describes, predates this restructure)
└── schools/
    └── odea/                    one folder per school
        ├── school.json           { id, name, platform, passwordSalt, passwordHash } — see "School passwords"
        ├── schedules.js          this school's real bell times for every schedule type, plus menu order
        ├── colors.js             semantic color name -> this school's color-picker button label
        ├── config.js             this school's CDP port, device IP, delays, retries, audio file
        └── selectors.js          this school's confirmed page locators (see inspect.js)
```

## School passwords

Every school must have a password before it can be opened — `bells.js`
and `inspect.js` both refuse to load a school with no password set
(fail-closed), so this isn't optional. Set or change one with:

```bash
node engine/set-school-password.js
```

It writes only a salted hash into that school's `school.json` — the
plaintext password is never stored anywhere, and typing it happens
locally in your own terminal, not through any AI assistant or chat.

Be clear about what this actually protects against: there's no server, so
this is a local gate that stops someone from casually opening a school
they don't administer — not a real defense against someone determined
enough to dig through the app's own files. That's the right threat model
for "keep one school's staff out of another school's calendar," but don't
treat it as stronger than it is.

## Adding a new school

1. Copy `schools/odea/` to `schools/<new-school-id>/`.
2. Edit `school.json` — new `id` (must match the folder name) and `name`;
   remove the copied `passwordSalt`/`passwordHash` fields (each school
   needs its own password, not O'Dea's). Leave `platform: "cyberdata"`
   unless this school turns out to use a different bell/calendar system
   entirely (see below).
3. Run `node engine/set-school-password.js` and set this school's password.
4. Edit `config.js` — this school's device IP (`cyberDataHost`) and audio
   file name at minimum.
5. Hand-author `schedules.js` with this school's real bell times (see the
   comments in `schools/odea/schedules.js` for the data shape and the
   `order` array that controls menu display order).
6. Launch Edge with remote debugging, log into this school's CyberData,
   then run `node engine/inspect.js` and pick the new school — use "Pick
   locator" against its real New Event dialog to confirm/correct
   `selectors.js` and `colors.js` (CyberData markup and color-picker
   labels can differ per instance; don't assume O'Dea's values transfer).
7. Run `node engine/bells.js`, pick the new school, and do a real test run
   on a throwaway date before trusting it for a live schedule.

If a school turns out to be on a completely different bell/calendar
platform (not CyberData), that needs a new `platforms/<name>.js` engine —
nothing built here yet for that case.

## Known limitations (by design, not bugs)

- No login automation — you log into CyberData yourself, every time.
- No editing or deleting existing calendar events — creation only.
- No auto-detection of "what kind of day is it" — the operator picks the
  schedule type manually for every date.
- No UI yet — this is still a terminal CLI (`Bells.command` just wraps it
  for double-click launch). A real app/UI is planned next.
