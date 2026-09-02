// platforms/cyberdata.js
//
// The CyberData automation engine — generalized so any school on
// CyberData/InformaCast can use it by supplying its own selectors, colors,
// and config, instead of one school's values being baked into this file.
//
// Exposes createEngine({ selectors, colors, config }) -> { connect, createEvent }
//
// `selectors` shape: see any schools/<school>/selectors.js for the fields
// this expects (dialogLabel, newEventButtonName, titleFieldName, etc).
// `colors` shape: see schools/<school>/colors.js (semantic name -> the
// CyberData color-picker button's exact label text).
// `config` shape: see schools/<school>/config.js (cdpUrl, cyberDataHost,
// postSaveDelayMs, dialogTimeoutMs, maxRetries, audioFile).
//
// school-loader.js is the only thing that should call createEngine();
// bells.js and inspect.js go through that, not this file directly.

const { chromium } = require("playwright");

function createEngine({ selectors, colors, config }) {
  function dialogLocator(page) {
    return page.getByLabel(selectors.dialogLabel);
  }

  /**
   * Attach to an already-running, already-logged-in Edge instance over CDP.
   * Never launches a new browser and never logs in — that's the operator's
   * job before running bells.js.
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

    // On a genuinely fresh launch (new profile, just force-relaunched),
    // the CDP port can accept connections slightly before Edge has
    // actually created its first tab — a real race, not hypothetical.
    // Retry briefly instead of failing on the very first empty check.
    let pages = context.pages();
    for (let attempt = 0; pages.length === 0 && attempt < 10; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      pages = context.pages();
    }

    // Prefer a tab that's already on this school's CyberData host; fall
    // back to the first tab. CyberData is typically reached by bare IP,
    // not a hostname, so this matches on config.cyberDataHost directly
    // rather than assuming a "cyberdata.*" pattern.
    const page = pages.find((p) => p.url().includes(config.cyberDataHost)) || pages[0];

    if (!page) {
      throw new Error("No open tabs found in the attached Edge instance.");
    }

    return { browser, page };
  }

  /**
   * Create a single CyberData bell trigger and wait for confirmation that
   * it actually saved, with one retry on failure.
   *
   * Every event is a one-off, non-recurring trigger at a single point in
   * time — there is no meaningful "end" of a class period from CyberData's
   * point of view, so the dialog's "End time:" field is left untouched
   * (see the note in fillEventFields below).
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
        // before retrying — otherwise the retry's "New Event" click lands
        // on the stale modal instead of opening a fresh one.
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
    await page.getByRole("button", { name: selectors.newEventButtonName }).click();
    await dialogLocator(page).waitFor({
      state: "visible",
      timeout: config.dialogTimeoutMs,
    });
  }

  async function fillEventFields(page, event, dateStr) {
    const dialog = dialogLocator(page);

    await dialog.getByRole("textbox", { name: selectors.titleFieldName }).fill(event.title);

    await dialog.getByRole("textbox", { name: selectors.startDateFieldName }).fill(dateStr);
    await dialog.getByRole("textbox", { name: selectors.endDateFieldName }).fill(dateStr);

    await dialog.getByRole("textbox", { name: selectors.startTimeFieldName }).fill(event.start);

    // "End time:" is disabled in CyberData's real DOM, permanently locked
    // to end-of-day — confirmed live on O'Dea's instance. That's already
    // the value wanted for a one-off trigger, so there's nothing to fill;
    // attempting to would just hang forever waiting for a disabled field
    // to become editable. If a future school's CyberData instance turns
    // out to have an editable End time field, this will need revisiting.

    await dialog
      .getByLabel(selectors.audioLabel, { exact: true })
      .selectOption({ label: config.audioFile });

    const colorValue = colors[event.color] || event.color;
    await dialog.getByRole("button", { name: colorValue, exact: true }).click();
  }

  async function saveAndWaitForClose(page) {
    const dialog = dialogLocator(page);
    await dialog.getByRole("button", { name: selectors.saveButtonName }).click();
    await dialog.waitFor({ state: "hidden", timeout: config.dialogTimeoutMs });
  }

  return { connect, createEvent };
}

module.exports = { createEngine };
