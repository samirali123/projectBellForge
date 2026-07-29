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
// Full bell-time table for all 14 schedule types, transcribed from O'Dea's
// public "Bell Schedule" page (Student Life > Bell Schedule). Maroon Day,
// Gold Day, and Maroon 1-Hour Late Start were additionally cross-checked
// against cyberdata_bells.sh, which encodes times already confirmed
// against real hand-entered CyberData events for Aug 31 / Sept 1-4, 2026 —
// those three match exactly.
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
  return events;
}

module.exports = {
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
};
