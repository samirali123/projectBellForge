// --- element refs -------------------------------------------------------

const schoolSelect = document.getElementById("school-select");
const networkStatus = document.getElementById("network-status");
const networkText = networkStatus.querySelector(".network-text");
const passwordInput = document.getElementById("password");
const connectBtn = document.getElementById("connect-btn");
const connectError = document.getElementById("connect-error");
const connectLog = document.getElementById("connect-log");
const subtitle = document.getElementById("subtitle");

// --- state ---------------------------------------------------------------

let selectedSchoolId = null;
let unsubscribeStatus = null;
let scheduleMenu = null; // { schoolName, items: [{key, label, eventCount}], colors, warnings }
let pendingAssignments = [];
let reviewOrigin = "screen-mode";

// --- screen switching ------------------------------------------------------

function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => {
    s.hidden = s.id !== id;
  });
}

// --- connect screen --------------------------------------------------------

function showConnectError(message) {
  connectError.textContent = message;
  connectError.hidden = false;
}

function clearConnectError() {
  connectError.hidden = true;
  connectError.textContent = "";
}

function resetConnectLog() {
  connectLog.innerHTML = "";
  connectLog.hidden = true;
}

function appendConnectLog(text, kind) {
  connectLog.hidden = false;
  const line = document.createElement("div");
  line.className = kind ? `line ${kind}` : "line";
  line.textContent = text;
  connectLog.appendChild(line);
  connectLog.scrollTop = connectLog.scrollHeight;
}

function setNetworkStatus(state, text) {
  networkStatus.hidden = false;
  networkStatus.className = `network-status ${state}`;
  networkText.textContent = text;
}

async function loadSchools() {
  const schools = await window.api.listSchools();
  schoolSelect.innerHTML = "";

  if (schools.length === 0) {
    const opt = document.createElement("option");
    opt.textContent = "No schools configured";
    opt.disabled = true;
    opt.selected = true;
    schoolSelect.appendChild(opt);
    return;
  }

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Choose a school…";
  placeholder.disabled = true;
  placeholder.selected = true;
  schoolSelect.appendChild(placeholder);

  for (const school of schools) {
    const opt = document.createElement("option");
    opt.value = school.id;
    opt.textContent = school.name;
    schoolSelect.appendChild(opt);
  }
}

async function onSchoolChange() {
  selectedSchoolId = schoolSelect.value || null;
  clearConnectError();
  resetConnectLog();
  connectBtn.disabled = !selectedSchoolId;

  if (!selectedSchoolId) {
    networkStatus.hidden = true;
    return;
  }

  setNetworkStatus("checking", "Checking network…");
  const result = await window.api.checkReachable(selectedSchoolId);
  if (result.reachable) {
    setNetworkStatus("ok", `Reachable (${result.host})`);
  } else {
    setNetworkStatus(
      "fail",
      `Can't reach ${result.host || "this school"} — check your network/VPN`
    );
  }
}

async function onConnectClick() {
  clearConnectError();
  resetConnectLog();

  if (!selectedSchoolId) return;
  const password = passwordInput.value;
  if (!password) {
    showConnectError("Enter this school's password.");
    return;
  }

  connectBtn.disabled = true;
  connectBtn.textContent = "Checking password…";

  // Wrapped in try/catch/finally so an unexpected rejection anywhere in
  // this flow (a bug, a bad IPC response, anything) always leaves the UI
  // in a recoverable state with a visible message — instead of silently
  // stuck on "Connecting…" forever with no feedback at all, which is what
  // was happening before this existed.
  try {
    const passwordResult = await window.api.checkPassword(selectedSchoolId, password);
    if (!passwordResult.ok) {
      showConnectError(passwordResult.error);
      return;
    }

    connectBtn.textContent = "Connecting…";

    if (unsubscribeStatus) unsubscribeStatus();
    unsubscribeStatus = window.api.onStatus((text) => appendConnectLog(text));

    const result = await window.api.launchAndConnect(selectedSchoolId);

    if (unsubscribeStatus) {
      unsubscribeStatus();
      unsubscribeStatus = null;
    }

    if (!result.ok) {
      showConnectError(result.error);
      return;
    }

    appendConnectLog("Connected.", "success");
    connectBtn.textContent = "Connected";

    const menu = await window.api.getScheduleMenu();
    if (!menu.ok) {
      showConnectError(menu.error);
      return;
    }
    applyScheduleMenu(menu);
    subtitle.textContent = menu.schoolName;

    showScreen("screen-mode");
  } catch (err) {
    showConnectError(`Unexpected error: ${err.message}`);
  } finally {
    if (connectBtn.textContent !== "Connected") {
      connectBtn.disabled = false;
      connectBtn.textContent = "Connect";
    }
  }
}

