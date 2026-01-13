const { contextBridge, ipcRenderer, webUtils } = require('electron')

contextBridge.exposeInMainWorld('api', {
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  renderTree: (path) => ipcRenderer.invoke('render-tree', path),
  copyHtml: (html) => ipcRenderer.invoke('copy-html', html),
  copyText: (text) => ipcRenderer.invoke('copy-text', text),
  windowClose: () => ipcRenderer.invoke('window-close'),
  windowMinimize: () => ipcRenderer.invoke('window-minimize'),
  windowToggleMaximize: () => ipcRenderer.invoke('window-toggle-maximize'),
  checkUpdates: () => ipcRenderer.invoke('check-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file)
    } catch (err) {
      return ''
    }
  },
  onUpdateEvent: (callback) => {
    const listener = (_event, data) => callback(data)
    ipcRenderer.on('update-event', listener)
    return () => ipcRenderer.removeListener('update-event', listener)
  },
  safeZip: {
    createJob: (sourcePath) => ipcRenderer.invoke('safezip:create-job', sourcePath),
    analyzeSource: (sourcePath) => ipcRenderer.invoke('safezip:analyze-source', sourcePath),
    copyFiles: (job) => ipcRenderer.invoke('safezip:copy-files', job),
    createZip: (job) => ipcRenderer.invoke('safezip:create-zip', job),
    saveZip: (job) => ipcRenderer.invoke('safezip:save-zip', job),
    cleanup: () => ipcRenderer.invoke('safezip:cleanup'),
    openFolder: (folderPath) => ipcRenderer.invoke('safezip:open-folder', folderPath),
    onCopyProgress: (callback) => {
      const listener = (_event, data) => callback(data)
      ipcRenderer.on('safezip:copy-progress', listener)
      return () => ipcRenderer.removeListener('safezip:copy-progress', listener)
    },
    onZipProgress: (callback) => {
      const listener = (_event, data) => callback(data)
      ipcRenderer.on('safezip:zip-progress', listener)
      return () => ipcRenderer.removeListener('safezip:zip-progress', listener)
    },
  },
  gofile: {
    getServer: () => ipcRenderer.invoke('gofile:get-server'),
    uploadFile: (filePath) => ipcRenderer.invoke('gofile:upload-file', filePath),
    onUploadProgress: (callback) => {
      const listener = (_event, data) => callback(data)
      ipcRenderer.on('gofile:upload-progress', listener)
      return () => ipcRenderer.removeListener('gofile:upload-progress', listener)
    },
  },
  bitly: {
    createShortLink: (longUrl, customAlias) => ipcRenderer.invoke('bitly:create-short-link', longUrl, customAlias),
  },
})
