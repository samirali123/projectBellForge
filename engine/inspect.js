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
//   3. Pick the school this browser session is logged into.
//   4. In the Inspector window that opens, click "Pick locator", then click
//      the New Event button, the dialog, and the Save button on the real
//      page. Copy the suggested locator for each into that school's
//      selectors.js.
//   5. Close the Inspector window (or Ctrl+C here) when done.

const readline = require("readline/promises");
const { stdin, stdout } = require("process");
const { listSchools, loadSchool } = require("./school-loader");

async function promptSchool(rl) {
  const schools = listSchools();
  if (schools.length === 0) {
    throw new Error(
      "No schools found in ../schools. Add a school folder (see schools/odea for the shape) first."
    );
  }

  console.log("\nWhich school is this Edge session logged into?\n");
  schools.forEach((s, i) => {
    const num = String(i + 1).padStart(2, " ");
    console.log(`${num}) ${s.name}`);
  });

  while (true) {
    const answer = (await rl.question("\nSelection: ")).trim();
    const idx = Number(answer) - 1;
    if (Number.isInteger(idx) && idx >= 0 && idx < schools.length) {
      return schools[idx].id;
    }
    console.log(`Please enter a number between 1 and ${schools.length}.`);
  }
}

async function run() {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const schoolId = await promptSchool(rl);
  rl.close();

  const { connect } = loadSchool(schoolId);

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
