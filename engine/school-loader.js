// school-loader.js
//
// Discovers and loads schools from ../schools/<id>/. A school is a plain
// folder — school.json (id, display name, which platform engine it uses),
// plus schedules.js / colors.js / config.js / selectors.js in the same
// shape as schools/odea. No database, no server — adding a school means
// adding a folder.

const fs = require("fs");
const path = require("path");

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

  const { order, schedules } = require(path.join(dir, "schedules.js"));
  const colors = require(path.join(dir, "colors.js"));
  const config = require(path.join(dir, "config.js"));
  const selectors = require(path.join(dir, "selectors.js"));
  const { createEngine } = require(platformPath);

  const { connect, createEvent } = createEngine({ selectors, colors, config });

  return { meta, order, schedules, colors, config, selectors, connect, createEvent };
}

module.exports = { listSchools, loadSchool };
