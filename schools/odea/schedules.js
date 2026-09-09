// schedules.js
//
// Pure data. No Playwright imports, no CLI code belongs in this file.
//
// --- Data model -------------------------------------------------------
// CyberData's calendar is actually driving O'Dea's InformaCast bell/paging
// system, not a normal duration-based calendar. Confirmed against a real,
// working session (see ../../cyberdata_bells.sh, which POSTs straight to
// the New Event form endpoint and successfully created live events):
// every entry is a single bell-ring TRIGGER at one point in time — there
// is no meaningful "end" of a period from CyberData's point of view
// (the form's end_time field is always sent as 23:59, regardless of when
// the period actually ends).
//
// So each event here is: { title, start: "HH:MM", color, details? }
// `color` is a key into colors.js. `details` is the longer description
// CyberData shows on the event (defaults to `title` if omitted).
//
// --- Where these times came from --------------------------------------
// Bell-time table for the original 14 schedule types transcribed from
// O'Dea's public "Bell Schedule" page (Student Life > Bell Schedule), plus
// 3 Finals schedules added later from O'Dea's Finals-week slides, plus
// Back-to-School Night from that event's flyer. Maroon Day, Gold Day, and
// Maroon 1-Hour Late Start were additionally cross-checked against
// cyberdata_bells.sh, which encodes times already confirmed against real
// hand-entered CyberData events for Aug 31 / Sept 1-4, 2026 — those three
// match exactly.
//
// --- Pattern -------------------------------------------------------
// Every schedule is a straight-through sequence of class blocks. Between
// each block there is a "Pass" (grey) trigger fired at the moment the
// current block ends; after the final block, a "Dismissal" (grey) trigger
// fires instead. `buildEvents()` below encodes that pattern once so each
// schedule only has to list its actual blocks.

function buildEvents(blocks) {
  const events = [];
  blocks.forEach((block, i) => {
    events.push({
      title: block.title,
      start: block.start,
      color: block.color,
      details: block.details || block.title,
    });

    const isLast = i === blocks.length - 1;
    events.push(
      isLast
        ? { title: "Dismissal", start: block.end, color: "Grey", details: "Dismissal" }
        : { title: "Pass", start: block.end, color: "Grey", details: "Passing Period" }
    );
  });

  // Every title (the short code CyberData actually displays) must be at
  // least 2 characters — a 1-character title isn't a valid selection on
  // the live page. No upper limit; this is a minimum, not an exact size.
  for (const event of events) {
    if (event.title.length < 2) {
      throw new Error(
        `Event title must be at least 2 characters, got "${event.title}" (${event.title.length})`
      );
    }
  }

  return events;
}

// Menu display order. Deliberately separate from property declaration
// order above (which is grouped by family — Maroon, then Gold, then
// Unified, then Finals — for readability) — this is the order operators
// actually see day to day (Maroon/Gold days alternate), so it's called
// out explicitly here rather than left as an implicit side effect of
// how the object below happens to be written.
const order = [
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
  "backToSchoolNight",
];

