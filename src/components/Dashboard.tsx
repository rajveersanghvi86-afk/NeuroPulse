import React, { useState, useEffect } from 'react';
import type { Alert } from '../store/telemetryStore';
import { useTelemetryStore } from '../store/telemetryStore';
import { WebcamFeed } from './WebcamFeed';
import { AudioVisualizer } from './AudioVisualizer';
import { MFIGauge } from './MFIGauge';
import { MitigationPanel } from './MitigationPanel';
import { Activity, BrainCircuit, X, RefreshCw, FileText, Mic, ShieldCheck, HelpCircle } from 'lucide-react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';

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

  const startTour = () => {
    const driverObj = driver({
      showProgress: true,
      steps: [
        { element: '#tour-btn', popover: { title: 'Welcome to NeuroPulse!', description: 'This is an interactive tour to help you understand the dashboard.', side: 'bottom', align: 'start' } },
        { element: '#voice-check-btn', popover: { title: 'Voice Check', description: 'Run a quick 10-second test to establish your vocal baseline. We use this to detect fatigue through voice analysis.', side: 'bottom', align: 'start' } },
        { element: '#recalibrate-btn', popover: { title: 'Recalibrate', description: 'Click this if your head posture changes to reset the tracking anchor. This ensures accurate head movement data.', side: 'bottom', align: 'start' } },
        { element: '#start-telemetry-btn', popover: { title: 'Start Telemetry', description: 'Begins the real-time biometric tracking session. This analyzes your webcam feed and microphone/tab audio.', side: 'bottom', align: 'start' } },
        { element: '#finish-session-btn', popover: { title: 'Finish Session', description: 'Ends the session and generates a comprehensive downloadable PDF and CSV report.', side: 'bottom', align: 'start' } },
        { element: '#camera-audio-controls', popover: { title: 'Camera & Audio Controls', description: 'Toggle your camera off for audio-only tracking (useful for Zoom), and switch your audio source to capture tab audio instead of your mic.', side: 'top', align: 'end' } },
        { element: '#webcam-feed', popover: { title: 'Webcam Feed', description: 'Shows your current webcam feed. Data is processed locally to track your head posture, eye movements (saccades), and facial expressions.', side: 'right', align: 'start' } },
        { element: '#audio-visualizer', popover: { title: 'Audio Visualizer', description: 'Displays the Psychoacoustic FFT Spectrum (2kHz - 4kHz) to analyze vocal stress and fatigue.', side: 'right', align: 'start' } },
        { element: '#mfi-gauge', popover: { title: 'Mental Fatigue Index (MFI)', description: 'Real-time calculation of your fatigue level based on combined biometric data.', side: 'left', align: 'start' } },
        { element: '#active-mitigation', popover: { title: 'Active Mitigation', description: 'Provides real-time alerts and actionable suggestions based on your fatigue level.', side: 'left', align: 'start' } }
      ]
    });
    driverObj.drive();
  };

  useEffect(() => {
    // Check if tour was already shown in this session to avoid annoyance
    const tourSeen = sessionStorage.getItem('neuroPulseTourSeen');
    if (!tourSeen) {
      startTour();
      sessionStorage.setItem('neuroPulseTourSeen', 'true');
    }
  }, []);

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
            id="tour-btn"
            onClick={startTour}
            className="px-4 py-2.5 rounded-full font-semibold transition-all shadow-glass bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-2"
          >
            <HelpCircle className="w-4 h-4" /> Tour
          </button>

          <button 
            id="voice-check-btn"
            onClick={() => setVoiceCheckIn(true)}
            className="px-4 py-2.5 rounded-full font-semibold transition-all shadow-glass bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-2"
          >
            <Mic className="w-4 h-4" /> Run Voice Check
          </button>

          {isTracking && (
            <button 
              id="recalibrate-btn"
              onClick={handleRecalibrate}
              className="px-4 py-2.5 rounded-full font-semibold transition-all shadow-glass bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" /> Recalibrate
            </button>
          )}
          
          <button 
            id="start-telemetry-btn"
            onClick={handleStartTelemetry}
            className={`px-6 py-2.5 rounded-full font-semibold transition-all shadow-glass ${isTracking ? 'bg-severe/20 text-severe hover:bg-severe/30' : 'bg-baseline/20 text-baseline hover:bg-baseline/30'}`}
          >
            {isTracking ? 'Pause Tracking' : 'Start Telemetry'}
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
        <div id="camera-audio-controls" className="flex items-center gap-4 bg-slate-800/80 px-4 py-2 rounded-lg border border-slate-700">
          
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
          <div id="webcam-feed" className="glass-panel p-1 rounded-2xl overflow-hidden relative" style={{ height: '480px' }}>
            <WebcamFeed />
          </div>
          <div id="audio-visualizer" className="glass-panel p-6 h-48">
            <h3 className="text-sm uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-2">
              <Activity className="w-4 h-4" /> Psychoacoustic FFT Spectrum (2kHz - 4kHz)
            </h3>
            <AudioVisualizer />
          </div>
        </div>

        {/* Right Column - Metrics & Mitigation */}
        <div className="md:col-span-4 flex flex-col gap-6 fade-in" style={{ animationDelay: '0.2s' }}>
          <div id="mfi-gauge" className="glass-panel p-6 flex flex-col items-center justify-center relative">
            <h3 className="text-sm uppercase tracking-wider text-slate-400 mb-4 self-start absolute top-6 left-6">
              Fatigue Index (MFI)
            </h3>
            <div className="mt-8">
              <MFIGauge value={mfi} />
            </div>
          </div>
          
          <div id="active-mitigation" className="glass-panel p-6 flex-1">
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
