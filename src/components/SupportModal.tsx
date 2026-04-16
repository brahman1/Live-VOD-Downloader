import { Terminal, Copy, X } from 'lucide-react';

import { Translator } from '../App';

interface SupportModalProps {
  logs: { id: string | null; message: string }[];
  onClose: () => void;
  t: Translator;
}

export default function SupportModal({ logs, onClose, t }: SupportModalProps) {
  const handleCopy = () => {
    const text = logs.map(l => `[${l.id || 'SYS'}] ${l.message}`).join('\n');
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-950 border border-slate-800 w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[80vh]">
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900">
          <h3 className="text-lg font-medium text-white flex items-center gap-2">
            <Terminal className="w-5 h-5 text-slate-400" /> {t('DIAGNOSTIC_CONSOLE')}
          </h3>
          <div className="flex gap-2">
            <button onClick={handleCopy} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors" title={t('COPY_LOGS')}>
              <Copy className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        
        <div className="flex-1 p-4 overflow-y-auto font-mono text-xs text-slate-400 space-y-1">
           {logs.map((log, i) => (
             <div key={i} className="leading-relaxed hover:bg-white/5 px-2 py-0.5 rounded">
                <span className="text-slate-600 mr-2">[{log.id || 'SYSTEM'}]</span>
                <span className={log.message.includes('Erreur') || log.message.includes('ERR') ? 'text-red-400' : 'text-emerald-400/80'}>{log.message}</span>
             </div>
           ))}
           {logs.length === 0 && <div className="text-center mt-10 text-slate-600">{t('NO_LOGS')}</div>}
        </div>
      </div>
    </div>
  );
}
