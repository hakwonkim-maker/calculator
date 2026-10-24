// 렌더러에 노출하는 최소한의 안전한 API
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('mfApi', {
  pickFolder: () => ipcRenderer.invoke('dialog:pickFolder'),
  pickPhotos: () => ipcRenderer.invoke('dialog:pickPhotos'),
  pickAudio: () => ipcRenderer.invoke('dialog:pickAudio'),
  pickImage: () => ipcRenderer.invoke('dialog:pickImage'),
  saveVideoDialog: (name) => ipcRenderer.invoke('dialog:saveVideo', name),
  scanPaths: (paths, recursive) => ipcRenderer.invoke('scan:paths', paths, recursive),
  saveProject: (json, path, name) => ipcRenderer.invoke('project:save', json, path, name),
  openProject: () => ipcRenderer.invoke('project:open'),
  exists: (paths) => ipcRenderer.invoke('fs:exists', paths),
  showItem: (p) => ipcRenderer.invoke('shell:showItem', p),
  openPath: (p) => ipcRenderer.invoke('shell:openPath', p),
  info: () => ipcRenderer.invoke('app:info'),
  exportStart: (opts) => ipcRenderer.invoke('export:start', opts),
  exportFrame: (data) => ipcRenderer.invoke('export:frame', data),
  exportFinish: () => ipcRenderer.invoke('export:finish'),
  exportCancel: () => ipcRenderer.invoke('export:cancel'),
  pathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return null;
    }
  },
});
