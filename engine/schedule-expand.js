// schedule-expand.js
//
// Turns a schedule's authored blocks (what's stored in a school's
// schedules.json) into the flat list of CyberData events actually created.
//
// --- Data model -------------------------------------------------------
// CyberData's calendar drives the school's InformaCast bell/paging system,
// not a normal duration-based calendar: every entry is a single bell-ring
// TRIGGER at one point in time (the form's end time is always locked to
// end-of-day). So each expanded event is { title, start: "HH:MM", color,
// details }. `color` is a key into the school's colors.js; `details` is
// the longer description CyberData shows (defaults to `title`).
//
// --- Pattern ----------------------------------------------------------
// A block is { title, start, end?, color, details? }. Between blocks a
// "Pass" (grey) trigger fires at the moment a block ends; after the final
// block, a "Dismissal" (grey) trigger fires instead. A block with no `end`
// is a standalone point event (e.g. Back-to-School Night's announcements)
// and nothing follows it.
//
// This runs at load time, not save time: schedules.json only ever holds
// what a human authored, so the derived Pass/Dismissal triggers can never
// drift out of sync or be hand-edited incorrectly.

// Every title (the short code CyberData actually displays) must be at
// least 2 characters. A 1-character title isn't a valid selection on the
// live page. No upper limit; this is a minimum, not an exact size.
const MIN_TITLE_LENGTH = 2;

function validateTitle(title) {
  if (typeof title !== "string" || title.length < MIN_TITLE_LENGTH) {
    return `Event title must be at least ${MIN_TITLE_LENGTH} characters, got "${title}" (${
      typeof title === "string" ? title.length : 0
    })`;
  }
  return null;
}

function expandBlocks(blocks) {
  const events = [];
  blocks.forEach((block, i) => {
    events.push({
      title: block.title,
      start: block.start,
      color: block.color,
      details: block.details || block.title,
    });

    if (block.end === undefined) return;

    const isLast = i === blocks.length - 1;
    events.push(
      isLast
        ? { title: "Dismissal", start: block.end, color: "Grey", details: "Dismissal" }
        : { title: "Pass", start: block.end, color: "Grey", details: "Passing Period" }
    );
  });

  for (const event of events) {
    const error = validateTitle(event.title);
    if (error) throw new Error(error);
  }

  return events;
}

// Parsed schedules.json -> { order, schedules } in the shape the rest of
// the engine uses (each schedule: { label, events }).
function expandScheduleFile({ order, schedules: raw }) {
  const schedules = {};
  for (const [key, { label, blocks }] of Object.entries(raw)) {
    try {
      schedules[key] = { label, events: expandBlocks(blocks) };
    } catch (err) {
      throw new Error(`schedules.${key}: ${err.message}`);
    }
  }

  for (const key of order) {
    if (!schedules[key]) throw new Error(`schedules.json: order lists unknown schedule "${key}"`);
  }

  return { order, schedules };
}

module.exports = { MIN_TITLE_LENGTH, validateTitle, expandBlocks, expandScheduleFile };
