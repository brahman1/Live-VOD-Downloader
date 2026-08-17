const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
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
const appDataPath = path.join(app.getPath('appData'), 'LiveAndVODDownloader');
app.setPath('userData', appDataPath);

const store = new SimpleStore('config');

const LEMON_API = 'https://api.lemonsqueezy.com/v1/licenses/validate';
const BUY_URL_PRO = 'https://livestreamsownloadmanager.lemonsqueezy.com/checkout/buy/67d072dd-18ac-456c-827f-0c1f9e7c7c17';
const BUY_URL_ELITE = 'https://livestreamsownloadmanager.lemonsqueezy.com/checkout/buy/bfb97181-45cb-458f-b80a-9e050dd30a3a';

const MASTER_KEYS = [
  'ELITE-TEST-OVERRIDE-KEY-2026'
];

let mainWindow;
let currentLicenseStatus = 'FREE'; 
let licenseDetails = null;

async function validateLicense(key, isManualActivation = false) {
  if (!key || typeof key !== 'string') return { valid: false, status: 'FREE' };
  const cleanKey = key.trim();

  // 1. Master Key Override (only when manually entered in activation modal)
  if (isManualActivation && MASTER_KEYS.some(k => k.toLowerCase() === cleanKey.toLowerCase())) {
    store.set('last_validation', Date.now());
    store.set('license_key', cleanKey);
    return { valid: true, status: 'ELITE', master: true };
  }

  // 2. Validate with Lemon Squeezy API
  try {
    const res = await fetch(LEMON_API, {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ license_key: cleanKey })
    });

    const data = await res.json();

    if (res.ok && data.valid) {
      store.set('last_validation', Date.now());
      store.set('license_key', cleanKey);

      const variant = (data.meta?.variant_name || data.meta?.product_name || '').toLowerCase();
      let status = 'PRO';
      if (variant.includes('elite')) {
        status = 'ELITE';
      } else if (variant.includes('pro')) {
        status = 'PRO';
      }
      return { valid: true, status, data };
    } else {
      store.delete('license_key');
      return { valid: false, status: 'FREE', error: data.error || 'Clé de licence invalide ou non activée.' };
    }
  } catch (err) {
    // 3. Fallback: 7 days offline grace period
    const lastValid = store.get('last_validation');
    const savedKey = store.get('license_key');
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    if (savedKey && savedKey === cleanKey && lastValid && (Date.now() - lastValid) < SEVEN_DAYS) {
      return { valid: true, status: 'PRO', offline: true };
    }
    store.delete('license_key');
    return { valid: false, status: 'FREE', error: 'Erreur réseau ou délai de grâce expiré.' };
  }
}

