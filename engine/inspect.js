#!/usr/bin/env node
// inspect.js
//
// One-off helper for confirming/correcting a school's selectors.js.
// Attaches to the same already-logged-in Edge session as bells.js (via
// that school's connect()), then opens the Playwright Inspector so you
// can use its element picker against the REAL, authenticated CyberData
// page — not a second, freshly-logged-in browser the way
// `npx playwright codegen` would give you.
//
// Usage:
//   1. Launch Edge with --remote-debugging-port=9222 and log into that
//      school's CyberData manually (same as for bells.js).
//   2. node inspect.js
//   3. Pick the school this browser session is logged into, and enter
//      its password.
//   4. In the Inspector window that opens, click "Pick locator", then click
//      the New Event button, the dialog, and the Save button on the real
//      page. Copy the suggested locator for each into that school's
//      selectors.js.
//   5. Close the Inspector window (or Ctrl+C here) when done.

const { createInterface } = require("./readline-compat");
const { stdin, stdout } = require("process");
const { loadSchool } = require("./school-loader");
const { selectSchool } = require("./school-selector");

async function run() {
  const rl = createInterface({ input: stdin, output: stdout });
  const schoolMeta = await selectSchool(rl);
  rl.close();

  const { connect } = loadSchool(schoolMeta.id);

  console.log("\nAttaching to Edge...");
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
