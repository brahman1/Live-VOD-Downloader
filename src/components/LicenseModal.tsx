import React, { useState } from 'react';
import { KeyRound, ExternalLink, Loader2, ShieldCheck, AlertCircle } from 'lucide-react';
import { Translator } from '../App';

interface Props {
  t: Translator;
  onClose: () => void;
  onSuccess: (status: string) => void;
  remainingDownloads?: number;
  usedDownloads?: number;
}

export default function LicenseModal({ t, onClose, onSuccess, remainingDownloads = 10, usedDownloads = 0 }: Props) {
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isExhausted = remainingDownloads <= 0;

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim()) return;
    
    setLoading(true);
    setError('');

    try {
      const api = (window as any).electronAPI;
      if (api) {
        const result = await api.activateLicense(key.trim());
        if (result.valid) {
          onSuccess(result.status);
        } else {
          setError(result.error || t('INVALID_LICENSE'));
        }
      }
    } catch (e: any) {
      setError(e.message || t('INVALID_LICENSE'));
    } finally {
      setLoading(false);
    }
  };

  const handleBuy = (plan: 'pro' | 'elite' = 'pro') => {
    const api = (window as any).electronAPI;
    if (api && api.buyLicense) {
      api.buyLicense(plan);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4 animate-in fade-in duration-300">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 pb-4 border-b border-white/5 relative overflow-hidden bg-gradient-to-b from-cyan-500/10 to-transparent">
          <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/20 rounded-full blur-[50px] -mr-10 -mt-10 pointer-events-none"></div>
          
          <div className="flex items-center gap-3 relative z-10">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center shadow-lg shadow-cyan-500/20 text-white">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">{t('ACTIVATE_PRO')}</h2>
              <p className="text-xs text-slate-400 mt-1">Live & VOD Downloader</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 space-y-5">
          
          {/* Trial Quota Banner */}
          {isExhausted ? (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-center">
              <div className="text-red-400 font-bold text-sm mb-1">⚠️ {t('TRIAL_EXHAUSTED')}</div>
              <div className="text-slate-300 text-xs leading-relaxed">{t('TRIAL_EXHAUSTED_DESC')}</div>
            </div>
          ) : (
            <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-xl p-3 flex items-center justify-between">
              <span className="text-xs font-semibold text-cyan-300">
                ⚡ Offre d'essai gratuite :
              </span>
              <span className="text-xs font-black bg-cyan-500/20 text-cyan-400 px-2.5 py-1 rounded-lg border border-cyan-500/30">
                {remainingDownloads} / 10 restants
              </span>
            </div>
          )}

          <form onSubmit={handleVerify} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-cyan-400" />
                {t('LICENSE_KEY')}
              </label>
              <input
                type="text"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder={t('LICENSE_PLACEHOLDER')}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all font-mono"
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <p className="text-sm text-red-200/90">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={!key.trim() || loading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/40 hover:scale-[1.02] transition-all disabled:opacity-50 disabled:pointer-events-none disabled:hover:scale-100"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : t('VERIFY')}
            </button>
          </form>

          <div className="pt-3 border-t border-slate-800 space-y-2">
             <div className="text-xs text-slate-400 font-medium mb-1">Acheter une licence illimitée :</div>
             <div className="grid grid-cols-2 gap-2">
               <button
                  type="button"
                  onClick={() => handleBuy('pro')}
                  className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-cyan-400 transition-colors border border-slate-700/80"
               >
                  Acheter PRO <ExternalLink className="w-3 h-3" />
               </button>
               <button
                  type="button"
                  onClick={() => handleBuy('elite')}
                  className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-bold bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 transition-colors border border-purple-500/30"
               >
                  Acheter ELITE <ExternalLink className="w-3 h-3" />
               </button>
             </div>
             
             {!isExhausted && (
               <button 
                 onClick={onClose}
                 className="w-full pt-2 text-xs text-slate-500 hover:text-slate-300 transition-colors text-center"
               >
                 Continuer avec l'offre gratuite ({remainingDownloads} restants)
               </button>
             )}
          </div>
        </div>
      </div>
    </div>
  );
}
