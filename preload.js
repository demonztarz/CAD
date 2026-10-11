const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  openDialog: () => ipcRenderer.invoke('open-dialog'),
  openPath: (p) => ipcRenderer.invoke('open-path', p),
  pathForFile: (file) => (webUtils && webUtils.getPathForFile ? webUtils.getPathForFile(file) : null),
  saveDialog: (defaultName, filters) => ipcRenderer.invoke('save-dialog', { defaultName, filters }),
  writeFile: (path, data, encoding) => ipcRenderer.invoke('write-file', { path, data, encoding }),
  plot: (opts) => ipcRenderer.invoke('plot', opts),
  confirmDiscard: () => ipcRenderer.invoke('confirm-discard'),
  setTitle: (t) => ipcRenderer.send('set-title', t),
  reallyClose: () => ipcRenderer.send('really-close'),
  onMenu: (fn) => ipcRenderer.on('menu', (_e, cmd) => fn(cmd)),
  onFileOpened: (fn) => ipcRenderer.on('file-opened', (_e, f) => fn(f)),
});
