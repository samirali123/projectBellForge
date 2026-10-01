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

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// Field-level problems with one block, as [{ field, message }]. Used for
// live validation while typing, for the final save, and when loading
// user-added schedules, so the rules exist in exactly one place.
// `colorKeys` is the school's colors.js keys: a block can only use a color
// CyberData actually has.
function validateBlock(block, colorKeys) {
  const errors = [];
  const titleError = validateTitle(block.title);
  if (titleError) errors.push({ field: "title", message: "Title must be at least 2 characters." });

  if (!block.start) {
    errors.push({ field: "start", message: "Start time is required." });
  } else if (!TIME_RE.test(block.start)) {
    errors.push({ field: "start", message: "Start time must be HH:MM (24-hour)." });
  }
  if (block.end !== undefined) {
    if (!block.end) {
      errors.push({ field: "end", message: "End time is required, unless this is a point event." });
    } else if (!TIME_RE.test(block.end)) {
      errors.push({ field: "end", message: "End time must be HH:MM (24-hour)." });
    } else if (TIME_RE.test(block.start || "") && block.end <= block.start) {
      errors.push({ field: "end", message: "End time must be after the start time." });
    }
  }

  if (!colorKeys.includes(block.color)) {
    errors.push({ field: "color", message: `Color must be one of: ${colorKeys.join(", ")}.` });
  }
  if (block.details !== undefined && typeof block.details !== "string") {
    errors.push({ field: "details", message: "Details must be text." });
  }
  return errors;
}

// Whole-schedule problems, as a list of messages. Blocks must be in time
// order and must not overlap, since each block's Pass bell fires at its end.
function validateSchedule({ label, blocks }, colorKeys) {
  const errors = [];
  if (typeof label !== "string" || label.trim() === "") errors.push("The schedule needs a name.");
  if (!Array.isArray(blocks) || blocks.length === 0) {
    errors.push("Add at least one block.");
    return errors;
  }

  blocks.forEach((block, i) => {
    for (const { message } of validateBlock(block, colorKeys)) {
      errors.push(`Block ${i + 1} (${block.title || "untitled"}): ${message}`);
    }
  });
  if (errors.length > 0) return errors;

  for (let i = 1; i < blocks.length; i++) {
    const prev = blocks[i - 1];
    const prevLast = prev.end !== undefined ? prev.end : prev.start;
    if (blocks[i].start < prevLast) {
      errors.push(
        `Block ${i + 1} (${blocks[i].title}) starts at ${blocks[i].start}, before block ${i} ` +
          `(${prev.title}) ${prev.end !== undefined ? "ends" : "starts"} at ${prevLast}.`
      );
    }
  }
  return errors;
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

module.exports = {
  MIN_TITLE_LENGTH,
  validateTitle,
  validateBlock,
  validateSchedule,
  expandBlocks,
  expandScheduleFile,
};
