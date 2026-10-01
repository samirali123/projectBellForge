// main.js — Electron main process.
//
// This is the "home" that launches/attaches to Edge, replacing the manual
// Bells.command dance with buttons. It's a thin shell around the same
// engine/ code the CLI uses — school-loader.js, school-auth.js, and each
// school's platform engine (connect()/createEvent()) are all reused
// as-is, not reimplemented here.

const { app, BrowserWindow, ipcMain, dialog, nativeTheme } = require("electron");
const path = require("path");
const os = require("os");
const fs = require("fs");
const net = require("net");
const { execFile, spawn } = require("child_process");

// engine/ and schools/ live at the repo root, not under app/. In dev
// they're found via ../engine relative to this file; a packaged build
// copies them into resources/ instead (see app/package.json "build" ->
// extraResources), so resolve based on app.isPackaged.
function resourcePath(...parts) {
  const base = app.isPackaged ? process.resourcesPath : path.join(__dirname, "..");
  return path.join(base, ...parts);
}

const { listSchools, loadSchool } = require(resourcePath("engine", "school-loader"));
const { verifyPassword } = require(resourcePath("engine", "school-auth"));
const { createEvents } = require(resourcePath("engine", "create-events"));
const { validateBlock, validateSchedule, expandBlocks } = require(resourcePath("engine", "schedule-expand"));
const { normalizeBlock, saveCustomSchedule, deleteCustomSchedule } = require(
  resourcePath("engine", "custom-schedules")
);
const { parseScheduleCsv } = require(resourcePath("engine", "schedule-csv"));

const CDP_PORT = 9222;
const EDGE_PROFILE = path.join(os.homedir(), "edge-cyberdata-debug");
const PORT_WAIT_RETRIES = 10;
const PORT_WAIT_DELAY_MS = 1000;

let mainWindow;

// The connected school's live session — set once by launch-and-connect,
// read by every screen after that (schedule menu, event creation). There's
// only ever one active connection at a time, matching the CLI's model.
let currentSession = null;

// The packaged app gets its icon from the build (app/build/, see
// package.json "build"). When running unpacked with `npm start`, Electron
// would otherwise show its own logo in the Dock and taskbar, so set it here.
const DEV_ICON = path.join(__dirname, "build", process.platform === "darwin" ? "icon-mac.png" : "icon.png");

function createWindow() {
  if (!app.isPackaged && process.platform === "darwin" && fs.existsSync(DEV_ICON)) {
    app.dock.setIcon(DEV_ICON);
  }

  mainWindow = new BrowserWindow({
    width: 480,
    height: 680,
    minWidth: 420,
    minHeight: 520,
    resizable: true,
    title: "BellForge",
    ...(!app.isPackaged && fs.existsSync(DEV_ICON) ? { icon: DEV_ICON } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
}

// --- appearance -----------------------------------------------------------
// "system" follows the OS; "light"/"dark" override it. Setting
// nativeTheme.themeSource is what drives the renderer's
// prefers-color-scheme, so the CSS needs no theme logic of its own.
const THEMES = ["system", "light", "dark"];

function settingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsPath(), "utf8"));
  } catch {
    return {};
  }
}

function writeSettings(settings) {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2) + "\n");
}

ipcMain.handle("get-theme", () => nativeTheme.themeSource);

ipcMain.handle("set-theme", (event, { theme }) => {
  if (!THEMES.includes(theme)) return { ok: false };
  nativeTheme.themeSource = theme;
  try {
    writeSettings({ ...readSettings(), theme });
  } catch {
    // Not being able to remember the choice shouldn't stop it applying now.
  }
  return { ok: true, theme };
});

app.whenReady().then(() => {
  const { theme } = readSettings();
  if (THEMES.includes(theme)) nativeTheme.themeSource = theme;
  createWindow();
});
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

// Windows install locations for msedge.exe, checked before falling back
// to the registry App Paths key — Edge usually isn't on PATH by default.
const WIN_EDGE_PATHS = [
  path.join(process.env["ProgramFiles(x86)"] || "", "Microsoft", "Edge", "Application", "msedge.exe"),
  path.join(process.env["ProgramFiles"] || "", "Microsoft", "Edge", "Application", "msedge.exe"),
  path.join(process.env["LocalAppData"] || "", "Microsoft", "Edge", "Application", "msedge.exe"),
];