// --- schedule select helper --------------------------------------------

// Takes a fresh menu from the main process (after connecting, or after the
// builder saves a new schedule) and refreshes everything that lists
// schedules or colors.
function applyScheduleMenu(menu) {
  scheduleMenu = menu;
  populateScheduleSelect(document.getElementById("single-schedule"), false);

  const colorSelect = document.getElementById("block-color");
  colorSelect.innerHTML = "";
  for (const color of menu.colors) {
    const opt = document.createElement("option");
    opt.value = color;
    opt.textContent = color;
    colorSelect.appendChild(opt);
  }

  const warningsBox = document.getElementById("mode-warnings");
  warningsBox.textContent = menu.warnings.join("\n");
  warningsBox.hidden = menu.warnings.length === 0;
}

function populateScheduleSelect(selectEl, includeBlank) {
  selectEl.innerHTML = "";
  if (includeBlank) {
    const blank = document.createElement("option");
    blank.value = "blank";
    blank.textContent = "Blank (no school / no bells)";
    selectEl.appendChild(blank);
  }
  for (const item of scheduleMenu.items) {
    const opt = document.createElement("option");
    opt.value = item.key;
    opt.textContent = `${item.label} (${item.eventCount} events)`;
    selectEl.appendChild(opt);
  }
}

// --- mode screen ---------------------------------------------------------

document.getElementById("mode-single").addEventListener("click", () => {
  showScreen("screen-single");
});
document.getElementById("mode-range").addEventListener("click", () => {
  showScreen("screen-range");
});
document.getElementById("mode-build").addEventListener("click", () => {
  document.getElementById("mode-notice").hidden = true;
  showScreen("screen-builder");
  validateBlockForm();
});
document.querySelectorAll(".back-link[data-back]").forEach((btn) => {
  btn.addEventListener("click", () => showScreen(btn.dataset.back));
});

// --- single-day screen -----------------------------------------------------

document.getElementById("single-review-btn").addEventListener("click", () => {
  const date = document.getElementById("single-date").value;
  const scheduleKey = document.getElementById("single-schedule").value;
  if (!date) {
    alert("Pick a date.");
    return;
  }
  pendingAssignments = [{ date, scheduleKey }];
  reviewOrigin = "screen-single";
  showReview();
});

// --- date-range screen -----------------------------------------------------

