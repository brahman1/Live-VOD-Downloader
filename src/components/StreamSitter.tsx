import { useState, useEffect, useRef, useCallback } from 'react';
import { Rss, Plus, Trash2, Radio, Clock, Loader2, X, CheckCircle2, AlertTriangle } from 'lucide-react';
import { DownloadOptions } from '../types';
import { Translator } from '../App';

interface WatchedChannel {
  id: string;
  url: string;
  label: string;
  status: 'waiting' | 'checking' | 'live' | 'error';
  lastChecked?: string;
  recordingTaskId?: string;
  recordingFinished?: boolean;
}

interface StreamSitterProps {
  onStartDownload: (url: string, options: DownloadOptions) => string;
  t: Translator;
}

function generateId() {
  return Math.random().toString(36).substring(2, 9);
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

export default function StreamSitter({ onStartDownload, t }: StreamSitterProps) {
  const [channels, setChannels] = useState<WatchedChannel[]>([]);
  const [inputUrl, setInputUrl] = useState('');
  const [pollingInterval, setPollingInterval] = useState(60);

  // Ref to the latest onStartDownload — avoids stale closures without causing re-renders
  const onStartDownloadRef = useRef(onStartDownload);
  useEffect(() => { onStartDownloadRef.current = onStartDownload; }, [onStartDownload]);

  // Ref to latest channels for use inside stable callbacks
  const channelsRef = useRef<WatchedChannel[]>(channels);
  useEffect(() => { channelsRef.current = channels; }, [channels]);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Tracks which channel IDs are currently being checked to prevent concurrent probes
  const checkingRef = useRef<Set<string>>(new Set());

  /* ---- Persistence: load once on mount ---- */
  useEffect(() => {
    try {
      const saved = localStorage.getItem('sitter_channels');
      if (saved) {
        const parsed: WatchedChannel[] = JSON.parse(saved);
        // Never restore 'live' or 'checking' — always reset to 'waiting'
        setChannels(parsed.map(ch => ({
          ...ch,
          status: (ch.status === 'live' || ch.status === 'checking') ? 'waiting' : ch.status,
          recordingTaskId: undefined,
          recordingFinished: false,
        })));
      }
      const savedInterval = localStorage.getItem('sitter_interval');
      if (savedInterval) setPollingInterval(parseInt(savedInterval, 10));
    } catch {}
  }, []);

  /* ---- Persistence: save on change ---- */
  useEffect(() => {
    try { localStorage.setItem('sitter_channels', JSON.stringify(channels)); } catch {}
  }, [channels]);

  /* ---- Listen to IPC download events to auto-reset channel status ---- */
  useEffect(() => {
    if (!window.electronAPI) return;

    window.electronAPI.onDownloadComplete(({ id }: { id: string }) => {
      setChannels(prev =>
        prev.map(ch =>
          ch.recordingTaskId === id
            ? { ...ch, status: 'waiting', recordingTaskId: undefined, recordingFinished: true, lastChecked: new Date().toLocaleTimeString() }
            : ch
        )
      );
      // Release the guard for that channel
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
        return prev.map(c =>
          c.recordingTaskId === id
            ? { ...c, status: 'waiting', recordingTaskId: undefined, lastChecked: new Date().toLocaleTimeString() }
            : c
        );
      });
    });
  }, []); // runs once, IPC listeners are persistent

  /* ---- Stable checkChannel — deps only on stable refs ---- */
  const checkChannel = useCallback(async (ch: WatchedChannel) => {
    // Guard: skip if already being checked or currently recording
    if (checkingRef.current.has(ch.id)) return;
    if (ch.status === 'live' && ch.recordingTaskId) return;

    checkingRef.current.add(ch.id);

    setChannels(prev => prev.map(c => c.id === ch.id ? { ...c, status: 'checking', recordingFinished: false } : c));

    try {
      const isLive = await probeChannelLive(ch.url);
      const now = new Date().toLocaleTimeString();

      if (isLive) {
        // Use ref so we always call the latest version of onStartDownload
        const taskId = onStartDownloadRef.current(ch.url, {
          format: 'optimized',
          resolution: '1080',
          useCookies: false,
          cookieBrowser: 'none',
          cookieFilePath: '',
          ghostMode: false,
          relentlessMode: false, // ← must be false: Sitter manages retries itself
          autoCut: false,
          outputFolder: '',
        });

        setChannels(prev =>
          prev.map(c =>
            c.id === ch.id
              ? { ...c, status: 'live', lastChecked: now, recordingTaskId: taskId }
              : c
          )
        );
        // Don't release checkingRef — will be released when download completes/errors

      } else {
        setChannels(prev =>
          prev.map(c =>
            c.id === ch.id
              ? { ...c, status: 'waiting', lastChecked: now }
              : c
          )
        );
        checkingRef.current.delete(ch.id);
      }
    } catch {
      const now = new Date().toLocaleTimeString();
      setChannels(prev =>
        prev.map(c =>
          c.id === ch.id ? { ...c, status: 'error', lastChecked: now } : c
        )
      );
      checkingRef.current.delete(ch.id);
    }
  }, []); // no external deps — uses refs for everything mutable

  /* ---- Polling timer ---- */
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (channels.length === 0) return;

    timerRef.current = setInterval(() => {
      // Read fresh channels from ref (no stale closure)
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
  // checkChannel is stable (no deps), so this only re-runs when channel count or interval changes

  const addChannel = () => {
    const url = inputUrl.trim();
    if (!url) return;
    const newCh: WatchedChannel = {
      id: generateId(),
      url,
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
    setChannels(prev =>
      prev.map(c => c.id === ch.id ? { ...c, status: 'waiting', recordingTaskId: undefined } : c)
    );
  };

  const manualCheck = useCallback((ch: WatchedChannel) => {
    checkingRef.current.delete(ch.id);
    checkChannel({ ...ch, status: 'waiting' });
  }, [checkChannel]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">

      {/* Header */}
      <div className="bg-gradient-to-br from-amber-500/10 to-orange-600/10 border border-amber-500/20 p-6 rounded-3xl relative overflow-hidden">
        <div className="absolute -top-8 -right-8 w-40 h-40 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-amber-500/20 rounded-xl">
            <Rss className="w-6 h-6 text-amber-400" />
          </div>
          <h2 className="text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-amber-400 to-orange-400">
            Stream-Sitter
          </h2>
        </div>
        <p className="text-slate-400 text-sm max-w-xl">
          {t('SITTER_DESC')}
        </p>
      </div>

      {/* Add channel form */}
      <div className="bg-white/5 border border-white/10 p-5 rounded-2xl backdrop-blur-xl">
        <p className="text-sm text-slate-400 font-medium mb-3">{t('SITTER_BTN')}</p>
        <div className="flex gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder={t('SITTER_ADD_PLACEHOLDER')}
              value={inputUrl}
              onChange={e => setInputUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addChannel()}
              className="w-full bg-slate-900/60 border border-slate-700 rounded-xl py-3 pl-4 pr-10 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 transition-all duration-300 text-sm"
            />
            {inputUrl && (
              <button
                onClick={() => setInputUrl('')}
                className="absolute inset-y-0 right-3 flex items-center text-slate-500 hover:text-slate-300 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            onClick={addChannel}
            disabled={!inputUrl.trim()}
            className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold rounded-xl disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 hover:-translate-y-1 cursor-pointer hover:shadow-[0_8px_20px_rgba(245,158,11,0.4)] transition-all duration-300 text-sm shadow-[0_4px_12px_rgba(245,158,11,0.2)]"
          >
            <Plus className="w-4 h-4" />
            {t('SITTER_ADD_BTN')}
          </button>
        </div>

        {/* Interval setting */}
        <div className="mt-4 flex items-center gap-3">
          <Clock className="w-4 h-4 text-slate-500 shrink-0" />
          <label className="text-xs text-slate-500">{t('SITTER_INTERVAL')}</label>
          <input
            type="number"
            min={15}
            max={3600}
            value={pollingInterval}
            onChange={e => {
              const v = Math.max(15, parseInt(e.target.value, 10) || 60);
              setPollingInterval(v);
              localStorage.setItem('sitter_interval', String(v));
            }}
            className="w-20 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-300 focus:outline-none focus:border-amber-500 transition-colors text-center"
          />
          <span className="text-xs text-slate-600">s</span>
        </div>
      </div>

      {/* Channel list */}
      {channels.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-600">
          <Rss className="w-12 h-12 mb-4 opacity-30" />
          <p className="text-sm">{t('SITTER_EMPTY')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {channels.map(ch => (
            <ChannelCard
              key={ch.id}
              channel={ch}
              onRemove={() => removeChannel(ch.id)}
              onStopRecording={() => manualStopRecording(ch)}
              onCheckNow={() => manualCheck(ch)}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* -------- Channel Card -------- */
function ChannelCard({
  channel,
  onRemove,
  onStopRecording,
  onCheckNow,
  t,
}: {
  channel: WatchedChannel;
  onRemove: () => void;
  onStopRecording: () => void;
  onCheckNow: () => void;
  t: Translator;
}) {
  // Explicit per-call translation so re-render on `t` change works correctly
  const statusInfo: Record<WatchedChannel['status'], { label: string; color: string }> = {
    waiting:  { label: t('SITTER_STATUS_WAITING'),  color: 'text-slate-400'   },
    checking: { label: t('SITTER_STATUS_CHECKING'), color: 'text-yellow-400'  },
    live:     { label: t('SITTER_STATUS_LIVE'),     color: 'text-emerald-400' },
    error:    { label: `⚠ ${t('ERR_TAG')}`,         color: 'text-red-400'     },
  };

  const { label: statusLabel, color: statusColor } = statusInfo[channel.status];

  return (
    <div
      className={`bg-slate-900 border rounded-2xl p-4 flex items-center gap-4 transition-all duration-300 ${
        channel.status === 'live'
          ? 'border-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.1)]'
          : channel.status === 'error'
          ? 'border-red-500/20'
          : 'border-slate-800 hover:border-slate-700'
      }`}
    >
      {/* Status icon */}
      <div className="relative shrink-0">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            channel.status === 'live' ? 'bg-emerald-500/20'
            : channel.status === 'checking' ? 'bg-yellow-500/10'
            : channel.status === 'error' ? 'bg-red-500/10'
            : channel.recordingFinished ? 'bg-emerald-500/10'
            : 'bg-slate-800'
          }`}
        >
          {channel.status === 'live' ? (
            <Radio className="w-5 h-5 text-emerald-400 animate-pulse" />
          ) : channel.status === 'checking' ? (
            <Loader2 className="w-5 h-5 text-yellow-400 animate-spin" />
          ) : channel.status === 'error' ? (
            <AlertTriangle className="w-5 h-5 text-red-400" />
          ) : channel.recordingFinished ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          ) : (
            <Rss className="w-5 h-5 text-slate-500" />
          )}
        </div>
        {channel.status === 'live' && (
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-slate-900 animate-ping" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-200 truncate" title={channel.url}>
          {channel.label}
        </p>
        <p className="text-xs text-slate-600 truncate" title={channel.url}>
          {channel.url}
        </p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className={`text-xs font-medium ${statusColor}`}>
            {statusLabel}
          </span>
          {channel.lastChecked && (
            <span className="text-[10px] text-slate-600">— {channel.lastChecked}</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {(channel.status === 'waiting' || channel.status === 'error') && (
          <button
            onClick={onCheckNow}
            className="text-xs px-3 py-1.5 bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg border border-transparent hover:border-slate-600 transition-all duration-300 cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(0,0,0,0.3)]"
          >
            {t('CHECK_BTN')}
          </button>
        )}
        {channel.status === 'live' && (
          <button
            onClick={onStopRecording}
            className="text-xs px-3 py-1.5 bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 rounded-lg border border-transparent hover:border-red-500/30 transition-all duration-300 cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(239,68,68,0.2)]"
          >
            {t('STOP_BTN')}
          </button>
        )}
        <button
          onClick={onRemove}
          title={t('SITTER_REMOVE')}
          className="p-1.5 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all duration-300 cursor-pointer hover:-translate-y-0.5"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

/* -------- Probe function -------- */
async function probeChannelLive(url: string): Promise<boolean> {
  if ((window as any).electronAPI?.checkLive) {
    try {
      return await (window as any).electronAPI.checkLive(url);
    } catch {
      return false;
    }
  }
  return false;
}
