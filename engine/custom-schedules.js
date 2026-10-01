// custom-schedules.js
//
// Schedules a school adds through BellForge's schedule builder. These are
// kept apart from the built-in schools/<id>/schedules.json, which ships
// inside the app and gets replaced on every update. User-added schedules
// live in the per-user data folder instead, so an update never touches
// them:
//
//   macOS:   ~/Library/Application Support/BellForge/schools/<id>/custom-schedules.json
//   Windows: %APPDATA%\BellForge\schools\<id>\custom-schedules.json
//
// The CLI and the app both resolve this path here, so they always see the
// same file. Same shape as schedules.json: { order, schedules }.
//
// Keys are always prefixed "custom-" so they can't collide with a built-in
// schedule, including one added by a later update.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { validateSchedule } = require("./schedule-expand");

const KEY_PREFIX = "custom-";

function userDataDir() {
  if (process.env.BELLFORGE_DATA_DIR) return process.env.BELLFORGE_DATA_DIR;
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "BellForge");
  }
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "BellForge");
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "BellForge");
}

function customSchedulesPath(schoolId) {
  return path.join(userDataDir(), "schools", schoolId, "custom-schedules.json");
}

// { order, schedules } as stored, or an empty set if the file doesn't
// exist yet. Throws if the file exists but isn't valid JSON; callers decide
// whether that's fatal (save) or a warning (load).
function readCustomFile(schoolId) {
  const file = customSchedulesPath(schoolId);
  if (!fs.existsSync(file)) return { order: [], schedules: {} };
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  return {
    order: Array.isArray(parsed.order) ? parsed.order : [],
    schedules: parsed.schedules && typeof parsed.schedules === "object" ? parsed.schedules : {},
  };
}

// "Spring Pep Rally" -> "custom-spring-pep-rally", with -2, -3, ... added
// if that key is already taken.
function makeKey(label, takenKeys) {
  const slug =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "schedule";
  const base = KEY_PREFIX + slug;
  let key = base;
  for (let n = 2; takenKeys.includes(key); n++) key = `${base}-${n}`;
  return key;
}

// Writes to a temp file in the same folder, then renames it over the real
// one. A rename within one folder is atomic, so a crash mid-save leaves
// either the old file or the new one, never a half-written file.
function writeAtomic(file, text) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });

  // Clear out temp files left behind by an earlier save that crashed.
  const stalePrefix = `${path.basename(file)}.`;
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith(stalePrefix) && name.endsWith(".tmp")) fs.rmSync(path.join(dir, name), { force: true });
  }

  const tmp = `${file}.${process.pid}.tmp`;
  const fd = fs.openSync(tmp, "w");
  try {
    fs.writeSync(fd, text);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
}

// Validates and appends one new schedule. Returns { ok, key } or
// { ok: false, errors }. `takenKeys` (every key already loaded) and
// `colorKeys` come from the loaded school.
function saveCustomSchedule(schoolId, { label, blocks }, { takenKeys, colorKeys }) {
  const clean = {
    label: typeof label === "string" ? label.trim() : label,
    blocks: (blocks || []).map(normalizeBlock),
  };
  const errors = validateSchedule(clean, colorKeys);
  if (errors.length > 0) return { ok: false, errors };

  const current = readCustomFile(schoolId);
  const key = makeKey(clean.label, [...takenKeys, ...Object.keys(current.schedules)]);
  current.schedules[key] = clean;
  current.order.push(key);

  writeAtomic(customSchedulesPath(schoolId), JSON.stringify(current, null, 2) + "\n");
  return { ok: true, key };
}

// Removes one added schedule. Only keys in this school's
// custom-schedules.json can be deleted, so a built-in schedule never can.
function deleteCustomSchedule(schoolId, key) {
  const current = readCustomFile(schoolId);
  if (!current.schedules[key]) return { ok: false, error: "That isn't one of your added schedules." };
  const { label } = current.schedules[key];
  delete current.schedules[key];
  current.order = current.order.filter((k) => k !== key);
  writeAtomic(customSchedulesPath(schoolId), JSON.stringify(current, null, 2) + "\n");
  return { ok: true, label };
}

// Keeps only the known fields, drops blank details, and stores fields in
// the same order as schedules.json. A blank end is kept (and fails
// validation) rather than dropped: leaving out `end` is how a block says
// it's a point event, and that has to be a deliberate choice.
function normalizeBlock(block) {
  const title = typeof block.title === "string" ? block.title.trim() : block.title;
  const out = { title, start: block.start };
  if (block.end !== undefined && block.end !== null) out.end = block.end;
  out.color = block.color;
  const details = typeof block.details === "string" ? block.details.trim() : block.details;
  if (details !== undefined && details !== null && details !== "") out.details = details;
  return out;
}

module.exports = {
  KEY_PREFIX,
  userDataDir,
  customSchedulesPath,
  readCustomFile,
  makeKey,
  normalizeBlock,
  saveCustomSchedule,
  deleteCustomSchedule,
};
