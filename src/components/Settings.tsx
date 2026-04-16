import { Server, KeySquare, Cloud, CheckCircle2, Globe } from 'lucide-react';
import { Language, Translator } from '../App';

interface SettingsProps {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translator;
}

export default function Settings({ language, setLanguage, t }: SettingsProps) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500 pb-20">
      
      {/* Language & Localisation */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
        <div className="flex items-start gap-4 mb-4">
          <div className="p-3 bg-indigo-500/10 rounded-xl">
            <Globe className="w-6 h-6 text-indigo-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-white">{t('LANGUAGE')}</h3>
            <p className="text-sm text-slate-400">{t('LANGUAGE_DESC')}</p>
          </div>
        </div>
        <div className="mt-4 max-w-xs">
           <select 
              value={language}
              onChange={(e) => setLanguage(e.target.value as Language)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl py-3 px-4 text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium appearance-none hover:border-indigo-500/50 hover:shadow-[0_0_15px_rgba(99,102,241,0.2)]"
           >
              <option value="en">🇬🇧 English</option>
              <option value="fr">🇫🇷 Français</option>
           </select>
        </div>
      </div>

      {/* Cloud Integration */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
        <div className="flex items-start gap-4 mb-4">
          <div className="p-3 bg-blue-500/10 rounded-xl">
            <Cloud className="w-6 h-6 text-blue-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-white">{t('CLOUD_SYNC_TITLE')}</h3>
            <p className="text-sm text-slate-400">{t('CLOUD_SYNC_DESC')}</p>
          </div>
        </div>
        <div className="flex gap-4">
          <button disabled className="px-4 py-2 bg-slate-800 text-slate-500 rounded-lg text-sm border border-slate-700 opacity-50 cursor-not-allowed">
            {t('LINK_GDRIVE')}
          </button>
          <button disabled className="px-4 py-2 bg-slate-800 text-slate-500 rounded-lg text-sm border border-slate-700 opacity-50 cursor-not-allowed">
            {t('LINK_DROPBOX')}
          </button>
        </div>
      </div>

      {/* Cookies & Auth */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
        <div className="flex items-start gap-4 mb-4">
          <div className="p-3 bg-cyan-500/10 rounded-xl">
            <KeySquare className="w-6 h-6 text-cyan-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-white">{t('COOKIES_AUTH_TITLE')}</h3>
            <p className="text-sm text-slate-400">{t('COOKIES_AUTH_DESC')}</p>
          </div>
        </div>
        <div className="bg-slate-950 rounded-xl p-4 border border-white/5 space-y-2">
            <p className="text-sm text-slate-300">{t('COOKIES_FLOW_TITLE')}</p>
            <ol className="text-sm text-slate-500 list-decimal pl-5 space-y-1">
               <li>{t('COOKIES_FLOW_1')}</li>
               <li>{t('COOKIES_FLOW_2')}</li>
               <li>{t('COOKIES_FLOW_3')}</li>
            </ol>
            <div className="mt-4 flex items-center text-emerald-500 text-sm font-medium gap-2">
               <CheckCircle2 className="w-4 h-4" /> {t('COOKIES_FLOW_PERM')}
            </div>
        </div>
      </div>

      {/* Proxies */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl opacity-50 pointer-events-none">
        <div className="flex items-start gap-4 mb-4">
          <div className="p-3 bg-purple-500/10 rounded-xl">
            <Server className="w-6 h-6 text-purple-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-white">{t('NETWORK_TITLE')}</h3>
            <p className="text-sm text-slate-400">{t('NETWORK_DESC')}</p>
          </div>
        </div>
      </div>

    </div>
  );
}