function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function enumerateDates(startStr, endStr) {
  const [sy, sm, sd] = startStr.split("-").map(Number);
  const [ey, em, ed] = endStr.split("-").map(Number);
  const cur = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);

  const dates = [];
  while (cur <= end) {
    dates.push(formatDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function buildRangeTable(dates) {
  const tbody = document.querySelector("#range-table tbody");
  tbody.innerHTML = "";
  for (const date of dates) {
    const tr = document.createElement("tr");

    const tdDate = document.createElement("td");
    tdDate.className = "range-date";
    tdDate.textContent = date;

    const tdSelect = document.createElement("td");
    tdSelect.className = "range-select";
    const select = document.createElement("select");
    select.dataset.date = date;
    populateScheduleSelect(select, true);
    select.value = "blank";
    tdSelect.appendChild(select);

    tr.appendChild(tdDate);
    tr.appendChild(tdSelect);
    tbody.appendChild(tr);
  }
  document.getElementById("range-table-wrap").hidden = false;
}

document.getElementById("range-generate-btn").addEventListener("click", () => {
  const start = document.getElementById("range-start").value;
  const end = document.getElementById("range-end").value;
  if (!start || !end) {
    alert("Pick both a start and end date.");
    return;
  }
  if (end < start) {
    alert("End date must be on or after the start date.");
    return;
  }
  buildRangeTable(enumerateDates(start, end));
});

document.getElementById("range-review-btn").addEventListener("click", () => {
  const rows = document.querySelectorAll("#range-table tbody tr");
  const assignments = [];
  rows.forEach((tr) => {
    const select = tr.querySelector("select");
    if (select.value !== "blank") {
      assignments.push({ date: select.dataset.date, scheduleKey: select.value });
    }
  });
  if (assignments.length === 0) {
    alert("Every date is Blank — nothing to do.");
    return;
  }
  pendingAssignments = assignments;
  reviewOrigin = "screen-range";
  showReview();
});

// --- schedule builder -------------------------------------------------------
// The renderer only collects input. Every rule (title length, time format,
// colors, ordering) is checked by the main process through
// engine/schedule-expand.js, the same code that loads schedules.

const builderBlocks = []; // [{ title, start, end?, color, details }]
const blockInputs = {
  title: document.getElementById("block-title"),
  details: document.getElementById("block-details"),
  start: document.getElementById("block-start"),
  end: document.getElementById("block-end"),
  color: document.getElementById("block-color"),
};
const pointCheckbox = document.getElementById("block-point");
const blockAddBtn = document.getElementById("block-add-btn");
const touched = new Set(); // fields the user has edited, so errors don't show on a blank form
let validationSeq = 0;

function readBlockForm() {
  const block = {
    title: blockInputs.title.value,
    start: blockInputs.start.value,
    color: blockInputs.color.value,
    details: blockInputs.details.value,
  };
  if (!pointCheckbox.checked) block.end = blockInputs.end.value;
  return block;
}

async function validateBlockForm() {
  const seq = ++validationSeq;
  const { errors } = await window.api.validateBlock(readBlockForm());
  if (seq !== validationSeq) return; // a newer keystroke already re-validated

  // Red borders only on fields the user has edited; once they've started a
  // block, list everything still missing so a disabled Add is never a mystery.
  for (const [field, input] of Object.entries(blockInputs)) {
    input.classList.toggle("invalid", errors.some((e) => e.field === field && touched.has(field)));
  }
  document.getElementById("block-errors").textContent =
    touched.size > 0 ? errors.map((e) => e.message).join(" ") : "";
  blockAddBtn.disabled = errors.length > 0;
}

for (const [field, input] of Object.entries(blockInputs)) {
  input.addEventListener("input", () => {
    touched.add(field);
    validateBlockForm();
  });
}
pointCheckbox.addEventListener("change", () => {
  blockInputs.end.disabled = pointCheckbox.checked;
  validateBlockForm();
});

function renderBuilderBlocks() {
  const list = document.getElementById("builder-blocks");
  list.innerHTML = "";
  if (builderBlocks.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No blocks yet. Add the first one below.";
    list.appendChild(empty);
    return;
  }

  builderBlocks.forEach((block, i) => {
    const row = document.createElement("div");
    row.className = "block-item";

    const time = document.createElement("span");
    time.className = "block-time";
    time.textContent = block.end !== undefined ? `${block.start}-${block.end}` : `${block.start} (point)`;

    const text = document.createElement("span");
    text.className = "block-text";
    text.textContent = `${block.title} · ${block.color}${block.details ? ` · ${block.details}` : ""}`;
    text.title = text.textContent;

    const remove = document.createElement("button");
    remove.className = "block-remove";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      builderBlocks.splice(i, 1);
      renderBuilderBlocks();
    });

    row.append(time, text, remove);
    list.appendChild(row);
  });
}