const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production' && !process.env.ELECTRON_IS_PACKAGED;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 1050,
    minWidth: 1200,
    minHeight: 900,
    title: 'Live & VOD Downloader',
    icon: path.join(__dirname, '../build/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    require('electron').shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev || process.env.VITE_DEV_SERVER_URL) {
    const devServerUrl = 'http://localhost:5173';
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

ipcMain.handle('get-app-version', () => app.getVersion());

ipcMain.handle('select-cookie-file', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Text Files', extensions: ['txt'] }],
    title: 'Sélectionner le fichier cookies.txt'
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

// ── Twitch Followed Channels Fetcher ──────────────────────────────────
ipcMain.handle('fetch-twitch-follows', async (event, cookieFilePath) => {
  try {
    if (!cookieFilePath || !fs.existsSync(cookieFilePath)) {
      return { success: false, errorCode: 'FILE_NOT_FOUND', error: 'cookies.txt not found' };
    }

    // 1. Parse cookies.txt to extract auth-token
    const raw = fs.readFileSync(cookieFilePath, 'utf-8');
    let authToken = '';

    // Method A: Standard Netscape tab parsing
    const lines = raw.split(/\r?\n/).filter(l => l.trim() && !l.startsWith('#'));
    for (const line of lines) {
      const parts = line.split('\t');
      if (parts.length >= 7) {
        const name = parts[5]?.trim();
        const value = parts[6]?.trim();
        if (name === 'auth-token' && value) {
          authToken = value;
          break;
        }
      }
    }

    // Method B: Regex fallback if tabs were normalized to spaces
    if (!authToken) {
      const match = raw.match(/auth-token[\t\s]+([a-z0-9]+)/i);
      if (match) authToken = match[1];
    }

    if (!authToken) {
      return { success: false, errorCode: 'NO_TOKEN', error: 'auth-token not found in cookies.txt' };
    }

    // 2. Fetch followed channels via Twitch GQL API (Combined batch for live & followed channels)
    const TWITCH_GQL = 'https://gql.twitch.tv/gql';
    const CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';

    const batchQuery = [
      {
        operationName: "FollowingLive_User",
        query: `query FollowingLive_User {
          currentUser {
            follows(first: 100) {
              edges {
                node {
                  id
                  login
                  displayName
                  profileImageURL(width: 70)
                  stream { id type }
                }
              }
            }
          }
        }`
      },
      {
        operationName: "FollowedChannels",
        query: `query FollowedChannels {
          currentUser {
            follows(first: 100) {
              edges {
                node {
                  id
                  login
                  displayName
                  profileImageURL(width: 70)
                }
              }
            }
          }
        }`
      }
    ];

    const res = await fetch(TWITCH_GQL, {
      method: 'POST',
      headers: {
        'Client-ID': CLIENT_ID,
        'Authorization': `OAuth ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(batchQuery)
    });

    const dataArray = await res.json();
    let allChannelsMap = new Map();

    if (Array.isArray(dataArray)) {
      dataArray.forEach(data => {
        const follows = data?.data?.currentUser?.follows;
        if (follows && follows.edges) {
          follows.edges.forEach(edge => {
            const node = edge?.node;
            if (node && node.login && !allChannelsMap.has(node.login.toLowerCase())) {
              allChannelsMap.set(node.login.toLowerCase(), {
                login: node.login,
                displayName: node.displayName || node.login,
                profileImage: node.profileImageURL || undefined,
                isLive: !!(node.stream && node.stream.id),
                url: `https://www.twitch.tv/${node.login}`
              });
            }
          });
        }
      });
    }

    const allChannels = Array.from(allChannelsMap.values());

    if (allChannels.length === 0) {
      return { success: false, errorCode: 'TOKEN_EXPIRED', error: 'Token expired or invalid' };
    }

    return { 
      success: true, 
      channels: allChannels, 
      total: allChannels.length
    };

  } catch (err) {
    return { success: false, error: `Erreur: ${err.message || err}` };
  }
});

const { execSync } = require('child_process');

