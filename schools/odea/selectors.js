// selectors.js
//
// O'Dea's confirmed CyberData page locators — confirmed against the real,
// logged-in page using the Playwright Inspector's element picker (see
// ../../engine/inspect.js), not guesses.
//
// Notable things the live UI does differently than a generic "New Event"
// form might: the dialog itself is found by its accessible label, not
// role=dialog; color is a row of preset buttons (matched against the
// label text in colors.js), not a <select>; PGroup / Times to play /
// Relay are left untouched by the engine because their dialog defaults
// already match what's needed (see config.js) and no selector for them
// has been confirmed.
//
// If CyberData's markup ever changes, or another school's CyberData
// instance renders differently, re-confirm every value below with
// inspect.js before trusting it.

module.exports = {
  dialogLabel: "New Event New Task Title:",
  newEventButtonName: "New Event",
  titleFieldName: "Title",
  startDateFieldName: "Start date:",
  endDateFieldName: "End date:",
  startTimeFieldName: "Start time:",
  audioLabel: "Audio:",
  saveButtonName: "Save",
};
