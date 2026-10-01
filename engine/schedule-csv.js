// schedule-csv.js
//
// Parses a schedule's blocks from a CSV file (filled out in Excel or
// Google Sheets, from schools/<id>/schedule-import-template.csv). The
// result feeds the same block list the builder's manual form fills, so
// an import still has to go through Preview before anything is saved.
//
// Columns (any order, header row required, case-insensitive):
//   title, start, color   required
//   end, details          optional; a blank end makes that row a point event
//
// Every problem is reported per row, using the row number the user sees
// in their spreadsheet (the header is row 1). Rows are never silently
// skipped, apart from completely empty ones.

const { validateBlock, MIN_TITLE_LENGTH } = require("./schedule-expand");

const REQUIRED_COLUMNS = ["title", "start", "color"];
const KNOWN_COLUMNS = ["title", "details", "start", "end", "color"];

// RFC 4180-style: commas, double-quoted cells with "" escapes, CRLF or LF.
// Returns rows as arrays of raw cell strings, each tagged with its
// spreadsheet row number (a quoted cell can span lines but is still one row).
function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push({ line: rows.length + 1, cells: row });
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push({ line: rows.length + 1, cells: row });
  }
  return { rows, unterminatedQuote: inQuotes };
}

// Accepts what spreadsheets actually export: "8:10", "08:10", "08:10:00",
// "8:10 AM", "1:05 PM". Returns "HH:MM" (24-hour), or null if it isn't a
// time at all.
function normalizeTime(raw) {
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?$/);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2]);
  const ampm = m[4] && m[4].toUpperCase();
  if (minute > 59) return null;
  if (ampm) {
    if (hour < 1 || hour > 12) return null;
    if (ampm === "AM" && hour === 12) hour = 0;
    if (ampm === "PM" && hour !== 12) hour += 12;
  } else if (hour > 23) {
    return null;
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return d[a.length][b.length];
}

// Exact color name, ignoring case ("maroon" -> "Maroon"). Anything else is
// an error, with a suggestion if it's a near miss ("Maron").
function matchColor(raw, colorKeys) {
  const exact = colorKeys.find((c) => c.toLowerCase() === raw.trim().toLowerCase());
  if (exact) return { color: exact };
  const scored = colorKeys
    .map((c) => ({ c, d: editDistance(c.toLowerCase(), raw.trim().toLowerCase()) }))
    .sort((x, y) => x.d - y.d);
  const suggestion = scored.length > 0 && scored[0].d <= 2 ? scored[0].c : null;
  return { suggestion };
}

// text -> { blocks, errors }. If there are any errors, `blocks` is empty:
// an import either goes in whole or not at all, so a fixed-up file can be
// re-imported without leaving half of the previous attempt behind.
function parseScheduleCsv(text, colorKeys) {
  const errors = [];
  const { rows, unterminatedQuote } = parseCsvRows(text.replace(/^﻿/, ""));
  if (unterminatedQuote) errors.push("The file has a quote (\") that's never closed.");

  const nonEmpty = rows.filter((r) => r.cells.some((c) => c.trim() !== ""));
  if (nonEmpty.length === 0) return { blocks: [], errors: ["The file is empty."] };

  const [header, ...dataRows] = nonEmpty;
  const columns = header.cells.map((c) => c.trim().toLowerCase());
  for (const col of columns) {
    if (col !== "" && !KNOWN_COLUMNS.includes(col)) {
      errors.push(`Row ${header.line}: unknown column "${col}". Columns are: ${KNOWN_COLUMNS.join(", ")}.`);
    }
  }
  for (const col of REQUIRED_COLUMNS) {
    if (!columns.includes(col)) errors.push(`Row ${header.line}: missing the "${col}" column.`);
  }
  if (errors.length > 0) return { blocks: [], errors };
  if (dataRows.length === 0) return { blocks: [], errors: ["The file has a header row but no blocks."] };

  const blocks = [];
  for (const { line, cells } of dataRows) {
    const get = (col) => {
      const i = columns.indexOf(col);
      // CyberData fields are single-line, so line breaks and runs of
      // spaces inside a cell collapse to one space.
      return i === -1 || i >= cells.length ? "" : cells[i].replace(/\s+/g, " ").trim();
    };
    const rowErrors = [];
    const extra = cells.slice(columns.length).filter((c) => c.trim() !== "");
    if (extra.length > 0) rowErrors.push("has more cells than there are columns");

    const block = { title: get("title"), start: get("start") };

    if (block.title === "") rowErrors.push("title is blank");
    else if (block.title.length < MIN_TITLE_LENGTH) {
      rowErrors.push(`title "${block.title}" is shorter than ${MIN_TITLE_LENGTH} characters`);
    }

    const start = normalizeTime(block.start);
    if (block.start === "") rowErrors.push("start time is blank");
    else if (!start) rowErrors.push(`start time "${block.start}" isn't a time (use e.g. 08:10 or 8:10 AM)`);
    else block.start = start;

    const rawEnd = get("end");
    if (rawEnd !== "") {
      const end = normalizeTime(rawEnd);
      if (!end) rowErrors.push(`end time "${rawEnd}" isn't a time (use e.g. 09:00 or 9:00 AM)`);
      else block.end = end;
    }

    const rawColor = get("color");
    const { color, suggestion } = matchColor(rawColor, colorKeys);
    if (rawColor === "") rowErrors.push(`color is blank (use one of: ${colorKeys.join(", ")})`);
    else if (!color) {
      rowErrors.push(
        `color "${rawColor}" doesn't match any of this school's colors` +
          (suggestion ? `. Did you mean "${suggestion}"?` : ` (${colorKeys.join(", ")})`)
      );
    } else block.color = color;

    const details = get("details");
    if (details !== "") block.details = details;

    // Title, time and color problems are already reported above in
    // spreadsheet terms. The shared engine rules still run last, so a row
    // can never get in that the builder's own validation would reject.
    if (rowErrors.length === 0) {
      for (const { message } of validateBlock(block, colorKeys)) rowErrors.push(message.toLowerCase().replace(/\.$/, ""));
    }

    if (rowErrors.length > 0) {
      errors.push(`Row ${line}: ${rowErrors.join("; ")}`);
    } else {
      blocks.push(block);
    }
  }

  return errors.length > 0 ? { blocks: [], errors } : { blocks, errors: [] };
}

module.exports = { parseScheduleCsv, parseCsvRows, normalizeTime };
