import { DownloadTask } from '../types';
import { XCircle, Play, AlertCircle, HardDrive, ShieldAlert, WifiOff, FileVideo, Pause, AlertTriangle, Lock, Trash2 } from 'lucide-react';
import { Translator } from '../App';

interface QueueManagerProps {
  tasks: DownloadTask[];
  onCancel: (id: string) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onRemove: (id: string) => void;
  t: Translator;
}

const isVideoDownload = (task: DownloadTask) =>
  task.options.format === 'video_all' || task.options.format === 'video_only';

export default function QueueManager({ tasks, onCancel, onPause, onResume, onRemove, t }: QueueManagerProps) {

  const getHumanError = (errorMsg: string) => {
    if (errorMsg.includes('SUB_ONLY')) return { icon: <Lock/>, text: t('SUB_ONLY'), color: 'text-purple-400' };
    if (errorMsg.includes('RESTRICTED')) return { icon: <ShieldAlert/>, text: t('RESTRICTED'), color: 'text-orange-400' };
    if (errorMsg.includes('IP_BLOCKED')) return { icon: <ShieldAlert/>, text: t('IP_BLOCKED'), color: 'text-red-400' };
    if (errorMsg.includes('DISK_FULL')) return { icon: <HardDrive/>, text: t('DISK_FULL'), color: 'text-red-500' };
    if (errorMsg.includes('OFFLINE')) return { icon: <WifiOff/>, text: t('OFFLINE'), color: 'text-slate-400' };
    if (errorMsg.includes('FFMPEG_MISSING')) return { icon: <AlertCircle/>, text: t('FFMPEG_MISSING'), color: 'text-red-400' };
    if (errorMsg.includes('Annulé') || errorMsg.includes('CANCELED')) return { icon: <XCircle/>, text: t('CANCELED'), color: 'text-slate-400' };
    return { icon: <AlertCircle />, text: t('SYSTEM_ERROR'), color: 'text-red-400' };
  };

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500 animate-in fade-in">
        <div className="w-24 h-24 bg-slate-900 rounded-full flex items-center justify-center mb-6">
          <FileVideo className="w-10 h-10 text-slate-700" />
        </div>
        <h3 className="text-xl font-medium text-slate-300">{t('QUEUE_EMPTY')}</h3>
        <p className="text-sm mt-2">{t('QUEUE_EMPTY_DESC')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in flex-1 overflow-y-auto pr-2 pb-20">
      <h2 className="text-xl font-bold text-white mb-6">{t('ACTIVE_DOWNLOADS')}</h2>

      {tasks.slice().reverse().map((task) => (
        <div key={task.id} className="bg-slate-900 border border-slate-700/50 p-4 rounded-2xl flex flex-col gap-3 transition-all duration-300 hover:border-slate-600/50">

          {/* Top row: thumbnail + meta */}
          <div className="flex gap-4 items-start">
            {/* Thumbnail placeholder */}
            <div className="w-24 h-16 bg-slate-800 rounded-xl shrink-0 border border-white/5 relative overflow-hidden flex items-center justify-center">
              <div className="absolute inset-0 bg-gradient-to-tr from-cyan-900/20 to-purple-900/20"></div>
              <Play className="w-5 h-5 text-slate-500" />
              <div className="absolute top-1 left-1 bg-black/60 px-1.5 py-0.5 rounded text-[10px] font-bold text-white">LIVE</div>
            </div>

            {/* URL + format meta */}
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-medium text-slate-200 truncate leading-relaxed" title={task.url}>{task.url}</h4>
              <div className="text-xs text-slate-500 flex gap-2 mt-1">
                <span className="capitalize">{task.options.format}</span>
                <span>•</span>
                <span>{task.options.ghostMode ? t('GHOST_ON') : t('GHOST_OFF')}</span>
              </div>
            </div>
          </div>

          {/* Control Buttons — always below, never overflow */}
          <div className="flex items-center gap-2">
            {(task.status === 'downloading' || task.status === 'paused') && !task.speed?.includes(t('SAVING')) && (
              <>
                {/* Pause / Resume uniquement pour les téléchargements vidéo (pas les lives) */}
                {isVideoDownload(task) && (
                  task.status === 'downloading' ? (
                    <button
                      onClick={() => onPause(task.id)}
                      className="flex items-center gap-1.5 py-1.5 px-3 bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 hover:text-yellow-300 rounded-lg transition-all duration-300 cursor-pointer group text-xs border border-transparent hover:border-yellow-500/30 hover:shadow-[0_5px_15px_rgba(234,179,8,0.3)] hover:-translate-y-0.5"
                      title={t('PAUSE_BTN')}
                    >
                      <Pause className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                      <span className="font-medium">{t('PAUSE_BTN')}</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => onResume(task.id)}
                      className="flex items-center gap-1.5 py-1.5 px-3 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300 rounded-lg transition-all duration-300 cursor-pointer group text-xs border border-transparent hover:border-emerald-500/30 hover:shadow-[0_5px_15px_rgba(16,185,129,0.3)] hover:-translate-y-0.5"
                      title={t('RESUME_BTN')}
                    >
                      <Play className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                      <span className="font-medium">{t('RESUME_BTN')}</span>
                    </button>
                  )
                )}
                <button
                  onClick={() => onCancel(task.id)}
                  className="flex items-center gap-1.5 py-1.5 px-3 bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 rounded-lg transition-all duration-300 cursor-pointer group text-xs border border-transparent hover:border-red-500/30 shadow-sm hover:shadow-[0_5px_15px_rgba(239,68,68,0.4)] hover:-translate-y-0.5"
                  title={t('CANCEL_BTN')}
                >
                  <XCircle className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                  <span className="font-medium">{t('CANCEL_BTN')}</span>
                </button>
              </>
            )}
            
            {(task.status === 'completed' || task.status === 'error' || task.status === 'downloading' || task.status === 'paused') && (
              <button
                onClick={() => onRemove(task.id)}
                className="flex items-center gap-1.5 py-1.5 px-3 bg-slate-800 text-slate-400 hover:bg-red-500/10 hover:text-red-400 rounded-lg transition-all duration-300 cursor-pointer group text-xs border border-transparent hover:border-red-500/30"
                title={t('REMOVE_BTN')}
              >
                <Trash2 className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                <span className="font-medium">{t('REMOVE_BTN')}</span>
              </button>
            )}
          </div>

          {/* Dynamic Status Section */}
          {task.status === 'error' && (() => {
            const err = getHumanError(task.errorMsg || '');
            const isSubOnly = (task.errorMsg || '').includes('SUB_ONLY');
            return (
              <div className={`flex items-center gap-2 p-2 rounded-lg border ${isSubOnly ? 'bg-purple-500/10 border-purple-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
                <span className={`[&>svg]:w-4 [&>svg]:h-4 ${err.color}`}>
                  {err.icon}
                </span>
                <span className={`text-xs ${err.color}`}>
                  {err.text}
                </span>
              </div>
            );
          })()}

          {task.status === 'completed' && (
            <div className="text-sm font-medium text-emerald-400 flex items-center gap-2">
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
              {t('SUCCESS_MSG')}
            </div>
          )}

          {task.status === 'paused' && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-medium text-yellow-400">
                <span className="animate-pulse">{t('PAUSE_BTN')}...</span>
                <span>{task.progress}%</span>
              </div>
              <div className="flex items-center gap-2 p-2 bg-yellow-500/10 rounded-lg border border-yellow-500/20 shadow-[0_0_10px_rgba(234,179,8,0.1)]">
                <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0" />
                <span className="text-xs text-yellow-400">
                  {isVideoDownload(task) ? t('PAUSE_VIDEO_WARNING') : t('PAUSE_WARNING')}
                </span>
              </div>
            </div>
          )}

          {task.status === 'downloading' && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-medium text-cyan-400">
                <span className="animate-pulse">{t('RECORDING')}</span>
                <span>{task.progress}%</span>
              </div>
              <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-white/5">
                <div
                  className="bg-gradient-to-r from-cyan-500 to-purple-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${Math.max(5, task.progress)}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-slate-500">
                <span>{task.speed || t('CALCULATING')}</span>
                <span>{task.size || '---'}</span>
                <span>{task.eta}</span>
              </div>
            </div>
          )}

        </div>
      ))}
    </div>
  );
}