// Blocks are kept sorted by start time, so the list always reads in the
// order the bells will ring.
function addBuilderBlock(block) {
  const clean = { ...block, title: block.title.trim(), details: block.details.trim() };
  const at = builderBlocks.findIndex((b) => b.start > clean.start);
  builderBlocks.splice(at === -1 ? builderBlocks.length : at, 0, clean);
  renderBuilderBlocks();
}

blockAddBtn.addEventListener("click", async () => {
  const block = readBlockForm();
  const { errors } = await window.api.validateBlock(block);
  if (errors.length > 0) return;
  addBuilderBlock(block);

  // Next block usually starts right after this one, so keep the color and
  // move the start time on; clear the rest.
  blockInputs.title.value = "";
  blockInputs.details.value = "";
  blockInputs.start.value = block.end || block.start;
  blockInputs.end.value = "";
  pointCheckbox.checked = false;
  blockInputs.end.disabled = false;
  touched.clear();
  validateBlockForm();
  blockInputs.title.focus();
});

function showBuilderError(messages) {
  const box = document.getElementById("builder-error");
  box.textContent = messages.join("\n");
  box.hidden = messages.length === 0;
}

document.getElementById("builder-preview-btn").addEventListener("click", async () => {
  const label = document.getElementById("builder-label").value;
  const result = await window.api.previewSchedule(label, builderBlocks);
  if (!result.ok) {
    showBuilderError(result.errors);
    return;
  }
  showBuilderError([]);

  document.getElementById("preview-heading").textContent =
    `${label.trim()}: ${result.events.length} bells`;
  const list = document.getElementById("preview-list");
  list.innerHTML = "";
  for (const event of result.events) {
    const row = document.createElement("div");
    const isAuto = event.color === "Grey" && (event.title === "Pass" || event.title === "Dismissal");
    row.className = isAuto ? "review-item auto" : "review-item";
    const left = document.createElement("span");
    left.textContent = `${event.start}  ${event.title}`;
    const right = document.createElement("span");
    right.className = "review-schedule";
    right.textContent = `${event.color} · ${event.details}`;
    row.append(left, right);
    list.appendChild(row);
  }
  document.getElementById("preview-error").hidden = true;
  showScreen("screen-builder-preview");
});

document.getElementById("builder-save-btn").addEventListener("click", async () => {
  const saveBtn = document.getElementById("builder-save-btn");
  const label = document.getElementById("builder-label").value;
  saveBtn.disabled = true;
  try {
    const result = await window.api.saveSchedule(label, builderBlocks);
    if (!result.ok) {
      const box = document.getElementById("preview-error");
      box.textContent = result.errors.join("\n");
      box.hidden = false;
      return;
    }
    applyScheduleMenu(result.menu);

    builderBlocks.length = 0;
    renderBuilderBlocks();
    document.getElementById("builder-label").value = "";
    for (const input of Object.values(blockInputs)) {
      if (input.tagName === "INPUT") input.value = "";
    }
    touched.clear();

    const notice = document.getElementById("mode-notice");
    notice.textContent = `Saved "${label.trim()}". It's now in the schedule list.`;
    notice.hidden = false;
    showScreen("screen-mode");
  } finally {
    saveBtn.disabled = false;
  }
});

renderBuilderBlocks();

// --- review screen ---------------------------------------------------------

