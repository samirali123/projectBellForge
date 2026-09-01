// config.js
// Centralized tunable settings. Nothing schedule-specific or
// selector-specific belongs here — see schedules.js / colors.js and the
// selectors.js instead.

module.exports = {
  // Chrome DevTools Protocol (CDP) endpoint. Launch Edge yourself with, e.g.:
  //   msedge --remote-debugging-port=9222
  // and log into CyberData manually before running bells.js.
  cdpUrl: "http://localhost:9222",

  // Host CyberData is reached at (see ../../cyberdata_bells.sh). Used to
  // pick the right tab out of the attached Edge instance — CyberData is
  // reached by bare IP, not a hostname, so this can't be a "cyberdata.*"
  // pattern.
  cyberDataHost: "10.0.30.230",

  // How long to wait, after the "New Event" dialog closes on Save, before
  // starting the next event. Gives CyberData's page time to refresh/register
  // the new event. Tune this up if you see intermittent failures on a slow
  // connection, down if CyberData is consistently fast for you.
  postSaveDelayMs: 1500,

  // How long to wait for the dialog to appear after clicking "New Event",
  // and to disappear after clicking "Save", before treating it as a failure.
  dialogTimeoutMs: 10000,

  // How many times to retry a single failed save before halting the run.
  maxRetries: 1,

  // Audio dropdown value — confirmed as the dialog's own default (see the
  // "Audio:" screenshot in PROJECT_SPEC.md history), set explicitly anyway
  // since selectors.js has a confirmed selector for it.
  audioFile: "odeabell.wav",

  // PGroup / Times to play / Relay are deliberately NOT set here as
  // form values: the New Event dialog already defaults to what we need
  // (0: IntercomPagingGroup / 1 / No Action) and no selector for them has
  // been confirmed against the live page yet. If that ever needs to
  // change, confirm the selector with inspect.js first.

  // Every event is a one-off, non-recurring trigger; the end time is not
  // meaningful (CyberData always treats it as end-of-day for a single
  // trigger) so it's held fixed here rather than being part of the
  // schedule data.
  endTime: "23:59",
};
