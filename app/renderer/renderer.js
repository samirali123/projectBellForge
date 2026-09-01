const schoolSelect = document.getElementById("school-select");
const networkStatus = document.getElementById("network-status");
const networkText = networkStatus.querySelector(".network-text");
const passwordInput = document.getElementById("password");
const connectBtn = document.getElementById("connect-btn");
const errorBox = document.getElementById("error");
const logBox = document.getElementById("log");

let selectedSchoolId = null;
let unsubscribeStatus = null;

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function clearError() {
  errorBox.hidden = true;
  errorBox.textContent = "";
}

function resetLog() {
  logBox.innerHTML = "";
  logBox.hidden = true;
}

function appendLog(text, kind) {
  logBox.hidden = false;
  const line = document.createElement("div");
  line.className = kind ? `line ${kind}` : "line";
  line.textContent = text;
  logBox.appendChild(line);
  logBox.scrollTop = logBox.scrollHeight;
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
  clearError();
  resetLog();
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
  clearError();
  resetLog();

  if (!selectedSchoolId) return;
  const password = passwordInput.value;
  if (!password) {
    showError("Enter this school's password.");
    return;
  }

  connectBtn.disabled = true;
  connectBtn.textContent = "Checking password…";

  const passwordResult = await window.api.checkPassword(selectedSchoolId, password);
  if (!passwordResult.ok) {
    showError(passwordResult.error);
    connectBtn.disabled = false;
    connectBtn.textContent = "Connect";
    return;
  }

  connectBtn.textContent = "Connecting…";

  if (unsubscribeStatus) unsubscribeStatus();
  unsubscribeStatus = window.api.onStatus((text) => appendLog(text));

  const result = await window.api.launchAndConnect(selectedSchoolId);

  if (unsubscribeStatus) {
    unsubscribeStatus();
    unsubscribeStatus = null;
  }

  if (result.ok) {
    appendLog("Connected.", "success");
    connectBtn.textContent = "Connected";
  } else {
    showError(result.error);
    connectBtn.disabled = false;
    connectBtn.textContent = "Connect";
  }
}

schoolSelect.addEventListener("change", onSchoolChange);
connectBtn.addEventListener("click", onConnectClick);

loadSchools();
