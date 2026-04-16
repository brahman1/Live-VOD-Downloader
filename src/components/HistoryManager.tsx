import { DownloadTask } from '../types';
import { ShieldAlert, WifiOff, FileVideo, AlertTriangle, Lock, Trash2, FolderOpen, History, CheckCircle2, XOctagon } from 'lucide-react';
import { Translator } from '../App';

interface HistoryManagerProps {
  tasks: DownloadTask[];
  onRemove: (id: string) => void;
  onClearAll: () => void;
  t: Translator;
}

export default function HistoryManager({ tasks, onRemove, onClearAll, t }: HistoryManagerProps) {

  const getHumanError = (errorMsg: string) => {
    if (errorMsg.includes('SUB_ONLY')) return { icon: <Lock/>, text: t('SUB_ONLY'), color: 'text-purple-400' };
    if (errorMsg.includes('RESTRICTED')) return { icon: <ShieldAlert/>, text: t('RESTRICTED'), color: 'text-orange-400' };
    if (errorMsg.includes('IP_BLOCKED')) return { icon: <ShieldAlert/>, text: t('IP_BLOCKED'), color: 'text-red-400' };
    if (errorMsg.includes('OFFLINE')) return { icon: <WifiOff/>, text: t('OFFLINE'), color: 'text-slate-400' };
    if (errorMsg.includes('Annulé') || errorMsg.includes('CANCELED')) return { icon: <XOctagon/>, text: t('CANCELED'), color: 'text-slate-400' };
    return { icon: <AlertTriangle />, text: t('SYSTEM_ERROR'), color: 'text-red-400' };
  };

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500 animate-in fade-in">
        <div className="w-24 h-24 bg-slate-900 rounded-full flex items-center justify-center mb-6">
          <History className="w-10 h-10 text-slate-700" />
        </div>
        <h3 className="text-xl font-medium text-slate-300">{t('HISTORY_EMPTY')}</h3>
        <p className="text-sm mt-2">{t('HISTORY_EMPTY_DESC')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in flex-1 overflow-y-auto pr-2 pb-20">
      <div className="flex items-center justify-between mb-6">
         <h2 className="text-xl font-bold text-white flex items-center gap-2">
           <History className="w-5 h-5 text-slate-400" /> {t('TAB_HISTORY')}
         </h2>
         <button onClick={onClearAll} className="px-4 py-2 bg-slate-900 text-slate-400 hover:text-red-400 rounded-lg text-sm transition-colors border border-slate-800">
           {t('CLEAR_HISTORY')}
         </button>
      </div>

      {tasks.slice().reverse().map((task) => (
        <div key={task.id} className="bg-slate-900/50 border border-slate-700/50 p-4 rounded-2xl flex flex-col gap-3 transition-all duration-300 hover:bg-slate-900">

          <div className="flex gap-4 items-start">
            <div className={`w-16 h-12 rounded-xl shrink-0 border relative overflow-hidden flex items-center justify-center ${task.status === 'completed' ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-red-500/20 bg-red-500/5'}`}>
              {task.status === 'completed' ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <XOctagon className="w-5 h-5 text-red-500" />}
            </div>

            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-medium text-slate-200 truncate leading-relaxed" title={task.url}>{task.url}</h4>
              <div className="text-xs text-slate-500 flex gap-2 mt-1">
                <span className="capitalize">{task.options.format}</span>
                <span>•</span>
                <span>{task.options.ghostMode ? t('GHOST_ON') : t('GHOST_OFF')}</span>
              </div>
            </div>
            
            <button
                onClick={() => onRemove(task.id)}
                className="p-2 text-slate-500 hover:bg-red-500/10 hover:text-red-400 rounded-lg transition-all duration-300 group"
                title={t('REMOVE_BTN')}
              >
                <Trash2 className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-2">
            {task.status === 'error' ? (() => {
              const err = getHumanError(task.errorMsg || '');
              return (
                <div className="flex items-center gap-2 p-2 rounded-lg border bg-red-500/10 border-red-500/20">
                  <span className={`[&>svg]:w-4 [&>svg]:h-4 ${err.color}`}>
                    {err.icon}
                  </span>
                  <span className={`text-xs ${err.color}`}>
                    {err.text}
                  </span>
                </div>
              );
            })() : (
               <div className="flex items-center gap-2 px-3 py-2 bg-slate-950/50 rounded-lg text-xs font-mono text-slate-400 border border-slate-800 break-all">
                  <FolderOpen className="w-3.5 h-3.5 shrink-0" />
                  {task.options.outputFolder || t('DESTINATION_FOLDER')}
               </div>
            )}
          </div>
          
        </div>
      ))}
    </div>
  );
}
