// create-events.js
//
// The actual event-creation loop, shared by bells.js (CLI) and the
// Electron app's main process — so "walk an ordered list of assignments,
// create every event, halt immediately on the first failure" only exists
// once. Callers get progress via a callback instead of this file assuming
// how progress should be displayed (console.log vs. a UI).
//
// `assignments`: ordered list of { date, scheduleKey } — a single-day run
// is just a one-item list.
//
// onProgress is called with one of:
//   { type: "date-start", date, label }
//   { type: "event-start", date, index, countForDate, overallIndex, totalEvents, event }
//   { type: "event-ok", date, event, overallIndex, totalEvents }
//   { type: "event-fail", date, event, error }

async function createEvents({ page, schedules, createEvent, assignments, onProgress }) {
  const multiDate = assignments.length > 1;
  const totalEvents = assignments.reduce(
    (sum, a) => sum + schedules[a.scheduleKey].events.length,
    0
  );

  let succeeded = 0;
  let overallIndex = 0;
  let haltedOn = null;

  for (const { date, scheduleKey } of assignments) {
    const schedule = schedules[scheduleKey];
    if (multiDate) onProgress({ type: "date-start", date, label: schedule.label });

    for (let i = 0; i < schedule.events.length; i++) {
      const event = schedule.events[i];
      overallIndex += 1;
      onProgress({
        type: "event-start",
        date,
        index: i + 1,
        countForDate: schedule.events.length,
        overallIndex,
        totalEvents,
        event,
      });
      try {
        await createEvent(page, event, date);
        succeeded += 1;
        onProgress({ type: "event-ok", date, event, overallIndex, totalEvents });
      } catch (err) {
        onProgress({ type: "event-fail", date, event, error: err.message });
        haltedOn = `${date} ${event.title}`;
        break;
      }
    }
    if (haltedOn) break;
  }

  return { succeeded, totalEvents, haltedOn };
}

module.exports = { createEvents };
