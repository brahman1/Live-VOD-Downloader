import { useState, useEffect, useCallback } from 'react';
import { Home, DownloadCloud, ListVideo, Settings as SettingsIcon, Bug, Rss, History } from 'lucide-react';
import Dashboard from './components/Dashboard';
import QueueManager from './components/QueueManager';
import Settings from './components/Settings';
import SupportModal from './components/SupportModal';
import LicenseModal from './components/LicenseModal';
import SocialHub from './components/SocialHub';
import HistoryManager from './components/HistoryManager';
import { DownloadTask, DownloadOptions } from './types';
import locales from './locales.json';

// Declare types for the electron preload interface
declare global {
  interface Window {
    electronAPI: {
      download: (id: string, url: string, options: DownloadOptions) => void;
      onDownloadProgress: (callback: (data: any) => void) => void;
      onDownloadDestination: (callback: (data: any) => void) => void;
      onDownloadError: (callback: (data: any) => void) => void;
      onDownloadComplete: (callback: (data: any) => void) => void;
      onLog: (callback: (data: {id: string|null, message: string}) => void) => void;
      cancelDownload: (id: string) => void;
      pauseDownload: (id: string) => void;
      resumeDownload: (id: string) => void;
      checkLive: (url: string) => Promise<boolean>;
      getVideoInfo: (url: string, options?: any) => Promise<{success: boolean, title?: string, thumbnail?: string, isLive?: boolean, filesize?: number, duration?: string, extractor?: string, error?: string}>;
      selectFolder: () => Promise<string | null>;
      getDownloadsPath: () => Promise<string>;
      selectCookieFile: () => Promise<string | null>;
      removeDownload: (id: string) => void;
      getLicenseStatus: () => Promise<{status: string, key: string, stats: any}>;
    }
  }
}

function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

