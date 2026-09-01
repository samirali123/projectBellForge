#!/usr/bin/env node
// bells.js
//
// Interactive CLI entry point. This file talks to the human — menu, date
// prompt(s), confirmation, progress display. It contains no Playwright
// calls and no schedule data of its own; it orchestrates schedules.js
// (data) and playwright.js (browser automation engine).

const readline = require("readline/promises");
const { stdin, stdout } = require("process");
const schedules = require("./schedules");
const { connect, createEvent } = require("./playwright");

// Menu order matches PROJECT_SPEC.md §7.1 / §9, plus Finals schedules
// added afterward.
const MENU_ORDER = [
  "maroon",
  "gold",
  "maroonLate1hr",
  "goldLate1hr",
  "maroonAmIb",
  "goldLate1hrPmIb",
  "maroonPmIb",
  "goldPmIb",
  "maroonNoonDismissal",
  "goldNoonDismissal",
  "maroonLate2hr",
  "goldLate2hr",
  "maroonBrotherhood",
  "unifiedDay",
  "maroon12Finals",
  "maroon34Finals",
  "goldFinals",
];

const BLANK = "blank"; // range mode only — "no school / no bells on this date"
const BLANK_LABEL = "Blank (no school / no bells)";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(dateStr) {
  if (!DATE_RE.test(dateStr)) return false;
  const [y, m, d] = dateStr.split("-").map(Number);
  const parsed = new Date(y, m - 1, d);
  return (
    parsed.getFullYear() === y &&
    parsed.getMonth() === m - 1 &&
    parsed.getDate() === d
  );
}