const schedules = {
  // ------------------------------------------------------------- MAROON --
  maroon: {
    label: "Maroon Day",
    events: buildEvents([
      { title: "M0", start: "07:10", end: "08:00", color: "Maroon", details: "Maroon Zero period" },
      { title: "M1", start: "08:10", end: "09:30", color: "Maroon", details: "Maroon 1" },
      { title: "MG", start: "09:35", end: "09:45", color: "Maroon", details: "Mentor Group" },
      { title: "M2", start: "09:50", end: "11:10", color: "Maroon", details: "Maroon 2" },
      { title: "Lunch", start: "11:15", end: "11:35", color: "Lunch", details: "Lunch" },
      { title: "M3", start: "11:40", end: "13:00", color: "Maroon", details: "Maroon 3" },
      { title: "M4", start: "13:05", end: "14:25", color: "Maroon", details: "Maroon 4" },
    ]),
  },

  maroonLate1hr: {
    label: "Maroon 1-Hour Late Start",
    events: buildEvents([
      { title: "MM", start: "07:30", end: "08:50", color: "Maroon", details: "Morning Meeting" },
      { title: "M1", start: "09:10", end: "10:15", color: "Maroon", details: "Maroon 1" },
      { title: "MG", start: "10:20", end: "10:30", color: "Maroon", details: "Mentor Group" },
      { title: "M2", start: "10:35", end: "11:40", color: "Maroon", details: "Maroon 2" },
      { title: "Lunch", start: "11:45", end: "12:05", color: "Lunch", details: "Lunch" },
      { title: "M3", start: "12:10", end: "13:15", color: "Maroon", details: "Maroon 3" },
      { title: "M4", start: "13:20", end: "14:25", color: "Maroon", details: "Maroon 4" },
    ]),
  },

  maroonAmIb: {
    label: "Maroon (AM/IB)",
    events: buildEvents([
      { title: "M0", start: "07:10", end: "08:00", color: "Maroon", details: "Maroon Zero period" },
      { title: "M1", start: "08:10", end: "09:15", color: "Maroon", details: "Maroon 1" },
      { title: "MG", start: "09:20", end: "09:30", color: "Maroon", details: "Mentor Group" },
      { title: "M2A", start: "09:35", end: "10:05", color: "Maroon", details: "Maroon 2A" },
      { title: "IB", start: "10:10", end: "11:00", color: "Maroon", details: "Irish Block" },
      { title: "M2B", start: "11:05", end: "11:40", color: "Maroon", details: "Maroon 2B" },
      { title: "Lunch", start: "11:45", end: "12:05", color: "Lunch", details: "Lunch" },
      { title: "M3", start: "12:10", end: "13:15", color: "Maroon", details: "Maroon 3" },
      { title: "M4", start: "13:20", end: "14:25", color: "Maroon", details: "Maroon 4" },
    ]),
  },

  maroonPmIb: {
    label: "Maroon (PM/IB)",
    events: buildEvents([
      { title: "M0", start: "07:10", end: "08:00", color: "Maroon", details: "Maroon Zero period" },
      { title: "M1", start: "08:10", end: "09:15", color: "Maroon", details: "Maroon 1" },
      { title: "MG", start: "09:20", end: "09:30", color: "Maroon", details: "Mentor Group" },
      { title: "M2", start: "09:35", end: "10:40", color: "Maroon", details: "Maroon 2" },
      { title: "M3", start: "10:45", end: "11:50", color: "Maroon", details: "Maroon 3" },
      { title: "Lunch", start: "11:55", end: "12:15", color: "Lunch", details: "Lunch" },
      { title: "M4", start: "12:20", end: "13:25", color: "Maroon", details: "Maroon 4" },
      { title: "IB", start: "13:30", end: "14:25", color: "Maroon", details: "Irish Block" },
    ]),
  },

  maroonNoonDismissal: {
    label: "Maroon Noon Dismissal",
    events: buildEvents([
      { title: "M0", start: "07:10", end: "08:00", color: "Maroon", details: "Maroon Zero period" },
      { title: "M1", start: "08:10", end: "09:00", color: "Maroon", details: "Maroon 1" },
      { title: "MG", start: "09:05", end: "09:15", color: "Maroon", details: "Mentor Group" },
      { title: "M2", start: "09:20", end: "10:10", color: "Maroon", details: "Maroon 2" },
      { title: "M3", start: "10:15", end: "11:05", color: "Maroon", details: "Maroon 3" },
      { title: "M4", start: "11:10", end: "12:00", color: "Maroon", details: "Maroon 4" },
    ]),
  },

  maroonLate2hr: {
    label: "Maroon 2-Hour Late Start",
    events: buildEvents([
      { title: "M1", start: "10:10", end: "11:00", color: "Maroon", details: "Maroon 1" },
      { title: "MG", start: "11:05", end: "11:15", color: "Maroon", details: "Mentor Group" },
      { title: "M2", start: "11:20", end: "12:10", color: "Maroon", details: "Maroon 2" },
      { title: "Lunch", start: "12:15", end: "12:35", color: "Lunch", details: "Lunch" },
      { title: "M3", start: "12:40", end: "13:30", color: "Maroon", details: "Maroon 3" },
      { title: "M4", start: "13:35", end: "14:25", color: "Maroon", details: "Maroon 4" },
    ]),
  },

  maroonBrotherhood: {
    label: "Maroon Brotherhood Block",
    events: buildEvents([
      { title: "M0", start: "07:10", end: "08:00", color: "Maroon", details: "Maroon Zero period" },
      { title: "M1", start: "08:10", end: "09:20", color: "Maroon", details: "Maroon 1" },
      { title: "M2", start: "09:25", end: "10:35", color: "Maroon", details: "Maroon 2" },
      { title: "BB", start: "10:40", end: "11:30", color: "Maroon", details: "Brotherhood Block & Mentor Group" },
      { title: "Lunch", start: "11:35", end: "11:55", color: "Lunch", details: "Lunch" },
      { title: "M3", start: "12:00", end: "13:10", color: "Maroon", details: "Maroon 3" },
      { title: "M4", start: "13:15", end: "14:25", color: "Maroon", details: "Maroon 4" },
    ]),
  },

  // --------------------------------------------------------------- GOLD --
  gold: {
    label: "Gold Day",
    events: buildEvents([
      { title: "G0", start: "07:10", end: "08:00", color: "Gold", details: "Gold Zero period" },
      { title: "G1", start: "08:10", end: "09:30", color: "Gold", details: "Gold 1" },
      { title: "MG", start: "09:35", end: "10:05", color: "Gold", details: "Mentor Group" },
      { title: "IB", start: "10:10", end: "11:10", color: "Gold", details: "Irish Block" },
      { title: "Lunch", start: "11:15", end: "11:35", color: "Lunch", details: "Lunch" },
      { title: "G2", start: "11:40", end: "13:00", color: "Gold", details: "Gold 2" },
      { title: "G3", start: "13:05", end: "14:25", color: "Gold", details: "Gold 3" },
    ]),
  },

  goldLate1hr: {
    label: "Gold 1-Hour Late Start",
    events: buildEvents([
      { title: "MM", start: "07:30", end: "08:50", color: "Gold", details: "Morning Meeting" },
      { title: "G1", start: "09:10", end: "10:15", color: "Gold", details: "Gold 1" },
      { title: "MG", start: "10:20", end: "10:50", color: "Gold", details: "Mentor Group" },
      { title: "IB", start: "10:55", end: "11:40", color: "Gold", details: "Irish Block" },
      { title: "Lunch", start: "11:45", end: "12:05", color: "Lunch", details: "Lunch" },
      { title: "G2", start: "12:10", end: "13:15", color: "Gold", details: "Gold 2" },
      { title: "G3", start: "13:20", end: "14:25", color: "Gold", details: "Gold 3" },
    ]),
  },

  goldLate1hrPmIb: {
    label: "Gold 1-Hour Late Start (PM/IB)",
    events: buildEvents([
      { title: "FM", start: "07:30", end: "08:50", color: "Gold", details: "Faculty Meeting" },
      { title: "G1", start: "09:10", end: "10:15", color: "Gold", details: "Gold 1" },
      { title: "MG", start: "10:20", end: "10:50", color: "Gold", details: "Mentor Group" },
      { title: "G2", start: "10:55", end: "12:00", color: "Gold", details: "Gold 2" },
      { title: "Lunch", start: "12:05", end: "12:25", color: "Lunch", details: "Lunch" },
      { title: "G3", start: "12:30", end: "13:35", color: "Gold", details: "Gold 3" },
      { title: "IB", start: "13:40", end: "14:25", color: "Gold", details: "Irish Block" },
    ]),
  },

  goldPmIb: {
    label: "Gold (PM/IB)",
    events: buildEvents([
      { title: "G0", start: "07:10", end: "08:00", color: "Gold", details: "Gold Zero period" },
      { title: "G1", start: "08:10", end: "09:30", color: "Gold", details: "Gold 1" },
      { title: "MG", start: "09:35", end: "10:05", color: "Gold", details: "Mentor Group" },
      { title: "G2", start: "10:10", end: "11:30", color: "Gold", details: "Gold 2" },
      { title: "Lunch", start: "11:35", end: "11:55", color: "Lunch", details: "Lunch" },
      { title: "G3", start: "12:00", end: "13:20", color: "Gold", details: "Gold 3" },
      { title: "IB", start: "13:25", end: "14:25", color: "Gold", details: "Irish Block" },
    ]),
  },

  goldNoonDismissal: {
    label: "Gold Noon Dismissal",
    events: buildEvents([
      { title: "G1", start: "08:10", end: "09:15", color: "Gold", details: "Gold 1" },
      { title: "MG", start: "09:20", end: "09:40", color: "Gold", details: "Mentor Group" },
      { title: "G2", start: "09:45", end: "10:50", color: "Gold", details: "Gold 2" },
      { title: "G3", start: "10:55", end: "12:00", color: "Gold", details: "Gold 3" },
    ]),
  },

  goldLate2hr: {
    label: "Gold 2-Hour Late Start",
    events: buildEvents([
      { title: "G1", start: "10:10", end: "11:20", color: "Gold", details: "Gold 1" },
      { title: "MG", start: "11:25", end: "11:35", color: "Gold", details: "Mentor Group" },
      { title: "Lunch", start: "11:40", end: "12:00", color: "Lunch", details: "Lunch" },
      { title: "G2", start: "12:05", end: "13:15", color: "Gold", details: "Gold 2" },
      { title: "G3", start: "13:20", end: "14:25", color: "Gold", details: "Gold 3" },
    ]),
  },

  // ------------------------------------------------------------ UNIFIED --
  // M1-M4 are given Maroon color and G1-G3 Gold color by inference from
  // their labels; "Prayer Service / Mentor Group" is set to Black per
  // direction.
  unifiedDay: {
    label: "Unified Day",
    events: buildEvents([
      { title: "M1", start: "08:10", end: "08:35", color: "Maroon", details: "Maroon 1" },
      { title: "M2", start: "08:40", end: "09:05", color: "Maroon", details: "Maroon 2" },
      { title: "M3", start: "09:10", end: "09:35", color: "Maroon", details: "Maroon 3" },
      { title: "M4", start: "09:40", end: "10:05", color: "Maroon", details: "Maroon 4" },
      { title: "G1", start: "10:10", end: "10:35", color: "Gold", details: "Gold 1" },
      { title: "G2", start: "10:40", end: "11:05", color: "Gold", details: "Gold 2" },
      { title: "G3", start: "11:10", end: "11:35", color: "Gold", details: "Gold 3" },
      { title: "PS", start: "11:40", end: "12:00", color: "Black", details: "Prayer Service/Mentor Group" },
    ]),
  },

  // -------------------------------------------------------------- FINALS --
  // Transcribed from O'Dea's Finals schedule slides ("Maroon 1 & 2 Finals",
  // "Maroon 3 & 4 Finals", "Gold Finals 2027").
  maroon12Finals: {
    label: "Maroon 1 & 2 Finals",
    events: buildEvents([
      { title: "SRC", start: "07:00", end: "08:00", color: "Maroon", details: "SRC Open Study Hall" },
      { title: "IB", start: "08:10", end: "09:40", color: "Maroon", details: "Irish Block" },
      { title: "M1F", start: "09:45", end: "11:15", color: "Maroon", details: "Maroon 1 Final" },
      { title: "Lunch", start: "11:20", end: "11:45", color: "Lunch", details: "Lunch" },
      { title: "M2F", start: "11:50", end: "13:20", color: "Maroon", details: "Maroon 2 Final" },
      { title: "SRC", start: "13:25", end: "15:00", color: "Maroon", details: "SRC Open Study Hall" },
    ]),
  },

  maroon34Finals: {
    label: "Maroon 3 & 4 Finals",
    events: buildEvents([
      { title: "SRC", start: "07:00", end: "08:00", color: "Maroon", details: "SRC Open Study Hall" },
      { title: "IB", start: "08:10", end: "09:40", color: "Maroon", details: "Irish Block" },
      { title: "M3F", start: "09:45", end: "11:15", color: "Maroon", details: "Maroon 3 Final" },
      { title: "Lunch", start: "11:20", end: "11:45", color: "Lunch", details: "Lunch" },
      { title: "M4F", start: "11:50", end: "13:20", color: "Maroon", details: "Maroon 4 Final" },
      { title: "SRC", start: "13:25", end: "15:00", color: "Maroon", details: "SRC Open Study Hall" },
    ]),
  },

  goldFinals: {
    label: "Gold Finals",
    events: buildEvents([
      { title: "SRC", start: "07:00", end: "08:00", color: "Gold", details: "SRC Open Study Hall" },
      { title: "G1F", start: "08:10", end: "09:40", color: "Gold", details: "Gold 1 Final" },
      { title: "G2F", start: "09:45", end: "11:15", color: "Gold", details: "Gold 2 Final" },
      { title: "Lunch", start: "11:20", end: "11:45", color: "Lunch", details: "Lunch" },
      { title: "G3F", start: "11:50", end: "13:20", color: "Gold", details: "Gold 3 Final" },
      { title: "SRC", start: "13:25", end: "15:00", color: "Gold", details: "SRC Open Study Hall" },
    ]),
  },

  // ----------------------------------------------------------- SPECIAL --
  // Transcribed from the "Back-to-School Night" flyer (dated 2025 there,
  // but this is a selectable schedule type — the operator picks whatever
  // this year's actual date is when running it, same as every other
  // schedule here).
  //
  // Shape is different from the class-day schedules above: the first two
  // rows (Senior Family Night, Principal's Welcome) are standalone
  // announcements with no duration/end time on the flyer, so they're
  // plain point triggers, not buildEvents() blocks. Mentor Group through
  // Zero Period DO have real start/end times with passing-period-style
  // gaps between them, so that portion reuses buildEvents() normally.
  //
  // NOTE: the flyer doesn't specify colors for anything (it's a plain
  // text table, no color-coding). Mentor Group and Zero Period are set
  // to Maroon per direction.
  backToSchoolNight: {
    label: "Back-to-School Night",
    events: [
      { title: "SFN", start: "17:30", color: "Grey", details: "Senior Family Night (SRC)" },
      { title: "Welcome", start: "18:00", color: "Grey", details: "Principal's Welcome (Gym)" },
      ...buildEvents([
        { title: "MG", start: "18:30", end: "18:37", color: "Maroon", details: "Mentor Group" },
        { title: "G1", start: "18:41", end: "18:48", color: "Gold", details: "Gold 1" },
        { title: "G2", start: "18:52", end: "18:59", color: "Gold", details: "Gold 2" },
        { title: "G3", start: "19:03", end: "19:10", color: "Gold", details: "Gold 3" },
        { title: "M1", start: "19:14", end: "19:21", color: "Maroon", details: "Maroon 1" },
        { title: "M2", start: "19:25", end: "19:32", color: "Maroon", details: "Maroon 2" },
        { title: "M3", start: "19:36", end: "19:43", color: "Maroon", details: "Maroon 3" },
        { title: "M4", start: "19:47", end: "19:54", color: "Maroon", details: "Maroon 4" },
        { title: "ZP", start: "19:58", end: "20:05", color: "Maroon", details: "Zero Period" },
      ]),
    ],
  },
};

// Belt-and-suspenders on top of buildEvents()'s own check: covers
// standalone events declared outside buildEvents() too (e.g. Back-to-
// School Night's point triggers), so the minimum-2-characters rule holds
// for every event in every schedule, no exceptions.
for (const [key, schedule] of Object.entries(schedules)) {
  for (const event of schedule.events) {
    if (event.title.length < 2) {
      throw new Error(
        `schedules.${key}: event title must be at least 2 characters, got "${event.title}" (${event.title.length})`
      );
    }
  }
}

module.exports = { order, schedules };
