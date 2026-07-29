// playwright.js
//
// The automation engine. This file talks to the browser and only the
// browser — no CLI prompts, no schedule data. It exposes:
//
//   connect()                 -> { browser, page }
//   createEvent(page, event, dateStr, opts) -> Promise<void>
//
// bells.js is the only other file that should import this module.

const { chromium } = require("playwright");
const config = require("./config");
const colors = require("./colors");

// ---------------------------------------------------------------------
// SELECTORS
//
// Confirmed against the real, logged-in CyberData page using the
// Playwright Inspector's element picker (see inspect.js) — not guesses.
//
// Notable things the live UI does differently than assumed at first:
//   - The dialog itself is found by its accessible label, not role=dialog.
//   - Color is NOT a <select> — it's a row of preset buttons, one per
//     color name, matching the labels already in colors.js exactly.
//   - PGroup / Times to play / Relay are left untouched: their dialog
//     defaults already match what we need (see config.js), and no
//     confirmed selector exists for them yet.
// ---------------------------------------------------------------------
const DIALOG_LABEL = "New Event New Task Title:";

function dialogLocator(page) {
  return page.getByLabel(DIALOG_LABEL);
}

/**
 * Attach to an already-running, already-logged-in Edge instance over CDP.
 * Never launches a new browser and never logs in — that's the operator's
 * job before running bells.js (see PROJECT_SPEC.md §6.1/§6.2).
 */
async function connect() {
  let browser;
  try {
    browser = await chromium.connectOverCDP(config.cdpUrl);
  } catch (err) {
    throw new Error(
      `Could not attach to Edge at ${config.cdpUrl}. ` +
        `Make sure Edge is running with --remote-debugging-port and that ` +
        `CyberData is open and already logged in. (${err.message})`
    );
  }

  const context = browser.contexts()[0];
  if (!context) {
    throw new Error("Edge is running but has no open browser context/tabs.");
  }

  // Prefer a tab that's already on CyberData; fall back to the first tab.
  // CyberData is reached by bare IP (see config.cyberDataHost), not a
  // hostname containing "cyberdata", so match on that instead.
  const pages = context.pages();
  const page =
    pages.find((p) => p.url().includes(config.cyberDataHost)) || pages[0];

  if (!page) {
    throw new Error("No open tabs found in the attached Edge instance.");
  }

  return { browser, page };
}

/**
 * Create a single CyberData bell trigger and wait for confirmation that it
 * actually saved, with one retry on failure (PROJECT_SPEC.md §6.4/§6.5).
 *
 * Every event is a one-off, non-recurring trigger at a single point in
 * time (see the note in schedules.js) — there is no meaningful "end" of a
 * class period from CyberData's point of view, so `end_time` is always
 * sent as config.endTime regardless of the event.
 *
 * @param {import('playwright').Page} page
 * @param {{title: string, start: string, color: string, details?: string}} event
 * @param {string} dateStr - "YYYY-MM-DD", applied to both start and end
 */
async function createEvent(page, event, dateStr) {
  let attempt = 0;

  while (true) {
    attempt += 1;
    try {
      await openNewEventDialog(page);
      await fillEventFields(page, event, dateStr);
      await saveAndWaitForClose(page);
      await page.waitForTimeout(config.postSaveDelayMs);
      return; // success
    } catch (err) {
      console.error(`  attempt ${attempt} failed: ${err.message.split("\n")[0]}`);
      if (attempt > config.maxRetries) {
        throw new Error(
          `Failed to create event "${event.title}" after ${attempt} attempt(s): ${err.message}`
        );
      }
      // A failed attempt often leaves the dialog open mid-fill. Close it
      // before retrying — otherwise the retry's "New Event" click lands on
      // the stale modal instead of opening a fresh one.
      await closeStaleDialog(page);
    }
  }
}

async function closeStaleDialog(page) {
  const dialog = dialogLocator(page);
  if (!(await dialog.isVisible().catch(() => false))) return;
  await page.keyboard.press("Escape").catch(() => {});
  await dialog.waitFor({ state: "hidden", timeout: 3000 }).catch(() => {});
}

async function openNewEventDialog(page) {
  await page.getByRole("button", { name: "New Event" }).click();
  await dialogLocator(page).waitFor({
    state: "visible",
    timeout: config.dialogTimeoutMs,
  });
}

async function fillEventFields(page, event, dateStr) {
  const dialog = dialogLocator(page);

  await dialog.getByRole("textbox", { name: "Title" }).fill(event.title);

  await dialog.getByRole("textbox", { name: "Start date:" }).fill(dateStr);
  await dialog.getByRole("textbox", { name: "End date:" }).fill(dateStr);

  await dialog.getByRole("textbox", { name: "Start time:" }).fill(event.start);

  // "End time:" is disabled in the real DOM, permanently locked to 23:59
  // (confirmed live: <input disabled type="time" id="end_time" value="23:59">).
  // That's already the value we want (see the note on config.endTime), so
  // there's nothing to fill — attempting to would just hang forever
  // waiting for a disabled field to become editable.

  await dialog
    .getByLabel("Audio:", { exact: true })
    .selectOption({ label: config.audioFile });

  const colorValue = colors[event.color] || event.color;
  await dialog.getByRole("button", { name: colorValue, exact: true }).click();
}

async function saveAndWaitForClose(page) {
  const dialog = dialogLocator(page);
  await dialog.getByRole("button", { name: "Save" }).click();
  await dialog.waitFor({ state: "hidden", timeout: config.dialogTimeoutMs });
}

module.exports = { connect, createEvent };
