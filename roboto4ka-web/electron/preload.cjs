// Preload — мост между renderer (React) и main (Node).
// Открывает безопасный API через window.electron.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  onOpenFile: (callback) => {
    ipcRenderer.on("open-file", (_evt, filePath) => callback(filePath));
  },
  readFile: (filePath) => ipcRenderer.invoke("read-file", filePath),
});
