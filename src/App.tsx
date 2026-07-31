import { useEffect, useRef, useState } from 'react';
import { LandingPage } from './components/LandingPage';
import { Dashboard } from './components/Dashboard';
import { CalibrationModal } from './components/CalibrationModal';
import { SessionReportModal } from './components/SessionReportModal';
import { MicroRestModal } from './components/MicroRestModal';
import { VoiceCheckInModal } from './components/VoiceCheckInModal';
import { useTelemetryStore } from './store/telemetryStore';
import { saccadeEngine } from './lib/saccadeEngine';
import { acousticEngine } from './lib/acousticEngine';
import { mfiEngine } from './lib/mfiCalculator';

function App() {
  const [currentPage, setCurrentPage] = useState<'landing' | 'dashboard'>('landing');

  const { 
    isTracking, 
    setVisualMetrics, 
    setAcousticMetrics,
    setMFI,
    addAlert,
    logDataPoint,
    logGazePoint,
    triggerMicroRest,
    audioMode
  } = useTelemetryStore();

  const animationFrameRef = useRef<number>(0);
  const logTimerRef = useRef<number>(0);

  useEffect(() => {
    let active = true;

    const runTelemetryLoop = () => {
      if (!active) return;

      if (acousticEngine.isInitialized) {
        const { fftData, harshBandEnergy } = acousticEngine.getTelemetry();
        if (fftData) {
          setAcousticMetrics(fftData, harshBandEnergy);
        }
      }

      animationFrameRef.current = requestAnimationFrame(runTelemetryLoop);
    };

    if (isTracking) {
      saccadeEngine.onAlert = (msg, type) => {
        addAlert(msg, type);
      };

      saccadeEngine.onResults = (_results, metrics) => {
        setVisualMetrics(metrics.ear, metrics.perclos, metrics.cLight, metrics.liveSaccadeLatency, metrics.outOfFrame);
        
        if (useTelemetryStore.getState().isCalibrated && !useTelemetryStore.getState().calibrationAnchor) {
           useTelemetryStore.getState().setCalibrationAnchor(metrics.nosePos);
        }

        const currentHarsh = acousticEngine.isInitialized ? acousticEngine.getTelemetry().harshBandEnergy : 0;
        const mfi = mfiEngine.calculateMFI(
          metrics.liveSaccadeLatency, 
          metrics.perclos, 
          metrics.cLight, 
          currentHarsh,
          metrics.ear
        );
        
        setMFI(mfi);
        acousticEngine.setMitigationLevel(mfi);

        if (mfi >= 50) {
          triggerMicroRest();
        }
        
        const now = Date.now();
        if (metrics.gazePoint) {
          logGazePoint({ x: metrics.gazePoint.x, y: metrics.gazePoint.y, time: now });
        }

        if (now - logTimerRef.current > 1000) {
          logDataPoint({
            time: now,
            mfi,
            ear: metrics.ear,
            latency: metrics.liveSaccadeLatency,
            harshEnergy: currentHarsh
          });
          logTimerRef.current = now;
        }
      };

      const initAudio = async () => {
        try {
          let stream: MediaStream;
          if (audioMode === 'system') {
            stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
          } else {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          }
          if (active) acousticEngine.initialize(stream);
        } catch (err) {
          console.error("Audio error:", err);
          addAlert("⚠️ Audio access denied. Acoustic tracking disabled.", "severe");
        }
      };

      initAudio();
      runTelemetryLoop();
    } else {
      saccadeEngine.stop();
      if (animationFrameRef.current !== undefined) cancelAnimationFrame(animationFrameRef.current);
    }

    return () => {
      active = false;
      if (animationFrameRef.current !== undefined) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isTracking, audioMode]);

  if (currentPage === 'landing') {
    return <LandingPage onLaunch={() => setCurrentPage('dashboard')} />;
  }

  return (
    <>
      <CalibrationModal />
      <SessionReportModal />
      <MicroRestModal />
      <VoiceCheckInModal />
      <Dashboard />
    </>
  );
}

export default App;
