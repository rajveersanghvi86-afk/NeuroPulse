import React from 'react';
import { useTelemetryStore } from '../store/telemetryStore';
import { REST_INTERVAL_MS } from '../store/telemetryStore';
import { Headphones, Lightbulb, Coffee, Eye, Volume2, Timer, Sun } from 'lucide-react';
import { acousticEngine } from '../lib/acousticEngine';
import { MFI_LEVELS } from '../lib/mfiCalculator';

interface Tip {
  icon: React.ReactNode;
  title: string;
  text: string;
  tone: 'info' | 'warning' | 'severe';
}

export const MitigationPanel: React.FC = () => {
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
    tips.push({ icon: <Coffee className="w-5 h-5" />, tone: 'severe', title: 'Take a real break',
      text: 'Several fatigue signs are high. Step away from the screen for 10-15 minutes. A short walk or a 20-minute nap helps more than coffee alone.' });
  }
  if (eyeScore >= 50) {
    tips.push({ icon: <Eye className="w-5 h-5" />, tone: eyeScore >= 75 ? 'severe' : 'warning', title: 'Your eyes are closing more than usual',
      text: 'Longer blinks and droopy lids are early drowsiness signs. Rest your eyes, and if it keeps rising, stop doing anything that needs sustained attention.' });
  }
  if (acousticScore >= 40) {
    tips.push({ icon: <Volume2 className="w-5 h-5" />, tone: 'warning', title: 'Lots of harsh audio',
      text: tabMode
        ? 'Turn on Call Assist below, lower the volume, or use headphones with a softer treble.'
        : 'Your room or your own voice is loud in the 2-4 kHz range. Lower the call volume, use headphones, or move somewhere quieter.' });
  }
  if (reactionScore >= 40) {
    tips.push({ icon: <Timer className="w-5 h-5" />, tone: 'warning', title: 'Reaction time is slower',
      text: 'Your last reaction test was slower than your baseline. Schedule less demanding work for now.' });
  }
  if (vision && vision.faceVisible && vision.lightQuality < 0.4) {
    tips.push({ icon: <Sun className="w-5 h-5" />, tone: 'info', title: 'Improve your lighting',
      text: 'A light in front of you (not behind) makes the eye measurements far more reliable.' });
  }
  if (isTracking && reactionResults.length === 0) {
    tips.push({ icon: <Timer className="w-5 h-5" />, tone: 'info', title: 'Run a reaction test',
      text: 'It adds the most objective fatigue measure to the index. It takes about a minute.' });
  }
  if (tips.length === 0) {
    tips.push({ icon: <Lightbulb className="w-5 h-5" />, tone: 'info', title: isTracking ? 'All good' : 'Not tracking',
      text: isTracking ? 'No fatigue signs that need action right now.' : 'Start tracking to get live suggestions.' });
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
            <h4 className="font-semibold text-sm">Call Assist</h4>
          </div>
          <div className={`w-10 h-5 rounded-full p-1 transition-colors ${isCallAssistActive && tabMode ? 'bg-baseline' : 'bg-slate-600'}`}>
            <div className={`w-3 h-3 bg-white rounded-full transition-transform ${isCallAssistActive && tabMode ? 'translate-x-5' : ''}`} />
          </div>
        </div>
        <p className="text-xs text-slate-400">
          {!tabMode
            ? 'Only works with "System (Tab Capture)" audio: it re-plays a web call through an EQ that softens 2-4 kHz harshness.'
            : isCallAssistActive
            ? 'Tab audio is playing through a de-harshing EQ (stronger as fatigue rises).'
            : 'Turn on to soften harsh treble in the shared tab’s audio.'}
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
        <p className="text-xs text-slate-500 text-center">Next 20-20-20 eye break in ~{nextRestMin} min</p>
      )}
    </div>
  );
};
