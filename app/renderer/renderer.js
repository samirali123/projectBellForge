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
let scheduleMenu = null; // { schoolName, items: [{key, label, eventCount}] }
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
    scheduleMenu = menu;
    subtitle.textContent = menu.schoolName;
    populateScheduleSelect(document.getElementById("single-schedule"), false);

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
