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


function App() {
  const [currentPage, setCurrentPage] = useState<'landing' | 'dashboard'>('landing');

  const { 
    isTracking, 
    setVisualMetrics, 
    setAcousticMetrics,
    addAlert,
    logGazePoint,
    triggerMicroRest,
    audioMode
  } = useTelemetryStore();

  const animationFrameRef = useRef<number>(0);
  const lastLogSecondRef = useRef<number>(0);

  useEffect(() => {
    let active = true;

    const runTelemetryLoop = () => {
      if (!active) return;

      const store = useTelemetryStore.getState();

      if (acousticEngine.isInitialized) {
        const { fftData, harshBandEnergy } = acousticEngine.getTelemetry();
        if (fftData) {
          setAcousticMetrics(fftData, harshBandEnergy);
        }
      }

      // Audio-only MFI calculation and logging when camera is disabled
      if (store.isTracking && !store.cameraEnabled) {
         const currentAcoustic = (store.harshBandEnergy / 255.0) * 100;
         const calculatedMFI = Math.round(currentAcoustic); 
         
         store.setMFI(calculatedMFI);
         acousticEngine.setMitigationLevel(calculatedMFI);

         if (calculatedMFI >= 50) {
           store.triggerMicroRest();
         }

         const currentSecond = Math.floor(Date.now() / 1000);
         if (lastLogSecondRef.current !== currentSecond) {
            lastLogSecondRef.current = currentSecond;
            store.logDataPoint({
              time: Date.now(),
              mfi: calculatedMFI,
              ear: store.earBaseline, // dummy value for audio-only
              latency: store.latencyBaseline, // dummy value for audio-only
              harshEnergy: store.harshBandEnergy
            });
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
        
        const store = useTelemetryStore.getState();
        if (store.isCalibrated && !store.calibrationAnchor) {
           store.setCalibrationAnchor(metrics.nosePos);
        }

        const mfi = store.mfi;
        acousticEngine.setMitigationLevel(mfi);

        if (mfi >= 50) {
          triggerMicroRest();
        }
        
        const now = Date.now();
        if (metrics.gazePoint) {
          logGazePoint({ x: metrics.gazePoint.x, y: metrics.gazePoint.y, time: now });
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
      <Dashboard onHome={() => setCurrentPage('landing')} />
    </>
  );
}

export default App;
