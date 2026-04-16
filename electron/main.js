const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const YtDlpManager = require('./yt-dlp-manager');

class SimpleStore {
  constructor(name) {
    this.name = name;
  }
  
  get path() {
    return path.join(app.getPath('userData'), `${this.name}.json`);
  }

  get(key, defaultValue) {
    try {
      if (!fs.existsSync(this.path)) return defaultValue;
      const data = JSON.parse(fs.readFileSync(this.path, 'utf8'));
      return data[key] !== undefined ? data[key] : defaultValue;
    } catch (e) {
      return defaultValue;
    }
  }

  set(key, value) {
    try {
      const dir = path.dirname(this.path);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      let data = {};
      if (fs.existsSync(this.path)) {
        try {
          data = JSON.parse(fs.readFileSync(this.path, 'utf8'));
        } catch (err) {
          // empty or corrupted file, ignore
        }
      }
      data[key] = value;
      fs.writeFileSync(this.path, JSON.stringify(data, null, 2));
    } catch (e) {
      // Create a debug fallback to see the error
      try {
        fs.writeFileSync(path.join(app.getPath('desktop'), 'store_error.txt'), e.toString());
      } catch (err2) {}
      console.error('Failed to save store', e);
    }
  }
  
  delete(key) {
    try {
      if (!fs.existsSync(this.path)) return;
      let data = {};
      try {
        data = JSON.parse(fs.readFileSync(this.path, 'utf8'));
      } catch (err) {}
      delete data[key];
      fs.writeFileSync(this.path, JSON.stringify(data, null, 2));
    } catch (e) {}
  }
}

// Force the same consistent userData path across all environments
const appDataPath = path.join(app.getPath('appData'), 'LiveStreamDownloadManager');
app.setPath('userData', appDataPath);

const store = new SimpleStore('config');

const LEMON_API = 'https://api.lemonsqueezy.com/v1/licenses/validate';
const LEMON_KEY = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhdWQiOiI5NGQ1OWNlZi1kYmI4LTRlYTUtYjE3OC1kMjU0MGZjZDY5MTkiLCJqdGkiOiI3MDY2ZmU0OTU0MTJmYjQwOGFkODA5OWQ0NWQ0MWFiZDY1MjVhODI5ZThhYTM4YjNhODk3OTIyMzYxZGJiNjgyNmQ1NzkwZTAzYjg2MTFlMiIsImlhdCI6MTc3NTc0MDQ5My4zMjQwMTIsIm5iZiI6MTc3NTc0MDQ5My4zMjQwMTUsImV4cCI6MTc5MTUwNDAwMC4wMjMwMTgsInN1YiI6IjY4NjczMTAiLCJzY29wZXMiOltdfQ.vr_F5N_Dr1MkyAxyAdxmMmjGxQq9eMBRlnyAdzI-pi8d0E2cf9Lv7aqSWAYcOMrcK9oNp1j7LwTGHEumkNTdh0r-1LGm33vdofpeTnYRmqfoCu16fX4K6_8hbf8Jwjti3htJ10uuFztTDIdzm2oim3NfaYqMxytUm7EYOlHPKSesgURhtZa2ChnWa6lqairHHrMVcHMortNjq7w2q8u2-5YnPtNnW_PWj1aKJM1UacrIOSSAH1457NTl-Z8FuHV5IAnBPK1fkbemBgc3JQqedmog7-IB7eJMIyCCck-5O0JZWp5peBXCLmVz_g_9L711oDIze6o-wjp1zNMJPZ7RtnE3PzCa9v3MXGudKWyA5tnKLoI5CtZQXjB2aaZGL8O4nO9vIoihWoiwSlgKl_g14Ffy-HTfiNzLSPmXgoBia2zFOULB_iVcipejXQMej4SARI9KjHT1OcDk6b69613xZnudhczgVJUvX7VPD7on9WBqVLEARW5R3NCR70tVJ1ij00n2H6nSz55a7A0PjB2DOf1G3YKWTjXjKf-Dl2oFRgKIOyZZllMq7cxh78MHGeO_q3o7CNx_qhBiuQsM5jLxpug7FL7roaUpx9lgPX4nRK-NVt_V02Mr1W6AY3qGxpOHC-W2L0eSIe6c_90DnwNIm4fgxvRtv_DatQ1X8eLEhqk';

let mainWindow;
let currentLicenseStatus = 'FREE'; 
let licenseDetails = null;