class PersistentQuotaManager {
  constructor() {
    let globalDir = '';
    if (process.platform === 'win32') {
      const progData = process.env.PROGRAMDATA || 'C:\\ProgramData';
      try {
        const testDir = path.join(progData, 'LiveAndVODDownloader');
        if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
        globalDir = testDir;
      } catch (e) {
        // Fallback to user appData if ProgramData is not writable (e.g. per-user install without admin)
        globalDir = path.join(app.getPath('appData'), 'LiveAndVODDownloader');
      }
    } else if (process.platform === 'darwin') {
      const home = process.env.HOME || require('os').homedir();
      globalDir = path.join(home, 'Library', 'Application Support', 'LiveAndVODDownloader');
    } else {
      const home = process.env.HOME || require('os').homedir();
      globalDir = path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'LiveAndVODDownloader');
    }
    this.globalFile = path.join(globalDir, '.sys_quota.json');
  }

  getUsedCount() {
    let count = 0;
    
    // 1. Check userData store
    const localVal = store.get('trial_used_count', 0);
    if (typeof localVal === 'number' && localVal > count) {
      count = localVal;
    }

    // 2. Check Global store (ProgramData or ~/.config)
    try {
      if (fs.existsSync(this.globalFile)) {
        const raw = fs.readFileSync(this.globalFile, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.used === 'number' && parsed.used > count) {
          count = parsed.used;
        }
      }
    } catch (e) {}

    // 3. Check Windows Registry (Windows ONLY)
    if (process.platform === 'win32') {
      try {
        const regCmd = 'reg query "HKCU\\Software\\LiveAndVODDownloader" /v TrialUsed';
        const output = execSync(regCmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        const match = output.match(/REG_DWORD\s+0x([0-9a-fA-F]+)/);
        if (match && match[1]) {
          const regVal = parseInt(match[1], 16);
          if (!isNaN(regVal) && regVal > count) {
            count = regVal;
          }
        }
      } catch (e) {}
    }

    // Sync all to max value
    this.saveCount(count);
    return count;
  }

  saveCount(count) {
    // 1. Save in config.json
    store.set('trial_used_count', count);

    // 2. Save in Global dir
    try {
      const dir = path.dirname(this.globalFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.globalFile, JSON.stringify({ used: count, updated: Date.now() }));
    } catch (e) {}

    // 3. Save in Windows Registry (Windows ONLY)
    if (process.platform === 'win32') {
      try {
        const regAddCmd = `reg add "HKCU\\Software\\LiveAndVODDownloader" /v TrialUsed /t REG_DWORD /d ${count} /f`;
        execSync(regAddCmd, { stdio: ['ignore', 'ignore', 'ignore'] });
      } catch (e) {}
    }
  }

  increment() {
    const current = this.getUsedCount();
    const next = current + 1;
    this.saveCount(next);
    return next;
  }
}

const quotaManager = new PersistentQuotaManager();

