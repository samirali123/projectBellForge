# CyberData Bell Schedule Automation — Project Specification

**Status:** Design complete — ready for staged implementation
**Owner:** Samir (O'Brien Business Group, client: Odea)
**Stack:** Node.js + Playwright (CDP attach mode)

---

## 1. Project Overview & Rationale

Odea's bell schedule calendar lives inside **CyberData**, a web calendar system
with no bulk-entry or import feature. Every school day type (Maroon, Gold, late
starts, noon dismissals, IB days, etc.) has to be entered as a series of
individual calendar events — one per period/bell — by hand, through the
CyberData "New Event" dialog.

The original approach was a Playwright **recorder** script: a literal
click-by-click recording of one day being entered, replayed verbatim. That
works for exactly one schedule, once. It breaks the moment a bell time
changes, and extending it to the other 13 schedule types would mean recording
13 more scripts.

This project replaces the recorder with a **single reusable automation
engine** driven by **data**. The engine knows how to create *one* CyberData
event reliably. Every schedule (Maroon, Gold, 2-Hour Late Gold, Unified Day,
etc.) is just a list of events described in a data file. Adding or fixing a
bell time means editing one line of data — never touching the automation
code.

### Why this matters
If O'Dea changes a single bell time next year, the fix is a one-line edit in
`schedules.js`. Nothing is re-recorded, nothing is re-tested end-to-end from
scratch.

---

## 2. Goals

- Interactive command-line tool (`node bells.js`)
- Attaches to an **already-running, already-logged-in** Chrome session via CDP
  — the tool never logs in and never touches credentials
- Visibly drives the real browser (no headless mode) so the operator can
  watch and intervene
- One reusable automation engine that creates a single event; every schedule
  type is expressed as data, not code
- Supports all 14 known schedule types (see §9)
- Reliable waiting: the engine waits on real UI state (dialog open/closed),
  not blind fixed sleeps
- Clear progress output and confirmation before any events are created

## 3. Non-Goals (explicitly out of scope for v1)

- ❌ No auto-detection of "what kind of day is it" from an external calendar
  feed — the operator picks the schedule type manually from the menu
- ❌ No login automation of any kind
- ❌ No navigating the CyberData calendar month-by-month (see §6.3)
- ❌ No editing or deleting existing events
- ❌ No GUI — CLI only

---

## 4. Technology Stack

| Concern              | Choice                                   |
|-----------------------|-------------------------------------------|
| Runtime               | Node.js (LTS)                             |
| Browser automation    | Playwright (`playwright` npm package)     |
| Browser connection    | Chrome DevTools Protocol (CDP) attach     |
| CLI interaction       | Node's built-in `readline/promises`       |
| Schedule data         | Plain JS modules (see §5, future: JSON)   |
| Config                | Plain JS module + optional `.env`         |

No database, no build step, no framework — this is a small operational tool,
not a product.

---

## 5. Project Structure

```
CyberDataAutomation/
│
├── package.json          package + dependency manifest
├── bells.js              entry point — interactive CLI
├── playwright.js         browser automation engine (CDP attach, event creation)
├── schedules.js          every bell schedule, expressed as data
├── colors.js             color-name → CyberData color-picker mapping
├── config.js             tunable settings (delay, retry, CDP port, URL)
├── README.md             quick-start / usage instructions
└── PROJECT_SPEC.md        this document
```

Each file has exactly one job:

- **bells.js** — talks to the human (menu, date prompt, confirmation,
  progress display). Contains no Playwright calls and no schedule data.
- **playwright.js** — talks to the browser. Contains no CLI code and no
  schedule data. Exposes a single high-level function: given one event
  object, create it in CyberData reliably.
- **schedules.js** — pure data. No logic, no imports from Playwright.
- **colors.js** — pure data. Maps the color *names* used in `schedules.js`
  to whatever CyberData's own color picker expects (label, swatch position,
  or value — to be confirmed against the live UI).
- **config.js** — the handful of numbers/strings someone might need to tweak
  (delay ms, retry count, CDP debugging port, CyberData base URL) in one
  place instead of buried in code.

---

## 6. Browser Connection & Automation Strategy

### 6.1 Connecting to Chrome
The operator launches their normal Chrome with remote debugging enabled and
logs into CyberData manually, e.g.:

```
chrome.exe --remote-debugging-port=9222
```

`playwright.js` attaches to that running instance with
`chromium.connectOverCDP('http://localhost:9222')` and picks up the existing
authenticated context. The tool never sees or stores a password, and never
performs any login step. If it can't find a running CyberData tab, it fails
fast with a clear error rather than trying to log in itself.

