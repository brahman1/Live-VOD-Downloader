import { useState, useEffect, useRef, useCallback } from 'react';
import { Rss, Plus, Trash2, Radio, FileKey, Loader2, PlayCircle, RefreshCw, Clock, Search, Video, List, LayoutGrid, Power, Sparkles, UserCheck, HelpCircle, X } from 'lucide-react';
import { DownloadOptions } from '../types';
import { Translator } from '../App';

interface WatchedChannel {
  id: string;
  url: string;
  platform: 'twitch' | 'youtube' | 'kick' | 'other';
  label: string;
  avatarUrl?: string; // Profile image URL
  status: 'waiting' | 'checking' | 'live' | 'error';
  enabled: boolean; // TRUE = Sitter active (auto-record on live), FALSE = Disabled (manual view only)
  lastChecked?: string;
  recordingTaskId?: string;
  recordingFinished?: boolean;
}

interface SocialHubProps {
  onStartDownload: (url: string, options: DownloadOptions) => string;
  t: Translator;
}

function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

function detectPlatform(url: string): WatchedChannel['platform'] {
  const u = url.toLowerCase();
  if (u.includes('twitch.tv')) return 'twitch';
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
  if (u.includes('kick.com')) return 'kick';
  return 'other';
}

function labelFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] || u.hostname;
  } catch {
    return url.length > 40 ? url.slice(0, 40) + '…' : url;
  }
}

