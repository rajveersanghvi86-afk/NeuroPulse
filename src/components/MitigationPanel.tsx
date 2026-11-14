import React from 'react';
import { useTelemetryStore } from '../store/telemetryStore';
import { REST_INTERVAL_MS } from '../store/telemetryStore';
import { Headphones, Lightbulb, Coffee, Eye, Volume2, Timer, Sun } from 'lucide-react';
import { acousticEngine } from '../lib/acousticEngine';
import { MFI_LEVELS } from '../lib/mfiCalculator';
import { useT } from '../i18n';

interface Tip {
  icon: React.ReactNode;
  title: string;
  text: string;
  tone: 'info' | 'warning' | 'severe';
}

export const MitigationPanel: React.FC = () => {
  const t = useT();
  const mfi = useTelemetryStore((s) => s.mfi);
  const breakdown = useTelemetryStore((s) => s.breakdown);
  const vision = useTelemetryStore((s) => s.vision);
  const isTracking = useTelemetryStore((s) => s.isTracking);
  const audioMode = useTelemetryStore((s) => s.audioMode);
  const isCallAssistActive = useTelemetryStore((s) => s.isCallAssistActive);
  const setCallAssistActive = useTelemetryStore((s) => s.setCallAssistActive);
  const lastRest = useTelemetryStore((s) => s.lastMicroRestTime);
  const reactionResults = useTelemetryStore((s) => s.reactionResults);

  const tabMode = audioMode === 'system';

  const toggleCallAssist = () => {
    if (!tabMode) return;
    const next = !isCallAssistActive;
    setCallAssistActive(next);
    acousticEngine.setCallAssist(next, mfi ?? 0);
  };

  const score = (key: string) => breakdown?.components.find((c) => c.key === key && c.weight > 0)?.score ?? null;
  const eyeScore = Math.max(score('perclos') ?? 0, score('blinkDuration') ?? 0, score('eyelidDroop') ?? 0, score('longClosures') ?? 0);
  const acousticScore = score('acoustic') ?? 0;
  const reactionScore = score('reaction') ?? 0;

  const tips: Tip[] = [];
  if (mfi !== null && mfi >= MFI_LEVELS.severe) {
    tips.push({ icon: <Coffee className="w-5 h-5" />, tone: 'severe', title: t('tip_break_t'), text: t('tip_break_d') });
  }
  if (eyeScore >= 50) {
    tips.push({ icon: <Eye className="w-5 h-5" />, tone: eyeScore >= 75 ? 'severe' : 'warning', title: t('tip_eyes_t'), text: t('tip_eyes_d') });
  }
  if (acousticScore >= 40) {
    tips.push({ icon: <Volume2 className="w-5 h-5" />, tone: 'warning', title: t('tip_audio_t'), text: t(tabMode ? 'tip_audio_tab' : 'tip_audio_mic') });
  }
  if (reactionScore >= 40) {
    tips.push({ icon: <Timer className="w-5 h-5" />, tone: 'warning', title: t('tip_rt_t'), text: t('tip_rt_d') });
  }
  if (vision && vision.faceVisible && vision.lightQuality < 0.4) {
    tips.push({ icon: <Sun className="w-5 h-5" />, tone: 'info', title: t('tip_light_t'), text: t('tip_light_d') });
  }
  if (isTracking && reactionResults.length === 0) {
    tips.push({ icon: <Timer className="w-5 h-5" />, tone: 'info', title: t('tip_test_t'), text: t('tip_test_d') });
  }
  if (tips.length === 0) {
    tips.push({ icon: <Lightbulb className="w-5 h-5" />, tone: 'info', title: t(isTracking ? 'tip_ok_t' : 'tip_idle_t'), text: t(isTracking ? 'tip_ok_d' : 'tip_idle_d') });
  }

  const nextRestMin = isTracking && lastRest ? Math.max(0, Math.ceil((lastRest + REST_INTERVAL_MS - Date.now()) / 60000)) : null;

  return (
    <div className="flex flex-col gap-3">
      <div
        className={`p-4 rounded-xl border transition-colors ${tabMode ? 'cursor-pointer hover:bg-slate-700/50' : 'opacity-60 cursor-not-allowed'} ${isCallAssistActive && tabMode ? 'bg-baseline/20 border-baseline text-white' : 'bg-slate-800/30 border-white/5'}`}
        onClick={toggleCallAssist}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <Headphones className={`w-5 h-5 ${isCallAssistActive && tabMode ? 'text-baseline' : 'text-slate-400'}`} />
            <h4 className="font-semibold text-sm">{t('m_ca')}</h4>
          </div>
          <div className={`w-10 h-5 rounded-full p-1 transition-colors ${isCallAssistActive && tabMode ? 'bg-baseline' : 'bg-slate-600'}`}>
            <div className={`w-3 h-3 bg-white rounded-full transition-transform ${isCallAssistActive && tabMode ? 'translate-x-5' : ''}`} />
          </div>
        </div>
        <p className="text-xs text-slate-400">
          {t(!tabMode ? 'm_caTab' : isCallAssistActive ? 'm_caOn' : 'm_caOff')}
        </p>
      </div>

      {tips.map((t, i) => (
        <div key={i} className={`p-4 rounded-xl border ${
          t.tone === 'severe' ? 'bg-severe/10 border-severe/30' : t.tone === 'warning' ? 'bg-warning/10 border-warning/30' : 'bg-slate-800/30 border-white/5'
        }`}>
          <div className={`flex items-center gap-3 mb-1 ${t.tone === 'severe' ? 'text-severe' : t.tone === 'warning' ? 'text-warning' : 'text-slate-400'}`}>
            {t.icon}
            <h4 className="font-semibold text-sm text-slate-200">{t.title}</h4>
          </div>
          <p className="text-xs text-slate-400">{t.text}</p>
        </div>
      ))}

      {nextRestMin !== null && (
        <p className="text-xs text-slate-500 text-center">{t('m_next', { v: nextRestMin })}</p>
      )}
    </div>
  );
};
