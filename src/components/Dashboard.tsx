import { useState, useEffect } from 'react';
import { Download, Link, Shuffle, Sparkles, Key, RefreshCw, Radio, FileVideo, ClipboardPaste, FolderOpen, Loader2, PlayCircle, ShieldCheck, Zap } from 'lucide-react';
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
  remainingDownloads?: number;
  onOpenLicense?: () => void;
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

export default function Dashboard({ onStartDownload, t, onNavigateSitter, outputFolder, setOutputFolder, defaultFolder, licenseStatus = 'PRO', remainingDownloads = 10, onOpenLicense }: DashboardProps) {
  const [url, setUrl] = useState('');
  // We no longer have a manual 'live' vs 'video' tab. It's inferred.
  const [inferredType, setInferredType] = useState<'live' | 'video'>('video');
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  
  const [format, setFormat] = useState<DownloadOptions['format']>('optimized');
  const [resolution, setResolution] = useState<'1080' | '720' | '480' | '360'>(() => licenseStatus === 'FREE' ? '720' : '1080');
  const [cookieBrowser, setCookieBrowser] = useState<string>('none');
  const [cookieFilePath, setCookieFilePath] = useState<string>('');
  const useCookies = cookieBrowser !== 'none';
  const [ghostMode, setGhostMode] = useState(false);
  const [relentlessMode, setRelentlessMode] = useState(false);
  const [autoCut, setAutoCut] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [checkError, setCheckError] = useState<string>('');

  useEffect(() => {
    if (licenseStatus === 'FREE' && resolution === '1080') {
      setResolution('720');
    }
  }, [licenseStatus, resolution]);

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

  const handleDownload = () => {
    if (!url || !metadata) return;
    if (licenseStatus === 'FREE' && remainingDownloads <= 0) {
       onOpenLicense?.();
       return;
    }
    onStartDownload(url, { format, resolution, useCookies, cookieBrowser, cookieFilePath, ghostMode, relentlessMode, autoCut, outputFolder });
    setUrl('');
    setMetadata(null);
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 h-full flex flex-col xl:flex-row gap-8">
      
      {/* LEFT COLUMN: ACTION & CONFIGURATION */}
      <div className="flex-1 space-y-6">
        <div className="bg-white border border-slate-200/90 p-6 sm:p-8 rounded-3xl shadow-sm relative overflow-visible">
          <h2 className="text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-cyan-600 to-purple-600 mb-6 flex items-center gap-3">
            {t('NEW_DOWNLOAD')}
            {isChecking && <Loader2 className="w-5 h-5 text-cyan-600 animate-spin" />}
          </h2>
          
          <div className="space-y-6">
            {/* URL Input */}
            <div className="relative group flex gap-2">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                  <Link className="w-5 h-5 text-slate-400 group-focus-within:text-cyan-600 transition-colors" />
                </div>
                <input 
                  type="text" 
                  placeholder={t('URL_PLACEHOLDER')} 
                  value={url}
                  onChange={handleUrlChange}
                  onKeyDown={handleKeyDown}
                  className="w-full bg-slate-50 border border-slate-300 rounded-2xl py-4 pl-12 pr-12 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all font-semibold shadow-sm"
                />
                <button
                   onClick={handlePasteAndCheck}
                   className="absolute inset-y-0 right-4 flex items-center justify-center cursor-pointer text-slate-400 hover:text-cyan-600 transition-all duration-300"
                   title={t('SMART_PASTE')}
                >
                   <ClipboardPaste className="w-5 h-5" />
                </button>
              </div>
              
              {!metadata && !isChecking && url && (
                <button onClick={() => handleURLComplete(url)} className="px-6 rounded-2xl bg-cyan-600 text-white font-black hover:bg-cyan-500 transition-colors shadow-md shadow-cyan-600/20">
                  {t('VALIDATE') || 'Valider'}
                </button>
              )}
            </div>

            {checkError && (
              <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm font-bold">
                 ⚠️ {checkError}
              </div>
            )}

            {/* PRE-FLIGHT VALIDATION CARD */}
            {metadata && (
              <div className="p-1 rounded-2xl bg-gradient-to-r from-cyan-500/20 to-purple-500/20 animate-in zoom-in-95 duration-300">
                <div className="bg-white border border-slate-200 rounded-xl p-4 flex gap-4 overflow-hidden relative shadow-sm">
                   {metadata.thumbnail ? (
                     <div className="w-32 h-24 shrink-0 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 relative">
                        <img src={metadata.thumbnail} className="w-full h-full object-cover" alt="Thumb" />
                        {metadata.isLive && (
                           <div className="absolute top-1 left-1 bg-red-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded flex items-center gap-1 shadow-black/20 shadow-md">
                             <div className="w-1.5 h-1.5 bg-white rounded-full animate-ping" /> LIVE
                           </div>
                        )}
                        {!metadata.isLive && metadata.duration && (
                           <div className="absolute bottom-1 right-1 bg-black/70 px-1 rounded text-[10px] font-mono text-white">
                             {metadata.duration}
                           </div>
                        )}
                     </div>
                   ) : (
                     <div className="w-32 h-24 shrink-0 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400">
                        <PlayCircle className="w-8 h-8 opacity-50" />
                     </div>
                   )}
                   
                   <div className="flex-1 min-w-0 pr-4">
                      <h3 className="font-bold text-slate-900 truncate mb-1">{metadata.title || 'Vidéo Inconnue'}</h3>
                      <div className="flex flex-wrap gap-2 text-xs font-medium mt-3">
                         <span className="bg-slate-100 px-2 py-1 rounded text-slate-600 border border-slate-200">
                           {metadata.extractor}
                         </span>
                         {!metadata.isLive && (
                           <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded border border-blue-200">
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
                  <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-3 shadow-sm">
                    <FolderOpen className="w-5 h-5 text-slate-500" />
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] font-bold text-slate-500 uppercase">{t('DESTINATION_FOLDER') || 'Destination Folder'}</span>
                      <div className="text-xs text-slate-700 font-medium truncate tracking-tight">{outputFolder || defaultFolder}</div>
                    </div>
                    <button onClick={handleSelectOutputFolder} className="text-xs bg-slate-200 hover:bg-slate-300 px-3 py-1.5 rounded-lg text-slate-700 transition-colors border border-slate-300 font-bold shadow-sm cursor-pointer">
                      {t('MODIFY') || 'Modifier'}
                    </button>
                  </div>

                  {/* Format/Options Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 shadow-sm">
                        <label className="text-sm text-blue-900 font-extrabold mb-3 block">{t('FORMAT_QUALITY')}</label>
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
                            className={`py-2 px-3 relative flex justify-center text-center rounded-lg text-sm transition-all font-bold shadow-sm ${disabled ? 'opacity-50 border-dashed border-slate-300 bg-white text-slate-400' : 'cursor-pointer'} ${
                              format === opt.id && !disabled ? (inferredType === 'live' ? 'bg-cyan-600 text-white border border-cyan-700 shadow-md shadow-cyan-600/20' : 'bg-purple-600 text-white border border-purple-700 shadow-md shadow-purple-600/20') : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                            } ${inferredType === 'video' && opt.id === 'audio' ? 'col-span-2' : ''}`}
                          >
                            {opt.label}
                          </button>
                        )})}
                        </div>
                     </div>

                     {/* Right Panel Smart Addons or Resolution */}
                     <div className="bg-purple-50 border border-purple-100 rounded-xl p-4 flex flex-col gap-3 shadow-sm">
                         {inferredType === 'video' && format !== 'audio' && (
                            <div className="mb-2">
                              <label className="text-sm text-purple-900 font-extrabold mb-2 block flex items-center justify-between">
                                <span>{t('RESOLUTION')}</span>
                                {licenseStatus === 'FREE' && (
                                  <span className="text-[10px] text-purple-600 font-bold bg-purple-100 px-2 py-0.5 rounded-full">
                                    720p Max (FREE)
                                  </span>
                                )}
                              </label>
                              <div className="flex gap-2">
                                {['1080', '720', '480', '360'].map(res => {
                                  const isDisabled = res === '1080' && licenseStatus === 'FREE';
                                  return (
                                    <button 
                                      key={res} 
                                      disabled={isDisabled}
                                      onClick={() => !isDisabled && setResolution(res as any)} 
                                      className={`flex-1 py-1.5 text-xs rounded-lg font-bold transition-all shadow-sm relative flex items-center justify-center gap-1 ${
                                        isDisabled 
                                          ? 'opacity-40 border-dashed border-slate-300 bg-slate-100 text-slate-400 cursor-not-allowed' 
                                          : resolution === res 
                                          ? 'bg-purple-600 text-white border border-purple-700 shadow-md shadow-purple-600/20 cursor-pointer' 
                                          : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 cursor-pointer'
                                      }`}
                                      title={isDisabled ? '1080p réservé aux membres PRO / ELITE' : ''}
                                    >
                                      {res}p
                                      {isDisabled && <span className="text-[9px] font-black text-purple-600 bg-purple-100 px-1 rounded">PRO</span>}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                         )}

                        <label className="flex items-center space-x-3 cursor-pointer group">
                          <input type="checkbox" className="hidden" checked={ghostMode} onChange={e => setGhostMode(e.target.checked)} />
                          <div className={`p-1.5 rounded-lg transition-colors border ${ghostMode ? 'bg-purple-100 text-purple-600 border-purple-200' : 'bg-white text-slate-400 border-slate-200'}`}><Shuffle className="w-3 h-3" /></div>
                          <div className={`flex-1 text-sm font-bold ${ghostMode ? 'text-purple-900' : 'text-slate-600'}`}>{t('GHOST_MODE')}</div>
                          <div className={`w-8 h-4 rounded-full relative shadow-inner ${ghostMode ? 'bg-purple-600' : 'bg-slate-300'}`}>
                            <div className={`absolute top-0.5 left-0.5 bg-white w-3 h-3 rounded-full transition-transform shadow ${ghostMode ? 'translate-x-4' : ''}`}></div>
                          </div>
                        </label>
                        
                        {inferredType === 'live' && (
                           <>
                             <label className="flex items-center space-x-3 cursor-pointer group">
                                <input type="checkbox" className="hidden" checked={relentlessMode} onChange={e => setRelentlessMode(e.target.checked)} />
                                <div className={`p-1.5 rounded-lg transition-colors border ${relentlessMode ? 'bg-pink-100 text-pink-600 border-pink-200' : 'bg-white text-slate-400 border-slate-200'}`}><RefreshCw className="w-3 h-3" /></div>
                                <div className={`flex-1 text-sm font-bold ${relentlessMode ? 'text-pink-900' : 'text-slate-600'}`}>{t('RELENTLESS_MODE')}</div>
                                <div className={`w-8 h-4 rounded-full relative shadow-inner ${relentlessMode ? 'bg-pink-500' : 'bg-slate-300'}`}>
                                  <div className={`absolute top-0.5 left-0.5 bg-white w-3 h-3 rounded-full transition-transform shadow ${relentlessMode ? 'translate-x-4' : ''}`}></div>
                                </div>
                              </label>
                           </>
                        )}
                     </div>
                  </div>

                  <div className="space-y-2">
                    <button 
                      onClick={handleDownload}
                      className={`w-full py-4 rounded-xl font-black text-lg transition-all duration-300 flex items-center justify-center gap-3 cursor-pointer ${
                        licenseStatus === 'FREE' && remainingDownloads <= 0
                          ? 'bg-gradient-to-r from-red-600 to-pink-600 text-white shadow-lg shadow-red-500/30'
                          : 'bg-gradient-to-r from-cyan-500 to-purple-600 text-white shadow-[0_5px_15px_rgba(34,211,238,0.3)] hover:shadow-[0_12px_25px_rgba(168,85,247,0.5)] hover:-translate-y-1 hover:scale-[1.02]'
                      }`}
                    >
                      <Download className="w-6 h-6" />
                      {licenseStatus === 'FREE' && remainingDownloads <= 0
                        ? 'Quota Épuisé — Activer une Licence'
                        : (t('DOWNLOAD_NOW') || 'Lancer le téléchargement')}
                    </button>

                    {licenseStatus === 'FREE' && (
                      <div className="text-center text-xs text-slate-400 font-medium">
                        Offre d'essai : <span className={remainingDownloads <= 2 ? 'text-red-400 font-bold' : 'text-cyan-400 font-bold'}>{remainingDownloads} / 10 téléchargements restants</span>
                      </div>
                    )}
                  </div>
               </div>
            )}
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN: VALUE PROP / INFO (Split Screen Design) */}
      <div className="w-full xl:w-[400px] flex flex-col gap-6">
        <div className="bg-gradient-to-br from-indigo-50 via-purple-50 to-cyan-50 border border-indigo-100 rounded-3xl p-8 relative overflow-hidden h-full shadow-lg">
          <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-400/20 rounded-full blur-[80px] pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-400/20 rounded-full blur-[80px] pointer-events-none" />
          
          <div className="relative z-10 flex flex-col h-full justify-between">
            <div>
               <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-100 border border-cyan-200 text-cyan-800 font-extrabold text-xs mb-8 shadow-sm">
                 <Zap className="w-3 h-3 text-cyan-600" />
                 {t('DASH_BANNER_BADGE') || "L'outil Ultime de Capture"}
               </div>
             
               <h3 className="text-3xl font-black text-slate-900 mb-6 leading-tight">
                 {t('DASH_BANNER_TITLE_1') || "Conçu pour les"} <br/>
                 <span className="bg-clip-text text-transparent bg-gradient-to-r from-cyan-600 to-purple-600">{t('DASH_BANNER_TITLE_2') || "Flux en Direct"}</span>
               </h3>

               <ul className="space-y-6">
                 <li className="flex gap-4">
                   <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0 border border-red-200 shadow-sm">
                     <Radio className="w-5 h-5 text-red-600" />
                   </div>
                   <div>
                     <h4 className="font-bold text-slate-900 mb-1">{t('DASH_BANNER_FEAT1_TITLE') || "Moteur Anti-Coupure (Live)"}</h4>
                     <p className="text-sm text-slate-600 font-medium leading-relaxed">{t('DASH_BANNER_FEAT1_DESC') || "Notre technologie propriétaire assure que même si la connexion du streamer coupe, le logiciel reconnait et assemble les morceaux automatiquement."}</p>
                   </div>
                 </li>
                 <li className="flex gap-4">
                   <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0 border border-emerald-200 shadow-sm">
                     <ShieldCheck className="w-5 h-5 text-emerald-600" />
                   </div>
                   <div>
                     <h4 className="font-bold text-slate-900 mb-1">{t('DASH_BANNER_FEAT2_TITLE') || "Zero-Extract Privacy"}</h4>
                     <p className="text-sm text-slate-600 font-medium leading-relaxed">{t('DASH_BANNER_FEAT2_DESC') || "Vos cookies restent sur votre PC. Aucun serveur intermédiaire ne valide l'âge ou vos abonnements Sub-Only."}</p>
                   </div>
                 </li>
                  <li className="flex gap-4">
                    <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center shrink-0 border border-purple-200 shadow-sm">
                      <Sparkles className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 mb-1">{t('DASH_BANNER_FEAT3_TITLE') || "Moteur HD & Extractions High-Speed"}</h4>
                      <p className="text-sm text-slate-600 font-medium leading-relaxed">{t('DASH_BANNER_FEAT3_DESC') || "Sélection fluide des définitions jusqu'en 4K 60fps et extraction audio MP3/AAC sans altération de la source."}</p>
                    </div>
                  </li>
                 <li className="flex gap-4">
                   <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0 border border-blue-200 shadow-sm">
                     <FileVideo className="w-5 h-5 text-blue-600" />
                   </div>
                   <div>
                     <h4 className="font-bold text-slate-900 mb-1">{t('DASH_BANNER_FEAT4_TITLE') || "100% Multi-Plateformes"}</h4>
                     <p className="text-sm text-slate-600 font-medium leading-relaxed">{t('DASH_BANNER_FEAT4_DESC') || "Télécharge les Lives et les Vidéos (VOD) depuis toutes les plateformes (Twitch, YouTube, Kick, TikTok...), à l'exception d'Instagram."}</p>
                   </div>
                 </li>
               </ul>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