export type Translator = (key: keyof typeof locales.en) => string;
export type Language = 'en' | 'fr';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'queue' | 'history' | 'settings' | 'socialhub'>('dashboard');
  const [tasks, setTasks] = useState<DownloadTask[]>([]);
  const [logs, setLogs] = useState<{id: string|null, message: string}[]>([]);
  const [showSupportWindow, setShowSupportWindow] = useState(false);
  const [showLicenseModal, setShowLicenseModal] = useState(false);
  const [licenseStatus, setLicenseStatus] = useState<string>('FREE');
  const [quota, setQuota] = useState<{ usedDownloads: number, remainingDownloads: number }>({ usedDownloads: 0, remainingDownloads: 10 });
  
  const [language, setLanguage] = useState<Language>('en');
  const [outputFolder, setOutputFolder] = useState<string>(() => localStorage.getItem('customOutputFolder') || '');
  const [defaultFolder, setDefaultFolder] = useState<string>('');

  const [appUpdate, setAppUpdate] = useState<{
    available: boolean;
    version: string;
    releaseNotes: string;
    downloadUrl?: string;
    downloading: boolean;
    percent: number;
    downloaded: boolean;
  }>({
    available: false,
    version: '',
    releaseNotes: '',
    downloading: false,
    percent: 0,
    downloaded: false
  });

  const t: Translator = (key) => locales[language][key] || key;

  useEffect(() => {
    const api = window.electronAPI as any;
    
    api?.getDownloadsPath?.().then((defaultDownloadsPath: string) => {
      if (defaultDownloadsPath) {
        setDefaultFolder(defaultDownloadsPath);
        if (!localStorage.getItem('customOutputFolder')) {
           setOutputFolder(defaultDownloadsPath);
        }
      }
    });
    
    api?.getLicenseStatus?.().then((res: any) => {
      if (res) {
         if (res.status) setLicenseStatus(res.status);
         if (typeof res.usedDownloads === 'number' && typeof res.remainingDownloads === 'number') {
            setQuota({ usedDownloads: res.usedDownloads, remainingDownloads: res.remainingDownloads });
         }
         if (res.status === 'FREE') {
            setShowLicenseModal(true);
         }
      }
    });

    if (window.electronAPI) {
      window.electronAPI.onDownloadDestination(({id, dest}) => {
         setTasks(prev => prev.map(task => task.id === id ? { ...task, destination: dest } : task));
      });

      window.electronAPI.onDownloadProgress(({id, percent, speed, eta, size}) => {
         setTasks(prev => prev.map(task => task.id === id ? { ...task, percent, progress: percent, speed, eta, size, status: task.status === 'paused' ? 'paused' : 'downloading' } : task));
      });

      window.electronAPI.onDownloadError(({id, error}) => {
         if (id) {
           setTasks(prev => prev.map(task => task.id === id ? { ...task, status: 'error', errorMsg: error } : task));
           // If error is about quota exhausted, pop up license modal
           if (error && error.includes('Quota')) {
              setShowLicenseModal(true);
           }
         }
      });

      window.electronAPI.onDownloadComplete(({id}) => {
         setTasks(prev => prev.map(task => task.id === id ? { ...task, status: 'completed', progress: 100 } : task));
      });

      const apiAny = window.electronAPI as any;
      apiAny.onQuotaUpdated?.(({ usedDownloads, remainingDownloads }: any) => {
         setQuota({ usedDownloads, remainingDownloads });
         if (remainingDownloads <= 0) {
            setShowLicenseModal(true);
         }
      });

      window.electronAPI.onLog((logData) => {
        setLogs(prev => [...prev.slice(-199), logData]);
      });

      apiAny.onAppUpdateAvailable?.((data: any) => {
        setAppUpdate(prev => ({
          ...prev,
          available: true,
          version: data.version,
          releaseNotes: data.releaseNotes || '',
          downloadUrl: data.downloadUrl
        }));
      });

      apiAny.onAppUpdateProgress?.((data: any) => {
        setAppUpdate(prev => ({
          ...prev,
          downloading: true,
          percent: Math.round(data.percent || 0)
        }));
      });

      apiAny.onAppUpdateDownloaded?.((data: any) => {
        setAppUpdate(prev => ({
          ...prev,
          downloading: false,
          downloaded: true,
          version: data.version
        }));
      });
    }
  }, []);

  const handleStartDownload = useCallback((url: string, options: DownloadOptions): string => {
    const id = generateId();
    const newTask: DownloadTask = {
      id, url, options, status: 'pending', progress: 0, speed: '', eta: '', size: '', destination: ''
    };
    setTasks(prev => [...prev, newTask]);
    
    const finalFolder = options.outputFolder || outputFolder || defaultFolder;
    
    window.electronAPI?.download(id, url, { ...options, outputFolder: finalFolder, language });
    return id;
  }, [language, outputFolder, defaultFolder]);

  const handleCancelDownload = (id: string) => {
    window.electronAPI?.cancelDownload(id);
    setTasks(prev => prev.map(task => task.id === id ? { ...task, speed: t('SAVING'), eta: t('FINALIZING') } : task));
  };

  const handlePause = (id: string) => {
    window.electronAPI?.pauseDownload(id);
    setTasks(prev => prev.map(task => task.id === id ? { ...task, status: 'paused', speed: t('STATUS_PAUSED') } : task));
  };

  const handleResume = (id: string) => {
    window.electronAPI?.resumeDownload(id);
    setTasks(prev => prev.map(task => task.id === id ? { ...task, status: 'downloading', speed: t('STATUS_RESUMING') } : task));
  };

  const handleRemove = (id: string) => {
    window.electronAPI?.cancelDownload(id); // Ensure process stops
    // We'll call a specific remove IPC to also delete files
    const api = window.electronAPI as any;
    api?.removeDownload?.(id);
    setTasks(prev => prev.filter(task => task.id !== id));
  };

  const activeTasks = tasks.filter(t => ['pending', 'downloading', 'paused'].includes(t.status));
  const historyTasks = tasks.filter(t => ['completed', 'error'].includes(t.status));
  const activeDownloads = activeTasks.length;

  const handleClearHistory = () => {
    setTasks(prev => prev.filter(t => !['completed', 'error'].includes(t.status)));
  };

  return (
    <div className="flex h-screen bg-[#F1F5F9] text-slate-800 font-sans overflow-hidden selection:bg-cyan-500/20">
      
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col z-10 shrink-0 shadow-sm">
         <div className="p-5 flex items-start justify-between">
            <div>
              <h1 className="text-xl font-black bg-clip-text text-transparent bg-gradient-to-r from-cyan-600 via-indigo-600 to-purple-600 leading-tight tracking-tighter">
                Live & VOD <br/>
                <span className="text-lg">Downloader</span>
              </h1>
            </div>
            <span className="text-[10px] font-black text-cyan-700 bg-cyan-50 border border-cyan-200 px-2 py-0.5 rounded-full shadow-xs mt-0.5">
              v1.2.0
            </span>
         </div>

         <nav className="flex-1 px-3 space-y-1.5 mt-2 text-sm font-semibold overflow-y-auto hide-scrollbar">
            <button 
              onClick={() => setActiveTab('dashboard')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${activeTab === 'dashboard' ? 'bg-cyan-500/10 text-cyan-700 font-black border-l-4 border-cyan-500 shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`}
            >
              <DownloadCloud className="w-4 h-4 text-cyan-600" /> {t('TAB_DASHBOARD')}
            </button>

            <button 
              onClick={() => setActiveTab('queue')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all ${activeTab === 'queue' ? 'bg-cyan-500/10 text-cyan-700 font-black border-l-4 border-cyan-500 shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`}
            >
              <div className="flex items-center gap-3">
                <ListVideo className="w-4 h-4 text-indigo-600" /> {t('TAB_QUEUE')}
              </div>
              {activeDownloads > 0 && (
                <span className="bg-cyan-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shadow-sm">
                  {activeDownloads}
                </span>
              )}
            </button>

            <button 
              onClick={() => setActiveTab('history')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all ${activeTab === 'history' ? 'bg-cyan-500/10 text-cyan-700 font-black border-l-4 border-cyan-500 shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`}
            >
              <div className="flex items-center gap-3">
                <History className="w-4 h-4 text-purple-600" /> {t('TAB_HISTORY')}
              </div>
            </button>

            <button 
              onClick={() => setActiveTab('socialhub')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${activeTab === 'socialhub' ? 'bg-purple-500/10 text-purple-700 font-black border-l-4 border-purple-500 shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`}
            >
              <Rss className="w-4 h-4 text-amber-500" /> {t('TAB_SITTER')}
            </button>

            <button 
              onClick={() => setActiveTab('settings')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${activeTab === 'settings' ? 'bg-cyan-500/10 text-cyan-700 font-black border-l-4 border-cyan-500 shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`}
            >
              <SettingsIcon className="w-4 h-4 text-slate-600" /> {t('SETTINGS_TITLE')}
            </button>
         </nav>

         <div className="p-3 border-t border-slate-200 space-y-2 bg-slate-50/80 shrink-0">
            {/* Bug Report button removed per user request */}

            {licenseStatus === 'FREE' && (
              <button 
                onClick={() => setShowLicenseModal(true)}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:brightness-110 text-white font-extrabold rounded-xl text-xs transition-all shadow-md shadow-cyan-600/20 border border-cyan-500/30 cursor-pointer"
              >
                {t('ACTIVATE_PRO')}
              </button>
            )}
            
            <div className="text-center pt-0.5 space-y-1">
               <div 
                 onClick={() => licenseStatus === 'FREE' && setShowLicenseModal(true)}
                 className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full inline-block ${licenseStatus === 'FREE' ? 'bg-slate-200 text-slate-700 cursor-pointer hover:bg-slate-300' : licenseStatus === 'ELITE' ? 'bg-purple-100 text-purple-700 border border-purple-200' : 'bg-cyan-100 text-cyan-800 border border-cyan-200'}`}
               >
                 {t(`VERSION_${licenseStatus}` as keyof typeof locales.en)}
                 {licenseStatus === 'FREE' && ` (${quota.remainingDownloads}/10 restants)`}
               </div>
               <div className="text-[10px] text-slate-400 font-bold tracking-tight">
                 Live & VOD Downloader v1.2.0
               </div>
            </div>
         </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 relative flex flex-col h-full overflow-hidden">
        {/* Automatic App Update Banner */}
        {appUpdate.available && (
          <div className="bg-gradient-to-r from-cyan-600 to-blue-600 text-white px-6 py-3 shadow-lg flex items-center justify-between z-30 border-b border-cyan-400/30 shrink-0">
            <div className="flex items-center gap-3">
              <span className="text-xl animate-bounce">🚀</span>
              <div>
                <div className="font-extrabold text-sm">
                  {language === 'fr' 
                    ? `Mise à jour disponible : v${appUpdate.version}` 
                    : `Update Available: v${appUpdate.version}`}
                </div>
                <div className="text-xs opacity-90">
                  {appUpdate.downloaded 
                    ? (language === 'fr' ? 'La mise à jour est prête à être installée !' : 'The update is ready to install!')
                    : appUpdate.downloading 
                    ? (language === 'fr' ? `Téléchargement en cours... ${appUpdate.percent}%` : `Downloading update... ${appUpdate.percent}%`)
                    : (language === 'fr' ? 'Cliquez sur mettre à jour pour installer la nouvelle version.' : 'Click update to install the latest version.')}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {appUpdate.downloaded ? (
                <button
                  onClick={() => (window.electronAPI as any)?.installAppUpdate?.()}
                  className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs rounded-xl shadow-md transition-all cursor-pointer transform hover:scale-105"
                >
                  {language === 'fr' ? 'Redémarrer & Installer' : 'Restart & Install'}
                </button>
              ) : appUpdate.downloading ? (
                <div className="w-32 bg-cyan-950/50 rounded-full h-3 overflow-hidden border border-cyan-300/40">
                  <div className="bg-emerald-400 h-full transition-all duration-300" style={{ width: `${appUpdate.percent}%` }}></div>
                </div>
              ) : (
                <button
                  onClick={async () => {
                    const res = await (window.electronAPI as any)?.startAppUpdate?.();
                    if (res && res.downloadUrl) {
                      window.open(res.downloadUrl, '_blank');
                    }
                  }}
                  className="px-4 py-1.5 bg-white text-cyan-900 hover:bg-cyan-50 font-black text-xs rounded-xl shadow-md transition-all cursor-pointer transform hover:scale-105"
                >
                  {language === 'fr' ? 'Mettre à jour' : 'Update Now'}
                </button>
              )}

              <button
                onClick={() => setAppUpdate(prev => ({ ...prev, available: false }))}
                className="px-2 py-1 text-xs opacity-75 hover:opacity-100 text-white cursor-pointer"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Dynamic Background Effects */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
          <div className="absolute top-[-20%] right-[10%] w-[50%] h-[50%] bg-purple-600/10 rounded-full blur-[140px] mix-blend-screen"></div>
          <div className="absolute bottom-[-20%] left-[10%] w-[50%] h-[50%] bg-cyan-600/10 rounded-full blur-[140px] mix-blend-screen"></div>
        </div>

        <div className="flex-1 overflow-auto p-6 sm:p-10 hide-scrollbar">
          <div className={`h-full ${activeTab === 'dashboard' ? '' : 'hidden'}`}>
            <Dashboard 
              onStartDownload={handleStartDownload} 
              t={t} 
              onNavigateSitter={() => setActiveTab('socialhub')} 
              outputFolder={outputFolder}
              setOutputFolder={setOutputFolder}
              defaultFolder={defaultFolder}
              licenseStatus={licenseStatus}
              remainingDownloads={quota.remainingDownloads}
              onOpenLicense={() => setShowLicenseModal(true)}
            />
          </div>
          
          {activeTab === 'queue' && (
            <QueueManager 
              tasks={activeTasks} 
              onCancel={handleCancelDownload} 
              onPause={handlePause} 
              onResume={handleResume} 
              onRemove={handleRemove}
              t={t} 
            />
          )}
          {activeTab === 'history' && (
            <HistoryManager 
              tasks={historyTasks}
              onRemove={handleRemove}
              onClearAll={handleClearHistory}
              t={t}
            />
          )}
          {/* SocialHub is ALWAYS mounted to preserve state — hidden via CSS when not active */}
          <div className={activeTab === 'socialhub' ? '' : 'hidden'}>
            <SocialHub onStartDownload={handleStartDownload} t={t} />
          </div>
          {activeTab === 'settings' && <Settings language={language} setLanguage={setLanguage} t={t} outputFolder={outputFolder} setOutputFolder={setOutputFolder} defaultFolder={defaultFolder} />}
        </div>
      </main>

      {showSupportWindow && <SupportModal logs={logs} onClose={() => setShowSupportWindow(false)} t={t} />}
      {showLicenseModal && (
        <LicenseModal 
          onClose={() => setShowLicenseModal(false)} 
          onSuccess={(st) => { setLicenseStatus(st); setShowLicenseModal(false); }} 
          remainingDownloads={quota.remainingDownloads}
          usedDownloads={quota.usedDownloads}
          t={t} 
        />
      )}
    </div>
  );
}