function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Every calendar date from startStr to endStr, inclusive.
function enumerateDates(startStr, endStr) {
  const [sy, sm, sd] = startStr.split("-").map(Number);
  const [ey, em, ed] = endStr.split("-").map(Number);
  const cur = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);

  const dates = [];
  while (cur <= end) {
    dates.push(formatDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

async function promptMode(rl) {
  console.log("\n1) Single day\n2) Date range\n");
  while (true) {
    const answer = (await rl.question("Selection: ")).trim();
    if (answer === "1") return "single";
    if (answer === "2") return "range";
    console.log("Please enter 1 or 2.");
  }
}

async function promptSchedule(rl) {
  console.log("\nChoose Schedule\n");
  MENU_ORDER.forEach((key, i) => {
    const num = String(i + 1).padStart(2, " ");
    console.log(`${num}) ${schedules[key].label}`);
  });

  while (true) {
    const answer = (await rl.question("\nSelection: ")).trim();
    const idx = Number(answer) - 1;
    if (Number.isInteger(idx) && idx >= 0 && idx < MENU_ORDER.length) {
      return MENU_ORDER[idx];
    }
    console.log(`Please enter a number between 1 and ${MENU_ORDER.length}.`);
  }
}

// Same 14 schedule types plus Blank, asked once per date in a range.
// Blank is "0" rather than tacked onto the end of the numbered list, so
// it reads as "nothing" rather than just another schedule choice.
async function promptScheduleForDate(rl, dateStr) {
  console.log(`\n${dateStr} — Choose Schedule\n`);
  console.log(` 0) ${BLANK_LABEL}`);
  MENU_ORDER.forEach((key, i) => {
    const num = String(i + 1).padStart(2, " ");
    console.log(`${num}) ${schedules[key].label}`);
  });

  while (true) {
    const answer = (await rl.question("\nSelection: ")).trim();
    if (answer !== "" && Number(answer) === 0) return BLANK;
    const idx = Number(answer) - 1;
    if (Number.isInteger(idx) && idx >= 0 && idx < MENU_ORDER.length) {
      return MENU_ORDER[idx];
    }
    console.log(`Please enter 0, or a number between 1 and ${MENU_ORDER.length}.`);
  }
}

async function promptDate(rl) {
  while (true) {
    const answer = (await rl.question("\nDate (YYYY-MM-DD): ")).trim();
    if (isValidDate(answer)) return answer;
    console.log("Please enter a valid date in YYYY-MM-DD format.");
  }
}

async function promptDateRange(rl) {
  while (true) {
    const start = (await rl.question("\nStart date (YYYY-MM-DD): ")).trim();
    if (!isValidDate(start)) {
      console.log("Please enter a valid date in YYYY-MM-DD format.");
      continue;
    }
    const end = (await rl.question("End date (YYYY-MM-DD): ")).trim();
    if (!isValidDate(end)) {
      console.log("Please enter a valid date in YYYY-MM-DD format.");
      continue;
    }
    if (end < start) {
      console.log("End date must be on or after the start date.");
      continue;
    }
    return { start, end };
  }
}

async function promptConfirm(rl, schedule, dateStr) {
  console.log("\nYou are about to create\n");
  console.log(`  ${schedule.label}`);
  console.log(`  ${dateStr}`);
  console.log(`  ${schedule.events.length} events\n`);

  const answer = (await rl.question("Proceed? (Y/N) ")).trim().toLowerCase();
  return answer === "y" || answer === "yes";
}

async function promptConfirmBatch(rl, assignments) {
  console.log("\nYou are about to create\n");
  let totalEvents = 0;
  for (const { date, scheduleKey } of assignments) {
    const schedule = schedules[scheduleKey];
    totalEvents += schedule.events.length;
    console.log(`  ${date}  ${schedule.label}  (${schedule.events.length} events)`);
  }
  console.log(`\n${assignments.length} day(s), ${totalEvents} events total\n`);

  const answer = (await rl.question("Proceed? (Y/N) ")).trim().toLowerCase();
  return answer === "y" || answer === "yes";
}

// Shared execution path for both single-day and range runs. `assignments`
// is an ordered list of { date, scheduleKey } — a single-day run is just a
// one-item list. Halts the whole run on the first failed event, per
// PROJECT_SPEC.md §11 — never silently skips a date or keeps going with an
// unknown calendar state.
async function runAssignments(assignments) {
  console.log("\nAttaching to Edge...");
  const { page } = await connect();
  console.log("Connected. Starting run.\n");

  const multiDate = assignments.length > 1;
  const totalEvents = assignments.reduce(
    (sum, a) => sum + schedules[a.scheduleKey].events.length,
    0
  );

  let succeeded = 0;
  let overallIndex = 0;
  let haltedOn = null;

  for (const { date, scheduleKey } of assignments) {
    const schedule = schedules[scheduleKey];
    if (multiDate) console.log(`\n=== ${date} — ${schedule.label} ===`);

    for (let i = 0; i < schedule.events.length; i++) {
      const event = schedule.events[i];
      overallIndex += 1;
      const overallSuffix = multiDate ? ` (${overallIndex}/${totalEvents} overall)` : "";
      console.log(
        `Creating event ${i + 1}/${schedule.events.length}${overallSuffix}: ${event.title} @ ${event.start}`
      );
      try {
        await createEvent(page, event, date);
        succeeded += 1;
      } catch (err) {
        console.error(`  FAILED: ${err.message}`);
        haltedOn = `${date} ${event.title}`;
        break;
      }
    }
    if (haltedOn) break;
  }

  console.log("\n--- Summary ---");
  console.log(`Succeeded: ${succeeded}/${totalEvents}`);
  if (haltedOn) {
    console.log(`Failed: ${haltedOn}`);
    console.log("Run halted. Browser left open for inspection.");
  } else {
    console.log("All events created successfully.");
  }

  // Note: browser is left attached/open deliberately — we connected to
  // an existing session and should not close the operator's own Edge.
}

async function runSingleDay(rl) {
  const scheduleKey = await promptSchedule(rl);
  const schedule = schedules[scheduleKey];
  const dateStr = await promptDate(rl);
  const confirmed = await promptConfirm(rl, schedule, dateStr);

  if (!confirmed) {
    console.log("\nAborted. No events were created.");
    return;
  }

  await runAssignments([{ date: dateStr, scheduleKey }]);
}

async function runRange(rl) {
  const { start, end } = await promptDateRange(rl);
  const dates = enumerateDates(start, end);
  console.log(
    `\n${dates.length} date(s) from ${start} to ${end}. You'll be asked for each one.`
  );

  const assignments = [];
  for (const date of dates) {
    const scheduleKey = await promptScheduleForDate(rl, date);
    if (scheduleKey !== BLANK) assignments.push({ date, scheduleKey });
  }

  if (assignments.length === 0) {
    console.log("\nEvery date was left Blank. Nothing to do.");
    return;
  }

  const confirmed = await promptConfirmBatch(rl, assignments);
  if (!confirmed) {
    console.log("\nAborted. No events were created.");
    return;
  }

  await runAssignments(assignments);
}

async function run() {
  const rl = readline.createInterface({ input: stdin, output: stdout });

  try {
    const mode = await promptMode(rl);
    if (mode === "single") {
      await runSingleDay(rl);
    } else {
      await runRange(rl);
    }
  } finally {
    rl.close();
  }
}

run().catch((err) => {
  console.error(`\nError: ${err.message}`);
  process.exitCode = 1;
});
