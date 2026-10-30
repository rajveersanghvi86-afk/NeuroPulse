import React, { useState, useEffect } from 'react';
import { useTelemetryStore } from '../store/telemetryStore';
import { WebcamFeed } from './WebcamFeed';
import { AudioVisualizer } from './AudioVisualizer';
import { MFIGauge } from './MFIGauge';
import { MitigationPanel } from './MitigationPanel';
import { visionEngine } from '../lib/visionEngine';
import { acousticEngine } from '../lib/acousticEngine';
import { Activity, BrainCircuit, X, RefreshCw, FileText, Timer, ShieldCheck, HelpCircle } from 'lucide-react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';

interface DashboardProps {
  onHome?: () => void;
}

const btn = 'px-4 py-2.5 rounded-full font-semibold transition-all shadow-glass bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-2';

export const Dashboard: React.FC<DashboardProps> = ({ onHome }) => {
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
    const driverObj = driver({
      showProgress: true,
      steps: [
        { element: '#tour-btn', popover: { title: 'Welcome to NeuroPulse', description: 'A quick tour of the dashboard.', side: 'bottom', align: 'start' } },
        { element: '#start-telemetry-btn', popover: { title: 'Start Tracking', description: 'Starts the camera and audio analysis. Everything is processed in your browser. You will be asked to calibrate first.', side: 'bottom', align: 'start' } },
        { element: '#reaction-test-btn', popover: { title: 'Reaction Test', description: 'A one-minute reaction test (a short Psychomotor Vigilance Task). Take one when you feel fresh to set your baseline, then again later to see if you have slowed down.', side: 'bottom', align: 'start' } },
        { element: '#recalibrate-btn', popover: { title: 'Recalibrate', description: 'Redo calibration if you change seat, lighting or posture.', side: 'bottom', align: 'start' } },
        { element: '#finish-session-btn', popover: { title: 'Finish Session', description: 'Stops tracking and opens a summary you can export as PDF, CSV or JSON.', side: 'bottom', align: 'start' } },
        { element: '#camera-audio-controls', popover: { title: 'Camera & Audio', description: 'Turn the camera off for audio-only mode, or capture a browser tab (web Zoom/Meet/Teams) instead of your microphone.', side: 'top', align: 'end' } },
        { element: '#webcam-feed', popover: { title: 'Eye Tracking', description: 'Measures eye openness, blinks, PERCLOS (time with eyes mostly closed), head pose and lighting.', side: 'right', align: 'start' } },
        { element: '#audio-visualizer', popover: { title: 'Audio Spectrum', description: 'Live spectrum. The amber band (2-4 kHz) is the harsh range our ears are most sensitive to.', side: 'right', align: 'start' } },
        { element: '#mfi-gauge', popover: { title: 'Fatigue Index (MFI)', description: 'Combines the signals below into one 0-100 estimate. The breakdown shows what is driving it and the confidence shows how much data it has.', side: 'left', align: 'start' } },
        { element: '#active-mitigation', popover: { title: 'Suggestions', description: 'Practical suggestions based on what is driving your fatigue right now.', side: 'left', align: 'start' } },
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
            className={`flex items-center justify-between p-4 rounded-xl shadow-lg border backdrop-blur-md fade-in
              ${alert.type === 'severe' ? 'bg-severe/20 border-severe/50 text-white' :
                alert.type === 'warning' ? 'bg-warning/20 border-warning/50 text-white' :
                'bg-slate-800/80 border-slate-600 text-slate-200'}`}
          >
            <p className="font-semibold text-sm mr-4">{alert.message}</p>
            <button onClick={() => store().removeAlert(alert.id)} className="hover:opacity-70" aria-label="Dismiss">
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {showAudioGuide && (
        <div className="fixed inset-0 z-50 bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-6">
          <div className="glass-panel max-w-2xl p-8 relative border border-white/10">
            <button onClick={() => setShowAudioGuide(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white">
              <X className="w-6 h-6" />
            </button>
            <h2 className="text-2xl font-bold text-white mb-4">Audio sources</h2>
            <p className="text-slate-300 mb-6">
              Browsers can't listen to desktop apps like the Zoom or Teams apps directly. Pick one:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                <h3 className="font-bold text-baseline mb-2">Microphone (default)</h3>
                <p className="text-sm text-slate-400">Measures the sound in your room, including speaker output and your own voice. Call Assist isn't available.</p>
              </div>
              <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                <h3 className="font-bold text-baseline mb-2">System (Tab Capture)</h3>
                <p className="text-sm text-slate-400">
                  For web-based Zoom, Meet or Teams. Share the call's tab and tick <em>"Share tab audio"</em> (Chrome/Edge).
                  The tab's audio then plays through NeuroPulse, so Call Assist can soften it.
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

        <div className="flex flex-wrap gap-3">
          <button id="tour-btn" onClick={startTour} className={btn}>
            <HelpCircle className="w-4 h-4" /> Tour
          </button>
          <button id="reaction-test-btn" onClick={() => store().setShowReactionTest(true)} className={btn}>
            <Timer className="w-4 h-4" /> Reaction Test
          </button>
          {isTracking && cameraEnabled && (
            <button id="recalibrate-btn" onClick={handleRecalibrate} className={btn}>
              <RefreshCw className="w-4 h-4" /> Recalibrate
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
            {isTracking ? 'Pause Tracking' : sessionDataLength > 0 ? 'Resume Tracking' : 'Start Tracking'}
          </button>
          <button
            id="finish-session-btn"
            onClick={handleFinishSession}
            className="px-4 py-2.5 rounded-full font-semibold transition-all shadow-glass bg-baseline text-slate-900 hover:bg-baseline/80 flex items-center gap-2"
          >
            <FileText className="w-4 h-4" /> Finish Session
          </button>
        </div>
      </header>

      <div className="w-full max-w-6xl flex justify-end gap-2 mb-4">
        <div id="camera-audio-controls" className="flex flex-wrap items-center gap-4 bg-slate-800/80 px-4 py-2 rounded-lg border border-slate-700">
          <div className="flex items-center gap-2 border-r border-slate-700 pr-4">
            <span className="text-sm font-semibold text-slate-300">Camera:</span>
            <button
              onClick={() => store().setCameraEnabled(!cameraEnabled)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${cameraEnabled ? 'bg-baseline' : 'bg-slate-600'}`}
              aria-label="Toggle camera"
            >
              <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${cameraEnabled ? 'translate-x-5' : 'translate-x-1'}`} />
            </button>
            <span className="text-xs text-slate-400">{cameraEnabled ? 'On' : 'Off'}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-300">Audio:</span>
            <select
              className="bg-slate-900 text-white border border-slate-600 rounded px-2 py-1 text-sm outline-none cursor-pointer"
              value={audioMode}
              onChange={(e) => handleAudioMode(e.target.value as 'mic' | 'system')}
            >
              <option value="mic">Microphone</option>
              <option value="system">System (Tab Capture)</option>
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
              <Activity className="w-4 h-4" /> Audio Spectrum (2–4 kHz highlighted)
            </h3>
            <div className="flex-1 min-h-0">
              <AudioVisualizer />
            </div>
          </div>
        </div>

        <div className="md:col-span-4 flex flex-col gap-6 fade-in" style={{ animationDelay: '0.2s' }}>
          <div id="mfi-gauge" className="glass-panel p-6 flex flex-col items-center">
            <h3 className="text-sm uppercase tracking-wider text-slate-400 mb-2 self-start">Fatigue Index (MFI)</h3>
            <MFIGauge value={mfi} confidence={breakdown?.confidence ?? 0} />
            {breakdown && (
              <div className="w-full mt-4 flex flex-col gap-2">
                {breakdown.components.map((c) => {
                  const on = c.weight > 0 && c.score !== null;
                  const s = c.score ?? 0;
                  return (
                    <div key={c.key} className={on ? '' : 'opacity-40'}>
                      <div className="flex justify-between text-xs mb-0.5">
                        <span className="text-slate-300">{c.label}</span>
                        <span className="text-slate-400 font-mono">{on ? `${s.toFixed(0)}` : 'n/a'}</span>
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
            <h3 className="text-sm uppercase tracking-wider text-slate-400 mb-4">Suggestions</h3>
            <MitigationPanel />
          </div>
        </div>
      </div>

      <footer className="w-full max-w-6xl flex flex-col items-center gap-2 pb-6">
        <div className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 rounded-full border border-slate-700/50 text-slate-400 text-sm">
          <ShieldCheck className="w-4 h-4 text-baseline" />
          <span>All processing happens in your browser. No video, audio or measurements are uploaded.</span>
        </div>
        <p className="text-xs text-slate-600">NeuroPulse gives wellbeing estimates, not a medical diagnosis.</p>
      </footer>
    </div>
  );
};
