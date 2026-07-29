// colors.js
//
// Maps the semantic color names used in schedules.js to the value
// CyberData's color <select> dropdown expects.
//
// The New Event form's raw HTTP field takes a hex value (see
// ../../cyberdata_bells.sh, which POSTs hex directly to the form endpoint)
// — but the dropdown's visible option *labels* are plain color names, and
// selecting by label through Playwright (`selectOption({ label })`) has
// been confirmed working against the live page. So this file maps to the
// label, not the hex, since that's what playwright.js actually selects by.

module.exports = {
  Maroon: "Brown",
  Gold: "Orange",
  Lunch: "Green",
  Grey: "Grey",
  Black: "Black",
};
