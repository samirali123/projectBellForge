// render-icons.js
//
// Rasterizes the BellForge app-icon SVG into the PNGs electron-builder and
// the dev-mode Dock/window icon use. Run with Electron (it does the SVG
// rendering, so no extra tools are needed):
//
//   app/node_modules/.bin/electron tools/render-icons.js
//
// Outputs:
//   app/build/icon.png      1024x1024, full-bleed tile (Windows installer/taskbar)
//   app/build/icon-mac.png  1024x1024, tile inset to Apple's 824px icon grid
//                           with a transparent margin, so it sits at the same
//                           visual size as other apps in the Dock
//   app/renderer/assets/bellforge-logo-on-{light,dark}.png  copies of the
//                           full lockups for the in-app header (the renderer
//                           can't load files outside app/). The lockups
//                           themselves come from tools/extract-wordmark.py.
//
// branding/logo/ is the source of truth; re-run this after changing it.

const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SVG = fs.readFileSync(path.join(ROOT, "branding", "logo", "bellforge-app-icon.svg"), "utf8");
const OUT = path.join(ROOT, "app", "build");

app.disableHardwareAcceleration();
// Each icon gets its own throwaway window; closing one mustn't quit the app
// before the next is rendered.
app.on("window-all-closed", () => {});

async function render(file, size, inset) {
  const win = new BrowserWindow({
    width: size,
    height: size,
    show: false,
    transparent: true,
    frame: false,
    useContentSize: true,
    webPreferences: { offscreen: true },
  });
  win.webContents.setZoomFactor(1);
  const tile = size - inset * 2;
  const html = `<!doctype html><html><body style="margin:0;background:transparent">
    <img src="data:image/svg+xml;base64,${Buffer.from(SVG).toString("base64")}"
         style="position:absolute;left:${inset}px;top:${inset}px;width:${tile}px;height:${tile}px">
  </body></html>`;
  await win.loadURL(`data:text/html;base64,${Buffer.from(html).toString("base64")}`);
  await new Promise((r) => setTimeout(r, 300));
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size });
  const png = image.resize({ width: size, height: size }).toPNG();
  fs.writeFileSync(path.join(OUT, file), png);
  win.destroy();
  console.log(`wrote app/build/${file} (${size}x${size})`);
}

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await render("icon.png", 1024, 0);
  await render("icon-mac.png", 1024, 100);

  const assets = path.join(ROOT, "app", "renderer", "assets");
  fs.mkdirSync(assets, { recursive: true });
  for (const file of ["bellforge-logo-on-light.png", "bellforge-logo-on-dark.png"]) {
    fs.copyFileSync(path.join(ROOT, "branding", "logo", file), path.join(assets, file));
    console.log(`wrote app/renderer/assets/${file}`);
  }
  app.quit();
});
