const { app } = require('electron');
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const ffmpegPath = require('ffmpeg-static');
const locales = require('../src/locales.json');

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0'
];

class YtDlpManager {
  constructor(window, store, getLicenseStatus) {
    this.window = window;
    this.store = store;
    this.getLicenseStatus = getLicenseStatus;
    this.processes = new Map();
    this.destinations = new Map();
    this.tasks = new Map();
    this.language = 'en'; // default
    this.tempDir = path.join(os.tmpdir(), 'livevault-temp');
    if (!fs.existsSync(this.tempDir)) {
      try { fs.mkdirSync(this.tempDir, { recursive: true }); } catch (e) {}
    }
    this.ensureBinariesReady();
  }

  getBinName() {
    if (os.platform() === 'win32') return 'yt-dlp.exe';
    if (os.platform() === 'darwin') return 'yt-dlp_macos';
    return 'yt-dlp'; // Linux
  }

  ensureBinariesReady() {
    const userDataBin = path.join(app.getPath('userData'), 'bin');
    if (!fs.existsSync(userDataBin)) {
      try { fs.mkdirSync(userDataBin, { recursive: true }); } catch (e) {}
    }

    const binName = this.getBinName();
    const targetYtDlp = path.join(userDataBin, binName);
    const targetFfmpeg = path.join(userDataBin, os.platform() === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
    const targetFfprobe = path.join(userDataBin, os.platform() === 'win32' ? 'ffprobe.exe' : 'ffprobe');

    // 1. Copy yt-dlp if not present
    let packagedYtDlp = app.isPackaged 
      ? path.join(process.resourcesPath, 'bin', binName)
      : path.join(__dirname, '../bin', binName);

    if (!fs.existsSync(targetYtDlp) && fs.existsSync(packagedYtDlp)) {
      try { fs.copyFileSync(packagedYtDlp, targetYtDlp); } catch (e) {}
    }

    // 2. Copy ffmpeg if not present or size differs
    try {
      const srcFfmpeg = require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked');
      if (fs.existsSync(srcFfmpeg)) {
        const srcSize = fs.statSync(srcFfmpeg).size;
        const tgtSize = fs.existsSync(targetFfmpeg) ? fs.statSync(targetFfmpeg).size : 0;
        if (srcSize !== tgtSize) {
          fs.copyFileSync(srcFfmpeg, targetFfmpeg);
        }
      }
    } catch (e) {}

    // 3. Copy ffprobe if not present or size differs
    try {
      const srcFfprobe = require('ffprobe-static').path.replace('app.asar', 'app.asar.unpacked');
      if (fs.existsSync(srcFfprobe)) {
        const srcSize = fs.statSync(srcFfprobe).size;
        const tgtSize = fs.existsSync(targetFfprobe) ? fs.statSync(targetFfprobe).size : 0;
        if (srcSize !== tgtSize) {
          fs.copyFileSync(srcFfprobe, targetFfprobe);
        }
      }
    } catch (e) {}

    // Fix permissions on Unix
    if (os.platform() !== 'win32') {
      [targetYtDlp, targetFfmpeg, targetFfprobe].forEach(p => {
        try { if (fs.existsSync(p)) fs.chmodSync(p, '755'); } catch (e) {}
      });
    }

    this.binDir = userDataBin;
    return userDataBin;
  }

  getYtDlpPath() {
    const binName = this.getBinName();
    const userBinPath = path.join(app.getPath('userData'), 'bin', binName);
    if (fs.existsSync(userBinPath)) return userBinPath;

    let binPath;
    if (app.isPackaged) {
      binPath = path.join(process.resourcesPath, 'bin', binName);
    } else {
      binPath = path.join(__dirname, '../bin', binName);
    }
    
    if (os.platform() !== 'win32') {
      try { fs.chmodSync(binPath, '755'); } catch (e) {}
    }
    return binPath;
  }

  getFfmpegDir() {
    const userBinDir = path.join(app.getPath('userData'), 'bin');
    const ffmpegInUserBin = path.join(userBinDir, os.platform() === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
    if (fs.existsSync(ffmpegInUserBin)) {
      return userBinDir;
    }
    try {
      const srcFfmpeg = require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked');
      return path.dirname(srcFfmpeg);
    } catch (e) {
      return userBinDir;
    }
  }

  getFfmpegBin() {
    const userBinDir = path.join(app.getPath('userData'), 'bin');
    const ffmpegInUserBin = path.join(userBinDir, os.platform() === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
    if (fs.existsSync(ffmpegInUserBin)) {
      return ffmpegInUserBin;
    }
    return require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked');
  }

  sendToWindow(channel, payload) {
    if (this.window && !this.window.isDestroyed() && this.window.webContents && !this.window.webContents.isDestroyed()) {
      this.window.webContents['send'](channel, payload);
    }
  }

  sendLog(id, message) {
    this.sendToWindow('log', { id, message: message.toString().trim() });
    console.log(`[${id || 'SYSTEM'}] ${message.toString().trim()}`);
  }

  checkForUpdates() {
    const msg = this.language === 'fr' 
      ? 'Système: Vérification des mises à jour de yt-dlp...' 
      : 'System: Checking for yt-dlp updates...';
    this.sendLog(null, msg);
    
    const ytDlpPath = this.getYtDlpPath();
        
    const proc = spawn(ytDlpPath, ['-U']);
    
    proc.stdout.on('data', (data) => this.sendLog(null, data));
    proc.stderr.on('data', (data) => this.sendLog(null, `[UPDATE ERR] ${data}`));
    
    proc.on('close', (code) => {
      this.sendLog(null, `Update check terminé (Code: ${code})`);
    });

    proc.on('error', (err) => {
      this.sendLog(null, `CRITIQUE : yt-dlp introuvable dans le PATH système. ERREUR: ${err.message}`);
    });
  }

  download(id, url, options) {
    if (options.language) this.language = options.language;

    let isTikTokPhoto = false;
    // TikTok photo workaround to allow audio extraction without crashing yt-dlp
    if (url.includes('tiktok.com') && url.includes('/photo/')) {
        url = url.replace(/\/photo\//, '/video/');
        isTikTokPhoto = true;
        const msg = this.language === 'fr' 
            ? 'Lien TikTok (Photo) détecté. Adaptation du lien en /video/ pour extraire en toute sécurité.' 
            : 'TikTok Link (Photo) detected. Adapting link to /video/ for safe extraction.';
        this.sendLog(id, msg);
    }

    if (this.processes.has(id)) {
       const err = this.language === 'fr' 
         ? `Erreur: L'ID ${id} est déjà en cours de téléchargement.` 
         : `Error: ID ${id} is already being downloaded.`;
       this.sendLog(id, err);
       return;
    }

    this.tasks.set(id, {
        isCancelled: false,
        parts: [],
        url: url,
        options: options,
        isTikTokPhoto: isTikTokPhoto
    });

    const isLive = options.isLive || false; // Try to get isLive from options, or infer later
    const status = this.getLicenseStatus();
    
    // FREE Tier VOD Limit Check
    if (status === 'FREE' && !isLive) {
      const vodCount = this.store.get('vod_downloads', 0);
      if (vodCount >= 10) {
         this.sendLog(id, 'Erreur: Limite de 10 téléchargements VOD atteinte en version Gratuite.');
         this.sendToWindow('download-error', { id, error: 'FREE_LIMIT_REACHED' });
         this.tasks.delete(id);
         return;
      }
      // increment immediately to prevent parallel bypass, decrement on fail?
      this.store.set('vod_downloads', vodCount + 1);
    }

    const startMsg = this.language === 'fr' ? `Démarrage: ${url}` : `Starting: ${url}`;
    this.sendLog(id, startMsg);
    this._executeYtDlp(id, url, options);
  }

  _executeYtDlp(id, url, options) {
    const downloadsDir = options.outputFolder || app.getPath('downloads');
    
    let suffix = '';
    if (options.format === 'video_all') suffix = '_VS';
    else if (options.format === 'video_only') suffix = '_V';
    else if (options.format === 'audio') suffix = '_S';

    const currentTask = this.tasks.get(id);
    let workDir = downloadsDir;
    
    // Isolate TikTok Photos in a unique temp directory to prevent any path or naming issues during ffmpeg merge
    if (currentTask && currentTask.isTikTokPhoto) {
        workDir = path.join(downloadsDir, `tiktok_tmp_${id}`);
        if (!fs.existsSync(workDir)) fs.mkdirSync(workDir, { recursive: true });
        
        this._executeTikTokPhotoProcess(id, url, options, workDir, downloadsDir);
        return;
    }

    let args = [
      url,
      '--ffmpeg-location', this.getFfmpegDir(),
      '--newline',
      '-c',
      '-P', `home:${workDir}`,
      '--no-playlist',
      '--restrict-filenames',
      '-o', options.relentlessMode ? `%(title).70s [%(id)s]${suffix}-%(epoch)s.%(ext)s` : `%(title).70s [%(id)s]${suffix}.%(ext)s`
    ];

    if (options.ghostMode) {
      const agent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
      args.push('--user-agent', agent);
      const ghostMsg = this.language === 'fr' 
        ? 'Ghost Mode activé : User-Agent anonyme injecté.' 
        : 'Ghost Mode enabled: Anonymous User-Agent injected.';
      this.sendLog(id, ghostMsg);
       // --sleep-requests to avoid being flagged as bot easily
      args.push('--sleep-requests', '1');
    }

    if (currentTask && currentTask.isTikTokPhoto) {
      args.push('--write-all-thumbnails');
    }

    if (options.useCookies) {
      if (options.cookieBrowser === 'file' && options.cookieFilePath) {
         args.push('--cookies', options.cookieFilePath);
         const fileMsg = this.language === 'fr' 
           ? 'Paramètre: Importation via fichier cookies.txt réussie.' 
           : 'Parameter: Successfully imported via cookies.txt file.';
         this.sendLog(id, fileMsg);
      } else {
         const browser = options.cookieBrowser || 'chrome';
         args.push('--cookies-from-browser', browser);
         const browserMsg = this.language === 'fr' 
           ? `Paramètre: Exportation des cookies de ${browser} activée.` 
           : `Parameter: Browser cookie export (${browser}) enabled.`;
         this.sendLog(id, browserMsg);
      }
    }

    if (options.autoCut) {
      // Split stream into sections (very useful for huge files) or just ignore for now if not fully supported without ffmpeg slicing
      // We will just fetch meta and chat
      this.sendLog(id, 'Auto-Cut actif (Simulation).');
      args.push('--write-description', '--write-thumbnail');
    }

    const status = this.getLicenseStatus();
    if (status === 'FREE') {
      // Force 720p maximum and disable mp3/video_only which are PRO features
      if (options.format === 'audio' || options.format === 'video_only' || options.format === 'video_all') {
         options.format = 'optimized';
      }
    }

    if (options.format === 'audio') {
      args.push('-x', '--audio-format', 'mp3');
    } else if (options.format === 'eco') {
      args.push('-f', 'bestvideo[height<=480]+bestaudio/best[height<=480]/best');
    } else if (options.format === 'master') {
      args.push('-f', 'bestvideo+bestaudio/best');
    } else if (options.format === 'video_all' || options.format === 'video_only') {
      let res = options.resolution || '1080';
      if (status === 'FREE' && parseInt(res) > 720) res = '720';

      args.push('--merge-output-format', 'mp4', '--remux-video', 'mp4');
      
      if (options.format === 'video_only') {
         args.push('-f', `bestvideo[ext=mp4][height<=${res}]/bestvideo[height<=${res}]/best`);
      } else {
         args.push('-f', `bestvideo[ext=mp4][height<=${res}]+bestaudio[ext=m4a]/bestvideo[height<=${res}]+bestaudio/best`);
      }
    } else {
      // default optimized
      let maxRes = status === 'FREE' ? '720' : '1080';
      args.push('-f', `bestvideo[height<=${maxRes}]+bestaudio/best[height<=${maxRes}]/best`);
    }

    const ytDlpPath = this.getYtDlpPath();
    const unpackedFfmpeg = this.getFfmpegBin();
    
    if (os.platform() !== 'win32') {
      try { fs.chmodSync(unpackedFfmpeg, '755'); } catch(e) {}
    }

    this.sendLog(id, `Process: ${ytDlpPath} ${args.join(' ')}`);

    try {
      const proc = spawn(ytDlpPath, args);
      this.processes.set(id, proc);
      
      proc.on('error', (err) => {
        this.sendLog(id, `Erreur Processus: ${err.message}`);
        this.processes.delete(id);
        if (err.code === 'ENOENT') {
          this.sendToWindow('download-error', { id, error: 'YT-DLP_MISSING' });
        } else {
          this.sendToWindow('download-error', { id, error: `SYSTEM_ERROR|${err.message}` });
        }
      });

      proc.stdout.on('data', (data) => {
        const output = data.toString();
        
        if (output.includes('[download] Destination:')) {
           const dest = output.split('Destination:')[1].trim();
           this.destinations.set(id, dest);
           this.sendToWindow('download-destination', { id, dest });
           this.sendLog(id, output.trim());
        } else if (output.includes('[download]') && !output.includes('Destination')) {
           let percent = null, speed = '', eta = '', totalSize = '', downloadedSize = '';
           
           const percentMatch = output.match(/([\d\.]+)%/);
           if (percentMatch) percent = parseFloat(percentMatch[1]);
           
           const speedMatch = output.match(/at\s+([^\s]+)/);
           if (speedMatch) speed = speedMatch[1];
           
           const etaMatch = output.match(/ETA\s+([^\s]+)/);
           if (etaMatch) eta = etaMatch[1];
           
           const sizeOfMatch = output.match(/of\s+[~]?([^\s]+)/);
           if (sizeOfMatch) {
               totalSize = sizeOfMatch[1];
           } else {
               const downloadedMatch = output.match(/\[download\]\s+([^\s]+)/);
               if (downloadedMatch && downloadedMatch[1] && !downloadedMatch[1].includes('%')) {
                   downloadedSize = downloadedMatch[1];
               }
           }
           
           const timeMatch = output.match(/\(([\d:]+)\)/);
           if (timeMatch && !eta) eta = timeMatch[1] + ' écoulé';
  
           this.sendToWindow('download-progress', {
              id,
              percent: percent || 0,
              speed: speed || '',
              eta: eta || '',
              size: totalSize || downloadedSize || ''
           });
        } else if (output.includes('[Merger]')) {
           const destMatch = output.match(/into\s+"([^"]+)"/);
           if (destMatch && destMatch[1]) {
               this.destinations.set(id, destMatch[1].trim());
           }
           this.sendLog(id, 'Fusion Audio/Vidéo en cours via FFmpeg...');
           this.sendToWindow('download-progress', {
               id, percent: 100, speed: 'Fusion...', eta: 'Patientez', size: ''
           });
        }
      });
  
      proc.stderr.on('data', (data) => {
        const errOut = data.toString();
        
        // --- FFmpeg / HLS Spam Filters ---
        if (
          errOut.includes('Skip (\'#EXT-X-') || 
          errOut.includes('[hls @') || 
          errOut.includes('https @') || 
          errOut.includes('Opening \'https://') ||
          errOut.includes('Input #') || 
          errOut.includes('Output #') || 
          errOut.includes('Stream mapping:') || 
          errOut.includes('Press [q] to stop') || 
          errOut.includes('Metadata:') || 
          errOut.includes('Stream #') ||
          errOut.includes('Duration: N/A') ||
          errOut.includes('Found duplicated MOOV Atom') ||
          errOut.includes('Unable to extract metadata') ||
          errOut.includes('No supported JavaScript runtime')
        ) {
          return; // Ignore raw ffmpeg verbosity
        }

        // --- Live Stream Native Progress (FFmpeg) ---
        // Example: "size=    2560kB time=00:00:05.99 bitrate=3499.9kbits/s speed=3.03x"
        if (errOut.includes('size=') && errOut.includes('time=')) {
           let speedStr = '', sizeStr = '', timeStr = '';
           
           const timeMatch = errOut.match(/time=([\d:\.]+)/);
           if (timeMatch) timeStr = timeMatch[1];
           
           const sizeMatch = errOut.match(/size=\s*([^\s]+)/);
           if (sizeMatch) sizeStr = sizeMatch[1];

           const speedMatch = errOut.match(/speed=\s*([^\s]+)/);
           if (speedMatch) speedStr = speedMatch[1];
           
           this.sendToWindow('download-progress', {
              id,
              percent: 100, // Live streams don't have a known max size, fill the bar
              speed: speedStr ? `${speedStr} (Direct)` : 'En direct',
              eta: timeStr ? `${timeStr} capturé` : '',
              size: sizeStr || ''
           });

           // FREE Tier Live restriction (30 mins hard kill)
           if (this.getLicenseStatus() === 'FREE' && timeStr) {
               const timeParts = timeStr.split(':');
               if (timeParts.length >= 2) {
                   const mins = parseInt(timeParts[1]);
                   const hours = parseInt(timeParts[0]);
                   if (hours > 0 || mins >= 30) {
                       this.sendLog(id, 'Avertissement: Limite de 30 minutes atteinte (Version Gratuite). Coupure.');
                       this.cancel(id);
                       // Add a short delay to let process terminate, then report error.
                       setTimeout(() => {
                           this.sendToWindow('download-error', { id, error: 'FREE_LIMIT_LIVE_REACHED' });
                       }, 2000);
                   }
               }
           }
           return; 
        }

        // Log if it's a real message
        if (errOut.trim() !== '') {
          this.sendLog(id, `[Erreur/Info] ${errOut.trim()}`);
        }
        
        // Smart Error Mapping
        if (errOut.includes('subscriber-only') || errOut.includes('You must be logged into an account that has access to this subscriber')) {
          const task = this.tasks.get(id);
          if (task) task.hasFatalError = true; // prevent any completion event from firing
          this.sendToWindow('download-error', { id, error: 'SUB_ONLY' });
        } else if (errOut.includes('HTTP Error 403') || errOut.includes('Forbidden') || errOut.includes('offline') || errOut.includes('Sign in to confirm your age')) {
          this.sendToWindow('download-error', { id, error: 'RESTRICTED_OR_OFFLINE' });
          if (errOut.includes('offline') || errOut.includes('not found')) {
              this.sendToWindow('download-error', { id, error: 'OFFLINE' });
          }
        } else if (errOut.includes('HTTP Error 429')) {
          this.sendToWindow('download-error', { id, error: 'IP_BLOCKED' });
        } else if (errOut.includes('ffprobe or ffmpeg not found')) {
          this.sendToWindow('download-error', { id, error: 'FFMPEG_MISSING' });
        } else if (errOut.includes('No space left on device') || errOut.includes('Errno 28')) {
          this.sendToWindow('download-error', { id, error: 'DISK_FULL' });
        }
      });
  
      proc.on('close', (code) => {
        // Delete processes reference early so it doesn't block restart
        this.processes.delete(id);

        const task = this.tasks.get(id);

        // --- PAUSE: process was killed by user to pause the download ---
        // The .part file must stay on disk for yt-dlp's -c flag to resume later.
        // Do NOT rename, do NOT send any completion event.
        if (task && task.isPaused) {
          this.sendLog(id, 'Processus arrêté (pause). Fichier .part conservé pour reprise.');
          return;
        }

        // --- FATAL ERROR (e.g. SUB_ONLY): error was already sent via stderr, silently exit ---
        if (task && task.hasFatalError) {
          this.tasks.delete(id);
          return;
        }

        // Auto-heal .part or .ytdl files if forcefully terminated (Encoding-safe)
        const dest = this.destinations.get(id);
        let finalDest = dest;
        if (dest) {
            const dir = path.dirname(dest);
            const base = path.basename(dest);
            let healed = false;
            
            try {
                // L'encodage console Windows casse les accents (é -> ).
                // On recherche plutôt l'ID unique ou le pattern epoch à la fin du fichier
                const suffixMatch = base.match(/(\[[a-zA-Z0-9_-]+\](?:-[0-9]+)?\.[a-zA-Z0-9]+)$/);
                
                if (suffixMatch && fs.existsSync(dir)) {
                    const uniqueSuffix = suffixMatch[1]; // e.g. "[ID].mp4" or "[ID]-123456.mp4"
                    const files = fs.readdirSync(dir);
                    
                    for (const file of files) {
                        if (file.endsWith(uniqueSuffix + '.part')) {
                            finalDest = path.join(dir, file.replace('.part', ''));
                            fs.renameSync(path.join(dir, file), finalDest);
                            this.sendLog(id, `Fichier inachevé (.part) finalisé de force !`);
                            healed = true;
                        } else if (file.endsWith(uniqueSuffix + '.ytdl')) {
                            finalDest = path.join(dir, file.replace('.ytdl', ''));
                            fs.renameSync(path.join(dir, file), finalDest);
                            this.sendLog(id, `Fichier inachevé (.ytdl) finalisé de force !`);
                            healed = true;
                        }
                    }
                }
                
                // Fallback si pas de suffixe ID unique trouvé
                if (!healed) {
                    const partFile = dest + '.part';
                    const ytdlFile = dest + '.ytdl';
                    if (fs.existsSync(partFile)) {
                        fs.renameSync(partFile, dest);
                        this.sendLog(id, `Fichier inachevé (.part) finalisé de force !`);
                    } else if (fs.existsSync(ytdlFile)) {
                        fs.renameSync(ytdlFile, dest);
                        this.sendLog(id, `Fichier inachevé (.ytdl) finalisé de force !`);
                    }
                }
            } catch (e) {
                this.sendLog(id, `Impossible de renommer le fichier partiel : ${e.message}`);
            }
        }
        
        if (task && options.relentlessMode && finalDest && fs.existsSync(finalDest)) {
             if (!task.parts.includes(finalDest)) {
                 task.parts.push(finalDest);
             }
        }

        // On success or graceful cancellation (130/null means killed/interrupted properly)
        if (task && task.isCancelled) {
             if (options.relentlessMode && task.parts.length > 0) {
                 this._mergeParts(id, task.parts, options);
             } else {
                 this.sendToWindow('download-complete', { id });
             }
             this.tasks.delete(id);
             return;
        }

        if (options.relentlessMode && task && !task.isCancelled && !task.isPaused) {
             this.sendLog(id, `⚠️ Mode Acharné: Relance de la capture dans 5 secondes...`);
             setTimeout(() => {
                 if (this.tasks.has(id)) {
                     const currentTask = this.tasks.get(id);
                     if (!currentTask.isCancelled) {
                         this._executeYtDlp(id, url, options);
                     }
                 }
             }, 5000);
             return;
        }

        if (code === 0 || code === 130 || code === 1 || code === null) {
          if (task && task.isTikTokPhoto && finalDest && fs.existsSync(finalDest)) {
              this._convertTikTokPhotoToVideo(id, finalDest, downloadsDir);
              return; // wait for ffmpeg to finish before sending complete
          }
          this.sendToWindow('download-complete', { id });
        } else {
          this.sendToWindow('download-error', { id, error: `CRASH|${code}` });
        }
        this.tasks.delete(id);
      });

    } catch (e) {
      this.sendToWindow('download-error', { id, error: 'PROCESS_ERROR' });
    }
  }

  cancel(id) {
    const task = this.tasks.get(id);
    if (task) {
        task.isCancelled = true;
    }

    const proc = this.processes.get(id);
    if (!proc) {
        if (task && task.parts.length > 0) {
            this._mergeParts(id, task.parts, task.options);
            this.tasks.delete(id);
        } else if (task) {
            this.sendToWindow('download-complete', { id });
            this.tasks.delete(id);
        }
        return;
    }

    this.sendLog(id, 'Annulation et finalisation du fichier...');

    if (os.platform() === 'win32') {
       exec(`taskkill /pid ${proc.pid} /T /F`);
    } else {
       proc.kill('SIGINT');
    }
  }

  pause(id) {
    const proc = this.processes.get(id);
    const task = this.tasks.get(id);
    if (!proc || !task) return;

    this.sendLog(id, 'Mise en pause du téléchargement...');

    // Mark as paused BEFORE killing so the close handler doesn't trigger completion
    task.isPaused = true;

    // Kill the process immediately — the .part file stays on disk
    // yt-dlp's -c (continue) flag will pick up from the .part file on resume
    if (os.platform() === 'win32') {
      exec(`taskkill /pid ${proc.pid} /T /F`, () => {
        this.sendLog(id, 'Téléchargement suspendu. Le fichier partiel est conservé.');
      });
    } else {
      try { proc.kill('SIGINT'); } catch(e) {}
    }
  }

  resume(id) {
    const task = this.tasks.get(id);
    if (!task || !task.isPaused) return;

    this.sendLog(id, 'Reprise du téléchargement...');
    task.isPaused = false;

    // Restart yt-dlp with same args — the -c flag resumes from the .part file automatically
    this._executeYtDlp(id, task.url, task.options);
  }



  _mergeParts(id, parts, options) {
      if (parts.length === 1) {
          this.sendLog(id, `Mode Acharné: Assemblage ignoré (un seul morceau capturé).`);
          this.sendToWindow('download-complete', { id });
          return;
      }

      this.sendLog(id, `Mode Acharné: Assemblage de ${parts.length} morceaux en cours...`);
      this.sendToWindow('download-progress', {
           id, percent: 100, speed: 'Assemblage...', eta: 'Finalisation', size: ''
      });

      const downloadsDir = options.outputFolder || app.getPath('downloads');
      const concatFile = path.join(this.tempDir, `concat_${id}.txt`);
      
      // Get base extension from first part
      const ext = path.extname(parts[0]);
      // Construct final filename: "My Video [ID].mp4"
      // Wait, we can strip the -[epoch] part.
      // Example part: "Title [150818]-170422.mp4"
      const basename = path.basename(parts[0]);
      const baseMatch = basename.match(/(.*\[[a-zA-Z0-9_-]+\])-[0-9]+\.[a-zA-Z0-9]+$/);
      let finalName = `live_merged_${id}${ext}`;
      if (baseMatch) {
          finalName = `${baseMatch[1]}${ext}`;
      }
      const finalDest = path.join(downloadsDir, finalName);

      const fileList = parts.map(p => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n');
      fs.writeFileSync(concatFile, fileList);

      const ffmpegBin = this.getFfmpegBin();
      
      if (os.platform() !== 'win32') {
        try { fs.chmodSync(ffmpegBin, '755'); } catch(e) {}
      }
      
      const args = ['-f', 'concat', '-safe', '0', '-i', concatFile, '-c', 'copy', finalDest, '-y'];

      let proc;
      try {
          proc = spawn(ffmpegBin, args);
      } catch (e) {
          this.sendLog(id, `Erreur Spawn FFmpeg: ${e.message}`);
          return;
      }

      proc.stderr.on('data', (d) => {
          console.log(`[FFMPEG_MERGE] ${d.toString().trim()}`);
      });

      proc.on('error', (err) => {
          this.sendLog(id, `CRASH FFmpeg: ${err.message}`);
      });
      
      proc.on('close', (code) => {
           try { fs.unlinkSync(concatFile); } catch(e){}
           if (code === 0) {
               this.sendLog(id, `Assemblage réussi ! Nettoyage des morceaux...`);
               for (const part of parts) {
                   try { fs.unlinkSync(part); } catch (e) {}
               }
               this.sendToWindow('download-destination', { id, dest: finalDest });
           } else {
               this.sendLog(id, `Erreur lors de l'assemblage (Code ${code}). Les morceaux originaux sont conservés.`);
           }
           this.sendToWindow('download-complete', { id });
      });
  }
  async _executeTikTokPhotoProcess(id, url, options, workDir, downloadsDir) {
      const ytDlpPath = this.getYtDlpPath();
      const unpackedFfmpeg = this.getFfmpegDir();

      const fileNameTemplate = options.relentlessMode ? `%(title).70s [%(id)s]-%(epoch)s.%(ext)s` : `%(title).70s [%(id)s].%(ext)s`;

      const audioArgs = [
          url,
          '--ffmpeg-location', unpackedFfmpeg,
          '--newline',
          '-c',
          '-P', `home:${workDir}`,
          '--no-playlist',
          '--restrict-filenames',
          '-f', 'bestaudio',
          '--recode-video', 'mp4',
          '-o', fileNameTemplate
      ];

      const thumbArgs = [
          url,
          '--ffmpeg-location', unpackedFfmpeg,
          '--newline',
          '-c',
          '-P', `home:${workDir}`,
          '--no-playlist',
          '--restrict-filenames',
          '--write-all-thumbnails',
          '--skip-download',
          '-o', fileNameTemplate
      ];

      if (options.ghostMode) {
          const agent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
          const ghostArgs = ['--user-agent', agent, '--sleep-requests', '1'];
          audioArgs.push(...ghostArgs);
          thumbArgs.push(...ghostArgs);
      }
      
      if (options.useCookies) {
          if (options.cookieBrowser === 'file' && options.cookieFilePath) {
             audioArgs.push('--cookies', options.cookieFilePath);
             thumbArgs.push('--cookies', options.cookieFilePath);
          } else {
             const browser = options.cookieBrowser || 'chrome';
             audioArgs.push('--cookies-from-browser', browser);
             thumbArgs.push('--cookies-from-browser', browser);
          }
      }

      try {
          this.sendLog(id, `[TikTok] Étape 1/3: Téléchargement du son (MP4)...`);
          await this._runProcessAsync(id, ytDlpPath, audioArgs, 'Téléchargement Audio');
          
          const taskObj = this.tasks.get(id);
          if (!taskObj || taskObj.isCancelled || taskObj.isPaused) return;

          this.sendLog(id, `[TikTok] Étape 2/3: Téléchargement des images...`);
          await this._runProcessAsync(id, ytDlpPath, thumbArgs, 'Téléchargement Images');
          
          if (!taskObj || taskObj.isCancelled || taskObj.isPaused) return;
          
          this.sendLog(id, `[TikTok] Étape 3/3: Assemblage FFmpeg...`);
          
          let finalMp4 = null;
          const files = fs.readdirSync(workDir);
          for(const f of files) {
              if (f.endsWith('.mp4')) {
                  finalMp4 = path.join(workDir, f);
                  break;
              }
          }
          
          if (finalMp4) {
              this._convertTikTokPhotoToVideo(id, finalMp4, downloadsDir);
          } else {
              this.sendLog(id, `[TikTok] Erreur: Audio MP4 introuvable.`);
              this.sendToWindow('download-error', { id, error: 'AUDIO_MISSING' });
              this.tasks.delete(id);
          }

      } catch (err) {
          const task = this.tasks.get(id);
          if (err.message === 'CANCELLED') {
              if (task && task.isPaused) {
                 this.sendLog(id, '[TikTok] Processus arrêté (pause).');
                 return;
              }
              this.sendToWindow('download-complete', { id });
              this.tasks.delete(id);
              return;
          }
          this.sendLog(id, `[TikTok] Erreur: ${err.message}`);
          this.sendToWindow('download-error', { id, error: `SYSTEM_ERROR|${err.message}` });
          this.tasks.delete(id);
      }
  }

  _runProcessAsync(id, bin, args, context) {
      return new Promise((resolve, reject) => {
          const proc = spawn(bin, args);
          this.processes.set(id, proc);
          
          proc.stdout.on('data', (data) => {
             const output = data.toString();
             if (output.includes('[download]') && !output.includes('Destination')) {
                 let percent = null;
                 const percentMatch = output.match(/([\d\.]+)%/);
                 if (percentMatch) percent = parseFloat(percentMatch[1]);
                 if (percent !== null) {
                     this.sendToWindow('download-progress', { id, percent, speed: context, eta: '', size: '' });
                 }
             }
          });
          
          proc.stderr.on('data', () => {});
          
          proc.on('close', (code) => {
              this.processes.delete(id);
              const task = this.tasks.get(id);
              if (task && (task.isCancelled || task.isPaused)) {
                  reject(new Error('CANCELLED'));
              } else if (code === 0 || code === null) {
                  resolve();
              } else {
                  reject(new Error(`Exit Code ${code}`));
              }
          });
          
          proc.on('error', (err) => {
              this.processes.delete(id);
              reject(err);
          });
      });
  }

  _convertTikTokPhotoToVideo(id, audioDest, realDownloadsDir) {
      const dir = path.dirname(audioDest);
      
      this.sendLog(id, `Fusion Vidéo/Audio en cours via FFmpeg (TikTok Photo)...`);
      this.sendToWindow('download-progress', {
           id, percent: 100, speed: 'Assemblage ffmpeg...', eta: 'Patientez', size: ''
      });

      let images = [];
      let finalAudioDest = audioDest;
      
      try {
          const files = fs.readdirSync(dir);
          for (const file of files) {
              const fullPath = path.join(dir, file);
              if (file.endsWith('.jpeg') || file.endsWith('.jpg') || file.endsWith('.webp') || file.endsWith('.png')) {
                  images.push(fullPath);
              } else if (!fullPath.endsWith('.mp4') && (file.endsWith('.mp3') || file.endsWith('.m4a') || file.endsWith('.wav'))) {
                  finalAudioDest = fullPath;
              }
          }
      } catch(e) {
          this.sendLog(id, `Erreur lecture dossier tmp: ${e.message}`);
      }

      if (images.length === 0) {
          this.sendLog(id, `Aucune image trouvée. Transfert du fichier audio uniquement.`);
          const fallbackDest = path.join(realDownloadsDir, path.basename(finalAudioDest));
          try {
              fs.renameSync(finalAudioDest, fallbackDest);
              this.destinations.set(id, fallbackDest);
              this.sendToWindow('download-destination', { id, fallbackDest });
          } catch(e) {}
          this.sendToWindow('download-complete', { id });
          this.tasks.delete(id);
          return;
      }

      const ffmpegBin = this.getFfmpegBin();
      const finalDestName = path.basename(finalAudioDest).replace(path.extname(finalAudioDest), '_FINAL.mp4');
      const finalDest = path.join(realDownloadsDir, finalDestName);
      
      let args = [];
      
      images.forEach((img) => {
          args.push('-loop', '1', '-t', '5', '-i', img);
      });
      
      args.push('-i', finalAudioDest);
      
      if (images.length > 1) {
          let filterComplex = '';
          for (let i = 0; i < images.length; i++) {
              filterComplex += `[${i}:v]`;
          }
          filterComplex += `concat=n=${images.length}:v=1:a=0[v]`;
          args.push('-filter_complex', filterComplex);
          args.push('-map', '[v]', '-map', `${images.length}:a`);
      } else {
          args.push('-map', '0:v', '-map', '1:a');
      }
      
      args.push('-c:v', 'libx264', '-c:a', 'copy', '-pix_fmt', 'yuv420p', '-shortest', '-y', finalDest);

      try {
          const proc = spawn(ffmpegBin, args);
          
          proc.stderr.on('data', () => {});

          proc.on('error', (err) => {
              this.sendLog(id, `Erreur FFmpeg (Photo): ${err.message}`);
              this.sendToWindow('download-error', { id, error: 'PROCESS_ERROR' });
          });
          
          proc.on('close', (code) => {
              if (code === 0 && fs.existsSync(finalDest)) {
                  this.sendLog(id, `Vidéo TikTok générée avec succès !`);
                  this.destinations.set(id, finalDest);
                  this.sendToWindow('download-destination', { id, dest: finalDest });
              } else {
                  this.sendLog(id, `Erreur FFmpeg (Code ${code}).`);
                  try {
                      const rescueDest = path.join(realDownloadsDir, path.basename(finalAudioDest));
                      fs.renameSync(finalAudioDest, rescueDest);
                      this.destinations.set(id, rescueDest);
                  } catch(e){}
              }
              
              try { fs.rmSync(dir, { recursive: true, force: true }); } catch(e){}
              
              this.sendToWindow('download-complete', { id });
              this.tasks.delete(id);
          });
      } catch(e) {
          this.sendLog(id, `Crash FFmpeg Spawn: ${e.message}`);
          this.sendToWindow('download-complete', { id });
          this.tasks.delete(id);
      }
  }

  getVideoMetadata(url, options = {}) {
      return new Promise((resolve) => {
          const ytDlpPath = this.getYtDlpPath();
          const args = ['--dump-json', '--no-playlist', url];
          
          if (options.useCookies) {
              if (options.cookieBrowser === 'file' && options.cookieFilePath) {
                  args.push('--cookies', options.cookieFilePath);
              } else if (options.cookieBrowser && options.cookieBrowser !== 'none') {
                  args.push('--cookies-from-browser', options.cookieBrowser);
              }
          }

          const proc = spawn(ytDlpPath, args);
          let output = '';
          
          proc.stdout.on('data', d => { output += d.toString(); });
          
          proc.on('close', (code) => {
              if (code === 0) {
                  try {
                      // Dump JSON output can be multiple lines if there are multiple formats, or contain yt-dlp warning prints before the json.
                      // Best way to parse it is to find the LAST valid json object or just parse it directly. 
                      // actually dump-json prints exactly one json per url
                      const data = JSON.parse(output.trim());
                      resolve({
                          success: true,
                          title: data.title,
                          thumbnail: data.thumbnail,
                          isLive: data.is_live || false,
                          filesize: data.filesize_approx || data.filesize || null,
                          duration: data.duration_string || data.duration || null,
                          extractor: data.extractor || data.extractor_key
                      });
                  } catch(e) {
                      // Attempt to salvage if yt-dlp outputs warnings then JSON
                      try {
                          const lines = output.trim().split('\n');
                          const lastLine = lines[lines.length - 1];
                          const data = JSON.parse(lastLine);
                          resolve({
                              success: true,
                              title: data.title,
                              thumbnail: data.thumbnail,
                              isLive: data.is_live || false,
                              filesize: data.filesize_approx || data.filesize || null,
                              duration: data.duration_string || data.duration || null,
                              extractor: data.extractor || data.extractor_key
                          });
                      } catch (e2) {
                          resolve({ success: false, error: 'JSON Parse Error' });
                      }
                  }
              } else {
                  resolve({ success: false, error: 'Failed to fetch metadata' });
              }
          });

          proc.on('error', (err) => {
              resolve({ success: false, error: err.message });
          });

          setTimeout(() => { try { proc.kill(); } catch{} resolve({success:false, error:'Timeout'}); }, 25000);
      });
  }

  ffmpegCutVideo(options) {
      return new Promise((resolve) => {
          const { input, start, end, mode, outputPath } = options;
          if (!input || !fs.existsSync(input)) {
              return resolve({ success: false, error: 'Fichier source introuvable.' });
          }

          const ffmpegBin = this.getFfmpegBin();
          if (os.platform() !== 'win32') {
              try { fs.chmodSync(ffmpegBin, '755'); } catch(e) {}
          }

          let args = ['-y'];

          if (start) args.push('-ss', start.toString());
          if (end) args.push('-to', end.toString());

          args.push('-i', input);

          if (mode === 'fast') {
              args.push('-c', 'copy');
          } else {
              args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-c:a', 'aac');
          }

          args.push(outputPath);

          const proc = spawn(ffmpegBin, args);
          
          let errLog = '';
          proc.stderr.on('data', (d) => { errLog += d.toString(); });

          proc.on('close', (code) => {
              if (code === 0 && fs.existsSync(outputPath)) {
                  resolve({ success: true, dest: outputPath });
              } else {
                  console.error("FFmpeg cut error:", errLog);
                  resolve({ success: false, error: `Erreur FFmpeg (Code ${code})` });
              }
          });

          proc.on('error', (err) => {
              resolve({ success: false, error: err.message });
          });
      });
  }

  remove(id) {
    const removeMsg = this.language === 'fr' 
      ? 'Suppression définitive du téléchargement et des fichiers...' 
      : 'Permanently deleting download and files...';
    this.sendLog(id, removeMsg);
    
    // 1. Get destination if it exists
    const dest = this.destinations.get(id);
    const task = this.tasks.get(id);
    const parts = task ? task.parts : [];

    // 2. Stop the process
    this.cancel(id);

    // 3. Delete files
    const deleteFile = (f) => {
      try {
        if (f && fs.existsSync(f)) {
          fs.unlinkSync(f);
          const delMsg = this.language === 'fr' 
            ? `Fichier supprimé : ${path.basename(f)}` 
            : `File deleted: ${path.basename(f)}`;
          this.sendLog(id, delMsg);
        }
      } catch (e) {
        const errMsg = this.language === 'fr' 
          ? `Erreur lors de la suppression : ${e.message}` 
          : `Error during deletion: ${e.message}`;
        this.sendLog(id, errMsg);
      }
    };

    if (dest) {
      deleteFile(dest);
      deleteFile(dest + '.part');
      deleteFile(dest + '.ytdl');
    }

    // Delete relentless mode parts
    if (parts && parts.length > 0) {
      parts.forEach(p => deleteFile(p));
    }

    // 4. Cleanup maps
    this.destinations.delete(id);
    this.tasks.delete(id);
  }
}

module.exports = YtDlpManager;
