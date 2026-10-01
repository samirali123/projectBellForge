// school-loader.js
//
// Discovers and loads schools from ../schools/<id>/. A school is a plain
// folder — school.json (id, display name, which platform engine it uses),
// plus schedules.json / colors.js / config.js / selectors.js in the same
// shape as schools/odea. No database, no server — adding a school means
// adding a folder.

const fs = require("fs");
const path = require("path");
const { expandScheduleFile, expandBlocks, validateSchedule } = require("./schedule-expand");
const { readCustomFile, customSchedulesPath } = require("./custom-schedules");

const SCHOOLS_DIR = path.join(__dirname, "..", "schools");
const PLATFORMS_DIR = path.join(__dirname, "platforms");

// [{ id, name, platform, dir }] for every school with a valid school.json.
function listSchools() {
  if (!fs.existsSync(SCHOOLS_DIR)) return [];

  return fs
    .readdirSync(SCHOOLS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const dir = path.join(SCHOOLS_DIR, entry.name);
      const schoolJsonPath = path.join(dir, "school.json");
      if (!fs.existsSync(schoolJsonPath)) return null;
      const meta = JSON.parse(fs.readFileSync(schoolJsonPath, "utf8"));
      return { ...meta, dir };
    })
    .filter(Boolean);
}

// Full working set for one school: its data files plus its platform engine
// (selectors/colors/config already wired into connect()/createEvent()).
function loadSchool(schoolId) {
  const dir = path.join(SCHOOLS_DIR, schoolId);
  const schoolJsonPath = path.join(dir, "school.json");
  if (!fs.existsSync(schoolJsonPath)) {
    throw new Error(`No school found with id "${schoolId}" (expected ${schoolJsonPath}).`);
  }
  const meta = JSON.parse(fs.readFileSync(schoolJsonPath, "utf8"));

  const platformPath = path.join(PLATFORMS_DIR, `${meta.platform}.js`);
  if (!fs.existsSync(platformPath)) {
    throw new Error(
      `School "${meta.name}" uses platform "${meta.platform}", but no ` +
        `engine exists at platforms/${meta.platform}.js yet.`
    );
  }

  // schedules.json holds authored blocks only; Pass/Dismissal triggers are
  // derived here, at load time (see schedule-expand.js).
  const builtIn = expandScheduleFile(
    JSON.parse(fs.readFileSync(path.join(dir, "schedules.json"), "utf8"))
  );
  const colors = require(path.join(dir, "colors.js"));
  const { order, schedules, warnings } = mergeCustomSchedules(schoolId, builtIn, Object.keys(colors));

  const config = require(path.join(dir, "config.js"));
  const selectors = require(path.join(dir, "selectors.js"));
  const { createEngine } = require(platformPath);

  const { connect, createEvent } = createEngine({ selectors, colors, config });

  return { meta, order, schedules, warnings, colors, config, selectors, connect, createEvent };
}

// Appends the schedules this school added through BellForge (see
// custom-schedules.js) after the built-in ones. A problem with a user-added
// schedule never stops the built-in schedules from loading: that one
// schedule is skipped and reported in `warnings` instead.
function mergeCustomSchedules(schoolId, builtIn, colorKeys) {
  const order = [...builtIn.order];
  const schedules = { ...builtIn.schedules };
  const warnings = [];

  let custom;
  try {
    custom = readCustomFile(schoolId);
  } catch (err) {
    warnings.push(
      `Couldn't read your added schedules (${customSchedulesPath(schoolId)}): ${err.message}. ` +
        `Built-in schedules are still available.`
    );
    return { order, schedules, warnings };
  }

  for (const key of custom.order) {
    const raw = custom.schedules[key];
    if (!raw) {
      warnings.push(`Added schedule "${key}" is listed but missing; skipped.`);
      continue;
    }
    if (schedules[key]) {
      warnings.push(`Added schedule "${raw.label}" has the same key as a built-in one; skipped.`);
      continue;
    }
    const errors = validateSchedule(raw, colorKeys);
    if (errors.length > 0) {
      warnings.push(`Added schedule "${raw.label || key}" is invalid and was skipped: ${errors.join(" ")}`);
      continue;
    }
    schedules[key] = { label: raw.label, events: expandBlocks(raw.blocks) };
    order.push(key);
  }

  return { order, schedules, warnings };
}

module.exports = { listSchools, loadSchool };