function showReview() {
  const list = document.getElementById("review-list");
  list.innerHTML = "";
  let total = 0;

  for (const { date, scheduleKey } of pendingAssignments) {
    const item = scheduleMenu.items.find((i) => i.key === scheduleKey);
    total += item ? item.eventCount : 0;

    const row = document.createElement("div");
    row.className = "review-item";
    const left = document.createElement("span");
    left.textContent = date;
    const right = document.createElement("span");
    right.className = "review-schedule";
    right.textContent = item ? `${item.label} (${item.eventCount})` : scheduleKey;
    row.appendChild(left);
    row.appendChild(right);
    list.appendChild(row);
  }

  document.getElementById("review-total").textContent =
    `${pendingAssignments.length} day(s), ${total} events total`;
  showScreen("screen-review");
}

document.getElementById("review-back").addEventListener("click", () => {
  showScreen(reviewOrigin);
});

// --- progress screen ---------------------------------------------------------

function appendProgressLine(p, multiDate) {
  const log = document.getElementById("progress-log");
  const line = document.createElement("div");

  if (p.type === "date-start") {
    line.className = "line heading";
    line.textContent = `${p.date} — ${p.label}`;
  } else if (p.type === "event-start") {
    line.className = "line";
    const overallSuffix = multiDate ? ` (${p.overallIndex}/${p.totalEvents} overall)` : "";
    line.textContent = `Creating ${p.index}/${p.countForDate}${overallSuffix}: ${p.event.title} @ ${p.event.start}`;
  } else if (p.type === "event-fail") {
    line.className = "line fail";
    line.textContent = `FAILED: ${p.error}`;
  } else {
    return; // event-ok: no separate line, matches the CLI's terse output
  }

  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
}

document.getElementById("review-confirm-btn").addEventListener("click", async () => {
  showScreen("screen-progress");
  const log = document.getElementById("progress-log");
  const summary = document.getElementById("progress-summary");
  const doneBtn = document.getElementById("progress-done-btn");
  log.innerHTML = "";
  summary.hidden = true;
  doneBtn.hidden = true;
  document.getElementById("progress-heading").textContent = "Creating events…";

  const multiDate = pendingAssignments.length > 1;
  const unsubscribe = window.api.onCreateProgress((p) => appendProgressLine(p, multiDate));

  const result = await window.api.createEvents(pendingAssignments);
  unsubscribe();

  document.getElementById("progress-heading").textContent = "Done";

  if (result.ok) {
    summary.className = "progress-summary success";
    summary.textContent = `Succeeded: ${result.succeeded}/${result.totalEvents}. All events created successfully.`;
  } else if (result.haltedOn) {
    summary.className = "progress-summary fail";
    summary.textContent =
      `Succeeded: ${result.succeeded}/${result.totalEvents}. ` +
      `Failed: ${result.haltedOn}. Run halted — Edge left open for inspection.`;
  } else {
    summary.className = "progress-summary fail";
    summary.textContent = result.error || "Something went wrong.";
  }
  summary.hidden = false;
  doneBtn.hidden = false;
});

document.getElementById("progress-done-btn").addEventListener("click", () => {
  pendingAssignments = [];
  document.getElementById("range-table-wrap").hidden = true;
  document.querySelector("#range-table tbody").innerHTML = "";
  document.getElementById("range-start").value = "";
  document.getElementById("range-end").value = "";
  document.getElementById("single-date").value = "";
  showScreen("screen-mode");
});

// --- wire up + boot ---------------------------------------------------------

schoolSelect.addEventListener("change", onSchoolChange);
connectBtn.addEventListener("click", onConnectClick);

// Last-resort safety net: an error anywhere that isn't already handled by
// a local try/catch should never leave the UI silently stuck with no
// feedback — surface it wherever the connect screen's error box is
// visible, since that's the one place always present regardless of which
// screen is showing.
window.addEventListener("unhandledrejection", (e) => {
  console.error(e.reason);
  showConnectError(`Unexpected error: ${e.reason && e.reason.message ? e.reason.message : e.reason}`);
});
window.addEventListener("error", (e) => {
  console.error(e.error);
  showConnectError(`Unexpected error: ${e.message}`);
});

loadSchools();
