import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTelemetryStore } from '../store/telemetryStore';
import { visionEngine } from '../lib/visionEngine';
import type { FrameSample, VisionCalibration } from '../lib/visionEngine';
import { fitGazeModel, leaveOnePointOutError } from '../lib/gazeModel';
import type { GazeSample } from '../lib/gazeModel';
import { CheckCircle2, ScanFace, AlertTriangle, EyeOff } from 'lucide-react';

const POINTS: [number, number][] = [
  [0.1, 0.1], [0.5, 0.1], [0.9, 0.1],
  [0.1, 0.5], [0.5, 0.5], [0.9, 0.5],
  [0.1, 0.9], [0.5, 0.9], [0.9, 0.9],
];
const CENTER = 4;
const CAPTURE_MS = 800;
const MIN_SAMPLES = 5;
const CLOSED_TOTAL_MS = 3000;
const CLOSED_SAMPLE_FROM_MS = 1000; // skip the moment of closing
const CLOSED_SAMPLE_TO_MS = 2700;

interface RawSample { point: number; s: FrameSample }

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function beep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
    osc.onended = () => ctx.close();
  } catch {
    /* no audio: the on-screen message still changes */
  }
}

/** Collects new frames from the engine for `ms`, then calls back. */
function collectFrames(ms: number, onDone: (frames: { at: number; s: FrameSample }[]) => void) {
  const out: { at: number; s: FrameSample }[] = [];
  let lastT = -1;
  const start = performance.now();
  const id = window.setInterval(() => {
    const l = visionEngine.getLatest();
    if (l && l.time !== lastT && l.faceFound) {
      lastT = l.time;
      out.push({ at: l.time - start, s: l });
    }
    if (performance.now() - start >= ms) {
      clearInterval(id);
      onDone(out);
    }
  }, 10);
  return id;
}

type Phase = 'intro' | 'point' | 'capturing' | 'closedIntro' | 'closing' | 'done';

