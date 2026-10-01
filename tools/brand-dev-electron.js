// brand-dev-electron.js
//
// When BellForge runs unpackaged (`npm start` in app/), it runs inside the
// Electron.app bundle in node_modules, so macOS shows "Electron" in the Dock
// tooltip and menu bar. This rebrands that development copy:
//
//   - Info.plist CFBundleName / CFBundleDisplayName -> BellForge (menu bar)
//   - re-signs it ad hoc (editing Info.plist breaks the existing signature,
//     and Apple Silicon won't launch an app with a broken one)
//   - renames the bundle folder Electron.app -> BellForge.app (the Dock
//     tooltip uses the folder name) and points electron's path.txt at it
//
// The executable inside stays "Electron" (only visible in Activity
// Monitor); renaming it would also mean renaming Electron's helper apps.
//
// Runs automatically from app/package.json's postinstall, so `npm install`
// keeps the name (if npm re-downloads Electron.app, this renames it again).
// Packaged builds get their name from electron-builder instead. Does
// nothing outside macOS. BELLFORGE_ELECTRON_DIR overrides the electron
// package folder (for testing on a copy).

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const NAME = "BellForge";

if (process.platform !== "darwin") process.exit(0);

const electronDir =
  process.env.BELLFORGE_ELECTRON_DIR || path.join(__dirname, "..", "app", "node_modules", "electron");
const original = path.join(electronDir, "dist", "Electron.app");
const branded = path.join(electronDir, "dist", `${NAME}.app`);
const pathTxt = path.join(electronDir, "path.txt");
const expectedPath = `${NAME}.app/Contents/MacOS/Electron`;
const lsregister =
  "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister";

if (!fs.existsSync(original)) {
  if (fs.existsSync(branded) && fs.readFileSync(pathTxt, "utf8") === expectedPath) {
    console.log(`brand-dev-electron: already branded as ${NAME}.`);
  } else {
    console.log("brand-dev-electron: no Electron.app found, skipping.");
  }
  process.exit(0);
}

const plist = path.join(original, "Contents", "Info.plist");
const has = (key) => {
  try {
    execFileSync("/usr/libexec/PlistBuddy", ["-c", `Print ${key}`, plist], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};
for (const key of ["CFBundleName", "CFBundleDisplayName"]) {
  const cmd = has(key) ? `Set ${key} ${NAME}` : `Add ${key} string ${NAME}`;
  execFileSync("/usr/libexec/PlistBuddy", ["-c", cmd, plist]);
}
execFileSync("codesign", ["--force", "--sign", "-", original], { stdio: "ignore" });

fs.rmSync(branded, { recursive: true, force: true });
fs.renameSync(original, branded);
fs.writeFileSync(pathTxt, expectedPath);

// Make Launch Services (Dock, Finder) pick up the new name right away.
execFileSync(lsregister, ["-f", branded], { stdio: "ignore" });
console.log(`brand-dev-electron: dev Electron.app rebranded as ${NAME}.app.`);
