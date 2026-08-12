const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');

const BINS_DIR = path.join(__dirname, '../bin');
if (!fs.existsSync(BINS_DIR)) {
  fs.mkdirSync(BINS_DIR, { recursive: true });
}

const FILES = [
  { name: 'yt-dlp.exe', url: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe' },
  { name: 'yt-dlp_macos', url: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos' },
  { name: 'yt-dlp', url: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp' }
];

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading ${path.basename(dest)}...`);
    const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';
    
    // Method 1: Try curl with HTTP/1.1 and IPv4 to avoid HTTP2 socket hangup bugs on macOS
    try {
      execSync(`curl -4 --http1.1 -L --retry 5 --retry-delay 2 -A "${userAgent}" -f -s -S -o "${dest}" "${url}"`, { stdio: 'inherit' });
      if (!dest.endsWith('.exe')) {
        try { fs.chmodSync(dest, '755'); } catch (e) {}
      }
      console.log(`Done: ${path.basename(dest)}`);
      return resolve();
    } catch (e) {
      console.warn(`curl failed, trying standard curl: ${e.message}`);
    }

    // Method 2: Standard curl fallback
    try {
      execSync(`curl -L --retry 3 -A "${userAgent}" -f -s -S -o "${dest}" "${url}"`, { stdio: 'inherit' });
      if (!dest.endsWith('.exe')) {
        try { fs.chmodSync(dest, '755'); } catch (e) {}
      }
      console.log(`Done: ${path.basename(dest)}`);
      return resolve();
    } catch (e) {
      console.warn(`standard curl failed, trying node https fallback...`);
    }

    // Method 3: Fallback to Node.js https
    const file = fs.createWriteStream(dest);
    
    function fetch(reqUrl, redirects = 0) {
      https.get(reqUrl, { headers: { 'User-Agent': userAgent } }, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          if (redirects > 5) return reject(new Error('Too many redirects'));
          return fetch(response.headers.location, redirects + 1);
        }
        
        if (response.statusCode !== 200) {
          return reject(new Error(`Status Code: ${response.statusCode}`));
        }

        response.pipe(file);
        
        file.on('finish', () => {
          file.close();
          if (!dest.endsWith('.exe')) {
             try { fs.chmodSync(dest, '755'); } catch(e) {}
          }
          console.log(`Done: ${path.basename(dest)}`);
          resolve();
        });
      }).on('error', (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
    }

    fetch(url);
  });
}

(async () => {
  console.log('Checking binaries...');
  for (const f of FILES) {
     const dest = path.join(BINS_DIR, f.name);
     if (!fs.existsSync(dest)) {
        try {
          await downloadFile(f.url, dest);
        } catch (err) {
          console.warn(`[WARNING] Failed to download ${f.name}: ${err.message}`);
          if (process.platform === 'darwin' && f.name === 'yt-dlp_macos') {
            console.error(`\n===============================================================`);
            console.error(`[MANUAL STEP REQUIRED] Network blocked automated GitHub release download.`);
            console.error(`Please download yt-dlp_macos directly from your browser:`);
            console.error(`👉 https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos`);
            console.error(`And place it into the folder: ${BINS_DIR}/yt-dlp_macos`);
            console.error(`Then make it executable: chmod +x ${BINS_DIR}/yt-dlp_macos`);
            console.error(`===============================================================\n`);
            process.exit(1);
          } else if (process.platform === 'win32' && f.name === 'yt-dlp.exe') {
            console.error(`[CRITICAL] Essential Windows binary ${f.name} failed to download.`);
            process.exit(1);
          }
        }
     } else {
        console.log(`${f.name} already exists. Skipping.`);
     }
  }
  console.log('Binary download step completed.');
})();
