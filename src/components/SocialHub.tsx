import { useState, useEffect, useRef, useCallback } from 'react';
import { Rss, Plus, Trash2, Radio, FileKey, Loader2, PlayCircle, RefreshCw, AlertTriangle, Clock } from 'lucide-react';
import { DownloadOptions } from '../types';
import { Translator } from '../App';

interface WatchedChannel {
  id: string;
  url: string;
  platform: 'twitch' | 'youtube' | 'kick' | 'other';
  label: string;
  status: 'waiting' | 'checking' | 'live' | 'error';
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
  
  const [pollingInterval, setPollingInterval] = useState(60); // Default 60 seconds

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
          status: (ch.status === 'live' || ch.status === 'checking') ? 'waiting' : ch.status,
          recordingTaskId: undefined,
          recordingFinished: false,
        })));
      }
      const savedCookie = localStorage.getItem('social_cookie');
      if (savedCookie) setCookiePath(savedCookie);
      const savedInterval = localStorage.getItem('social_interval');
      if (savedInterval) setPollingInterval(parseInt(savedInterval, 10));
    } catch {}
  }, []);

  useEffect(() => {
    try { 
      localStorage.setItem('social_channels', JSON.stringify(channels));
      localStorage.setItem('social_interval', pollingInterval.toString());
    } catch {}
  }, [channels, pollingInterval]);

  const handleSelectCookie = async () => {
    if (window.electronAPI?.selectCookieFile) {
      const path = await window.electronAPI.selectCookieFile();
      if (path) {
        setCookiePath(path);
        localStorage.setItem('social_cookie', path);
      }
    }
  };

  useEffect(() => {
    if (!window.electronAPI) return;

    window.electronAPI.onDownloadComplete(({ id }: { id: string }) => {
      setChannels(prev => prev.map(ch => ch.recordingTaskId === id ? { ...ch, status: 'waiting', recordingTaskId: undefined, recordingFinished: true, lastChecked: new Date().toLocaleTimeString() } : ch));
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
        return prev.map(c => c.recordingTaskId === id ? { ...c, status: 'waiting', recordingTaskId: undefined, lastChecked: new Date().toLocaleTimeString() } : c);
      });
    });
  }, []);

  const checkChannel = useCallback(async (ch: WatchedChannel) => {
    if (checkingRef.current.has(ch.id) || (ch.status === 'live' && ch.recordingTaskId)) return;

    checkingRef.current.add(ch.id);
    setChannels(prev => prev.map(c => c.id === ch.id ? { ...c, status: 'checking', recordingFinished: false } : c));

    try {
      const isLive = (window as any).electronAPI?.checkLive ? await (window as any).electronAPI.checkLive(ch.url) : false;
      const now = new Date().toLocaleTimeString();

      if (isLive) {
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

        setChannels(prev => prev.map(c => c.id === ch.id ? { ...c, status: 'live', lastChecked: now, recordingTaskId: taskId } : c));
      } else {
        setChannels(prev => prev.map(c => c.id === ch.id ? { ...c, status: 'waiting', lastChecked: now } : c));
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

  // Initial check when component mounts (tab activation)
  useEffect(() => {
     channelsRef.current.forEach(ch => {
        if (ch.status === 'waiting' && !checkingRef.current.has(ch.id)) {
           checkChannel(ch);
        }
     });
  }, [checkChannel]); // passive trigger when tab is opened

  const addChannel = () => {
    const url = inputUrl.trim();
    if (!url) return;
    const newCh: WatchedChannel = {
      id: generateId(),
      url,
      platform: detectPlatform(url),
      label: labelFromUrl(url),
      status: 'waiting',
    };
    setChannels(prev => [...prev, newCh]);
    setInputUrl('');
    setTimeout(() => checkChannel(newCh), 300);
  };

  const removeChannel = (id: string) => {
    checkingRef.current.delete(id);
    setChannels(prev => prev.filter(c => c.id !== id));
  };

  const manualStopRecording = (ch: WatchedChannel) => {
    checkingRef.current.delete(ch.id);
    setChannels(prev => prev.map(c => c.id === ch.id ? { ...c, status: 'waiting', recordingTaskId: undefined } : c));
  };

  const manualCheck = useCallback((ch: WatchedChannel) => {
    checkingRef.current.delete(ch.id);
    checkChannel({ ...ch, status: 'waiting' });
  }, [checkChannel]);

  const filteredChannels = activeTab === 'all' ? channels : channels.filter(c => c.platform === activeTab);

  const getPlatformColors = (platform: string) => {
    switch (platform) {
      case 'twitch': return 'from-[#9146FF] to-[#6b25ce] text-[#9146FF] border-[#9146FF]/30';
      case 'youtube': return 'from-[#FF0000] to-[#cc0000] text-[#FF0000] border-[#FF0000]/30';
      case 'kick': return 'from-[#53FC18] to-[#3aa811] text-[#53FC18] border-[#53FC18]/30';
      default: return 'from-amber-500 to-orange-500 text-amber-500 border-amber-500/30';
    }
  };

  return (
    <div className="h-full flex flex-col xl:flex-row gap-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
      
      {/* LEFT COLUMN: ACTION & CONFIGURATION */}
      <div className="flex-1 space-y-6">
        {/* Header */}
        <div className="bg-slate-900/40 border border-slate-800 p-6 rounded-3xl relative overflow-hidden backdrop-blur-sm">
          <div className="flex flex-col md:flex-row gap-6 justify-between items-start md:items-center">
            <div>
              <div className="flex items-center gap-3 mb-2">
                 <h2 className="text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500">
                   {t('TAB_SITTER') || 'Social Hub'}
                 </h2>
              </div>
              <p className="text-slate-400 text-sm max-w-xl">
                {t('SH_DESC')}
              </p>
            </div>
            
            <div className="flex flex-col items-end gap-3 mt-4 md:mt-0">
              <div className="flex items-center gap-3 bg-slate-800/50 p-2 rounded-xl border border-slate-700/50">
                <button 
                   onClick={handleSelectCookie} 
                   title={t('SITTER_GUIDE_COOKIES_DESC')}
                   className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs font-medium text-white transition-colors duration-200 cursor-help"
                >
                  <FileKey className="w-4 h-4" />
                  Cookies
                </button>
                <div className="text-xs text-slate-400 max-w-[150px] truncate" title={cookiePath || t('NO_FILE_SELECTED')}>
                  {cookiePath ? cookiePath.split('\\').pop() : t('COOKIE_DISABLED')}
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs font-medium text-slate-400 bg-slate-800/50 px-3 py-2 rounded-xl border border-slate-700/50">
                <Clock className="w-4 h-4 text-cyan-400" />
                <span>{t('AUTO_CHECK_LABEL') || 'Auto-check'} :</span>
                <select 
                   value={pollingInterval} 
                   onChange={(e) => setPollingInterval(Number(e.target.value))}
                   className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 outline-none text-slate-300 focus:border-cyan-500"
                >
                   <option value={30}>30s</option>
                   <option value={60}>1 min</option>
                   <option value={300}>5 min</option>
                   <option value={600}>10 min</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* TABS */}
        <div className="flex gap-2 p-1 bg-slate-900/60 border border-slate-800 rounded-2xl overflow-x-auto hide-scrollbar">
          {[
            { id: 'all', label: t('NETWORKS_ALL') || 'All Networks', color: 'from-cyan-500 to-blue-500', glow: 'shadow-cyan-500/20' },
            { id: 'twitch', label: 'Twitch', color: 'from-[#9146FF] to-[#6b25ce]', glow: 'shadow-[#9146FF]/20' },
            { id: 'youtube', label: 'YouTube', color: 'from-[#FF0000] to-[#cc0000]', glow: 'shadow-[#FF0000]/20' },
            { id: 'kick', label: 'Kick', color: 'from-[#53FC18] to-[#3aa811]', glow: 'shadow-[#53FC18]/20' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-6 py-3 rounded-xl text-sm font-bold transition-all duration-300 whitespace-nowrap ${
                activeTab === tab.id 
                  ? `bg-gradient-to-r ${tab.color} text-white shadow-lg ${tab.glow}` 
                  : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Add Form */}
        <div className="flex gap-3">
          <input
            type="text"
            placeholder={t('SITTER_ADD_PLACEHOLDER')}
            value={inputUrl}
            onChange={e => setInputUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addChannel()}
            className="flex-1 bg-slate-900/60 border border-slate-700/50 rounded-xl py-3 px-4 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all font-medium text-sm"
          />
          <button
            onClick={addChannel}
            disabled={!inputUrl.trim()}
            className="px-6 py-3 bg-white text-slate-900 font-black rounded-xl disabled:opacity-40 hover:-translate-y-1 hover:shadow-[0_8px_20px_rgba(255,255,255,0.2)] transition-all duration-300 flex items-center gap-2 cursor-pointer text-sm"
          >
            <Plus className="w-5 h-5" />
            {t('SITTER_ADD_BTN')}
          </button>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pb-12">
          {filteredChannels.length === 0 ? (
            <div className="col-span-full py-16 text-center text-slate-500">
              <Rss className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p>{t('SITTER_EMPTY')}</p>
            </div>
          ) : (
            filteredChannels.map(ch => (
               <ChannelCard
                  key={ch.id}
                  channel={ch}
                  colors={getPlatformColors(ch.platform)}
                  onRemove={() => removeChannel(ch.id)}
                  onStopRecording={() => manualStopRecording(ch)}
                  onCheckNow={() => manualCheck(ch)}
                  t={t}
               />
            ))
          )}
        </div>
      </div>

      {/* RIGHT COLUMN: INFO & GUIDE */}
      <div className="w-full xl:w-[400px] flex flex-col gap-6 shrink-0 pb-12">
        <div className="bg-gradient-to-br from-[#1E293B] to-[#0F172A] border border-slate-800 rounded-3xl p-8 relative overflow-hidden h-full shadow-2xl">
          <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full blur-[80px] pointer-events-none" />
          
          <div className="relative z-10 flex flex-col h-full">
               <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 font-bold text-xs mb-8 w-fit">
                 <Rss className="w-3 h-3" />
                 Stream Sitter
               </div>
             
               <h3 className="text-2xl font-black text-white mb-4 leading-tight">
                 {t('SITTER_GUIDE_TITLE')}
               </h3>
               
               <p className="text-sm text-slate-400 mb-8">
                 {t('SITTER_GUIDE_DESC')}
               </p>

               <ul className="space-y-8 flex-1">
                 <li className="flex gap-4">
                   <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center shrink-0 border border-purple-500/20">
                     <FileKey className="w-5 h-5 text-purple-400" />
                   </div>
                   <div>
                     <h4 className="font-bold text-slate-200 mb-1">{t('SITTER_GUIDE_COOKIES')}</h4>
                     <p className="text-sm text-slate-500 leading-relaxed">{t('SITTER_GUIDE_COOKIES_DESC')}</p>
                   </div>
                 </li>
                 <li className="flex gap-4">
                   <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center shrink-0 border border-cyan-500/20">
                     <Clock className="w-5 h-5 text-cyan-400" />
                   </div>
                   <div>
                     <h4 className="font-bold text-slate-200 mb-1">{t('SITTER_GUIDE_AUTO')}</h4>
                     <p className="text-sm text-slate-500 leading-relaxed">{t('SITTER_GUIDE_AUTO_DESC')}</p>
                   </div>
                 </li>
               </ul>
          </div>
        </div>
      </div>
      
    </div>
  );
}

function ChannelCard({ channel, colors, onRemove, onStopRecording, onCheckNow, t }: any) {
  const isLive = channel.status === 'live';
  const isChecking = channel.status === 'checking';
  const isError = channel.status === 'error';

  return (
    <div className={`relative bg-slate-900/80 border rounded-2xl p-5 overflow-hidden transition-all duration-300 ${isLive ? colors.split(' ')[2].replace('text-', 'border-') : 'border-slate-800'}`}>
      
      {/* Background glow if live */}
      {isLive && (
         <div className={`absolute -top-10 -right-10 w-32 h-32 bg-gradient-to-br ${colors.split(' ')[0]} ${colors.split(' ')[1]} opacity-20 blur-3xl rounded-full`} />
      )}

      <div className="flex justify-between items-start mb-4 relative z-10">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center bg-slate-800 ${isLive ? 'animate-pulse' : ''}`}>
            {channel.platform === 'twitch' ? <span className="font-black text-[#9146FF]">TW</span>
            : channel.platform === 'youtube' ? <PlayCircle className="text-[#FF0000]" />
            : channel.platform === 'kick' ? <span className="font-black text-[#53FC18]">KK</span>
            : <Radio className="text-slate-400" />}
          </div>
          <div>
            <h3 className="font-bold text-slate-100 turncate max-w-[150px]">{channel.label}</h3>
            <span className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">{channel.platform}</span>
          </div>
        </div>
        
        <button onClick={onRemove} className="text-slate-600 hover:text-red-400 p-1 transition-colors">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center justify-between mt-6 relative z-10">
        <div className="flex items-center gap-2">
          {isLive ? (
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-white/10 ${colors.split(' ')[2]}`}>
              <span className="w-2 h-2 rounded-full bg-current animate-ping" />
              LIVE
            </span>
          ) : isChecking ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-800 text-yellow-400">
              <Loader2 className="w-3 h-3 animate-spin" />
              Check...
            </span>
          ) : isError ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-400">
              <AlertTriangle className="w-3 h-3" />
              Erreur
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-800 text-slate-400">
              Off
            </span>
          )}
          
          {channel.lastChecked && (
             <span className="text-[10px] text-slate-600">{channel.lastChecked}</span>
          )}
        </div>

        <div>
          {isLive ? (
             <button onClick={onStopRecording} className="w-8 h-8 flex items-center justify-center bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white rounded-lg transition-all">
               ■
             </button>
          ) : (
             <button onClick={onCheckNow} disabled={isChecking} className="w-8 h-8 flex items-center justify-center bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white rounded-lg transition-all disabled:opacity-50">
               <RefreshCw className="w-4 h-4" />
             </button>
          )}
        </div>
      </div>
    </div>
  );
}
