// adhoc-sign.js (electron-builder afterPack hook)
//
// Without an Apple Developer ID, electron-builder skips signing and the Mac
// app keeps Electron's original signature, which no longer matches once
// it's renamed to BellForge and our files are added. A downloaded app with
// a broken signature is reported by macOS as "damaged and can't be
// opened", with no way past it.
//
// This re-signs the whole bundle ad hoc (no certificate) after packing and
// before the .dmg/.zip are built. The signature is then valid, so macOS
// shows the normal "Apple could not verify..." prompt instead, which users
// get past once via System Settings > Privacy & Security > Open Anyway.
//
// Skipped when a real signing identity is configured (CSC_LINK / CSC_NAME):
// electron-builder signs properly then.

const { execFileSync } = require("child_process");
const path = require("path");

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== "darwin") return;
  if (process.env.CSC_LINK || process.env.CSC_NAME) return;

  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", app], { stdio: "inherit" });
  execFileSync("codesign", ["--verify", "--deep", "--strict", app], { stdio: "inherit" });
  console.log(`  • ad hoc signed  ${app}`);
};
