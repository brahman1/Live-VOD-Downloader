import { useState, useEffect } from 'react';
import { Download, Link, Shuffle, Scissors, Key, RefreshCw, Radio, FileVideo, ClipboardPaste, FolderOpen, Loader2, PlayCircle, ShieldCheck, Zap } from 'lucide-react';
import { DownloadOptions } from '../types';
import { Translator } from '../App';

interface DashboardProps {
  onStartDownload: (url: string, options: DownloadOptions) => string;
  t: Translator;
  onNavigateSitter: () => void;
  outputFolder: string;
  setOutputFolder: (folder: string) => void;
  defaultFolder: string;
  licenseStatus?: string;
}

interface VideoMetadata {
  success: boolean;
  title?: string;
  thumbnail?: string;
  isLive?: boolean;
  filesize?: number;
  duration?: string;
  extractor?: string;
  error?: string;
}

export default function Dashboard({ onStartDownload, t, onNavigateSitter, outputFolder, setOutputFolder, defaultFolder, licenseStatus = 'PRO' }: DashboardProps) {
  const [url, setUrl] = useState('');
  // We no longer have a manual 'live' vs 'video' tab. It's inferred.
  const [inferredType, setInferredType] = useState<'live' | 'video'>('video');
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  
  const [format, setFormat] = useState<DownloadOptions['format']>('optimized');
  const [resolution, setResolution] = useState<'1080' | '720' | '480' | '360'>('1080');
  const [cookieBrowser, setCookieBrowser] = useState<string>('none');
  const [cookieFilePath, setCookieFilePath] = useState<string>('');
  const useCookies = cookieBrowser !== 'none';
  const [ghostMode, setGhostMode] = useState(false);
  const [relentlessMode, setRelentlessMode] = useState(false);
  const [autoCut, setAutoCut] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [checkError, setCheckError] = useState<string>('');

  const formatBytes = (bytes?: number | null, decimals = 2) => {
    if (!bytes) return t('UNKNOWN_SIZE') || 'Inconnu';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const handleSelectCookieFile = async () => {
    if (window.electronAPI?.selectCookieFile) {
      const file = await window.electronAPI.selectCookieFile();
      if (file) setCookieFilePath(file);
    }
  };

  const handleSelectOutputFolder = async () => {
    if (window.electronAPI?.selectFolder) {
      const folder = await window.electronAPI.selectFolder();
      if (folder) {
        setOutputFolder(folder);
        (window.electronAPI as any)?.saveOutputFolder?.(folder);
      }
    }
  };

  const handleURLComplete = async (targetUrl: string) => {
    if (!targetUrl || !window.electronAPI?.getVideoInfo) return;
    setIsChecking(true);
    setCheckError('');
    setMetadata(null);
    
    try {
      const data = await window.electronAPI.getVideoInfo(targetUrl, {
          useCookies, cookieBrowser, cookieFilePath
      });
      if (data.success) {
         setMetadata(data);
         const type = data.isLive ? 'live' : 'video';
         setInferredType(type);
         if (type === 'video' && (format === 'eco' || format === 'master')) {
            setFormat('video_all');
         } else if (type === 'live' && (format === 'video_only' || format === 'video_all')) {
            setFormat('optimized');
         }
      } else {
         setCheckError(data.error || 'Erreur lors de la lecture du lien.');
      }
    } catch(e: any) {
      setCheckError(e.message);
    }
    setIsChecking(false);
  };

  const handleUrlChange = (e: any) => {
     const value = e.target.value;
     setUrl(value);
     setMetadata(null);
     setCheckError('');
  };

  const handlePasteAndCheck = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text);
        if (text.startsWith('http')) {
           handleURLComplete(text);
        }
      }
    } catch (e) {}
  };

  // On Enter key
  const handleKeyDown = (e: any) => {
     if (e.key === 'Enter') {
         if (url.startsWith('http')) {
             handleURLComplete(url);
         }
     }
  };

  // Also trigger manually via button if needed? A "Valider" button makes sense.
  
  const handleDownload = () => {
    if (!url || !metadata) return;
    onStartDownload(url, { format, resolution, useCookies, cookieBrowser, cookieFilePath, ghostMode, relentlessMode, autoCut, outputFolder });
    setUrl('');
    setMetadata(null);
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 h-full flex flex-col xl:flex-row gap-8">
      
      {/* LEFT COLUMN: ACTION & CONFIGURATION */}
      <div className="flex-1 space-y-6">
        <div className="bg-white/5 border border-white/10 p-6 sm:p-8 rounded-3xl shadow-xl backdrop-blur-xl relative overflow-visible">
          <h2 className="text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-purple-500 mb-6 flex items-center gap-3">
            {t('NEW_DOWNLOAD')}
            {isChecking && <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />}
          </h2>
          
          <div className="space-y-6">
            {/* URL Input */}
            <div className="relative group flex gap-2">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                  <Link className="w-5 h-5 text-slate-400 group-focus-within:text-cyan-400 transition-colors" />
                </div>
                <input 
                  type="text" 
                  placeholder={t('URL_PLACEHOLDER')} 
                  value={url}
                  onChange={handleUrlChange}
                  onKeyDown={handleKeyDown}
                  className="w-full bg-slate-900/50 border border-slate-700/50 rounded-2xl py-4 pl-12 pr-12 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all font-medium"
                />
                <button
                   onClick={handlePasteAndCheck}
                   className="absolute inset-y-0 right-4 flex items-center justify-center cursor-pointer text-slate-400 hover:text-cyan-400 transition-all duration-300"
                   title={t('SMART_PASTE')}
                >
                   <ClipboardPaste className="w-5 h-5" />
                </button>
              </div>
              
              {!metadata && !isChecking && url && (
                <button onClick={() => handleURLComplete(url)} className="px-6 rounded-2xl bg-slate-800 text-white font-bold hover:bg-slate-700 transition-colors shadow-lg">
                  {t('VALIDATE') || 'Valider'}
                </button>
              )}
            </div>

            {checkError && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-sm font-medium">
                 ⚠️ {checkError}
              </div>
            )}

            {/* PRE-FLIGHT VALIDATION CARD */}
            {metadata && (
              <div className="p-1 rounded-2xl bg-gradient-to-r from-cyan-500/20 to-purple-500/20 animate-in zoom-in-95 duration-300">
                <div className="bg-slate-900 rounded-xl p-4 flex gap-4 overflow-hidden relative">
                   {metadata.thumbnail ? (
                     <div className="w-32 h-24 shrink-0 rounded-lg overflow-hidden bg-slate-800 border border-slate-700 relative">
                        <img src={metadata.thumbnail} className="w-full h-full object-cover" alt="Thumb" />
                        {metadata.isLive && (
                           <div className="absolute top-1 left-1 bg-red-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded flex items-center gap-1 shadow-black shadow-lg">
                             <div className="w-1.5 h-1.5 bg-white rounded-full animate-ping" /> LIVE
                           </div>
                        )}
                        {!metadata.isLive && metadata.duration && (
                           <div className="absolute bottom-1 right-1 bg-black/80 px-1 rounded text-[10px] font-mono text-white">
                             {metadata.duration}
                           </div>
                        )}
                     </div>
                   ) : (
                     <div className="w-32 h-24 shrink-0 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-600">
                        <PlayCircle className="w-8 h-8 opacity-50" />
                     </div>
                   )}
                   
                   <div className="flex-1 min-w-0 pr-4">
                      <h3 className="font-bold text-slate-100 truncate mb-1">{metadata.title || 'Vidéo Inconnue'}</h3>
                      <div className="flex flex-wrap gap-2 text-xs font-medium mt-3">
                         <span className="bg-slate-800 px-2 py-1 rounded text-slate-400">
                           {metadata.extractor}
                         </span>
                         {!metadata.isLive && (
                           <span className="bg-blue-500/10 text-blue-400 px-2 py-1 rounded border border-blue-500/20">
                             Poids estimé : {formatBytes(metadata.filesize)}
                           </span>
                         )}
                      </div>
                   </div>
                </div>
              </div>
            )}

            {/* If metadata exists, show options */}
            {metadata && (
               <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-500">
                 
                  {/* Destination */}
                  <div className="bg-slate-900/40 border border-slate-800 rounded-xl px-4 py-3 flex items-center gap-3">
                    <FolderOpen className="w-5 h-5 text-slate-500" />
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] font-medium text-slate-500 uppercase">{t('DESTINATION_FOLDER')}</span>
                      <div className="text-xs text-slate-300 truncate tracking-tight">{outputFolder || defaultFolder}</div>
                    </div>
                    <button onClick={handleSelectOutputFolder} className="text-xs bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg text-slate-300 transition-colors border border-slate-700 font-medium">
                      {t('MODIFY') || 'Modifier'}
                    </button>
                  </div>

                  {/* Format/Options Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div className="bg-slate-900/30 border border-slate-800 rounded-xl p-4">
                        <label className="text-sm text-slate-400 font-medium mb-3 block">{t('FORMAT_QUALITY')}</label>
                        <div className="grid grid-cols-2 gap-2">
                        {(inferredType === 'live' ? [
                          { id: 'eco', label: t('ECO_480'), isPro: false },
                          { id: 'optimized', label: t('OPT_1080'), isPro: false },
                          { id: 'master', label: t('MASTER'), isPro: false },
                          { id: 'audio', label: t('AUDIO_ONLY'), isPro: true },
                        ] : [
                          { id: 'video_all', label: t('VIDEO_ALL'), isPro: false },
                          { id: 'video_only', label: t('VIDEO_ONLY'), isPro: true },
                          { id: 'audio', label: t('AUDIO_ONLY'), isPro: true },
                        ]).map((opt) => {
                          const disabled = opt.isPro && licenseStatus === 'FREE';
                          return (
                          <button
                            key={opt.id} disabled={disabled}
                            onClick={() => setFormat(opt.id as DownloadOptions['format'])}
                            className={`py-2 px-3 relative flex justify-center text-center rounded-lg text-sm transition-all ${disabled ? 'opacity-50 border-dashed border-slate-700' : 'cursor-pointer'} ${
                              format === opt.id && !disabled ? (inferredType === 'live' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50' : 'bg-purple-500/20 text-purple-400 border border-purple-500/50') : 'bg-slate-800 text-slate-400'
                            } ${inferredType === 'video' && opt.id === 'audio' ? 'col-span-2' : ''}`}
                          >
                            {opt.label}
                          </button>
                        )})}
                        </div>
                     </div>

                     {/* Right Panel Smart Addons or Resolution */}
                     <div className="bg-slate-900/30 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
                        {inferredType === 'video' && format !== 'audio' && (
                           <div className="mb-2">
                             <label className="text-sm text-slate-400 font-medium mb-2 block">{t('RESOLUTION')}</label>
                             <div className="flex gap-2">
                               {['1080', '720', '480', '360'].map(res => (
                                 <button key={res} onClick={() => setResolution(res as any)} className={`flex-1 py-1 text-xs rounded-lg font-medium transition-all ${resolution === res ? 'bg-purple-500/20 text-purple-300 border border-purple-500/50' : 'bg-slate-800 text-slate-400'}`}>{res}p</button>
                               ))}
                             </div>
                           </div>
                        )}

                        <label className="flex items-center space-x-3 cursor-pointer group">
                          <input type="checkbox" className="hidden" checked={ghostMode} onChange={e => setGhostMode(e.target.checked)} />
                          <div className={`p-1.5 rounded transition-colors ${ghostMode ? 'bg-purple-500/20 text-purple-400' : 'bg-slate-800 text-slate-500'}`}><Shuffle className="w-3 h-3" /></div>
                          <div className="flex-1 text-sm font-medium text-slate-300">{t('GHOST_MODE')}</div>
                          <div className={`w-8 h-4 rounded-full relative ${ghostMode ? 'bg-purple-500' : 'bg-slate-700'}`}>
                            <div className={`absolute top-0.5 left-0.5 bg-white w-3 h-3 rounded-full transition-transform ${ghostMode ? 'translate-x-4' : ''}`}></div>
                          </div>
                        </label>
                        
                        {inferredType === 'live' && (
                           <>
                             <label className="flex items-center space-x-3 cursor-pointer group">
                                <input type="checkbox" className="hidden" checked={relentlessMode} onChange={e => setRelentlessMode(e.target.checked)} />
                                <div className={`p-1.5 rounded transition-colors ${relentlessMode ? 'bg-pink-500/20 text-pink-400' : 'bg-slate-800 text-slate-500'}`}><RefreshCw className="w-3 h-3" /></div>
                                <div className="flex-1 text-sm font-medium text-slate-300">{t('RELENTLESS_MODE')}</div>
                                <div className={`w-8 h-4 rounded-full relative ${relentlessMode ? 'bg-pink-500' : 'bg-slate-700'}`}>
                                  <div className={`absolute top-0.5 left-0.5 bg-white w-3 h-3 rounded-full transition-transform ${relentlessMode ? 'translate-x-4' : ''}`}></div>
                                </div>
                              </label>
                           </>
                        )}
                     </div>
                  </div>

                  <button 
                    onClick={handleDownload}
                    className="w-full py-4 rounded-xl font-black text-lg transition-all duration-300 flex items-center justify-center gap-3 cursor-pointer bg-gradient-to-r from-cyan-500 to-purple-600 text-white shadow-[0_5px_15px_rgba(34,211,238,0.3)] hover:shadow-[0_12px_25px_rgba(168,85,247,0.5)] hover:-translate-y-1 hover:scale-[1.02]"
                  >
                    <Download className="w-6 h-6" />
                    {t('DOWNLOAD_NOW') || 'Lancer le téléchargement'}
                  </button>
               </div>
            )}
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN: VALUE PROP / INFO (Split Screen Design) */}
      <div className="w-full xl:w-[400px] flex flex-col gap-6">
        <div className="bg-gradient-to-br from-[#1E293B] to-[#0F172A] border border-slate-800 rounded-3xl p-8 relative overflow-hidden h-full shadow-2xl">
          <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/10 rounded-full blur-[80px] pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/10 rounded-full blur-[80px] pointer-events-none" />
          
          <div className="relative z-10 flex flex-col h-full justify-between">
            <div>
               <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 font-bold text-xs mb-8">
                 <Zap className="w-3 h-3" />
                 {t('DASH_BANNER_BADGE') || "L'outil Ultime de Capture"}
               </div>
             
               <h3 className="text-3xl font-black text-white mb-6 leading-tight">
                 {t('DASH_BANNER_TITLE_1') || "Conçu pour les"} <br/>
                 <span className="bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-purple-500">{t('DASH_BANNER_TITLE_2') || "Flux en Direct"}</span>
               </h3>

               <ul className="space-y-6">
                 <li className="flex gap-4">
                   <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0 border border-red-500/20">
                     <Radio className="w-5 h-5 text-red-500" />
                   </div>
                   <div>
                     <h4 className="font-bold text-slate-200 mb-1">{t('DASH_BANNER_FEAT1_TITLE') || "Moteur Anti-Coupure (Live)"}</h4>
                     <p className="text-sm text-slate-500 leading-relaxed">{t('DASH_BANNER_FEAT1_DESC') || "Notre technologie propriétaire assure que même si la connexion du streamer coupe, le logiciel reconnait et assemble les morceaux automatiquement."}</p>
                   </div>
                 </li>
                 <li className="flex gap-4">
                   <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center shrink-0 border border-green-500/20">
                     <ShieldCheck className="w-5 h-5 text-green-500" />
                   </div>
                   <div>
                     <h4 className="font-bold text-slate-200 mb-1">{t('DASH_BANNER_FEAT2_TITLE') || "Zero-Extract Privacy"}</h4>
                     <p className="text-sm text-slate-500 leading-relaxed">{t('DASH_BANNER_FEAT2_DESC') || "Vos cookies restent sur votre PC. Aucun serveur intermédiaire ne valide l'âge ou vos abonnements Sub-Only."}</p>
                   </div>
                 </li>
                 <li className="flex gap-4">
                   <div className="w-10 h-10 rounded-xl bg-[#25F4EE]/10 flex items-center justify-center shrink-0 border border-[#25F4EE]/20">
                     <Scissors className="w-5 h-5 text-[#25F4EE]" />
                   </div>
                   <div>
                     <h4 className="font-bold text-slate-200 mb-1">{t('DASH_BANNER_FEAT3_TITLE') || "Video Maker Zéro-Perte"}</h4>
                     <p className="text-sm text-slate-500 leading-relaxed">{t('DASH_BANNER_FEAT3_DESC') || "Coupez vos streams volumineux en un claquement de doigt, sans ré-encoder grâce à FFmpeg en backend."}</p>
                   </div>
                 </li>
                 <li className="flex gap-4">
                   <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0 border border-blue-500/20">
                     <FileVideo className="w-5 h-5 text-blue-500" />
                   </div>
                   <div>
                     <h4 className="font-bold text-slate-200 mb-1">{t('DASH_BANNER_FEAT4_TITLE') || "100% Multi-Plateformes"}</h4>
                     <p className="text-sm text-slate-500 leading-relaxed">{t('DASH_BANNER_FEAT4_DESC') || "Télécharge les Lives et les Vidéos (VOD) depuis toutes les plateformes (Twitch, YouTube, Kick, TikTok...), à l'exception d'Instagram."}</p>
                   </div>
                 </li>
               </ul>
            </div>
            
            <div className="mt-8 pt-6 border-t border-slate-800">
               <div className="flex items-center justify-between">
                 <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">Powered by</div>
                 <div className="text-sm font-black text-slate-300">yt-dlp core</div>
               </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