### 6.2 No login automation
Explicitly out of scope (§3). The operator is responsible for having Chrome
open and CyberData signed in before running `node bells.js`.

### 6.3 No month navigation — the key simplification
CyberData's "New Event" dialog accepts a **Start Date** and **End Date**
directly as fields. The automation never needs to click through the calendar
to the correct month first — it opens "New Event" from wherever the calendar
happens to be sitting, and types the target date straight into the date
fields. This removes an entire category of flaky, month-grid-dependent
clicking from the design.

### 6.4 Per-event creation flow
Every event, regardless of schedule type, is created the same way:

```
click "New Event"
   ↓
wait until the event dialog is visible
   ↓
fill Title
fill Start Date / Start Time
fill End Date / End Time
select Color
select Audio (if applicable)
   ↓
click "Save"
   ↓
wait until the dialog has closed
   ↓
wait an additional configurable buffer (default 1500ms, see config.js)
   ↓
proceed to next event
```

This replaces the naive `click / sleep / click / sleep` pattern from the
recorder with **state-based waiting**: the engine waits for the actual dialog
element to disappear (proof CyberData has registered the save) before adding
a small fixed buffer for the page to finish refreshing. This is far more
resilient to a slow day on CyberData's end than a fixed sleep alone, and much
faster than sleeping long enough to cover the worst case every single time.

### 6.5 Retry logic
If the dialog does not close within the timeout window after clicking Save,
the engine retries the save **once**. If the retry also fails, that event is
reported as failed and the run stops so the operator can inspect the browser
state directly — it does not silently skip events or keep going with an
unknown calendar state.

---

## 7. Interactive CLI Specification

### 7.1 Menu
```
$ node bells.js

Choose Schedule

 1) Maroon
 2) Gold
 3) Maroon 1-Hour Late Start
 4) Gold 1-Hour Late Start
 5) Maroon (AM/IB)
 6) Gold 1-Hour Late Start (PM/IB)
 7) Maroon (PM/IB)
 8) Gold (PM/IB)
 9) Maroon Noon Dismissal
10) Gold Noon Dismissal
11) Maroon 2-Hour Late Start
12) Gold 2-Hour Late Start
13) Maroon Brotherhood Block
14) Unified Day

Selection:
```

### 7.2 Date prompt
```
Date (YYYY-MM-DD):
2026-09-16
```
Input is validated as a real calendar date in that exact format before
continuing.

### 7.3 Confirmation
```
You are about to create

  Gold Day
  2026-09-16
  14 events

Proceed? (Y/N)
```
Nothing is created until the operator confirms. Answering anything other
than `Y`/`y` aborts cleanly with no browser interaction.

### 7.4 Progress display
While running, each event prints its position and identity as it's created:
```
Creating event 7/14: Lunch (11:15–11:35)
```
On completion, a final summary reports how many events succeeded, how many
were retried, and how many failed (if any).

---

## 8. Data Model

### 8.1 Event object
Every event — across every schedule — is the same shape:

```js
{
  title:  "Period 1",     // string, shown in CyberData
  start:  "08:00",         // 24h "HH:MM"
  end:    "08:50",         // 24h "HH:MM"
  color:  "Maroon",        // key into colors.js
  audio:  null,             // optional — bell sound cue, if CyberData supports it
}
```

`start`/`end` are stored as time-of-day only; the calendar **date** comes
from the CLI prompt (§7.2) and is applied to every event in the chosen
schedule. This is what makes one schedule definition reusable across many
calendar dates.

### 8.2 Schedule object
A schedule is just a name plus an ordered list of events:

```js
// schedules.js
module.exports = {
  maroon: {
    label: "Maroon Day",
    events: [
      { title: "Period 1", start: "08:00", end: "08:50", color: "Maroon" },
      { title: "Period 2", start: "08:55", end: "09:45", color: "Maroon" },
      { title: "Lunch",    start: "11:15", end: "11:35", color: "Lunch"  },
      // ...
    ],
  },

  gold: {
    label: "Gold Day",
    events: [ /* ... */ ],
  },

  // ...remaining 12 schedule types
};
```

