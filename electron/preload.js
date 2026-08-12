const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  download: (id, url, options) => ipcRenderer.send('start-download', id, url, options),
  onDownloadProgress: (callback) => ipcRenderer.on('download-progress', (_event, data) => callback(data)),
  onDownloadDestination: (callback) => ipcRenderer.on('download-destination', (_event, data) => callback(data)),
  onDownloadError: (callback) => ipcRenderer.on('download-error', (_event, data) => callback(data)),
  onDownloadComplete: (callback) => ipcRenderer.on('download-complete', (_event, data) => callback(data)),
  onQuotaUpdated: (callback) => ipcRenderer.on('quota-updated', (_event, data) => callback(data)),
  onLog: (callback) => ipcRenderer.on('log', (_event, data) => callback(data)),
  cancelDownload: (id) => ipcRenderer.send('cancel-download', id),
  pauseDownload: (id) => ipcRenderer.send('pause-download', id),
  resumeDownload: (id) => ipcRenderer.send('resume-download', id),
  checkLive: (url) => ipcRenderer.invoke('check-live', url),
  getVideoInfo: (url, options) => ipcRenderer.invoke('get-video-info', url, options),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  getDownloadsPath: () => ipcRenderer.invoke('get-downloads-path'),
  selectCookieFile: () => ipcRenderer.invoke('select-cookie-file'),
  selectVideoFile: () => ipcRenderer.invoke('select-video-file'),
  ffmpegCut: (options) => ipcRenderer.invoke('ffmpeg-cut', options),
  removeDownload: (id) => ipcRenderer.send('remove-download', id),
  getLicenseStatus: () => ipcRenderer.invoke('get-license-status'),
  activateLicense: (key) => ipcRenderer.invoke('activate-license', key),
  buyLicense: (plan) => ipcRenderer.invoke('buy-license', plan),
  getSavedFolder: () => ipcRenderer.invoke('get-saved-folder'),
  saveOutputFolder: (folder) => ipcRenderer.send('save-output-folder', folder),
  fetchTwitchFollows: (cookiePath) => ipcRenderer.invoke('fetch-twitch-follows', cookiePath)
});
