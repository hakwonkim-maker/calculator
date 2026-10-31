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
  openProject: (p) => ipcRenderer.invoke('project:open', p),
  pendingOpen: () => ipcRenderer.invoke('app:pendingOpen'),
  onOpenFile: (fn) => ipcRenderer.on('app:open-file', (_e, p) => fn(p)),
  exists: (paths) => ipcRenderer.invoke('fs:exists', paths),
  showItem: (p) => ipcRenderer.invoke('shell:showItem', p),
  openPath: (p) => ipcRenderer.invoke('shell:openPath', p),
  info: () => ipcRenderer.invoke('app:info'),
  exportStart: (opts) => ipcRenderer.invoke('export:start', opts),
  exportEncoders: () => ipcRenderer.invoke('export:encoders'),
  exportProgress: (r) => ipcRenderer.invoke('export:progress', r),
  notifyDone: (title, body) => ipcRenderer.invoke('export:notifyDone', title, body),
  freeSpace: (p) => ipcRenderer.invoke('fs:free', p),
  exportFrame: (data) => ipcRenderer.invoke('export:frame', data),
  exportFinish: () => ipcRenderer.invoke('export:finish'),
  exportCancel: () => ipcRenderer.invoke('export:cancel'),
  setDirty: (v) => ipcRenderer.invoke('app:dirty', v),
  quitNow: () => ipcRenderer.invoke('app:quitNow'),
  onSaveAndQuit: (fn) => ipcRenderer.on('app:save-and-quit', () => fn()),
  openLogs: () => ipcRenderer.invoke('app:openLogs'),
  log: (...a) => ipcRenderer.invoke('app:log', ...a),
  notices: () => ipcRenderer.invoke('app:notices'),
  relinkPhotos: (missing, folder) => ipcRenderer.invoke('photos:relink', missing, folder),
  onScanProgress: (fn) => {
    const h = (_e, n) => fn(n);
    ipcRenderer.on('scan:progress', h);
    return () => ipcRenderer.removeListener('scan:progress', h);
  },
  photoDates: (paths) => ipcRenderer.invoke('photos:dates', paths),
  musicLibrary: () => ipcRenderer.invoke('music:library'),
  musicFetchOnline: () => ipcRenderer.invoke('music:fetchOnline'),
  musicDownload: (id) => ipcRenderer.invoke('music:download', id),
  pathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return null;
    }
  },
});