async function findWindowsEdgePath() {
  for (const candidate of WIN_EDGE_PATHS) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }

  const { stdout } = await runCommand("reg", [
    "query",
    "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\msedge.exe",
    "/ve",
  ]);
  const match = stdout && stdout.match(/REG_SZ\s+(.+)$/m);
  if (match) return match[1].trim();

  throw new Error("Couldn't find msedge.exe. Make sure Microsoft Edge is installed.");
}

// Force-quit any running Edge, then launch fresh with the debug flag — a
// browser only actually opens its debug port on a genuinely clean launch
// (see Bells.command for the same logic/reasoning on macOS).
//
// targetUrl is passed as a launch argument so Edge opens directly on the
// school's IP, instead of opening blank and relying on a post-attach
// page.goto(). The omnibox is native browser chrome outside the page DOM —
// Playwright/CDP can't type into it — so a launch-time URL argument is the
// only way to land there without a human pasting it in by hand.
async function relaunchEdgeWithDebugging(sendStatus, targetUrl) {
  const edgeArgs = [`--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${EDGE_PROFILE}`, targetUrl];

  sendStatus("Quitting any running Edge window...");
  if (process.platform === "darwin") {
    await runCommand("osascript", ["-e", 'quit app "Microsoft Edge"']);
    await sleep(1500);
    await runCommand("pkill", ["-f", "Microsoft Edge"]);
    await sleep(500);

    sendStatus("Launching Edge with remote debugging...");
    spawn("open", ["-a", "Microsoft Edge", "--args", ...edgeArgs], {
      detached: true,
      stdio: "ignore",
    }).unref();
  } else if (process.platform === "win32") {
    await runCommand("taskkill", ["/IM", "msedge.exe", "/F"]);
    await sleep(1000);

    const edgePath = await findWindowsEdgePath();
    sendStatus("Launching Edge with remote debugging...");
    spawn(edgePath, edgeArgs, { detached: true, stdio: "ignore" }).unref();
  } else {
    throw new Error(`Unsupported platform: ${process.platform}. BellForge only runs on macOS and Windows.`);
  }

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
        `Can't reach ${config.cyberDataHost}. Make sure you're on ${school.name}'s ` +
          `network or VPN, then try again.`
      );
    }

    await relaunchEdgeWithDebugging(sendStatus, config.calendarUrl);

    sendStatus("Attaching to Edge...");
    const { page } = await connect();

    // Belt-and-suspenders: Edge was already launched pointed at
    // calendarUrl, so this is normally a no-op. Kept as a fallback in
    // case the launch-argument URL didn't take for some reason.
    sendStatus("Opening the calendar...");
    await page.goto(config.calendarUrl, { waitUntil: "domcontentloaded" });

    currentSession = {
      schoolId,
      schoolName: school.name,
      page,
      order: loaded.order,
      schedules: loaded.schedules,
      customKeys: loaded.customKeys,
      warnings: loaded.warnings,
      // New schedules use CyberData's real color-picker labels.
      colorKeys: loaded.pickerColors,
      createEvent: loaded.createEvent,
    };

    sendStatus("Ready. Log into the calendar in the Edge window, then continue there.");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

function scheduleMenu() {
  const items = currentSession.order.map((key) => ({
    key,
    label: currentSession.schedules[key].label,
    eventCount: currentSession.schedules[key].events.length,
    custom: currentSession.customKeys.includes(key),
  }));
  return {
    ok: true,
    schoolName: currentSession.schoolName,
    items,
    colors: currentSession.colorKeys,
    warnings: currentSession.warnings,
  };
}

ipcMain.handle("get-schedule-menu", () => {
  if (!currentSession) return { ok: false, error: "Not connected to a school yet." };
  return scheduleMenu();
});

// --- schedule builder ------------------------------------------------------
// All validation and expansion happens here in the main process, through
// engine/schedule-expand.js, so the renderer never has its own copy of the
// rules that could drift from what the engine enforces.

ipcMain.handle("validate-block", (event, { block }) => {
  if (!currentSession) return { errors: [{ field: "title", message: "Not connected to a school yet." }] };
  return { errors: validateBlock(normalizeBlock(block), currentSession.colorKeys) };
});