async function validateLicense(key) {
  if (!key) return { valid: false, status: 'FREE' };
  
  try {
    const res = await fetch(LEMON_API, {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ license_key: key })
    });
    
    if (!res.ok) {
       throw new Error(`HTTP Error: ${res.status}`);
    }

    const data = await res.json();
    
    if (data.valid) {
      store.set('last_validation', Date.now());
      store.set('license_key', key);
      
      const variant = data.meta?.variant_name?.toLowerCase() || '';
      let status = 'PRO';
      if (variant.includes('elite') || variant.includes('lifetime')) {
         status = 'ELITE';
      }
      return { valid: true, status, data };
    } else {
      // Lemon Squeezy explicitly rejected it as an invalid or inactive key.
      store.delete('license_key');
      return { valid: false, status: 'FREE', error: data.error };
    }
  } catch (err) {
    // True offline logic / Network failure / 500 error
    const lastValid = store.get('last_validation');
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    if (lastValid && (Date.now() - lastValid) < SEVEN_DAYS) {
       return { valid: true, status: 'PRO', offline: true };
    }
    return { valid: false, status: 'FREE', error: 'Erreur réseau ou délai de grâce (7 jours) expiré.' };
  }
}

const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production' && !process.env.ELECTRON_IS_PACKAGED;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 1050,
    minWidth: 1200,
    minHeight: 900,
    title: 'Live Stream Download Manager',
    icon: path.join(__dirname, '../build/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
  });

  if (isDev || process.env.VITE_DEV_SERVER_URL) {
    const devServerUrl = 'http://localhost:5173';
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

ipcMain.handle('select-cookie-file', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Text Files', extensions: ['txt'] }],
    title: 'Sélectionner le fichier cookies.txt'
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

app.whenReady().then(async () => {
  // Optionnel: valider d'abord
  const savedKey = store.get('license_key');
  const result = await validateLicense(savedKey);
  currentLicenseStatus = result.status;
  licenseDetails = result.data;

  // Enregistrer tous les IPC en premier
  ipcMain.handle('get-license-status', () => {
    return {
      status: currentLicenseStatus,
      key: store.get('license_key', ''),
      stats: { vods: store.get('vod_downloads', 0) }
    };
  });

  ipcMain.handle('activate-license', async (event, key) => {
    const res = await validateLicense(key);
    if (res.valid) {
       currentLicenseStatus = res.status;
       licenseDetails = res.data;
    }
    return res;
  });

  ipcMain.handle('buy-license', () => {
    require('electron').shell.openExternal('https://livestreamsownloadmanager.lemonsqueezy.com');
  });

  ipcMain.on('start-download', (event, id, url, options) => {
    if (dlManager) dlManager.download(id, url, options);
  });

  ipcMain.on('cancel-download', (event, id) => {
    if (dlManager) dlManager.cancel(id);
  });

  ipcMain.on('pause-download', (event, id) => {
    if (dlManager) dlManager.pause(id);
  });

  ipcMain.on('resume-download', (event, id) => {
    if (dlManager) dlManager.resume(id);
  });

  ipcMain.on('remove-download', (event, id) => {
    if (dlManager) dlManager.remove(id);
  });

  ipcMain.handle('check-live', async (event, url) => {
    // Uses yt-dlp --simulate to check if a channel URL is currently live.
    // Returns true if live, false otherwise.
    return new Promise((resolve) => {
      const ytDlpPath = dlManager.getYtDlpPath();
      const { spawn } = require('child_process');
      const proc = spawn(ytDlpPath, [
        url,
        '--simulate',
        '--no-playlist',
        '--print', 'is_live',
        '--quiet'
      ]);
      let output = '';
      proc.stdout.on('data', d => { output += d.toString(); });
      proc.on('close', () => {
        const isLive = output.trim() === 'True';
        resolve(isLive);
      });
      proc.on('error', () => resolve(false));
      // Timeout after 30 seconds
      setTimeout(() => { try { proc.kill(); } catch {} resolve(false); }, 30000);
    });
  });

  ipcMain.handle('get-video-info', async (event, url, options) => {
    if (dlManager) return dlManager.getVideoMetadata(url, options);
    return { success: false, error: 'Manager not ready' };
  });

  ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    });
    if (result.canceled) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('select-video-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'Videos', extensions: ['mp4', 'mkv', 'webm', 'mov'] }]
    });
    if (result.canceled) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('ffmpeg-cut', async (event, options) => {
     if (dlManager) return dlManager.ffmpegCutVideo(options);
     return { success: false, error: 'Manager not ready' };
  });

  ipcMain.handle('get-saved-folder', () => {
    return store.get('output_folder', '');
  });

  ipcMain.on('save-output-folder', (event, folder) => {
    store.set('output_folder', folder);
  });

  ipcMain.handle('get-downloads-path', () => app.getPath('downloads'));

  // CREATE WINDOW LAST SO Handlers are ready when React loads
  createWindow();
  
  // Now we can inject mainWindow into dlManager safely
  dlManager = new YtDlpManager(mainWindow, store, () => currentLicenseStatus);
  dlManager.checkForUpdates();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
