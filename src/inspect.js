#!/usr/bin/env node
// inspect.js
//
// One-off helper for confirming/correcting the SELECTORS block in
// playwright.js. Attaches to the same already-logged-in Edge session as
// bells.js (via connect()), then opens the Playwright Inspector so you can
// use its element picker against the REAL, authenticated CyberData page —
// not a second, freshly-logged-in browser the way `npx playwright codegen`
// would give you.
//
// Usage:
//   1. Launch Edge with --remote-debugging-port=9222 and log into
//      CyberData manually (same as for bells.js).
//   2. node inspect.js
//   3. In the Inspector window that opens, click "Pick locator", then click
//      the New Event button, the dialog, and the Save button on the real
//      page. Copy the suggested locator for each into playwright.js's
//      SELECTORS block.
//   4. Close the Inspector window (or Ctrl+C here) when done.

const { connect } = require("./playwright");

async function run() {
  console.log("Attaching to Edge...");
  const { page } = await connect();
  console.log("Connected. Opening Playwright Inspector — use 'Pick locator'");
  console.log("on the New Event button, the dialog, and the Save button.\n");

  await page.pause();

  console.log("Inspector closed. Done.");
}

run().catch((err) => {
  console.error(`\nError: ${err.message}`);
  process.exitCode = 1;
});