ipcMain.handle("preview-schedule", (event, { label, blocks }) => {
  if (!currentSession) return { ok: false, errors: ["Not connected to a school yet."] };
  const clean = { label: (label || "").trim(), blocks: (blocks || []).map(normalizeBlock) };
  const errors = validateSchedule(clean, currentSession.colorKeys);
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, events: expandBlocks(clean.blocks) };
});

// Fills the builder's block list from a CSV file. Never saves anything:
// the blocks go back to the builder and still have to pass Preview.
ipcMain.handle("import-schedule-csv", async () => {
  if (!currentSession) return { ok: false, errors: ["Not connected to a school yet."] };
  const pick = await dialog.showOpenDialog(mainWindow, {
    title: "Import schedule blocks",
    filters: [{ name: "CSV", extensions: ["csv"] }],
    properties: ["openFile"],
  });
  if (pick.canceled || pick.filePaths.length === 0) return { ok: false, canceled: true };

  const file = pick.filePaths[0];
  try {
    const { blocks, errors } = parseScheduleCsv(fs.readFileSync(file, "utf8"), currentSession.colorKeys);
    return { ok: errors.length === 0, blocks, errors, fileName: path.basename(file, path.extname(file)) };
  } catch (err) {
    return { ok: false, errors: [`Couldn't read ${path.basename(file)}: ${err.message}`] };
  }
});

// Saves a copy of this school's pre-filled CSV template wherever the user
// picks, so they have something to fill out instead of guessing columns.
ipcMain.handle("save-csv-template", async () => {
  if (!currentSession) return { ok: false, error: "Not connected to a school yet." };
  const template = resourcePath("schools", currentSession.schoolId, "schedule-import-template.csv");
  if (!fs.existsSync(template)) return { ok: false, error: "This school doesn't have a CSV template yet." };

  const pick = await dialog.showSaveDialog(mainWindow, {
    title: "Save CSV template",
    defaultPath: path.join(app.getPath("documents"), "schedule-import-template.csv"),
    filters: [{ name: "CSV", extensions: ["csv"] }],
  });
  if (pick.canceled || !pick.filePath) return { ok: false, canceled: true };
  try {
    fs.copyFileSync(template, pick.filePath);
    return { ok: true, filePath: pick.filePath };
  } catch (err) {
    return { ok: false, error: `Couldn't save the template: ${err.message}` };
  }
});

ipcMain.handle("save-schedule", (event, { label, blocks }) => {
  if (!currentSession) return { ok: false, errors: ["Not connected to a school yet."] };
  try {
    const result = saveCustomSchedule(
      currentSession.schoolId,
      { label, blocks },
      { takenKeys: Object.keys(currentSession.schedules), colorKeys: currentSession.colorKeys }
    );
    if (!result.ok) return result;
    reloadSchedules();
    return { ok: true, key: result.key, menu: scheduleMenu() };
  } catch (err) {
    return { ok: false, errors: [`Couldn't save: ${err.message}`] };
  }
});

// Deletes one schedule added through the builder. Built-in schedules can't
// be deleted (deleteCustomSchedule only looks in custom-schedules.json).
// This only removes the schedule type from BellForge; it never touches
// events already created in CyberData.
ipcMain.handle("delete-schedule", (event, { key }) => {
  if (!currentSession) return { ok: false, error: "Not connected to a school yet." };
  if (!currentSession.customKeys.includes(key)) {
    return { ok: false, error: "Only schedules you added can be deleted." };
  }
  try {
    const result = deleteCustomSchedule(currentSession.schoolId, key);
    if (!result.ok) return result;
    reloadSchedules();
    return { ok: true, label: result.label, menu: scheduleMenu() };
  } catch (err) {
    return { ok: false, error: `Couldn't delete: ${err.message}` };
  }
});

// Re-reads schedules through exactly the same load path the CLI and the
// next app launch use. Only schedule data is swapped in; the live Edge
// connection is kept.
function reloadSchedules() {
  const reloaded = loadSchool(currentSession.schoolId);
  currentSession.order = reloaded.order;
  currentSession.schedules = reloaded.schedules;
  currentSession.customKeys = reloaded.customKeys;
  currentSession.warnings = reloaded.warnings;
}

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