> **Data status:** the exact bell times for each of the 14 schedule types
> were not fully captured in the material handed off for this v1 build (the
> reference screenshot with the full time table wasn't included). `schedules.js`
> ships with the correct **shape** and the two known schedule keys stubbed
> out with placeholder times marked `// TODO: confirm real time`. Real times
> need to be dropped in before this is used for an actual live run — see
> the open item at the end of this document.

### 8.3 Color mapping
```js
// colors.js
module.exports = {
  Maroon:    "Brown",
  Gold:      "Orange",
  Lunch:     "Green",
  Pass:      "Grey",
  Dismissal: "Grey",
};
```
This maps the *semantic* color name used in `schedules.js` to whatever label
or value CyberData's own color picker actually expects. If CyberData's picker
turns out to use something other than plain text labels (e.g. a swatch
index or hex value), only this file needs to change.

### 8.4 Audio mapping
Not yet specified — the original planning conversation flagged an `audio`
field on the event model but didn't pin down what values CyberData accepts
or which events need a bell sound versus none. Treat `audio: null` as the
default until this is confirmed; add an `audio.js` mapping file alongside
`colors.js` once the real options are known.

---

## 9. Supported Schedule Types (v1 scope)

1. Maroon
2. Gold
3. Maroon 1-Hour Late Start
4. Gold 1-Hour Late Start
5. Maroon (AM/IB)
6. Gold 1-Hour Late Start (PM/IB)
7. Maroon (PM/IB)
8. Gold (PM/IB)
9. Maroon Noon Dismissal
10. Gold Noon Dismissal
11. Maroon 2-Hour Late Start
12. Gold 2-Hour Late Start
13. Maroon Brotherhood Block
14. Unified Day

---

## 10. Configuration

`config.js` centralizes the values someone is actually likely to need to
tune, instead of leaving them scattered through the automation code:

```js
module.exports = {
  cdpUrl: "http://localhost:9222",   // Chrome remote debugging endpoint
  postSaveDelayMs: 1500,               // buffer after dialog closes, before next event
  dialogTimeoutMs: 10000,              // how long to wait for dialog open/close
  maxRetries: 1,                        // retries per failed save
};
```

---

## 11. Error Handling

- **Failed save:** retried once (§6.5); a second failure halts the run and
  reports which event failed, with the browser left exactly where the
  operator can see it.
- **Can't attach to Chrome:** fail immediately with a message telling the
  operator to confirm Chrome is running with remote debugging enabled and
  CyberData is open and logged in.
- **Invalid date input:** re-prompt rather than crashing.
- **Ctrl+C mid-run:** exit cleanly; already-created events are not rolled
  back (CyberData has no automation-friendly delete flow in scope for v1).

## 12. Logging

Console output only for v1: schedule chosen, date, per-event progress
(§7.4), retries, and a final success/fail summary. A `--log-file` option
that mirrors this output to disk is a natural, low-cost future addition
(see §14) but isn't required for v1.

---

## 13. Implementation Milestones

Built in stages so each piece can be tested before the next depends on it:

1. **Automation engine** — CDP attach + reliably create *one* hand-typed
   test event end-to-end (open dialog → fill → save → confirm closed).
2. **Interactive CLI** — menu, date prompt, confirmation, wired to a single
   dummy schedule.
3. **Gold + Maroon schedules** — real data for the two most common day
   types once bell times are confirmed.
4. **Remaining 12 schedule types** — AM/IB, PM/IB, late starts, noon
   dismissals, Brotherhood Block, Unified Day.
5. **Final polish** — progress display, retry/error handling, README.

## 14. Future Enhancements (explicitly deferred)

- **Dry-run mode:** print every event that *would* be created, with no
  browser interaction — useful for reviewing a schedule before committing.
- **Duplicate detection:** check whether events already exist for the
  target date before creating new ones.
- **JSON schedules:** move `schedules.js` from a JS module to a `.json`
  file (or small set of them) so schedules can be edited without touching
  any code at all.
- **Log file output** alongside console progress.

## 15. Testing Plan

- Manual smoke test of the engine against a real CyberData sandbox/test
  date before any production schedule is run.
- Verify retry logic by temporarily shortening `dialogTimeoutMs` to force a
  timeout and confirming the single-retry-then-halt behavior.
- Spot-check one full schedule (all events for one day type) against the
  CyberData calendar UI after a run, before trusting it unattended.

## 16. Coding Standards

- CommonJS modules (`require`/`module.exports`) for simplicity — no build
  step, runs directly under Node LTS.
- No schedule data, color values, or CyberData selectors inside
  `bells.js` or `playwright.js` — those files are logic-only.
- Every Playwright selector lives in one place per action so a CyberData UI
  change means editing one line, not hunting through the file.

---

## Open Items Before This Is Fully Executable

Two pieces of real-world data are needed before this stops being a scaffold
and becomes a working tool, and neither survived into this round of
handoff material:

1. **Actual bell times** for all 14 schedule types (the screenshot
   referenced in the original planning conversation that had "all of the
   times for each day, including weird ones").
2. **CyberData's real DOM selectors** for the New Event dialog, its fields,
   and the Save button — the earlier recorder scripts almost certainly had
   these captured already.

Everything else in this spec is ready to build against as-is.
