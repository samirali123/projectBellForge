// preload.js — the only bridge between the renderer (untrusted web content)
// and the main process (full Node access). Exposes a narrow, named API
// instead of giving the renderer direct access to ipcRenderer/Node.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  listSchools: () => ipcRenderer.invoke("list-schools"),
  checkPassword: (schoolId, password) =>
    ipcRenderer.invoke("check-password", { schoolId, password }),
  checkReachable: (schoolId) => ipcRenderer.invoke("check-reachable", { schoolId }),
  launchAndConnect: (schoolId) => ipcRenderer.invoke("launch-and-connect", { schoolId }),
  onStatus: (callback) => {
    const listener = (event, text) => callback(text);
    ipcRenderer.on("status-update", listener);
    return () => ipcRenderer.removeListener("status-update", listener);
  },
});
