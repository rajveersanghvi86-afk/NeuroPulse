import React, { useState, useEffect } from 'react';
import { useTelemetryStore } from '../store/telemetryStore';
import { WebcamFeed } from './WebcamFeed';
import { AudioVisualizer } from './AudioVisualizer';
import { MFIGauge } from './MFIGauge';
import { MitigationPanel } from './MitigationPanel';
import { visionEngine } from '../lib/visionEngine';
import { acousticEngine } from '../lib/acousticEngine';
import { MFI_LEVELS } from '../lib/mfiCalculator';
import { LANGUAGES, useT } from '../i18n';
import { LanguageSelect } from './LanguageSelect';
import { Activity, BrainCircuit, X, RefreshCw, FileText, Timer, ShieldCheck, HelpCircle } from 'lucide-react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';

interface DashboardProps {
  onHome?: () => void;
}

const btn = 'px-4 py-2.5 rounded-full font-semibold transition-all shadow-glass bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-2';

/** Sparkline of the fatigue index over the last five minutes. */
const TrendLine: React.FC<{ label: string }> = ({ label }) => {
  const data = useTelemetryStore((s) => s.sessionData);
  const recent = data.slice(-300);
  if (recent.length < 10) return null;
  const W = 220, H = 40;
  const y = (v: number) => H - (Math.max(0, Math.min(100, v)) / 100) * H;
  const pts = recent.map((d, i) => `${((i / (recent.length - 1)) * W).toFixed(1)},${y(d.mfi).toFixed(1)}`).join(' ');
  const last = recent[recent.length - 1].mfi;
  const color = last >= MFI_LEVELS.severe ? '#F43F5E' : last >= MFI_LEVELS.elevated ? '#F59E0B' : '#14B8A6';
  return (
    <div className="w-full mt-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">{label}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-10" preserveAspectRatio="none" role="img" aria-label={label}>
        <line x1="0" x2={W} y1={y(MFI_LEVELS.elevated)} y2={y(MFI_LEVELS.elevated)} stroke="#F59E0B" strokeOpacity="0.3" strokeDasharray="3 3" />
        <line x1="0" x2={W} y1={y(MFI_LEVELS.severe)} y2={y(MFI_LEVELS.severe)} stroke="#F43F5E" strokeOpacity="0.3" strokeDasharray="3 3" />
        <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
};

export const Dashboard: React.FC<DashboardProps> = ({ onHome }) => {
  const t = useT();
  const mfi = useTelemetryStore((s) => s.mfi);
  const breakdown = useTelemetryStore((s) => s.breakdown);
  const isTracking = useTelemetryStore((s) => s.isTracking);
  const alerts = useTelemetryStore((s) => s.alerts);
  const audioMode = useTelemetryStore((s) => s.audioMode);
  const cameraEnabled = useTelemetryStore((s) => s.cameraEnabled);
  const sessionDataLength = useTelemetryStore((s) => s.sessionData.length);
  const store = useTelemetryStore.getState;

  const [showAudioGuide, setShowAudioGuide] = useState(false);

  const startTour = () => {
    const step = (element: string, title: string, description: string, side: 'top' | 'bottom' | 'left' | 'right', align: 'start' | 'end' = 'start') =>
      ({ element, popover: { title, description, side, align } });
    const driverObj = driver({
      showProgress: true,
      nextBtnText: t('t_next'),
      prevBtnText: t('t_prev'),
      doneBtnText: t('done'),
      steps: [
        step('#tour-btn', t('t_welcome'), t('t_1'), 'bottom'),
        step('#language-select', t('lang'), LANGUAGES.map((l) => l.name).join(' · '), 'bottom'),
        step('#start-telemetry-btn', t('d_start'), t('t_2'), 'bottom'),
        step('#reaction-test-btn', t('d_reaction'), t('t_3'), 'bottom'),
        step('#finish-session-btn', t('d_finish'), t('t_4'), 'bottom'),
        step('#camera-audio-controls', t('t_5t'), t('t_5'), 'top', 'end'),
        step('#webcam-feed', t('t_6t'), t('t_6'), 'right'),
        step('#audio-visualizer', t('t_7t'), t('t_7'), 'right'),
        step('#mfi-gauge', t('d_mfi'), t('t_8'), 'left'),
        step('#active-mitigation', t('d_sugg'), t('t_9'), 'left'),
      ],
    });
    driverObj.drive();
  };

  useEffect(() => {
    let seen = false;
    try {
      seen = !!sessionStorage.getItem('neuroPulseTourSeen');
      sessionStorage.setItem('neuroPulseTourSeen', 'true');
    } catch {
      /* storage blocked */
    }
    if (!seen) startTour();
    // Only on first mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRecalibrate = () => {
    visionEngine.setCalibration(null);
    store().setCalibration(null);
  };

  const handleFinishSession = () => {
    store().setIsTracking(false);
    store().setSessionReportOpen(true);
  };

  const handleAudioMode = (mode: 'mic' | 'system') => {
    acousticEngine.unlock();
    if (mode === 'mic') store().setCallAssistActive(false);
    store().setAudioMode(mode);
  };

  return (
    <div className="min-h-screen bg-background text-slate-200 p-6 flex flex-col items-center relative">
      <div className="fixed top-6 right-6 z-[100] flex flex-col gap-3 max-w-sm">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className={`flex items-center justify-between p-4 rounded-xl shadow-lg border fade-in
              ${alert.type === 'severe' ? 'bg-[#2a1018] border-severe/60 text-white' :
                alert.type === 'warning' ? 'bg-[#2a1f0b] border-warning/60 text-white' :
                'bg-slate-800 border-slate-600 text-slate-200'}`}
          >
            <p className="font-semibold text-sm mr-4">{alert.message}</p>
            <button onClick={() => store().removeAlert(alert.id)} className="hover:opacity-70" aria-label="Dismiss">
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {showAudioGuide && (
        <div className="fixed inset-0 z-50 bg-slate-900/90 flex items-center justify-center p-6">
          <div className="glass-panel max-w-2xl p-8 relative border border-white/10">
            <button onClick={() => setShowAudioGuide(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white">
              <X className="w-6 h-6" />
            </button>
            <h2 className="text-2xl font-bold text-white mb-4">{t('g_title')}</h2>
            <p className="text-slate-300 mb-6">
              {t('g_intro')}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                <h3 className="font-bold text-baseline mb-2">{t('d_mic')}</h3>
                <p className="text-sm text-slate-400">{t('g_micd')}</p>
              </div>
              <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                <h3 className="font-bold text-baseline mb-2">{t('d_system')}</h3>
                <p className="text-sm text-slate-400">
                  {t('g_sysd')}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <header className="w-full max-w-6xl mb-8 flex flex-wrap gap-4 justify-between items-center fade-in">
        <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity" onClick={onHome}>
          <BrainCircuit className="w-10 h-10 text-baseline" />
          <h1 className="text-4xl font-bold tracking-tight text-white">Neuro<span className="text-baseline">Pulse</span></h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <LanguageSelect />
          <button id="tour-btn" onClick={startTour} className={btn}>
            <HelpCircle className="w-4 h-4" /> {t('d_tour')}
          </button>
          <button id="reaction-test-btn" onClick={() => store().setShowReactionTest(true)} className={btn}>
            <Timer className="w-4 h-4" /> {t('d_reaction')}
          </button>
          {isTracking && cameraEnabled && (
            <button id="recalibrate-btn" onClick={handleRecalibrate} className={btn}>
              <RefreshCw className="w-4 h-4" /> {t('d_recal')}
            </button>
          )}
          <button
            id="start-telemetry-btn"
            onClick={() => {
              // Unlock audio inside the click itself; some browsers keep it silent otherwise.
              if (!isTracking) acousticEngine.unlock();
              store().setIsTracking(!isTracking);
            }}
            className={`px-6 py-2.5 rounded-full font-semibold transition-all shadow-glass ${isTracking ? 'bg-severe/20 text-severe hover:bg-severe/30' : 'bg-baseline/20 text-baseline hover:bg-baseline/30'}`}
          >
            {t(isTracking ? 'd_pause' : sessionDataLength > 0 ? 'd_resume' : 'd_start')}
          </button>
          <button
            id="finish-session-btn"
            onClick={handleFinishSession}
            className="px-4 py-2.5 rounded-full font-semibold transition-all shadow-glass bg-baseline text-slate-900 hover:bg-baseline/80 flex items-center gap-2"
          >
            <FileText className="w-4 h-4" /> {t('d_finish')}
          </button>
        </div>
      </header>

      <div className="w-full max-w-6xl flex justify-end gap-2 mb-4">
        <div id="camera-audio-controls" className="flex flex-wrap items-center gap-4 bg-slate-800/80 px-4 py-2 rounded-lg border border-slate-700">
          <div className="flex items-center gap-2 border-r border-slate-700 pr-4">
            <span className="text-sm font-semibold text-slate-300">{t('d_camera')}:</span>
            <button
              onClick={() => store().setCameraEnabled(!cameraEnabled)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${cameraEnabled ? 'bg-baseline' : 'bg-slate-600'}`}
              aria-label="Toggle camera"
            >
              <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${cameraEnabled ? 'translate-x-5' : 'translate-x-1'}`} />
            </button>
            <span className="text-xs text-slate-400">{t(cameraEnabled ? 'd_on' : 'd_off')}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-300">{t('d_audio')}:</span>
            <select
              className="bg-slate-900 text-white border border-slate-600 rounded px-2 py-1 text-sm outline-none cursor-pointer"
              value={audioMode}
              onChange={(e) => handleAudioMode(e.target.value as 'mic' | 'system')}
            >
              <option value="mic">{t('d_mic')}</option>
              <option value="system">{t('d_system')}</option>
            </select>
            <button onClick={() => setShowAudioGuide(true)} className="text-slate-400 hover:text-white ml-2" aria-label="Audio help">
              <HelpCircle className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="w-full max-w-6xl grid grid-cols-1 md:grid-cols-12 gap-6 mb-8">
        <div className="md:col-span-8 flex flex-col gap-6 fade-in" style={{ animationDelay: '0.1s' }}>
          <div id="webcam-feed" className="glass-panel p-1 rounded-2xl overflow-hidden relative" style={{ height: '480px' }}>
            <WebcamFeed />
          </div>
          <div id="audio-visualizer" className="glass-panel p-6 h-56 flex flex-col">
            <h3 className="text-sm uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-2">
              <Activity className="w-4 h-4" /> {t('d_spectrum')}
            </h3>
            <div className="flex-1 min-h-0">
              <AudioVisualizer />
            </div>
          </div>
        </div>

        <div className="md:col-span-4 flex flex-col gap-6 fade-in" style={{ animationDelay: '0.2s' }}>
          <div id="mfi-gauge" className="glass-panel p-6 flex flex-col items-center">
            <div className="w-full flex justify-between items-baseline mb-2 gap-2">
              <h3 className="text-sm uppercase tracking-wider text-slate-400">{t('d_mfi')}</h3>
              {sessionDataLength > 0 && (
                <span className="text-xs font-mono text-slate-500 shrink-0">
                  {t('d_session')} {Math.floor(sessionDataLength / 60)}:{String(sessionDataLength % 60).padStart(2, '0')}
                </span>
              )}
            </div>
            <MFIGauge value={mfi} confidence={breakdown?.confidence ?? 0} />
            <TrendLine label={t('d_trend')} />
            {breakdown && (
              <div className="w-full mt-4 flex flex-col gap-2">
                {breakdown.components.map((c) => {
                  const on = c.weight > 0 && c.score !== null;
                  const s = c.score ?? 0;
                  return (
                    <div key={c.key} className={on ? '' : 'opacity-40'}>
                      <div className="flex justify-between text-xs mb-0.5">
                        <span className="text-slate-300">{t(`c_${c.key}`)}</span>
                        <span className="text-slate-400 font-mono">{on ? `${s.toFixed(0)}` : t('na')}</span>
                      </div>
                      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${s >= 70 ? 'bg-severe' : s >= 40 ? 'bg-warning' : 'bg-baseline'}`}
                          style={{ width: on ? `${Math.max(2, s)}%` : '0%' }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div id="active-mitigation" className="glass-panel p-6 flex-1">
            <h3 className="text-sm uppercase tracking-wider text-slate-400 mb-4">{t('d_sugg')}</h3>
            <MitigationPanel />
          </div>
        </div>
      </div>

      <footer className="w-full max-w-6xl flex flex-col items-center gap-2 pb-6">
        <div className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 rounded-full border border-slate-700/50 text-slate-400 text-sm">
          <ShieldCheck className="w-4 h-4 text-baseline" />
          <span>{t('d_privacy')}</span>
        </div>
        <p className="text-xs text-slate-600">{t('d_disc')}</p>
      </footer>
    </div>
  );
};
