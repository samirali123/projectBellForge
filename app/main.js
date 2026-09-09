// main.js — Electron main process.
//
// This is the "home" that launches/attaches to Edge, replacing the manual
// Bells.command dance with buttons. It's a thin shell around the same
// engine/ code the CLI uses — school-loader.js, school-auth.js, and each
// school's platform engine (connect()/createEvent()) are all reused
// as-is, not reimplemented here.

const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const os = require("os");
const net = require("net");
const { execFile, spawn } = require("child_process");

const { listSchools, loadSchool } = require("../engine/school-loader");
const { verifyPassword } = require("../engine/school-auth");
const { createEvents } = require("../engine/create-events");

const CDP_PORT = 9222;
const EDGE_PROFILE = path.join(os.homedir(), "edge-cyberdata-debug");
const PORT_WAIT_RETRIES = 10;
const PORT_WAIT_DELAY_MS = 1000;

let mainWindow;

// The connected school's live session — set once by launch-and-connect,
// read by every screen after that (schedule menu, event creation). There's
// only ever one active connection at a time, matching the CLI's model.
let currentSession = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 480,
    height: 680,
    minWidth: 420,
    minHeight: 520,
    resizable: true,
    title: "BellForge",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// --- helpers -----------------------------------------------------------

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runCommand(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, (err, stdout, stderr) => resolve({ err, stdout, stderr }));
  });
}

function isPortOpen(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, host);
  });
}

async function waitForPort(host, port, retries, delayMs, timeoutMs = 800) {
  for (let i = 0; i < retries; i++) {
    if (await isPortOpen(host, port, timeoutMs)) return true;
    await sleep(delayMs);
  }
  return false;
}

// A single 2.5s check was producing false negatives — likely too tight a
// timeout for a VPN's higher latency, and no retry meant one slow beat was
// enough to wrongly report "unreachable". Retry with backoff instead (same
// pattern as the CDP port wait above).
function isSchoolReachable(config) {
  return waitForPort(config.cyberDataHost, 443, 3, 1000, 1500);
}

// Force-quit any running Edge, then launch fresh with the debug flag — a
// browser only actually opens its debug port on a genuinely clean launch
// (see Bells.command for the same logic/reasoning).
//
// targetUrl is passed as a launch argument so Edge opens directly on the
// school's IP, instead of opening blank and relying on a post-attach
// page.goto(). The omnibox is native browser chrome outside the page DOM —
// Playwright/CDP can't type into it — so a launch-time URL argument is the
// only way to land there without a human pasting it in by hand.
async function relaunchEdgeWithDebugging(sendStatus, targetUrl) {
  sendStatus("Quitting any running Edge window...");
  await runCommand("osascript", ["-e", 'quit app "Microsoft Edge"']);
  await sleep(1500);
  await runCommand("pkill", ["-f", "Microsoft Edge"]);
  await sleep(500);

  sendStatus("Launching Edge with remote debugging...");
  spawn(
    "open",
    [
      "-a",
      "Microsoft Edge",
      "--args",
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${EDGE_PROFILE}`,
      targetUrl,
    ],
    { detached: true, stdio: "ignore" }
  ).unref();

  const ok = await waitForPort("localhost", CDP_PORT, PORT_WAIT_RETRIES, PORT_WAIT_DELAY_MS);
  if (!ok) {
    throw new Error(`Edge still isn't listening on port ${CDP_PORT} after a clean relaunch.`);
  }
}

// --- IPC handlers --------------------------------------------------------

ipcMain.handle("list-schools", () => {
  return listSchools().map((s) => ({ id: s.id, name: s.name }));
});

ipcMain.handle("check-password", (event, { schoolId, password }) => {
  const school = listSchools().find((s) => s.id === schoolId);
  if (!school) return { ok: false, error: "Unknown school." };
  if (!school.passwordHash || !school.passwordSalt) {
    return { ok: false, error: `${school.name} has no password set.` };
  }
  const ok = verifyPassword(password, school.passwordSalt, school.passwordHash);
  return ok ? { ok: true } : { ok: false, error: "Incorrect password." };
});

ipcMain.handle("check-reachable", async (event, { schoolId }) => {
  const school = listSchools().find((s) => s.id === schoolId);
  if (!school) return { reachable: false, error: "Unknown school." };
  const { config } = loadSchool(schoolId);
  const reachable = await isSchoolReachable(config);
  return { reachable, host: config.cyberDataHost };
});

ipcMain.handle("launch-and-connect", async (event, { schoolId }) => {
  const sendStatus = (text) => event.sender.send("status-update", text);

  try {
    const school = listSchools().find((s) => s.id === schoolId);
    if (!school) throw new Error("Unknown school.");
    const loaded = loadSchool(schoolId);
    const { config, connect } = loaded;

    sendStatus(`Checking whether ${config.cyberDataHost} is reachable...`);
    const reachable = await isSchoolReachable(config);
    if (!reachable) {
      throw new Error(
        `Can't reach ${config.cyberDataHost} — make sure you're on ${school.name}'s ` +
          `network or VPN, then try again.`
      );
    }

    await relaunchEdgeWithDebugging(sendStatus, config.calendarUrl);

    sendStatus("Attaching to Edge...");
    const { page } = await connect();

    // Belt-and-suspenders: Edge was already launched pointed at
    // calendarUrl, so this is normally a no-op. Kept as a fallback in
    // case the launch-argument URL didn't take for some reason.
    sendStatus("Opening CyberData...");
    await page.goto(config.calendarUrl, { waitUntil: "domcontentloaded" });

    currentSession = {
      schoolId,
      schoolName: school.name,
      page,
      order: loaded.order,
      schedules: loaded.schedules,
      createEvent: loaded.createEvent,
    };

    sendStatus("Ready — log into CyberData in the Edge window, then continue there.");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("get-schedule-menu", () => {
  if (!currentSession) return { ok: false, error: "Not connected to a school yet." };
  const items = currentSession.order.map((key) => ({
    key,
    label: currentSession.schedules[key].label,
    eventCount: currentSession.schedules[key].events.length,
  }));
  return { ok: true, schoolName: currentSession.schoolName, items };
});

ipcMain.handle("create-events", async (event, { assignments }) => {
  if (!currentSession) return { ok: false, error: "Not connected to a school yet." };
  if (!Array.isArray(assignments) || assignments.length === 0) {
    return { ok: false, error: "Nothing to create." };
  }

  const sendProgress = (p) => event.sender.send("create-progress", p);

  try {
    const { succeeded, totalEvents, haltedOn } = await createEvents({
      page: currentSession.page,
      schedules: currentSession.schedules,
      createEvent: currentSession.createEvent,
      assignments,
      onProgress: sendProgress,
    });
    return { ok: !haltedOn, succeeded, totalEvents, haltedOn };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
