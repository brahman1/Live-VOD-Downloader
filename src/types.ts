export interface DownloadTask {
  id: string;
  url: string;
  status: 'pending' | 'downloading' | 'paused' | 'completed' | 'error';
  progress: number;
  speed: string;
  eta: string;
  size: string;
  destination: string;
  errorMsg?: string;
  options: DownloadOptions;
  thumbnail?: string; // Random placeholder or generated
}

export interface DownloadOptions {
  format: 'eco' | 'optimized' | 'master' | 'audio' | 'video_only' | 'video_all';
  resolution?: '1080' | '720' | '480' | '360';
  useCookies: boolean;
  cookieBrowser?: string;
  cookieFilePath?: string;
  ghostMode: boolean;
  relentlessMode: boolean;
  autoCut: boolean;
  outputFolder?: string;
  language?: 'en' | 'fr';
}
