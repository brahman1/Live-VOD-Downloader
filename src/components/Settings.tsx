import { Server, KeySquare, Cloud, CheckCircle2, Globe } from 'lucide-react';
import { Language, Translator } from '../App';

interface SettingsProps {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translator;
  outputFolder: string;
  setOutputFolder: (folder: string) => void;
  defaultFolder: string;
  appUpdate?: any;
  setAppUpdate?: any;
  updaterLogs?: string[];
}

export default function Settings({ language, setLanguage, t, outputFolder, setOutputFolder, defaultFolder, appUpdate, setAppUpdate, updaterLogs = [] }: SettingsProps) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500 pb-20">
      
      {/* Language & Localisation */}
      <div className="bg-white border border-slate-200/90 p-6 rounded-2xl shadow-sm">
        <div className="flex items-start gap-4 mb-4">
          <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-100">
            <Globe className="w-6 h-6 text-indigo-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-slate-900">{t('LANGUAGE')}</h3>
            <p className="text-sm text-slate-500 font-medium">{t('LANGUAGE_DESC')}</p>
          </div>
        </div>
        <div className="mt-4 max-w-xs">
           <select 
              value={language}
              onChange={(e) => setLanguage(e.target.value as Language)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl py-3 px-4 text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-extrabold appearance-none hover:border-indigo-400 shadow-sm cursor-pointer"
           >
              <option value="en">🇬🇧 English</option>
              <option value="fr">🇫🇷 Français</option>
           </select>
        </div>
      </div>

      {/* Download Folder */}
      <div className="bg-white border border-slate-200/90 p-6 rounded-2xl shadow-sm">
        <div className="flex items-start gap-4 mb-4">
          <div className="p-3 bg-green-50 rounded-xl border border-green-100">
            <Cloud className="w-6 h-6 text-green-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-slate-900">{t('DOWNLOAD_FOLDER_TITLE') || 'Dossier de destination'}</h3>
            <p className="text-sm text-slate-500 font-medium">{t('DOWNLOAD_FOLDER_DESC') || 'Choisissez où enregistrer les vidéos et les lives'}</p>
          </div>
        </div>
        <div className="flex gap-4 items-center">
          <input 
            type="text" 
            readOnly 
            value={outputFolder || defaultFolder} 
            className="flex-1 bg-slate-50 border border-slate-300 rounded-xl py-3 px-4 text-slate-900 focus:outline-none transition-all font-medium text-sm"
          />
          <button 
            onClick={async () => {
               const folder = await window.electronAPI?.selectFolder();
               if (folder) {
                  setOutputFolder(folder);
                  localStorage.setItem('customOutputFolder', folder);
               }
            }}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
          >
            {t('BROWSE') || 'Parcourir...'}
          </button>
        </div>
      </div>

      {/* Cloud Integration */}
      <div className="bg-white border border-slate-200/90 p-6 rounded-2xl shadow-sm">
        <div className="flex items-start gap-4 mb-4">
          <div className="p-3 bg-blue-50 rounded-xl border border-blue-100">
            <Cloud className="w-6 h-6 text-blue-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-slate-900">{t('CLOUD_SYNC_TITLE')}</h3>
            <p className="text-sm text-slate-500 font-medium">{t('CLOUD_SYNC_DESC')}</p>
          </div>
        </div>
        <div className="flex gap-4">
          <button disabled className="px-4 py-2 bg-slate-100 text-slate-400 rounded-xl text-sm border border-slate-200 font-bold opacity-60 cursor-not-allowed">
            {t('LINK_GDRIVE')}
          </button>
          <button disabled className="px-4 py-2 bg-slate-100 text-slate-400 rounded-xl text-sm border border-slate-200 font-bold opacity-60 cursor-not-allowed">
            {t('LINK_DROPBOX')}
          </button>
        </div>
      </div>

      {/* Cookies & Auth */}
      <div className="bg-white border border-slate-200/90 p-6 rounded-2xl shadow-sm">
        <div className="flex items-start gap-4 mb-4">
          <div className="p-3 bg-cyan-50 rounded-xl border border-cyan-100">
            <KeySquare className="w-6 h-6 text-cyan-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-slate-900">{t('COOKIES_AUTH_TITLE')}</h3>
            <p className="text-sm text-slate-500 font-medium">{t('COOKIES_AUTH_DESC')}</p>
          </div>
        </div>
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-2">
            <p className="text-sm font-bold text-slate-800">{t('COOKIES_FLOW_TITLE')}</p>
            <ol className="text-sm text-slate-600 font-medium list-decimal pl-5 space-y-1">
               <li>{t('COOKIES_FLOW_1')}</li>
               <li>{t('COOKIES_FLOW_2')}</li>
               <li>{t('COOKIES_FLOW_3')}</li>
            </ol>
            <div className="mt-4 flex items-center text-emerald-700 text-sm font-bold gap-2">
               <CheckCircle2 className="w-4 h-4 text-emerald-600" /> {t('COOKIES_FLOW_PERM')}
            </div>
        </div>
      </div>

      {/* Proxies */}
      <div className="bg-white border border-slate-200/90 p-6 rounded-2xl opacity-60 pointer-events-none shadow-sm">
        <div className="flex items-start gap-4 mb-4">
          <div className="p-3 bg-purple-50 rounded-xl border border-purple-100">
            <Server className="w-6 h-6 text-purple-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-slate-900">{t('NETWORK_TITLE')}</h3>
            <p className="text-sm text-slate-500 font-medium">{t('NETWORK_DESC')}</p>
          </div>
        </div>
      </div>

      {/* App Version & Updates */}
      <div className="bg-white border border-slate-200/90 p-6 rounded-2xl shadow-sm">
        <div className="flex items-start gap-4 mb-4">
          <div className="p-3 bg-cyan-50 rounded-xl border border-cyan-100">
            <Server className="w-6 h-6 text-cyan-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-slate-900">À propos de l'application</h3>
            <p className="text-sm text-slate-500 font-medium">Version actuelle de Live & VOD Downloader</p>
          </div>
        </div>
        <div className="flex items-center justify-between bg-slate-50 p-4 rounded-xl border border-slate-200">
          <div>
            <div className="text-sm font-extrabold text-slate-900">Live & VOD Downloader</div>
            <div className="text-xs text-slate-500 font-medium mb-1">Version 1.2.0 (Build 64-bit)</div>
            <button
              onClick={() => (window.electronAPI as any)?.openExternalUrl?.('https://github.com/brahman1/DownloaderWebSite/releases/latest')}
              className="text-[11px] text-cyan-600 hover:text-cyan-800 underline font-medium cursor-pointer"
            >
              Voir la dernière version manuellement
            </button>
          </div>
          <button 
            onClick={() => {
              if (setAppUpdate) {
                 setAppUpdate((prev: any) => ({ ...prev, notAvailable: false, rateLimited: false }));
              }
              (window.electronAPI as any)?.checkAppUpdate?.(true);
            }}
            disabled={appUpdate?.notAvailable || appUpdate?.rateLimited}
            className={`px-4 py-2 rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer ${
              appUpdate?.rateLimited
                ? 'bg-amber-500 text-white shadow-amber-500/20 cursor-default'
                : appUpdate?.notAvailable 
                ? 'bg-emerald-500 text-white shadow-emerald-500/20 cursor-default'
                : 'bg-cyan-600 hover:bg-cyan-700 text-white shadow-cyan-600/20'
            }`}
          >
            {appUpdate?.rateLimited ? 'Trop de requêtes ⏱️' : appUpdate?.notAvailable ? 'À jour ✅' : 'Vérifier les mises à jour'}
          </button>
        </div>
        
        {/* Debug Logs */}
        {updaterLogs && updaterLogs.length > 0 && (
          <div className="mt-4 bg-slate-900 rounded-xl p-3 max-h-40 overflow-y-auto">
            <div className="text-[10px] text-slate-400 font-mono mb-2 uppercase tracking-wider">Logs de mise à jour</div>
            <div className="space-y-1">
              {updaterLogs.map((log, i) => (
                <div key={i} className="text-[11px] text-emerald-400 font-mono leading-relaxed">{log}</div>
              ))}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
