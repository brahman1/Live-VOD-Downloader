const fs = require('fs');
const path = require('path');
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
    const file = fs.createWriteStream(dest);
    
    function fetch(reqUrl, redirects = 0) {
      https.get(reqUrl, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          if (redirects > 3) return reject(new Error('Too many redirects'));
          return fetch(response.headers.location, redirects + 1);
        }
        
        if (response.statusCode !== 200) {
          return reject(new Error(`Status Code: ${response.statusCode}`));
        }

        response.pipe(file);
        
        file.on('finish', () => {
          file.close();
          // Ensure executable permissions on Unix systems
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
  try {
    for (const f of FILES) {
       const dest = path.join(BINS_DIR, f.name);
       if (!fs.existsSync(dest)) {
          await downloadFile(f.url, dest);
       } else {
          console.log(`${f.name} already exists. Skipping.`);
       }
    }
    console.log('All binaries downloaded successfully.');
  } catch (err) {
    console.error('Error downloading binaries:', err);
    process.exit(1);
  }
})();