app.whenReady().then(async () => {
  // Validate saved key at startup (isManualActivation=false, so master keys are ignored)
  const savedKey = store.get('license_key');
  if (savedKey && typeof savedKey === 'string' && savedKey.trim().length > 0) {
    const result = await validateLicense(savedKey, false);
    currentLicenseStatus = result.status;
    licenseDetails = result.data;
    // If the saved key is no longer valid, clean it up
    if (!result.valid) {
      store.delete('license_key');
      store.delete('last_validation');
      currentLicenseStatus = 'FREE';
    }
  } else {
    currentLicenseStatus = 'FREE';
  }

  // Enregistrer tous les IPC en premier
  ipcMain.handle('get-license-status', () => {
    const used = quotaManager.getUsedCount();
    const remaining = Math.max(0, 10 - used);
    return {
      status: currentLicenseStatus,
      key: store.get('license_key', ''),
      usedDownloads: used,
      remainingDownloads: remaining,
      maxFree: 10
    };
  });

  ipcMain.handle('activate-license', async (event, key) => {
    const res = await validateLicense(key, true);
    if (res.valid) {
       currentLicenseStatus = res.status;
       licenseDetails = res.data;
    }
    return res;
  });

  ipcMain.handle('buy-license', (event, plan) => {
    const targetUrl = plan === 'elite' ? BUY_URL_ELITE : BUY_URL_PRO;
    require('electron').shell.openExternal(targetUrl);
  });

  ipcMain.on('start-download', (event, id, url, options) => {
    if (currentLicenseStatus === 'FREE') {
      const used = quotaManager.getUsedCount();
      if (used >= 10) {
        if (mainWindow) {
          mainWindow.webContents.send('download-error', { 
            id, 
            error: 'Quota gratuit épuisé (10/10). Veuillez activer une licence PRO ou ELITE pour continuer.' 
          });
        }
        return;
      }
      quotaManager.increment();
      const newUsed = quotaManager.getUsedCount();
      if (mainWindow) {
        mainWindow.webContents.send('quota-updated', {
          usedDownloads: newUsed,
          remainingDownloads: Math.max(0, 10 - newUsed)
        });
      }
    }
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

const WEBSITE_URL = 'https://brahman1.github.io/DownloaderWebSite/';

  const os = require('os');
  const https = require('https');
  const { spawn } = require('child_process');

  let updateFilePath = null;

  ipcMain.handle('start-app-update', async () => {
    if (!latestAppUpdate || !latestAppUpdate.downloadUrl) {
       require('electron').shell.openExternal(WEBSITE_URL);
       return { success: true };
    }
    
    if (!latestAppUpdate.isDirectDownload) {
       require('electron').shell.openExternal(latestAppUpdate.downloadUrl);
       return { success: true };
    }

    const downloadUrl = latestAppUpdate.downloadUrl;
    const fileName = path.basename(new URL(downloadUrl).pathname) || 'update_file';
    updateFilePath = path.join(os.tmpdir(), fileName);

    if (fs.existsSync(updateFilePath)) {
       try { fs.unlinkSync(updateFilePath); } catch (e) {}
    }

    const fileStream = fs.createWriteStream(updateFilePath);
    
    const downloadFile = (url) => {
      https.get(url, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          downloadFile(response.headers.location);
          return;
        }
        
        if (response.statusCode !== 200) {
           if (mainWindow && !mainWindow.isDestroyed()) {
               mainWindow.webContents.send('app-update-error', 'Server returned ' + response.statusCode);
           }
           return;
        }

        const totalBytes = parseInt(response.headers['content-length'], 10) || 0;
        let downloadedBytes = 0;

        response.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          const percent = totalBytes ? (downloadedBytes / totalBytes) * 100 : 0;
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('app-update-progress', { percent });
          }
        });

        response.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close();
        });
        fileStream.on('close', () => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('app-update-progress', { percent: 100 });
            mainWindow.webContents.send('app-update-downloaded', { version: latestAppUpdate.version });
          }
        });
      }).on('error', (err) => {
         fs.unlink(updateFilePath, () => {});
         if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('app-update-error', err.message);
         }
      });
    };

    downloadFile(downloadUrl);
    return { success: true };
  });

  ipcMain.handle('open-external-url', async (_event, url) => {
    const target = url || WEBSITE_URL;
    require('electron').shell.openExternal(target);
    return { success: true };
  });

  ipcMain.handle('install-app-update', () => {
    if (updateFilePath && fs.existsSync(updateFilePath)) {
      const ext = path.extname(updateFilePath).toLowerCase();
      try {
        if (os.platform() === 'win32' && ext === '.exe') {
          const child = spawn(updateFilePath, [], {
             detached: true,
             stdio: 'ignore',
             shell: true
          });
          child.unref();
          app.quit();
        } else {
          require('electron').shell.showItemInFolder(updateFilePath);
          app.quit();
        }
      } catch (e) {
         console.error('Failed to install update', e);
      }
    } else {
      require('electron').shell.openExternal(WEBSITE_URL);
    }
  });

  ipcMain.handle('check-app-update', async (_event, manual) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (!manual && latestAppUpdate) {
        mainWindow.webContents.send('app-update-available', latestAppUpdate);
      } else {
        checkGitHubReleases(mainWindow, manual);
      }
    }
  });

  createWindow();
  
  dlManager = new YtDlpManager(mainWindow, store, () => currentLicenseStatus);
  dlManager.checkForUpdates();
  setupAutoUpdater(mainWindow);

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

let latestAppUpdate = null;

function setupAutoUpdater(win) {
  checkGitHubReleases(win, false);
}

let lastCheckTime = 0;
const AUTO_COOLDOWN = 5 * 60 * 1000;
const MANUAL_COOLDOWN = 15 * 1000;

function sendLog(win, msg) {
  console.log('[Updater]', msg);
  if (win && !win.isDestroyed()) {
    win.webContents.send('app-update-log', msg);
  }
}

