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

const { chromium } = require("playwright-core");

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

  // ------------------------------------------------------------ DELETE --
  // Unlike creation (which never needs month navigation — the New Event
  // dialog takes a date directly), deletion has to interact with the
  // actual rendered calendar grid.
  //
  // First attempt tried reading the on-screen "Month YYYY" header text to
  // know where the calendar currently was — that broke live (a 30s
  // timeout on the locator, meaning the assumed text shape didn't match
  // reality) and isn't worth re-guessing at. Instead: navigate fresh to
  // config.calendarUrl first, which is confirmed to always land on the
  // REAL current month (see the very first calendar screenshot from this
  // project — today's date was already circled on load). That turns
  // "where is the calendar right now" from a thing we'd otherwise have to
  // scrape off the page into a known quantity — the system clock — so
  // month navigation becomes pure arithmetic instead of a read-loop.
  async function navigateToMonth(page, targetYear, targetMonth1to12) {
    await page.goto(config.calendarUrl, { waitUntil: "domcontentloaded" });

    const now = new Date();
    const currentTotal = now.getFullYear() * 12 + now.getMonth(); // getMonth() is 0-11
    const targetTotal = targetYear * 12 + (targetMonth1to12 - 1);
    const diff = targetTotal - currentTotal;
    if (diff === 0) return;

    const button =
      diff > 0
        ? page.getByRole("button", { name: ">", description: "Next month" })
        : page.getByRole("button", { name: "<", description: "Previous month" });

    for (let i = 0; i < Math.abs(diff); i++) {
      await button.click();
      await page.waitForTimeout(300); // let the grid re-render between clicks
    }
  }

  /**
   * Delete every event on one calendar date. Irreversible — callers must
   * get explicit, unambiguous confirmation before calling this; nothing
   * in this function asks again.
   *
   * Each event row is a day-cell's `.tasks > li` child; clicking it
   * reveals a `.remove-task` button, which triggers a native confirm()
   * dialog (not part of the page DOM — handled via page.once("dialog",...),
   * not a locator). Re-queries the row list after every deletion rather
   * than indexing into a snapshot, since removing one row shifts the DOM.
   *
   * @param {import('playwright').Page} page
   * @param {string} dateStr - "YYYY-MM-DD"
   * @returns {Promise<{deleted: number}>}
   */
  async function deleteDayEvents(page, dateStr) {
    const [year, month, day] = dateStr.split("-").map(Number);
    await navigateToMonth(page, year, month);

    // Day cells render the bare day-of-month number first, immediately
    // followed by that day's event lines — confirmed live (e.g. a day 18
    // cell's text starts "18 08:10 - 23:59 G1 ..."). Anchored at the start
    // with a non-digit boundary so day 1 doesn't also match day 18, etc.
    const dayCell = page.locator("li").filter({ hasText: new RegExp(`^${day}\\D`) }).first();
    await dayCell.waitFor({ state: "visible", timeout: 10000 });

    const eventRows = dayCell.locator(".tasks > li");
    let deleted = 0;

    while (true) {
      const count = await eventRows.count();
      if (count === 0) break;

      const row = eventRows.first();
      await row.click(); // reveals .remove-task within this row (accordion)

      const removeBtn = row.locator(".button.smaller.remove-task");
      await removeBtn.waitFor({ state: "visible", timeout: 5000 });

      page.once("dialog", (dialog) => dialog.accept().catch(() => {}));
      await removeBtn.click();

      // Confirms the deletion actually round-tripped, not just that the
      // button was clicked.
      await row.waitFor({ state: "detached", timeout: 10000 });
      deleted += 1;
    }

    return { deleted };
  }

  return { connect, createEvent, deleteDayEvents };
}

module.exports = { createEngine };
