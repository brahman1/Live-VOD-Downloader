import { useState } from 'react';
import { Scissors, FileVideo, Zap, Target, FolderOpen, Video, Trash2, CheckCircle2, Loader2, PlaySquare } from 'lucide-react';
import { Translator } from '../App';

interface VideoMakerProps {
  t: Translator;
  defaultFolder: string;
}

export default function VideoMaker({ t, defaultFolder }: VideoMakerProps) {
  const [inputPath, setInputPath] = useState('');
  const [start, setStart] = useState('00:00:00');
  const [end, setEnd] = useState('00:00:15');
  const [mode, setMode] = useState<'fast' | 'accurate'>('fast');
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultMsg, setResultMsg] = useState('');
  const [err, setErr] = useState('');

  const handleSelectInput = async () => {
    if (window.electronAPI?.selectVideoFile) {
      const file = await window.electronAPI.selectVideoFile();
      if (file) setInputPath(file);
    }
  };

  const handleProcess = async () => {
    if (!inputPath || !window.electronAPI) return;
    setIsProcessing(true);
    setResultMsg('');
    setErr('');

    try {
      // Build output path next to input or in defaultFolder
      const pathModule = window.require ? window.require('path') : null;
      let outputPath = '';
      if (pathModule) {
        const parsed = pathModule.parse(inputPath);
        outputPath = pathModule.join(defaultFolder, `${parsed.name}_cut_${Date.now()}.mp4`);
      } else {
        // Fallback for simple string manip
        const parts = inputPath.split(/[/\\]/);
        const name = parts.pop() || 'video';
        outputPath = `${defaultFolder}\\${name.split('.')[0]}_cut_${Date.now()}.mp4`;
      }

      const options = {
        input: inputPath,
        start,
        end,
        mode,
        outputPath
      };

      const result = await window.electronAPI.ffmpegCut(options);
      
      if (result.success) {
        setResultMsg(t('VM_SUCCESS') + ' ' + result.dest);
      } else {
        setErr(result.error || t('SYSTEM_ERROR'));
      }
    } catch (e: any) {
      setErr(e.message || t('SYSTEM_ERROR'));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="bg-gradient-to-br from-[#FE2C55]/10 to-[#25F4EE]/10 border border-[#FE2C55]/20 p-6 sm:p-8 rounded-3xl shadow-xl backdrop-blur-xl relative overflow-hidden">
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-[#25F4EE]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-gradient-to-br from-[#FE2C55] to-[#25F4EE] rounded-xl shadow-lg">
            <Scissors className="w-6 h-6 text-white" />
          </div>
          <h2 className="text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-[#FE2C55] to-[#25F4EE]">
            Video Maker
          </h2>
        </div>

        <div className="space-y-6 relative z-10">
          {/* Input File */}
          <div className="bg-slate-900/60 border border-slate-700/50 p-5 rounded-2xl">
            <label className="text-sm text-slate-400 font-medium mb-3 block">{t('VM_SELECT_TUPLE')}</label>
            <div className="flex gap-3">
              <div className="flex-1 bg-slate-800/50 rounded-xl px-4 py-3 border border-slate-700 flex items-center gap-3 overflow-hidden">
                <FileVideo className="w-5 h-5 text-slate-500 shrink-0" />
                <span className="truncate text-slate-300 text-sm font-mono flex-1">
                  {inputPath || t('NO_FILE_SELECTED')}
                </span>
                {inputPath && (
                  <button onClick={() => setInputPath('')} className="text-slate-500 hover:text-[#FE2C55] transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <button
                onClick={handleSelectInput}
                className="px-5 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 rounded-xl text-white font-medium transition-all duration-300 flex items-center gap-2 cursor-pointer shadow-lg shadow-black/20"
              >
                <FolderOpen className="w-4 h-4" />
                {t('BROWSE')}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Timeline */}
            <div className="bg-slate-900/60 border border-slate-700/50 p-5 rounded-2xl">
              <label className="text-sm text-slate-400 font-medium mb-4 flex items-center gap-2">
                <PlaySquare className="w-4 h-4" />
                {t('VM_TIMELINE')}
              </label>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <label className="text-xs text-slate-500 mb-1 block">Start (HH:MM:SS)</label>
                  <input
                    type="text"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-center text-slate-200 focus:border-[#25F4EE] focus:ring-1 focus:ring-[#25F4EE] outline-none font-mono transition-colors"
                  />
                </div>
                <div className="text-slate-600 font-light mt-4">-</div>
                <div className="flex-1">
                  <label className="text-xs text-slate-500 mb-1 block">End (HH:MM:SS)</label>
                  <input
                    type="text"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-center text-slate-200 focus:border-[#FE2C55] focus:ring-1 focus:ring-[#FE2C55] outline-none font-mono transition-colors"
                  />
                </div>
              </div>
            </div>

            {/* Mode */}
            <div className="bg-slate-900/60 border border-slate-700/50 p-5 rounded-2xl">
              <label className="text-sm text-slate-400 font-medium mb-4 block">{t('VM_PROCESSING_MODE')}</label>
              <div className="grid grid-cols-2 gap-3 h-[72px]">
                <button
                  onClick={() => setMode('fast')}
                  className={`relative flex items-center justify-center gap-2 rounded-xl text-sm font-bold transition-all duration-300 border ${
                    mode === 'fast'
                      ? 'bg-[#25F4EE]/20 text-[#25F4EE] border-[#25F4EE]/50 shadow-[0_4px_15px_rgba(37,244,238,0.2)]'
                      : 'bg-slate-800 text-slate-400 border-transparent hover:bg-slate-700 cursor-pointer'
                  }`}
                >
                  <Zap className="w-4 h-4" />
                  {t('VM_FAST_CUT')}
                </button>
                <button
                  onClick={() => setMode('accurate')}
                  className={`relative flex items-center justify-center gap-2 rounded-xl text-sm font-bold transition-all duration-300 border ${
                    mode === 'accurate'
                      ? 'bg-[#FE2C55]/20 text-[#FE2C55] border-[#FE2C55]/50 shadow-[0_4px_15px_rgba(254,44,85,0.2)]'
                      : 'bg-slate-800 text-slate-400 border-transparent hover:bg-slate-700 cursor-pointer'
                  }`}
                >
                  <Target className="w-4 h-4" />
                  {t('VM_ACCURATE_CUT')}
                </button>
              </div>
            </div>
          </div>

          {/* Action button */}
          <button
            onClick={handleProcess}
            disabled={!inputPath || isProcessing}
            className={`w-full py-4 rounded-xl font-bold transition-all duration-300 flex items-center justify-center gap-3 ${
              !inputPath || isProcessing
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-[#FE2C55] to-[#25F4EE] text-white hover:shadow-[0_8px_25px_rgba(254,44,85,0.4)] cursor-pointer hover:-translate-y-1'
            }`}
          >
            {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Video className="w-5 h-5" />}
            {isProcessing ? t('VM_PROCESSING') : t('VM_CUT_VIDEO')}
          </button>

          {/* Feedback */}
          {err && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-sm flex gap-2 items-start mt-4">
              <span className="block mt-0.5">⚠️</span> 
              <span>{err}</span>
            </div>
          )}
          {resultMsg && (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-sm flex gap-2 items-start mt-4 break-all">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <span>{resultMsg}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
