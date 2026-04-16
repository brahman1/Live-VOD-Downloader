import { useState, useEffect, useCallback } from 'react';
import { Home, ListVideo, Settings as SettingsIcon, Bug, Rss, Scissors, History } from 'lucide-react';
import Dashboard from './components/Dashboard';
import QueueManager from './components/QueueManager';
import Settings from './components/Settings';
import SupportModal from './components/SupportModal';
import LicenseModal from './components/LicenseModal';
import SocialHub from './components/SocialHub';
import VideoMaker from './components/VideoMaker';
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
  const [activeTab, setActiveTab] = useState<'dashboard' | 'queue' | 'history' | 'settings' | 'socialhub' | 'videomaker'>('dashboard');
  const [tasks, setTasks] = useState<DownloadTask[]>([]);
  const [logs, setLogs] = useState<{id: string|null, message: string}[]>([]);
  const [showSupportWindow, setShowSupportWindow] = useState(false);
  const [showLicenseModal, setShowLicenseModal] = useState(false);
  const [licenseStatus, setLicenseStatus] = useState<string>('FREE');
  
  const [language, setLanguage] = useState<Language>('en');
  const [outputFolder, setOutputFolder] = useState<string>('');
  const [defaultFolder, setDefaultFolder] = useState<string>('');

  const t: Translator = (key) => locales[language][key] || key;

  useEffect(() => {
    const api = window.electronAPI as any;
    
    // Concurrently load the saved custom folder and the system downloads folder
    Promise.all([
      api?.getSavedFolder?.(),
      api?.getDownloadsPath?.()
    ]).then(([savedFolder, defaultDownloadsPath]) => {
      if (defaultDownloadsPath) {
        setDefaultFolder(defaultDownloadsPath);
      }
      
      if (savedFolder && savedFolder.trim() !== '') {
         setOutputFolder(savedFolder);
      } else if (defaultDownloadsPath) {
         setOutputFolder(defaultDownloadsPath);
      }
    });
    
    api?.getLicenseStatus?.().then((res: any) => {
      if (res && res.status) {
         setLicenseStatus(res.status);
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
         }
      });

      window.electronAPI.onDownloadComplete(({id}) => {
         setTasks(prev => prev.map(task => task.id === id ? { ...task, status: 'completed', progress: 100 } : task));
      });

      window.electronAPI.onLog((logData) => {
        setLogs(prev => [...prev.slice(-199), logData]);
      });
    }
  }, []);

  const handleStartDownload = useCallback((url: string, options: DownloadOptions): string => {
    const id = generateId();
    const newTask: DownloadTask = {
      id, url, options, status: 'pending', progress: 0, speed: '', eta: '', size: '', destination: ''
    };
    setTasks(prev => [...prev, newTask]);
    window.electronAPI?.download(id, url, { ...options, language });
    return id;
  }, []); // stable reference — never recreated

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
    <div className="flex h-screen bg-slate-950 text-slate-100 font-sans overflow-hidden selection:bg-cyan-500/30">
      
      {/* Sidebar */}
      <aside className="w-64 bg-slate-950 border-r border-slate-800 flex flex-col z-10 shrink-0">
         <div className="p-6">
            <h1 className="text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-purple-500 mb-1 leading-tight tracking-tighter">
              Live Stream <br/>
              <span className="text-xl">Download Manager</span>
            </h1>
         </div>

         <nav className="flex-1 px-4 space-y-2 mt-4 text-sm font-medium">
            <button 
              onClick={() => setActiveTab('dashboard')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'dashboard' ? 'bg-cyan-500/10 text-cyan-400' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'}`}
            >
              <Home className="w-5 h-5" /> {t('TAB_DASHBOARD')}
            </button>

            <button 
              onClick={() => setActiveTab('queue')}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all ${activeTab === 'queue' ? 'bg-cyan-500/10 text-cyan-400' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'}`}
            >
              <div className="flex items-center gap-3">
                <ListVideo className="w-5 h-5" /> {t('TAB_QUEUE')}
              </div>
              {activeDownloads > 0 && (
                <span className="bg-cyan-500 text-slate-900 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold">
                  {activeDownloads}
                </span>
              )}
            </button>

            <button 
              onClick={() => setActiveTab('history')}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all ${activeTab === 'history' ? 'bg-cyan-500/10 text-cyan-400' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'}`}
            >
              <div className="flex items-center gap-3">
                <History className="w-5 h-5" /> {t('TAB_HISTORY')}
              </div>
            </button>

            <button 
              onClick={() => setActiveTab('socialhub')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'socialhub' ? 'bg-amber-500/10 text-amber-400' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'}`}
            >
              <Rss className="w-5 h-5" /> {t('TAB_SITTER')}
            </button>

            <button 
              onClick={() => setActiveTab('videomaker')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'videomaker' ? 'bg-[#25F4EE]/10 text-[#FE2C55]' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'}`}
            >
              <Scissors className="w-5 h-5" /> {t('TAB_VIDEOMAKER') || 'Video Maker'}
            </button>

            <button 
              onClick={() => setActiveTab('settings')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'settings' ? 'bg-cyan-500/10 text-cyan-400' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'}`}
            >
              <SettingsIcon className="w-5 h-5" /> {t('SETTINGS_TITLE')}
            </button>
         </nav>

         <div className="p-4 border-t border-slate-800 space-y-2">
            <button 
              onClick={() => setShowSupportWindow(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 rounded-lg text-xs transition-colors"
            >
              <Bug className="w-4 h-4" /> {t('BUG_REPORT')}
            </button>

            {licenseStatus === 'FREE' && (
              <button 
                onClick={() => setShowLicenseModal(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 hover:brightness-110 text-white font-medium rounded-lg text-xs transition-all shadow-lg shadow-cyan-500/20 border border-cyan-400/30"
              >
                {t('ACTIVATE_PRO')}
              </button>
            )}
            
            <div className="text-center pt-2">
               <span 
                 onClick={() => licenseStatus === 'FREE' && setShowLicenseModal(true)}
                 className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${licenseStatus === 'FREE' ? 'bg-slate-800 text-slate-400 cursor-pointer hover:bg-slate-700 hover:text-slate-300' : licenseStatus === 'ELITE' ? 'bg-purple-500/20 text-purple-400' : 'bg-cyan-500/20 text-cyan-400'}`}
               >
                 {t(`VERSION_${licenseStatus}` as keyof typeof locales.en)}
               </span>
            </div>
         </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 relative flex flex-col h-full overflow-hidden">
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
          {activeTab === 'videomaker' && <VideoMaker t={t} defaultFolder={defaultFolder} />}
          {activeTab === 'settings' && <Settings language={language} setLanguage={setLanguage} t={t} />}
        </div>
      </main>

      {showSupportWindow && <SupportModal logs={logs} onClose={() => setShowSupportWindow(false)} t={t} />}
      {showLicenseModal && <LicenseModal onClose={() => setShowLicenseModal(false)} onSuccess={(st) => { setLicenseStatus(st); setShowLicenseModal(false); }} t={t} />}
    </div>
  );
}