async function checkGitHubReleases(win, manual = false) {
  try {
    sendLog(win, 'Démarrage de la vérification de mise à jour. Manual: ' + manual);
    const now = Date.now();
    const cooldown = manual ? MANUAL_COOLDOWN : AUTO_COOLDOWN;
    
    if (now - lastCheckTime < cooldown) {
      sendLog(win, 'Vérification annulée : Le cooldown n\'est pas écoulé. Temps restant: ' + Math.round((cooldown - (now - lastCheckTime))/1000) + 's');
      if (latestAppUpdate) {
        if (win && !win.isDestroyed()) win.webContents.send('app-update-available', latestAppUpdate);
      } else if (manual) {
        if (win && !win.isDestroyed()) win.webContents.send('app-update-not-available', { version: app.getVersion() });
      }
      return;
    }

    sendLog(win, 'Requête vers l\'API GitHub: https://api.github.com/repos/brahman1/DownloaderWebSite/releases/latest');
    const res = await fetch('https://api.github.com/repos/brahman1/DownloaderWebSite/releases/latest', {
      headers: {
        'User-Agent': 'Live-VOD-Downloader-App',
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (res.ok) {
      lastCheckTime = Date.now();
      const data = await res.json();
      const latestVersion = (data.tag_name || '').replace(/^[^\d]*/, '').trim();
      const currentVersion = app.getVersion();
      
      sendLog(win, `Réponse OK. Version distante: ${latestVersion} | Version locale: ${currentVersion}`);
      
      if (latestVersion && isNewerVersion(latestVersion, currentVersion)) {
        sendLog(win, 'Une mise à jour plus récente a été détectée.');
        const platform = os.platform();
        const arch = os.arch();
        let targetExt = '.zip';
        let archKeywords = [];

        if (platform === 'win32') {
          targetExt = '.exe';
        } else if (platform === 'darwin') {
          targetExt = '.dmg';
          archKeywords = arch === 'arm64' ? ['arm64', 'aarch64', 'm1'] : ['x64', 'intel', 'mac'];
        } else if (platform === 'linux') {
          targetExt = '.zip';
        }

        let bestAsset = null;
        if (data.assets && data.assets.length > 0) {
          const extAssets = data.assets.filter(a => a.name.toLowerCase().endsWith(targetExt));
          if (extAssets.length > 0) {
             if (platform === 'darwin' && extAssets.length > 1) {
                bestAsset = extAssets.find(a => archKeywords.some(kw => a.name.toLowerCase().includes(kw))) || extAssets[0];
             } else {
                bestAsset = extAssets[0];
             }
          } else {
             bestAsset = data.assets[0];
          }
        }

        const downloadUrl = bestAsset ? bestAsset.browser_download_url : WEBSITE_URL;
        sendLog(win, `Asset sélectionné: ${bestAsset ? bestAsset.name : 'Aucun asset compatible trouvé, fallback site web'}`);
        
        latestAppUpdate = {
          version: latestVersion,
          releaseNotes: data.body || 'Une nouvelle mise à jour est disponible !',
          downloadUrl: downloadUrl,
          isDirectDownload: bestAsset != null
        };

        if (win && !win.isDestroyed()) {
          win.webContents.send('app-update-available', latestAppUpdate);
        }
      } else {
        sendLog(win, 'La version locale est identique ou supérieure à la version distante.');
        if (manual && win && !win.isDestroyed()) {
          win.webContents.send('app-update-not-available', { version: currentVersion });
        }
      }
    } else if (res.status === 403) {
      sendLog(win, 'Erreur 403: Rate Limited par GitHub.');
      if (manual && win && !win.isDestroyed()) {
        win.webContents.send('app-update-rate-limited');
      }
    } else {
      sendLog(win, `Erreur réseau: Statut HTTP ${res.status}`);
      if (manual && win && !win.isDestroyed()) {
        win.webContents.send('app-update-not-available', { version: app.getVersion() });
      }
    }
  } catch (e) {
    sendLog(win, `Erreur inattendue: ${e.message}`);
    if (manual && win && !win.isDestroyed()) {
      win.webContents.send('app-update-not-available', { version: app.getVersion() });
    }
  }
}

function isNewerVersion(latest, current) {
  const parse = v => v.split('.').map(n => parseInt(n, 10) || 0);
  const l = parse(latest);
  const c = parse(current);
  for (let i = 0; i < Math.max(l.length, c.length); i++) {
    const lNum = l[i] || 0;
    const cNum = c[i] || 0;
    if (lNum > cNum) return true;
    if (lNum < cNum) return false;
  }
  return false;
}

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
