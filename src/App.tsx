import { useEffect, useRef, useState } from 'react';
import { LandingPage } from './components/LandingPage';
import { Dashboard } from './components/Dashboard';
import { CalibrationModal } from './components/CalibrationModal';
import { SessionReportModal } from './components/SessionReportModal';
import { MicroRestModal } from './components/MicroRestModal';
import { ReactionTestModal } from './components/ReactionTestModal';
import { useTelemetryStore } from './store/telemetryStore';
import { REST_INTERVAL_MS } from './store/telemetryStore';
import { visionEngine } from './lib/visionEngine';
import { acousticEngine } from './lib/acousticEngine';
import { computeMFI, MFI_LEVELS, MFISmoother } from './lib/mfiCalculator';

const SUSTAINED_FATIGUE_MS = 30000;

function App() {
  const [currentPage, setCurrentPage] = useState<'landing' | 'dashboard'>('landing');
  const isTracking = useTelemetryStore((s) => s.isTracking);
  const audioMode = useTelemetryStore((s) => s.audioMode);
  const smoother = useRef(new MFISmoother());

  useEffect(() => {
    if (!isTracking) return;
    let cancelled = false;
    const store = useTelemetryStore.getState;
    store().beginSession();

    (async () => {
      const res = await acousticEngine.start(audioMode);
      if (cancelled) {
        acousticEngine.stop();
        return;
      }
      if (!res.ok) {
        if (res.message) store().addAlert(res.message, 'severe');
      } else {
        acousticEngine.setCallAssist(store().isCallAssistActive, store().mfi ?? 0);
      }
    })();

    // If the browser kept audio paused, the next click anywhere resumes it.
    const resumeAudio = () => acousticEngine.unlock();
    window.addEventListener('pointerdown', resumeAudio);
    let quietSince: number | null = null;

    const onVisibility = () => {
      if (document.hidden) {
        store().addAlert('NeuroPulse is in a background tab: the browser slows tracking down. Keep it visible in a side window.', 'info');
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    let lastMfiT = 0;
    let lastLogT = 0;
    let elevatedSince: number | null = null;

    const id = window.setInterval(() => {
      const now = Date.now();
      const s = store();
      const acoustic = acousticEngine.sample();

      // Audio diagnostics: tell the user why nothing is being picked up.
      if (acoustic) {
        if (acousticEngine.contextState === 'suspended') {
          s.addAlert('Audio is paused by the browser. Click anywhere on the page to start it.', 'warning');
        } else if (acoustic.silentForMs > 5000) {
          s.addAlert(
            acoustic.source === 'mic'
              ? 'The microphone is sending pure silence. Check it isn\'t muted (system settings or a mute key) and that the right mic is selected.'
              : 'The shared tab is silent. Make sure something is playing in it and that "Share tab audio" was ticked.',
            'warning',
          );
        }
        if (acoustic.source === 'mic' && !acoustic.soundPresent && acoustic.silentForMs === 0) {
          quietSince ??= now;
          if (now - quietSince > 60000) {
            s.addAlert('The mic hears only room noise. If your call is in headphones, the mic can\'t hear it: use "System (Tab Capture)" for web calls.', 'info');
            quietSince = now + 10 * 60000; // don't repeat for a while
          }
        } else if (acoustic.soundPresent) {
          quietSince = null;
        }
      }

      if (now - lastMfiT < 250) return;
      lastMfiT = now;

      const vision = s.cameraEnabled ? visionEngine.getStats() : null;
      const lastReaction = s.reactionResults[s.reactionResults.length - 1];
      const breakdown = computeMFI({
        vision,
        acoustic,
        reaction: lastReaction
          ? { medianMs: lastReaction.medianMs, lapses: lastReaction.lapses, ageMs: now - lastReaction.time, baselineMs: s.reactionBaselineMs }
          : null,
      });
      const mfi = breakdown.raw === null ? null : smoother.current.update(breakdown.raw, now);
      s.setLive({ mfi, breakdown, vision, acoustic });
      acousticEngine.setMitigationLevel(mfi ?? 0);

      // Rest breaks: sustained elevated fatigue, or the 20-minute 20-20-20 reminder.
      if (mfi !== null && mfi >= MFI_LEVELS.elevated) {
        elevatedSince ??= now;
        if (now - elevatedSince >= SUSTAINED_FATIGUE_MS) s.triggerMicroRest('fatigue');
      } else {
        elevatedSince = null;
      }
      if (now - s.lastMicroRestTime >= REST_INTERVAL_MS) s.triggerMicroRest('timer');

      if (mfi !== null && now - lastLogT >= 1000) {
        lastLogT = now;
        const v = vision && vision.warmupDone ? vision : null;
        s.logDataPoint({
          time: now,
          mfi: Math.round(mfi * 10) / 10,
          confidence: Math.round(breakdown.confidence * 100) / 100,
          faceVisible: vision?.faceVisible ?? false,
          perclos: v ? v.perclos : null,
          blinkRate: v ? v.blinkRate : null,
          blinkMs: v ? v.medianBlinkMs : null,
          eyeOpenness: v ? v.eyeOpenness : null,
          acoustic: acoustic ? acoustic.exposure : null,
          soundDb: acoustic ? acoustic.soundAboveRoomDb : null,
          tiltDb: acoustic && acoustic.soundPresent ? acoustic.tiltDb : null,
          scores: Object.fromEntries(breakdown.components.map((c) => [c.key, c.weight > 0 ? c.score : null])),
          lightQuality: vision?.faceVisible ? vision.lightQuality : null,
          fps: vision ? vision.fps : null,
          lookingDown: vision?.lookingDown ?? false,
          totalBlinks: vision ? vision.totalBlinks : null,
          totalLongClosures: vision ? vision.totalLongClosures : null,
        });
      }
    }, 100);

    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pointerdown', resumeAudio);
      acousticEngine.stop();
    };
  }, [isTracking, audioMode]);

  if (currentPage === 'landing') {
    return <LandingPage onLaunch={() => setCurrentPage('dashboard')} />;
  }

  return (
    <>
      <CalibrationModal />
      <SessionReportModal onClosed={() => smoother.current.reset()} />
      <MicroRestModal />
      <ReactionTestModal />
      <Dashboard onHome={() => setCurrentPage('landing')} />
    </>
  );
}

export default App;