export const CalibrationModal: React.FC = () => {
  const isTracking = useTelemetryStore((s) => s.isTracking);
  const cameraEnabled = useTelemetryStore((s) => s.cameraEnabled);
  const calibration = useTelemetryStore((s) => s.calibration);
  const skipped = useTelemetryStore((s) => s.calibrationSkipped);

  const [phase, setPhase] = useState<Phase>('intro');
  const [step, setStep] = useState(0);
  const [faceOk, setFaceOk] = useState(false);
  const [retryMsg, setRetryMsg] = useState<string | null>(null);
  const [gazeErrorPct, setGazeErrorPct] = useState<number | null>(null);
  const [closedOk, setClosedOk] = useState<boolean | null>(null);
  const samples = useRef<RawSample[]>([]);
  const fit = useRef<(Omit<VisionCalibration, 'closedEar'> & { gazeErrorPct: number | null }) | null>(null);
  const closedEar = useRef<number | null>(null);
  const timer = useRef<number>(0);
  const phaseRef = useRef<Phase>('intro');
  const stepRef = useRef(0);
  phaseRef.current = phase;
  stepRef.current = step;

  const open = isTracking && cameraEnabled && !calibration && !skipped;

  useEffect(() => {
    if (open) {
      setPhase('intro');
      setStep(0);
      setRetryMsg(null);
      setClosedOk(null);
      samples.current = [];
      fit.current = null;
      closedEar.current = null;
    }
    return () => clearInterval(timer.current);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => {
      const l = visionEngine.getLatest();
      setFaceOk(!!l && l.faceFound && performance.now() - l.time < 500);
    }, 250);
    return () => clearInterval(id);
  }, [open]);

  const fitModel = () => {
    const all = samples.current;
    const center = all.filter((r) => r.point === CENTER).map((r) => r.s);
    const middleRow = all.filter((r) => POINTS[r.point][1] === 0.5).map((r) => r.s);
    const earBaseline = median(middleRow.map((s) => s.ear));
    const neutralYaw = median(center.map((s) => s.yaw));
    const neutralPitch = median(center.map((s) => s.pitch));
    const gazeSamples: GazeSample[] = all.map(({ point, s }) => ({
      point, tx: POINTS[point][0], ty: POINTS[point][1],
      h: s.gaze!.h, v: s.gaze!.v, yaw: s.yaw - neutralYaw, pitch: s.pitch - neutralPitch,
    }));
    const gazeModel = fitGazeModel(gazeSamples);
    fit.current = {
      earBaseline,
      ipdBaseline: median(all.map((r) => r.s.ipd)),
      anchor: { x: median(center.map((s) => s.nose.x)), y: median(center.map((s) => s.nose.y)) },
      neutralYaw,
      neutralPitch,
      gazeModel,
      gazeErrorPct: gazeModel ? leaveOnePointOutError(gazeSamples) : null,
    };
    setGazeErrorPct(fit.current.gazeErrorPct);
  };

  const capture = useCallback(() => {
    if (phaseRef.current !== 'point') return;
    const point = stepRef.current;
    setPhase('capturing');
    setRetryMsg(null);
    timer.current = collectFrames(CAPTURE_MS, (frames) => {
      const withGaze = frames.map((f) => f.s).filter((s) => s.gaze);
      // Drop blink frames: anything well below this point's typical eye openness.
      const med = withGaze.length ? median(withGaze.map((c) => c.ear)) : 0;
      const good = withGaze.filter((c) => c.ear > med * 0.75);
      if (good.length < MIN_SAMPLES) {
        setRetryMsg("Couldn't see your eyes clearly. Look at the dot and try again.");
        setPhase('point');
        return;
      }
      samples.current.push(...good.map((s) => ({ point, s })));
      if (point < POINTS.length - 1) {
        setStep(point + 1);
        setPhase('point');
      } else {
        fitModel();
        setPhase('closedIntro');
      }
    });
  }, []);

  const startClosed = useCallback(() => {
    setPhase('closing');
    setClosedOk(null);
    timer.current = collectFrames(CLOSED_TOTAL_MS, (frames) => {
      beep();
      const ears = frames.filter((f) => f.at >= CLOSED_SAMPLE_FROM_MS && f.at <= CLOSED_SAMPLE_TO_MS).map((f) => f.s.ear);
      const openEar = fit.current?.earBaseline ?? 0;
      const c = ears.length >= 5 ? median(ears) : NaN;
      if (Number.isFinite(c) && c < openEar * 0.75) {
        closedEar.current = c;
        setClosedOk(true);
        setPhase('done');
      } else {
        setClosedOk(false);
        setPhase('closedIntro');
      }
    });
  }, []);

  // Space bar = click the dot / start the eyes-closed step.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      e.preventDefault();
      if (phaseRef.current === 'point') capture();
      else if (phaseRef.current === 'closedIntro') startClosed();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, capture, startClosed]);

  if (!open) return null;

  const commit = () => {
    const f = fit.current;
    if (!f) return;
    const { gazeErrorPct: err, ...vc } = f;
    visionEngine.setCalibration({ ...vc, closedEar: closedEar.current });
    useTelemetryStore.getState().setCalibration({
      time: Date.now(),
      earBaseline: vc.earBaseline,
      closedEar: closedEar.current,
      ipdBaseline: vc.ipdBaseline,
      anchor: vc.anchor,
      neutralYaw: vc.neutralYaw,
      neutralPitch: vc.neutralPitch,
      gazeErrorPct: err,
    });
  };

  const skip = () => useTelemetryStore.getState().setCalibrationSkipped(true);
  const [px, py] = POINTS[step];
  const capturing = phase === 'capturing';

  // Solid background on purpose: a backdrop blur over live video is re-rendered every frame and makes this laggy.
  return (
    <div className="fixed inset-0 z-50 bg-[#070b14] flex flex-col items-center justify-center">
      {phase === 'intro' && (
        <div className="glass-panel max-w-lg p-8 text-center">
          <ScanFace className="w-12 h-12 text-baseline mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-3">Calibration (about 30 s)</h2>
          <p className="text-slate-300 mb-4 text-sm leading-relaxed">
            Sit the way you normally work, with your face lit from the front. For each of the 9 dots:
            <strong className="text-white"> look at it and press Space (or click it)</strong>, then keep looking for a moment.
            At the end you'll close your eyes for 3 seconds.
          </p>
          <p className="text-slate-400 mb-6 text-xs leading-relaxed">
            This learns your normal open and closed eye levels (so blinks are detected reliably), your posture,
            and how your eyes map to the screen.
          </p>
          <div className={`mb-6 text-sm font-semibold ${faceOk ? 'text-baseline' : 'text-warning'}`}>
            {faceOk ? '✓ Face detected' : 'Waiting for your face… (the tracker can take a few seconds to load)'}
          </div>
          <div className="flex gap-3 justify-center">
            <button onClick={skip} className="px-5 py-2.5 rounded-full bg-slate-800 text-slate-300 hover:bg-slate-700">Skip</button>
            <button
              disabled={!faceOk}
              onClick={() => setPhase('point')}
              className="px-6 py-2.5 rounded-full bg-baseline text-slate-900 font-bold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Start
            </button>
          </div>
        </div>
      )}

      {(phase === 'point' || capturing) && (
        <>
          <div className="absolute top-10 text-center w-full max-w-md px-4 pointer-events-none">
            <p className="text-slate-300">Look at the dot and press <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-white text-xs">Space</kbd> or click it.</p>
            <div className="w-full bg-slate-800 h-2 mt-4 rounded-full overflow-hidden">
              <div className="bg-baseline h-full transition-[width] duration-200" style={{ width: `${(step / POINTS.length) * 100}%` }} />
            </div>
            {!faceOk && <p className="text-warning text-sm mt-3">Face not detected. Check your camera and lighting.</p>}
            {retryMsg && (
              <p className="text-warning text-sm mt-3 flex items-center justify-center gap-2">
                <AlertTriangle className="w-4 h-4" /> {retryMsg}
              </p>
            )}
          </div>
          <button
            key={step}
            onClick={capture}
            aria-label={`Calibration point ${step + 1} of ${POINTS.length}`}
            className="absolute w-16 h-16 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center"
            style={{ left: `${px * 100}%`, top: `${py * 100}%` }}
          >
            <span className={`absolute inset-0 rounded-full border-2 ${capturing ? 'border-white' : 'border-baseline'}`} />
            {capturing && (
              <svg className="absolute inset-0 -rotate-90" viewBox="0 0 64 64">
                <circle cx="32" cy="32" r="30" fill="none" stroke="#14B8A6" strokeWidth="4" strokeDasharray="188.5"
                  style={{ strokeDashoffset: 188.5, animation: `calib-fill ${CAPTURE_MS}ms linear forwards` }} />
              </svg>
            )}
            <span className={`w-3 h-3 rounded-full ${capturing ? 'bg-white' : 'bg-baseline'}`} />
          </button>
          <style>{'@keyframes calib-fill { to { stroke-dashoffset: 0; } }'}</style>
        </>
      )}

      {(phase === 'closedIntro' || phase === 'closing') && (
        <div className="glass-panel max-w-md p-8 text-center">
          <EyeOff className="w-12 h-12 text-baseline mx-auto mb-4" />
          <h3 className="text-2xl font-bold text-white mb-3">{phase === 'closing' ? 'Eyes closed…' : 'Last step: close your eyes'}</h3>
          {phase === 'closing' ? (
            <p className="text-slate-300 text-sm">Keep them gently closed. Open them when you hear the beep.</p>
          ) : (
            <>
              <p className="text-slate-300 text-sm mb-2">
                Press Space or Start, then <strong className="text-white">gently close your eyes</strong> (don't squeeze) and keep your head still.
                Open them when you hear the beep (3 s).
              </p>
              <p className="text-slate-500 text-xs mb-5">This tells NeuroPulse what "closed" looks like for your eyes on this camera, so blinks register reliably.</p>
              {closedOk === false && (
                <p className="text-warning text-sm mb-4">Your eyes still looked open. Try again, or skip this step.</p>
              )}
              <div className="flex gap-3 justify-center">
                <button onClick={() => setPhase('done')} className="px-5 py-2.5 rounded-full bg-slate-800 text-slate-300 hover:bg-slate-700">Skip step</button>
                <button onClick={startClosed} className="px-6 py-2.5 rounded-full bg-baseline text-slate-900 font-bold">Start</button>
              </div>
            </>
          )}
        </div>
      )}

      {phase === 'done' && (
        <div className="glass-panel p-8 max-w-md text-center">
          <CheckCircle2 className="w-16 h-16 text-baseline mx-auto mb-4" />
          <h3 className="text-2xl font-bold text-white mb-3">Calibration complete</h3>
          {gazeErrorPct !== null ? (
            <p className="text-slate-300 text-sm mb-2">
              Estimated gaze error: <strong className={gazeErrorPct > 20 ? 'text-warning' : 'text-baseline'}>≈ {gazeErrorPct.toFixed(0)}% of the screen</strong>
            </p>
          ) : (
            <p className="text-warning text-sm mb-2">Gaze mapping couldn't be fitted. Fatigue metrics still work.</p>
          )}
          <p className="text-slate-300 text-sm mb-2">
            Closed-eye level: {closedOk ? <strong className="text-baseline">measured</strong> : <span className="text-warning">estimated (step skipped)</span>}
          </p>
          <p className="text-slate-500 text-xs mb-6">
            Webcam gaze is coarse. It's fine for a heatmap of roughly where you looked, not for precise points.
          </p>
          <button onClick={commit} className="px-6 py-2.5 rounded-full bg-baseline text-slate-900 font-bold">Continue</button>
        </div>
      )}
    </div>
  );
};