export default function SocialHub({ onStartDownload, t }: SocialHubProps) {
  const [channels, setChannels] = useState<WatchedChannel[]>([]);
  const [inputUrl, setInputUrl] = useState('');
  const [cookiePath, setCookiePath] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'twitch' | 'youtube' | 'kick'>('all');
  const [sitterFilter, setSitterFilter] = useState<'all' | 'active' | 'live'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [showCookieModal, setShowCookieModal] = useState(false);
  
  const [pollingInterval, setPollingInterval] = useState(60);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<{ success: boolean; message: string } | null>(null);

  const onStartDownloadRef = useRef(onStartDownload);
  useEffect(() => { onStartDownloadRef.current = onStartDownload; }, [onStartDownload]);

  const channelsRef = useRef<WatchedChannel[]>(channels);
  useEffect(() => { channelsRef.current = channels; }, [channels]);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const checkingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    try {
      const saved = localStorage.getItem('social_channels');
      if (saved) {
        const parsed: WatchedChannel[] = JSON.parse(saved);
        setChannels(parsed.map(ch => ({
          ...ch,
          enabled: ch.enabled === true ? true : false, // Legacy saved channels default to false (Sitter OFF)
          status: (ch.status === 'live' || ch.status === 'checking') ? 'waiting' : ch.status,
          recordingTaskId: undefined,
          recordingFinished: false,
        })));
      }
      const savedCookie = localStorage.getItem('social_cookie');
      if (savedCookie) setCookiePath(savedCookie);
      const savedInterval = localStorage.getItem('social_interval');
      if (savedInterval) setPollingInterval(parseInt(savedInterval, 10));
      const savedView = localStorage.getItem('social_view_mode');
      if (savedView === 'grid' || savedView === 'list') setViewMode(savedView);
    } catch {}
  }, []);

  useEffect(() => {
    try { 
      localStorage.setItem('social_channels', JSON.stringify(channels));
      localStorage.setItem('social_interval', pollingInterval.toString());
      localStorage.setItem('social_view_mode', viewMode);
    } catch {}
  }, [channels, pollingInterval, viewMode]);

  const handleSelectCookie = async () => {
    if (window.electronAPI?.selectCookieFile) {
      const path = await window.electronAPI.selectCookieFile();
      if (path) {
        setCookiePath(path);
        localStorage.setItem('social_cookie', path);
      }
    }
  };

  const handleImportTwitch = async () => {
    if (!cookiePath) {
      setImportResult({ success: false, message: t('IMPORT_TWITCH_NO_COOKIE') });
      setTimeout(() => setImportResult(null), 5000);
      return;
    }
    
    setImportLoading(true);
    setImportResult(null);

    try {
      const api = window.electronAPI as any;
      const result = await api.fetchTwitchFollows(cookiePath);
      
      if (!result.success) {
        const errorCodeMap: Record<string, string> = {
          'FILE_NOT_FOUND': t('IMPORT_TWITCH_NO_COOKIE'),
          'NO_TOKEN': t('IMPORT_TWITCH_TOKEN_ERROR'),
          'TOKEN_EXPIRED': t('IMPORT_TWITCH_EXPIRED'),
        };
        const msg = (result.errorCode && errorCodeMap[result.errorCode]) || result.error || 'Unknown error';
        setImportResult({ success: false, message: msg });
        setTimeout(() => setImportResult(null), 6000);
        return;
      }

      // Filter out channels already in the list
      const existingUrls = new Set(channels.map(c => c.url.toLowerCase()));
      const newChannels: WatchedChannel[] = result.channels
        .filter((ch: any) => !existingUrls.has(ch.url.toLowerCase()))
        .map((ch: any) => ({
          id: generateId(),
          url: ch.url,
          platform: 'twitch' as const,
          label: ch.displayName || ch.login,
          avatarUrl: ch.profileImage || undefined,
          status: 'waiting' as const,
          enabled: false, // Imported channels start disabled so user can pick which ones to sit!
        }));

      if (newChannels.length === 0) {
        setImportResult({ success: true, message: t('IMPORT_TWITCH_ALL_EXIST').replace('{total}', String(result.total)) });
      } else {
        setChannels(prev => [...prev, ...newChannels]);
        setImportResult({ success: true, message: t('IMPORT_TWITCH_SUCCESS').replace('{count}', String(newChannels.length)).replace('{total}', String(result.total)) });
        // Check newly added channels to detect who is live without auto-downloading disabled channels
        setTimeout(() => {
          newChannels.forEach(ch => checkChannel(ch));
        }, 500);
      }
      setTimeout(() => setImportResult(null), 6000);
    } catch (err: any) {
      setImportResult({ success: false, message: t('IMPORT_TWITCH_ERROR').replace('{error}', err.message || 'Unknown') });
      setTimeout(() => setImportResult(null), 6000);
    } finally {
      setImportLoading(false);
    }
  };

  useEffect(() => {
    if (!window.electronAPI) return;

    window.electronAPI.onDownloadComplete(({ id }: { id: string }) => {
      setChannels(prev => prev.map(ch => ch.recordingTaskId === id ? { 
        ...ch, 
        status: ch.status === 'live' ? 'live' : 'waiting', 
        recordingTaskId: undefined, 
        recordingFinished: true, 
        lastChecked: new Date().toLocaleTimeString() 
      } : ch));
      setChannels(prev => {
        const ch = prev.find(c => c.recordingTaskId === id);
        if (ch) checkingRef.current.delete(ch.id);
        return prev;
      });
    });

    window.electronAPI.onDownloadError(({ id }: { id: string }) => {
      setChannels(prev => {
        const ch = prev.find(c => c.recordingTaskId === id);
        if (ch) checkingRef.current.delete(ch.id);
        return prev.map(c => c.recordingTaskId === id ? { 
          ...c, 
          status: c.status === 'live' ? 'live' : 'waiting', 
          recordingTaskId: undefined, 
          lastChecked: new Date().toLocaleTimeString() 
        } : c);
      });
    });
  }, []);

  const checkChannel = useCallback(async (ch: WatchedChannel) => {
    if (checkingRef.current.has(ch.id) || (ch.status === 'live' && ch.recordingTaskId)) return;

    // Get current fresh channel state from channelsRef
    const freshCh = channelsRef.current.find(c => c.id === ch.id) || ch;
    const isSitterEnabled = freshCh.enabled === true;

    checkingRef.current.add(ch.id);
    setChannels(prev => prev.map(c => c.id === ch.id ? { ...c, status: 'checking', recordingFinished: false } : c));

    try {
      const isLive = (window as any).electronAPI?.checkLive ? await (window as any).electronAPI.checkLive(ch.url) : false;
      const now = new Date().toLocaleTimeString();

      if (isLive) {
        let taskId: string | undefined = freshCh.recordingTaskId;

        // ONLY auto-start recording if channel Sitter ON is strictly enabled by user!
        if (isSitterEnabled && !taskId) {
          taskId = onStartDownloadRef.current(ch.url, {
            format: 'optimized',
            resolution: '1080',
            useCookies: !!cookiePath,
            cookieBrowser: cookiePath ? 'file' : 'none',
            cookieFilePath: cookiePath,
            ghostMode: false,
            relentlessMode: false, 
            autoCut: false,
            outputFolder: '',
          });
        }

        setChannels(prev => prev.map(c => c.id === ch.id ? { ...c, status: 'live', lastChecked: now, recordingTaskId: taskId } : c));
      } else {
        setChannels(prev => prev.map(c => c.id === ch.id ? { ...c, status: 'waiting', lastChecked: now, recordingTaskId: undefined } : c));
        checkingRef.current.delete(ch.id);
      }
    } catch {
      const now = new Date().toLocaleTimeString();
      setChannels(prev => prev.map(c => c.id === ch.id ? { ...c, status: 'error', lastChecked: now } : c));
      checkingRef.current.delete(ch.id);
    }
  }, [cookiePath]);

  // Passive Polling
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (channels.length === 0) return;

    timerRef.current = setInterval(() => {
      channelsRef.current.forEach(ch => {
        if ((ch.status === 'waiting' || ch.status === 'error') && !checkingRef.current.has(ch.id)) {
          checkChannel(ch);
        }
      });
    }, pollingInterval * 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [channels.length, pollingInterval, checkChannel]);

  // Initial check when component mounts
  useEffect(() => {
     channelsRef.current.forEach(ch => {
        if (ch.status === 'waiting' && !checkingRef.current.has(ch.id)) {
           checkChannel(ch);
        }
     });
  }, [checkChannel]);

  const addChannel = () => {
    let url = inputUrl.trim();
    if (!url) return;
    
    // Auto-convert simple names like "traytonlol" or "otplol" to full Twitch URL
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      if (!url.includes('.')) {
        url = `https://www.twitch.tv/${url}`;
      } else {
        url = `https://${url}`;
      }
    }

    const newCh: WatchedChannel = {
      id: generateId(),
      url,
      platform: detectPlatform(url),
      label: labelFromUrl(url),
      status: 'waiting',
      enabled: true,
    };
    setChannels(prev => [...prev, newCh]);
    setInputUrl('');
    setTimeout(() => checkChannel(newCh), 300);
  };

  const removeChannel = (id: string) => {
    checkingRef.current.delete(id);
    setChannels(prev => prev.filter(c => c.id !== id));
  };

  const toggleChannelEnabled = (id: string) => {
    setChannels(prev => prev.map(c => {
      if (c.id !== id) return c;
      const nextEnabled = !c.enabled;
      if (nextEnabled && c.status === 'live' && !c.recordingTaskId) {
        setTimeout(() => checkChannel({ ...c, enabled: true }), 100);
      }
      return { ...c, enabled: nextEnabled };
    }));
  };

  const startManualRecording = (ch: WatchedChannel) => {
    if (ch.recordingTaskId) return;
    const taskId = onStartDownloadRef.current(ch.url, {
      format: 'optimized',
      resolution: '1080',
      useCookies: !!cookiePath,
      cookieBrowser: cookiePath ? 'file' : 'none',
      cookieFilePath: cookiePath,
      ghostMode: false,
      relentlessMode: false, 
      autoCut: false,
      outputFolder: '',
    });
    setChannels(prev => prev.map(c => c.id === ch.id ? { ...c, status: 'live', recordingTaskId: taskId } : c));
  };

  const manualStopRecording = (ch: WatchedChannel) => {
    if (ch.recordingTaskId && window.electronAPI?.cancelDownload) {
      window.electronAPI.cancelDownload(ch.recordingTaskId);
    }
    checkingRef.current.delete(ch.id);
    setChannels(prev => prev.map(c => c.id === ch.id ? { 
      ...c, 
      status: c.status === 'live' ? 'live' : 'waiting', 
      recordingTaskId: undefined 
    } : c));
  };

  const manualCheck = useCallback((ch: WatchedChannel) => {
    checkingRef.current.delete(ch.id);
    checkChannel({ ...ch, status: 'waiting' });
  }, [checkChannel]);

  function isChannelFiltered(c: WatchedChannel): boolean {
    if (activeTab !== 'all' && c.platform !== activeTab) return false;
    if (sitterFilter === 'active' && !c.enabled) return false;
    if (sitterFilter === 'live' && c.status !== 'live') return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      return c.label.toLowerCase().includes(q) || c.url.toLowerCase().includes(q);
    }
    return true;
  }

  // Bulk Actions
  const enableAllFiltered = () => {
    setChannels(prev => prev.map(c => isChannelFiltered(c) ? { ...c, enabled: true } : c));
  };

  const disableAllFiltered = () => {
    setChannels(prev => prev.map(c => isChannelFiltered(c) ? { ...c, enabled: false } : c));
  };

  const checkAllFiltered = () => {
    channels.filter(isChannelFiltered).forEach(ch => {
      checkingRef.current.delete(ch.id);
      checkChannel({ ...ch, status: 'waiting' });
    });
  };

  const clearAllChannels = () => {
    if (window.confirm("Supprimer toutes les chaînes de la liste ?")) {
      checkingRef.current.clear();
      setChannels([]);
    }
  };

  const filteredChannels = channels.filter(isChannelFiltered);

  // SORT CHANNELS: LIVE & Recording FIRST, then Sitter ON, then Alphabetical!
  const sortedFilteredChannels = [...filteredChannels].sort((a, b) => {
    if (a.recordingTaskId && !b.recordingTaskId) return -1;
    if (!a.recordingTaskId && b.recordingTaskId) return 1;
    if (a.status === 'live' && b.status !== 'live') return -1;
    if (a.status !== 'live' && b.status === 'live') return 1;
    if (a.enabled && !b.enabled) return -1;
    if (!a.enabled && b.enabled) return 1;
    return a.label.localeCompare(b.label);
  });

  // Statistics
  const totalCount = channels.length;
  const activeSitterCount = channels.filter(c => c.enabled).length;
  const liveNowCount = channels.filter(c => c.status === 'live').length;
  const recordingCount = channels.filter(c => c.recordingTaskId).length;

  const getPlatformColors = (platform: string) => {
    switch (platform) {
      case 'twitch': return 'from-[#9146FF] to-[#6b25ce] text-[#9146FF] border-[#9146FF]/30 bg-[#9146FF]/10';
      case 'youtube': return 'from-[#FF0000] to-[#cc0000] text-[#FF0000] border-[#FF0000]/30 bg-[#FF0000]/10';
      case 'kick': return 'from-[#53FC18] to-[#3aa811] text-[#53FC18] border-[#53FC18]/30 bg-[#53FC18]/10';
      default: return 'from-amber-500 to-orange-500 text-amber-500 border-amber-500/30 bg-amber-500/10';
    }
  };

  return (
    <div className="h-full flex flex-col xl:flex-row gap-6 animate-in fade-in slide-in-from-bottom-2 duration-500 relative">
      
      {/* MAIN COLUMN */}
      <div className="flex-1 flex flex-col gap-5 overflow-hidden">
        
        {/* ELEGANT LIGHT THEME HEADER BANNER */}
        <div className="bg-white border border-slate-200/90 text-slate-900 p-6 rounded-3xl relative overflow-hidden shadow-sm">
          <div className="flex flex-col lg:flex-row gap-6 justify-between items-start lg:items-center relative z-10">
            <div>
              <div className="flex items-center gap-3 mb-1">
                 <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                   <span className="p-2 rounded-xl bg-cyan-100 text-cyan-700">
                     <Rss className="w-5 h-5" />
                   </span>
                   {t('TAB_SITTER') || 'Stream Sitter'}
                 </h2>
                 <span className="px-3 py-0.5 rounded-full text-xs font-black bg-cyan-100 text-cyan-800 border border-cyan-200">
                    {t('CHANNELS_COUNT').replace('{count}', String(totalCount))}
                 </span>
              </div>
              <p className="text-slate-600 text-xs max-w-xl font-medium mt-1">
                {t('SH_DESC')}
              </p>
            </div>

            {/* Global Settings (Auto-check interval) */}
            <div className="flex items-center gap-2 text-xs font-bold text-slate-800 bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-200 shadow-sm">
              <Clock className="w-4 h-4 text-cyan-600" />
              <span>{t('AUTO_CHECK_FREQ')}</span>
              <select 
                 value={pollingInterval} 
                 onChange={(e) => setPollingInterval(Number(e.target.value))}
                 className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 outline-none text-slate-900 focus:border-cyan-500 font-extrabold shadow-sm"
              >
                 <option value={30}>30s</option>
                 <option value={60}>1 min</option>
                 <option value={300}>5 min</option>
                 <option value={600}>10 min</option>
              </select>
            </div>
          </div>
        </div>

        {/* SUMMARY STATS COUNTERS BAR (BRIGHT LIGHT THEME) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white border border-slate-200/90 p-4 rounded-2xl flex items-center justify-between shadow-sm">
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{t('TOTAL_CHANNELS')}</p>
              <p className="text-xl font-black text-slate-900">{totalCount}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
              <Rss className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white border border-slate-200/90 p-4 rounded-2xl flex items-center justify-between shadow-sm">
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{t('SITTER_STATUS_ACTIVE')}</p>
              <p className="text-xl font-black text-cyan-600">{activeSitterCount}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-cyan-50 flex items-center justify-center text-cyan-600 border border-cyan-200">
              <Power className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white border border-slate-200/90 p-4 rounded-2xl flex items-center justify-between shadow-sm">
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{t('FILTER_LIVE_NOW')}</p>
              <p className="text-xl font-black text-red-600">{liveNowCount}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center text-red-600 border border-red-200">
              <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-ping" />
            </div>
          </div>

          <div className="bg-white border border-slate-200/90 p-4 rounded-2xl flex items-center justify-between shadow-sm">
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{t('RECORDINGS_COUNT')}</p>
              <p className="text-xl font-black text-purple-600">{recordingCount}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600 border border-purple-200">
              <Video className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* TWO SEPARATED CARDS: MULTI-PLATFORM COOKIES & TWITCH IMPORT vs MANUAL ADD */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* SECTION A: MULTI-PLATFORM COOKIES (TWITCH, YOUTUBE, KICK) & TWITCH IMPORT */}
          <div className="bg-gradient-to-br from-purple-50 via-white to-slate-50 border border-purple-200/90 p-4 rounded-3xl relative overflow-hidden flex flex-col justify-between shadow-sm">
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-purple-100 text-purple-700">
                    <Sparkles className="w-4 h-4" />
                  </span>
                  <h3 className="font-extrabold text-sm text-slate-900">{t('COOKIE_PLATFORMS_LABEL')}</h3>
                </div>

                {/* Guide Button */}
                <button 
                  onClick={() => setShowCookieModal(true)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-purple-100 hover:bg-purple-200 text-purple-700 border border-purple-200 text-[11px] font-extrabold transition-all cursor-pointer shadow-sm"
                >
                  <HelpCircle className="w-3.5 h-3.5 text-purple-600" />
                  {t('HOW_TO_DO_IT')}
                </button>
              </div>

              {/* Supported platform badges */}
              <div className="flex items-center gap-1.5 mb-3">
                <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-purple-100 text-purple-700 border border-purple-200">Twitch</span>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-red-100 text-red-700 border border-red-200">YouTube</span>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-emerald-100 text-emerald-700 border border-emerald-200">Kick</span>
              </div>
            </div>

            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                <button 
                  onClick={handleSelectCookie} 
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 rounded-xl text-xs font-bold text-white shadow-sm transition-all cursor-pointer"
                >
                  <FileKey className="w-3.5 h-3.5 text-purple-400" />
                  {cookiePath ? "Changer cookies.txt" : "Choisir cookies.txt"}
                </button>
                <span className="text-[11px] text-slate-500 font-medium max-w-[160px] truncate" title={cookiePath || t('NO_FILE_SELECTED')}>
                  {cookiePath ? cookiePath.split('\\').pop() : t('NO_FILE_SELECTED')}
                </span>
              </div>

              <button 
                onClick={handleImportTwitch}
                disabled={importLoading || !cookiePath}
                className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-extrabold transition-all shadow-md ${
                  cookiePath 
                    ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-purple-500/20 cursor-pointer' 
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                } disabled:opacity-50`}
              >
                {importLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
                {importLoading ? t('IMPORT_TWITCH_LOADING') : t('IMPORT_TWITCH_BTN')}
              </button>
            </div>
          </div>

          {/* SECTION B: MANUAL ADD SINGLE CHANNEL */}
          <div className="bg-white border border-slate-200/90 p-4 rounded-3xl flex flex-col justify-between shadow-sm">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="p-1.5 rounded-lg bg-cyan-100 text-cyan-700">
                  <Plus className="w-4 h-4" />
                </span>
                <h3 className="font-extrabold text-sm text-slate-900">{t('MANUAL_ADD_TITLE')}</h3>
              </div>
              <p className="text-[11px] text-slate-500 mb-3 font-medium">
                {t('MANUAL_ADD_DESC')}
              </p>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder={t('SITTER_ADD_PLACEHOLDER')}
                value={inputUrl}
                onChange={e => setInputUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addChannel()}
                className="flex-1 bg-slate-50 border border-slate-300 rounded-xl py-2 px-3 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 text-xs font-semibold"
              />
              <button
                onClick={addChannel}
                disabled={!inputUrl.trim()}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-black rounded-xl disabled:opacity-40 transition-all flex items-center gap-1 cursor-pointer text-xs shrink-0 shadow-md shadow-cyan-600/20"
              >
                <Plus className="w-4 h-4" />
                {t('MANUAL_ADD_BTN')}
              </button>
            </div>
          </div>

        </div>

        {/* Import Result Banner */}
        {importResult && (
          <div className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-between animate-in fade-in slide-in-from-top-2 duration-300 ${
            importResult.success 
              ? 'bg-emerald-50 border-emerald-300 text-emerald-800' 
              : 'bg-red-50 border-red-300 text-red-800'
          }`}>
            <div className="flex items-center gap-2">
              <span>{importResult.success ? '✅' : '⚠️'}</span>
              <span>{importResult.message}</span>
            </div>
            <button onClick={() => setImportResult(null)} className="opacity-60 hover:opacity-100 text-xs font-bold px-2 py-0.5">✕</button>
          </div>
        )}

        {/* CONTROLS BAR: SEARCH, FILTERS & BULK ACTIONS */}
        <div className="bg-white border border-slate-200/90 p-4 rounded-3xl space-y-4 shadow-sm">
          
          {/* SEARCH BAR */}
          <div className="relative w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={t('SEARCH_PLACEHOLDER')}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2.5 pl-9 pr-8 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50 text-xs font-semibold"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>

          {/* Bottom row: Platform Filter Tabs, Status Filters & View Mode */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-100">
            {/* Platform Tabs */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
              {[
                { id: 'all', label: t('NETWORKS_ALL') },
                { id: 'twitch', label: 'Twitch' },
                { id: 'youtube', label: 'YouTube' },
                { id: 'kick', label: 'Kick' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all duration-200 ${
                    activeTab === tab.id 
                      ? 'bg-white text-cyan-700 shadow-sm border border-slate-200' 
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                onClick={() => setSitterFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                  sitterFilter === 'all' ? 'bg-white text-slate-900 shadow-sm border border-slate-200' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Tous ({channels.length})
              </button>
              <button
                onClick={() => setSitterFilter('active')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                  sitterFilter === 'active' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t('SITTER_STATUS_ACTIVE')} ({activeSitterCount})
              </button>
              <button
                onClick={() => setSitterFilter('live')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                  sitterFilter === 'live' ? 'bg-red-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                🔴 {t('FILTER_LIVE_NOW')} ({liveNowCount})
              </button>
            </div>

            {/* Bulk Actions & View Switcher */}
            <div className="flex items-center gap-2">
              <button 
                onClick={enableAllFiltered}
                className="px-2.5 py-1.5 bg-cyan-50 hover:bg-cyan-100 text-cyan-700 border border-cyan-200 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm"
              >
                {t('BULK_ENABLE_ALL')}
              </button>
              
              <button 
                onClick={disableAllFiltered}
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm"
              >
                {t('BULK_DISABLE_ALL')}
              </button>

              <button 
                onClick={checkAllFiltered}
                className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl transition-all cursor-pointer shadow-sm"
              >
                <RefreshCw className="w-4 h-4" />
              </button>

              {/* View mode toggle */}
              <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-white text-cyan-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  <List className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-white text-cyan-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
              </div>

              {channels.length > 0 && (
                <button
                  onClick={clearAllChannels}
                  className="p-1.5 text-slate-400 hover:text-red-600 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* CHANNELS LIST / GRID VIEW (LIVE CHANNELS FIRST!) */}
        <div className="flex-1 overflow-y-auto pr-1 hide-scrollbar pb-12">
          {sortedFilteredChannels.length === 0 ? (
            <div className="py-16 text-center text-slate-400 bg-white border border-slate-200 rounded-3xl shadow-sm">
              <Rss className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="font-semibold text-sm">{searchQuery ? "Aucune chaîne ne correspond à votre recherche." : t('SITTER_EMPTY')}</p>
            </div>
          ) : viewMode === 'list' ? (
            /* COMPACT LIST VIEW */
            <div className="space-y-2">
              {sortedFilteredChannels.map(ch => (
                <ChannelRow
                  key={ch.id}
                  channel={ch}
                  colors={getPlatformColors(ch.platform)}
                  onToggleEnabled={() => toggleChannelEnabled(ch.id)}
                  onStartRecording={() => startManualRecording(ch)}
                  onStopRecording={() => manualStopRecording(ch)}
                  onCheckNow={() => manualCheck(ch)}
                  onRemove={() => removeChannel(ch.id)}
                  t={t}
                />
              ))}
            </div>
          ) : (
            /* GRID VIEW */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {sortedFilteredChannels.map(ch => (
                <ChannelCard
                  key={ch.id}
                  channel={ch}
                  colors={getPlatformColors(ch.platform)}
                  onToggleEnabled={() => toggleChannelEnabled(ch.id)}
                  onStartRecording={() => startManualRecording(ch)}
                  onStopRecording={() => manualStopRecording(ch)}
                  onCheckNow={() => manualCheck(ch)}
                  onRemove={() => removeChannel(ch.id)}
                  t={t}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT SIDEBAR: GUIDE & EXPLANATION */}
      <div className="w-full xl:w-[340px] flex flex-col gap-4 shrink-0 pb-12">
        <div className="bg-white border border-slate-200/90 text-slate-900 rounded-3xl p-6 relative overflow-hidden shadow-sm">
          <div className="relative z-10 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-50 border border-cyan-200 text-cyan-800 font-bold text-xs">
              <Rss className="w-3.5 h-3.5 text-cyan-600" />
              {t('SITTER_GUIDE_TITLE')}
            </div>

            <div>
              <h3 className="text-xl font-black text-slate-900 mb-2 leading-tight">
                {t('HOW_IT_WORKS')}
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed font-medium">
                {t('HOW_IT_WORKS_DESC')}
              </p>
            </div>

            <div className="space-y-4 pt-2 border-t border-slate-100">
              <div className="flex gap-3 items-start">
                <div className="w-8 h-8 rounded-xl bg-cyan-100 text-cyan-800 flex items-center justify-center shrink-0 border border-cyan-200 font-black text-xs">
                  1
                </div>
                <div>
                  <h4 className="font-bold text-xs text-slate-900 mb-0.5">{t('HOW_STEP1_TITLE')}</h4>
                  <p className="text-[11px] text-slate-600 leading-relaxed font-medium">{t('HOW_STEP1_DESC')}</p>
                </div>
              </div>

              <div className="flex gap-3 items-start">
                <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-800 flex items-center justify-center shrink-0 border border-purple-200 font-black text-xs">
                  2
                </div>
                <div>
                  <h4 className="font-bold text-xs text-slate-900 mb-0.5">{t('HOW_STEP2_TITLE')}</h4>
                  <p className="text-[11px] text-slate-600 leading-relaxed font-medium">{t('HOW_STEP2_DESC')}</p>
                </div>
              </div>

              <div className="flex gap-3 items-start">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 border border-emerald-200 font-black text-xs">
                  3
                </div>
                <div>
                  <h4 className="font-bold text-xs text-slate-900 mb-0.5">{t('HOW_STEP3_TITLE')}</h4>
                  <p className="text-[11px] text-slate-600 leading-relaxed font-medium">{t('HOW_STEP3_DESC')}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3-STEP COOKIES GUIDE MODAL */}
      {showCookieModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-5 relative text-slate-900">
            
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <FileKey className="w-5 h-5 text-purple-600" />
                  {t('COOKIE_GUIDE_TITLE')}
                </h3>
                <p className="text-xs text-slate-500 mt-1 font-medium">
                  {t('COOKIE_GUIDE_SUBTITLE')}
                </p>
              </div>
              <button 
                onClick={() => setShowCookieModal(false)}
                className="p-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              {/* Step 1 */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-start gap-3">
                <div className="w-7 h-7 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-black text-xs shrink-0 border border-purple-200">
                  1
                </div>
                <div>
                  <h4 className="font-bold text-xs text-slate-900">{t('COOKIE_STEP1_TITLE')}</h4>
                  <p className="text-xs text-slate-600 mt-0.5 leading-relaxed font-medium">{t('COOKIE_STEP1_DESC')}</p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-start gap-3">
                <div className="w-7 h-7 rounded-xl bg-cyan-100 text-cyan-700 flex items-center justify-center font-black text-xs shrink-0 border border-cyan-200">
                  2
                </div>
                <div>
                  <h4 className="font-bold text-xs text-slate-900">{t('COOKIE_STEP2_TITLE')}</h4>
                  <p className="text-xs text-slate-600 mt-0.5 leading-relaxed font-medium">{t('COOKIE_STEP2_DESC')}</p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-start gap-3">
                <div className="w-7 h-7 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-black text-xs shrink-0 border border-emerald-200">
                  3
                </div>
                <div>
                  <h4 className="font-bold text-xs text-slate-900">{t('COOKIE_STEP3_TITLE')}</h4>
                  <p className="text-xs text-slate-600 mt-0.5 leading-relaxed font-medium">{t('COOKIE_STEP3_DESC')}</p>
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setShowCookieModal(false)}
                className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-black text-xs shadow-lg shadow-purple-600/20 transition-all cursor-pointer"
              >
                {t('UNDERSTOOD_BTN')}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

/* COMPACT ROW COMPONENT WITH AVATAR (BRIGHT LIGHT THEME) */
function ChannelRow({ channel, colors, onToggleEnabled, onStartRecording, onStopRecording, onCheckNow, onRemove, t }: any) {
  const isLive = channel.status === 'live';
  const isChecking = channel.status === 'checking';
  const isRecording = !!channel.recordingTaskId;

  return (
    <div className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all duration-200 shadow-sm ${
      isRecording 
        ? 'bg-purple-50 border-purple-300 text-slate-900 shadow-md' 
        : isLive 
        ? 'bg-red-50 border-red-300 text-slate-900 shadow-md' 
        : channel.enabled 
        ? 'bg-white hover:bg-cyan-50/50 border-slate-200 hover:border-cyan-300 text-slate-900' 
        : 'bg-slate-50 border-slate-200/80 opacity-85 hover:opacity-100 text-slate-800'
    }`}>
      {/* Left: Avatar / Platform & Name */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {/* Profile Avatar if available, else platform icon badge */}
        {channel.avatarUrl ? (
          <div className="relative shrink-0">
            <img 
              src={channel.avatarUrl} 
              alt={channel.label} 
              className="w-9 h-9 rounded-xl object-cover border border-slate-300 shadow-sm"
              onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
            />
            {isLive && (
              <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-red-600 border-2 border-white animate-pulse" />
            )}
          </div>
        ) : (
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black shrink-0 ${colors}`}>
            {channel.platform === 'twitch' ? 'TW'
            : channel.platform === 'youtube' ? <PlayCircle className="w-4 h-4 text-red-600" />
            : channel.platform === 'kick' ? 'KK'
            : <Radio className="w-4 h-4 text-slate-600" />}
          </div>
        )}

        {/* Label & URL */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="font-extrabold text-xs text-slate-900 truncate max-w-[200px]">{channel.label}</h4>
            <span className="text-[10px] font-mono text-slate-400 uppercase font-bold">{channel.platform}</span>
          </div>
          <a href={channel.url} target="_blank" rel="noreferrer" className="text-[10px] text-slate-500 hover:text-cyan-600 font-medium truncate block max-w-[240px]">
            {channel.url}
          </a>
        </div>
      </div>

      {/* Center: Status & Last Checked */}
      <div className="flex items-center gap-3 px-4">
        {isRecording ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black bg-purple-100 text-purple-800 border border-purple-300 animate-pulse">
            <span className="w-2 h-2 rounded-full bg-purple-600 animate-ping" />
            {t('STATUS_RECORDING')}
          </span>
        ) : isLive ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black bg-red-100 text-red-700 border border-red-300">
            <span className="w-2 h-2 rounded-full bg-red-600 animate-ping" />
            {t('STATUS_LIVE')}
          </span>
        ) : isChecking ? (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
            <Loader2 className="w-3 h-3 animate-spin" />
            Check...
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500">
            {t('STATUS_OFFLINE')}
          </span>
        )}

        {channel.lastChecked && (
          <span className="text-[10px] text-slate-400 font-mono hidden sm:inline font-semibold">{channel.lastChecked}</span>
        )}
      </div>

      {/* Right: Sitter Toggle & Actions */}
      <div className="flex items-center gap-3 shrink-0">
        
        {/* SITTER TOGGLE SWITCH */}
        <button
          onClick={onToggleEnabled}
          title={channel.enabled ? "Sitter Actif" : "Sitter Inactif"}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[10px] font-black border transition-all cursor-pointer ${
            channel.enabled 
              ? 'bg-cyan-600 text-white border-cyan-600 shadow-sm hover:bg-cyan-700' 
              : 'bg-slate-200 text-slate-600 border-slate-300 hover:bg-slate-300'
          }`}
        >
          <Power className={`w-3 h-3 ${channel.enabled ? 'text-white' : 'text-slate-500'}`} />
          <span>{channel.enabled ? 'Sitter ON' : 'OFF'}</span>
        </button>

        {/* Manual Record / Stop Recording Button */}
        {isRecording ? (
          <button 
            onClick={onStopRecording}
            title={t('STOP_RECORDING')}
            className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded-xl text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer shadow-sm"
          >
            ■ Stop
          </button>
        ) : isLive ? (
          <button 
            onClick={onStartRecording}
            title={t('START_RECORDING')}
            className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded-xl text-[10px] font-black transition-all shadow-md shadow-red-500/30 flex items-center gap-1 cursor-pointer animate-pulse"
          >
            <Video className="w-3 h-3" />
            {t('START_RECORDING')}
          </button>
        ) : null}

        {/* Check Button */}
        <button 
          onClick={onCheckNow} 
          disabled={isChecking}
          title="Vérifier le statut"
          className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-all disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>

        {/* Remove Button */}
        <button 
          onClick={onRemove}
          title="Supprimer"
          className="p-1.5 text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

/* CARD COMPONENT WITH AVATAR (BRIGHT LIGHT THEME) */
function ChannelCard({ channel, colors, onToggleEnabled, onStartRecording, onStopRecording, onCheckNow, onRemove, t }: any) {
  const isLive = channel.status === 'live';
  const isChecking = channel.status === 'checking';
  const isRecording = !!channel.recordingTaskId;

  return (
    <div className={`relative bg-white border rounded-2xl p-4 overflow-hidden transition-all duration-300 shadow-sm ${
      isRecording ? 'border-purple-300 bg-purple-50/50' 
      : isLive ? 'border-red-300 bg-red-50/50' 
      : channel.enabled ? 'border-slate-200' : 'border-slate-200 opacity-85'
    }`}>
      
      <div className="flex justify-between items-start mb-3 relative z-10">
        <div className="flex items-center gap-2.5 min-w-0">
          {channel.avatarUrl ? (
            <img 
              src={channel.avatarUrl} 
              alt={channel.label} 
              className="w-10 h-10 rounded-xl object-cover border border-slate-300 shadow-sm shrink-0"
              onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
            />
          ) : (
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black shrink-0 ${colors}`}>
              {channel.platform === 'twitch' ? 'TW'
              : channel.platform === 'youtube' ? <PlayCircle className="w-4 h-4 text-red-600" />
              : channel.platform === 'kick' ? 'KK'
              : <Radio className="w-4 h-4 text-slate-600" />}
            </div>
          )}
          <div className="min-w-0">
            <h4 className="font-extrabold text-xs text-slate-900 truncate max-w-[150px]">{channel.label}</h4>
            <span className="text-[10px] text-slate-400 font-mono uppercase font-bold">{channel.platform}</span>
          </div>
        </div>

        {/* Toggle Switch */}
        <button
          onClick={onToggleEnabled}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-[10px] font-black border transition-all cursor-pointer ${
            channel.enabled 
              ? 'bg-cyan-600 text-white border-cyan-600 shadow-sm' 
              : 'bg-slate-200 text-slate-600 border-slate-300'
          }`}
        >
          <Power className="w-3 h-3 text-white" />
          {channel.enabled ? 'Sitter ON' : 'OFF'}
        </button>
      </div>

      <div className="flex items-center justify-between mt-4 relative z-10 pt-3 border-t border-slate-100">
        <div className="flex items-center gap-2">
          {isRecording ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-800 border border-purple-300">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-600 animate-ping" />
              {t('STATUS_RECORDING')}
            </span>
          ) : isLive ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-red-100 text-red-700 border border-red-300">
              <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-ping" />
              {t('STATUS_LIVE')}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500">
              {t('STATUS_OFFLINE')}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {isRecording ? (
             <button onClick={onStopRecording} className="px-2 py-1 bg-red-600 text-white hover:bg-red-700 rounded-lg text-xs font-bold transition-all shadow-sm">
               ■ Stop
             </button>
          ) : isLive ? (
             <button onClick={onStartRecording} className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-extrabold transition-all shadow-md shadow-red-500/20 flex items-center gap-1 cursor-pointer">
               <Video className="w-3 h-3" />
               {t('START_RECORDING')}
             </button>
          ) : (
             <button onClick={onCheckNow} disabled={isChecking} className="p-1.5 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-lg transition-all disabled:opacity-50 cursor-pointer">
               <RefreshCw className="w-3.5 h-3.5" />
             </button>
          )}

          <button onClick={onRemove} className="p-1.5 text-slate-400 hover:text-red-600 transition-colors cursor-pointer">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
