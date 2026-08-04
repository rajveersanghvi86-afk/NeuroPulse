import React, { useState } from 'react';
import type { Alert } from '../store/telemetryStore';
import { useTelemetryStore } from '../store/telemetryStore';
import { WebcamFeed } from './WebcamFeed';
import { AudioVisualizer } from './AudioVisualizer';
import { MFIGauge } from './MFIGauge';
import { MitigationPanel } from './MitigationPanel';
import { Activity, BrainCircuit, X, RefreshCw, FileText, Mic, ShieldCheck, HelpCircle } from 'lucide-react';

interface DashboardProps {
  onHome?: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onHome }) => {
  const { 
    mfi, 
    isTracking, 
    setIsTracking, 
    alerts, 
    removeAlert,
    setCalibrationStatus,
    setSessionReportOpen,
    setVoiceCheckIn,
    setCalibrationAnchor,
    audioMode,
    setAudioMode,
    cameraEnabled,
    setCameraEnabled
  } = useTelemetryStore();

  const [showAudioGuide, setShowAudioGuide] = useState(false);
  const [showTour, setShowTour] = useState(true);

  const closeTour = () => {
    setShowTour(false);
  };

  const handleStartTelemetry = () => {
    setIsTracking(!isTracking);
  };

  const handleRecalibrate = () => {
    setCalibrationStatus(false);
    setCalibrationAnchor(null); // Reset Anchor
  };

  const handleFinishSession = () => {
    setIsTracking(false);
    setSessionReportOpen(true);
  };

  return (
    <div className="min-h-screen bg-background text-slate-200 p-6 flex flex-col items-center relative">
      
      {/* Tour Modal Overlay */}
      {showTour && (
        <div className="fixed inset-0 z-[200] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-6">
          <div className="glass-panel max-w-2xl p-8 relative border border-white/10 flex flex-col">
            <button onClick={closeTour} className="absolute top-4 right-4 text-slate-400 hover:text-white">
              <X className="w-6 h-6" />
            </button>
            <h2 className="text-2xl font-bold text-white mb-4">Welcome to NeuroPulse!</h2>
            <p className="text-slate-300 mb-6">Here is a quick tour of how to use the dashboard:</p>
            <div className="flex flex-col gap-4 text-sm text-slate-200">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-slate-800 rounded-lg shrink-0"><Mic className="w-5 h-5 text-baseline" /></div>
                <div><strong>Voice Check:</strong> Run a quick 10-second test to establish your vocal baseline.</div>
              </div>
              <div className="flex items-start gap-3">
                <div className="p-2 bg-slate-800 rounded-lg shrink-0"><RefreshCw className="w-5 h-5 text-baseline" /></div>
                <div><strong>Recalibrate:</strong> Click this if your head posture changes to reset the tracking anchor.</div>
              </div>
              <div className="flex items-start gap-3">
                <div className="p-2 bg-slate-800 rounded-lg shrink-0"><Activity className="w-5 h-5 text-baseline" /></div>
                <div><strong>Start Telemetry:</strong> Begins the real-time biometric tracking session.</div>
              </div>
              <div className="flex items-start gap-3">
                <div className="p-2 bg-slate-800 rounded-lg shrink-0"><FileText className="w-5 h-5 text-baseline" /></div>
                <div><strong>Finish Session:</strong> Ends the session and generates a downloadable PDF and CSV report.</div>
              </div>
              <div className="flex items-start gap-3">
                <div className="p-2 bg-slate-800 rounded-lg shrink-0"><HelpCircle className="w-5 h-5 text-baseline" /></div>
                <div><strong>Camera & Audio:</strong> Toggle your camera off for audio-only tracking (useful for Zoom), and switch your audio source to capture tab audio instead of your mic.</div>
              </div>
            </div>
            <button 
              onClick={closeTour} 
              className="mt-8 px-6 py-3 bg-baseline text-slate-900 rounded-full font-bold self-center hover:bg-baseline/80 transition-colors"
            >
              Got it!
            </button>
          </div>
        </div>
      )}

      {/* Toast Alerts Overlay */}
      <div className="fixed top-6 right-6 z-[100] flex flex-col gap-3">
        {alerts.map((alert: Alert) => (
          <div 
            key={alert.id} 
            className={`flex items-center justify-between p-4 rounded-xl shadow-lg border backdrop-blur-md fade-in min-w-[300px]
              ${alert.type === 'severe' ? 'bg-severe/20 border-severe/50 text-white' : 
                alert.type === 'warning' ? 'bg-warning/20 border-warning/50 text-white' : 
                'bg-slate-800/80 border-slate-600 text-slate-200'}`}
          >
            <p className="font-semibold text-sm mr-4">{alert.message}</p>
            <button onClick={() => removeAlert(alert.id)} className="hover:opacity-70">
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Audio Routing Guide Modal */}
      {showAudioGuide && (
        <div className="fixed inset-0 z-50 bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-6">
          <div className="glass-panel max-w-2xl p-8 relative border border-white/10">
            <button onClick={() => setShowAudioGuide(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white">
              <X className="w-6 h-6" />
            </button>
            <h2 className="text-2xl font-bold text-white mb-4">Audio Routing Guide</h2>
            <p className="text-slate-300 mb-6">
              Because of browser security constraints, we cannot automatically listen to native desktop apps like Zoom or Teams. You have two options for Call Assist:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                <h3 className="font-bold text-baseline mb-2">1. Microphone Mode (Default)</h3>
                <p className="text-sm text-slate-400">Captures your own microphone stream. Useful for testing or smoothing your outgoing voice.</p>
              </div>
              <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                <h3 className="font-bold text-baseline mb-2">2. System Audio (Tab) Mode</h3>
                <p className="text-sm text-slate-400">Captures incoming participant audio if you use Web-based Zoom, Teams, or Google Meet. Requires Screen/Tab Share permission.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <header className="w-full max-w-6xl mb-8 flex justify-between items-center fade-in">
        <div 
          className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
          onClick={onHome}
        >
          <BrainCircuit className="w-10 h-10 text-baseline" />
          <h1 className="text-4xl font-bold tracking-tight text-white">Neuro<span className="text-baseline">Pulse</span></h1>
        </div>
        
        <div className="flex gap-4">
          <button 
            onClick={() => setShowTour(true)}
            className="px-4 py-2.5 rounded-full font-semibold transition-all shadow-glass bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-2"
          >
            <HelpCircle className="w-4 h-4" /> Tour
          </button>

          <button 
            onClick={() => setVoiceCheckIn(true)}
            className="px-4 py-2.5 rounded-full font-semibold transition-all shadow-glass bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-2"
          >
            <Mic className="w-4 h-4" /> Run Voice Check
          </button>

          {isTracking && (
            <button 
              onClick={handleRecalibrate}
              className="px-4 py-2.5 rounded-full font-semibold transition-all shadow-glass bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" /> Recalibrate
            </button>
          )}
          
          <button 
            onClick={handleStartTelemetry}
            className={`px-6 py-2.5 rounded-full font-semibold transition-all shadow-glass ${isTracking ? 'bg-severe/20 text-severe hover:bg-severe/30' : 'bg-baseline/20 text-baseline hover:bg-baseline/30'}`}
          >
            {isTracking ? 'Pause Tracking' : 'Start Telemetry'}
          </button>
          
          <button 
            onClick={handleFinishSession}
            className="px-4 py-2.5 rounded-full font-semibold transition-all shadow-glass bg-baseline text-slate-900 hover:bg-baseline/80 flex items-center gap-2"
          >
            <FileText className="w-4 h-4" /> Finish Session
          </button>
        </div>
      </header>

      <div className="w-full max-w-6xl flex justify-end gap-2 mb-4">
        <div className="flex items-center gap-4 bg-slate-800/80 px-4 py-2 rounded-lg border border-slate-700">
          
          <div className="flex items-center gap-2 border-r border-slate-700 pr-4">
             <span className="text-sm font-semibold text-slate-300">Camera:</span>
             <button 
               onClick={() => setCameraEnabled(!cameraEnabled)}
               className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${cameraEnabled ? 'bg-baseline' : 'bg-slate-600'}`}
               disabled={isTracking}
             >
               <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${cameraEnabled ? 'translate-x-5' : 'translate-x-1'}`} />
             </button>
             <span className="text-xs text-slate-400">{cameraEnabled ? 'On' : 'Off'}</span>
          </div>

          <div className="flex items-center gap-2">
             <span className="text-sm font-semibold text-slate-300">Audio Source:</span>
             <select 
               className="bg-slate-900 text-white border border-slate-600 rounded px-2 py-1 text-sm outline-none cursor-pointer"
               value={audioMode}
               onChange={(e) => setAudioMode(e.target.value as 'mic' | 'system')}
               disabled={isTracking}
             >
               <option value="mic">Microphone</option>
               <option value="system">System (Tab Capture)</option>
             </select>
             <button onClick={() => setShowAudioGuide(true)} className="text-slate-400 hover:text-white ml-2">
               <HelpCircle className="w-4 h-4" />
             </button>
          </div>
        </div>
      </div>

      <div className="w-full max-w-6xl grid grid-cols-1 md:grid-cols-12 gap-6 mb-8">
        
        {/* Left Column - Visuals */}
        <div className="md:col-span-8 flex flex-col gap-6 fade-in" style={{ animationDelay: '0.1s' }}>
          <div className="glass-panel p-1 rounded-2xl overflow-hidden relative" style={{ height: '480px' }}>
            <WebcamFeed />
          </div>
          <div className="glass-panel p-6 h-48">
            <h3 className="text-sm uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-2">
              <Activity className="w-4 h-4" /> Psychoacoustic FFT Spectrum (2kHz - 4kHz)
            </h3>
            <AudioVisualizer />
          </div>
        </div>

        {/* Right Column - Metrics & Mitigation */}
        <div className="md:col-span-4 flex flex-col gap-6 fade-in" style={{ animationDelay: '0.2s' }}>
          <div className="glass-panel p-6 flex flex-col items-center justify-center relative">
            <h3 className="text-sm uppercase tracking-wider text-slate-400 mb-4 self-start absolute top-6 left-6">
              Fatigue Index (MFI)
            </h3>
            <div className="mt-8">
              <MFIGauge value={mfi} />
            </div>
          </div>
          
          <div className="glass-panel p-6 flex-1">
            <h3 className="text-sm uppercase tracking-wider text-slate-400 mb-4">
              Active Mitigation
            </h3>
            <MitigationPanel />
          </div>
        </div>
      </div>

      <footer className="w-full max-w-6xl flex justify-center pb-6">
        <div className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 rounded-full border border-slate-700/50 text-slate-400 text-sm">
          <ShieldCheck className="w-4 h-4 text-baseline" />
          <span><strong>Privacy Inspector:</strong> 100% Client-Side Executed | 0 Bytes Sent to Cloud</span>
        </div>
      </footer>

    </div>
  );
};
