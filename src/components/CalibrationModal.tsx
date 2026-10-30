import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTelemetryStore } from '../store/telemetryStore';
import { visionEngine } from '../lib/visionEngine';
import type { FrameSample } from '../lib/visionEngine';
import { fitGazeModel, leaveOnePointOutError } from '../lib/gazeModel';
import type { GazeSample } from '../lib/gazeModel';
import { Target, CheckCircle2, ScanFace, AlertTriangle } from 'lucide-react';

const POINTS: [number, number][] = [
  [0.1, 0.1], [0.5, 0.1], [0.9, 0.1],
  [0.1, 0.5], [0.5, 0.5], [0.9, 0.5],
  [0.1, 0.9], [0.5, 0.9], [0.9, 0.9],
];
const CENTER = 4;
const CAPTURE_MS = 1000;
const MIN_SAMPLES = 8;

interface RawSample { point: number; s: FrameSample }

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

type Phase = 'intro' | 'point' | 'capturing' | 'done';

export const CalibrationModal: React.FC = () => {
  const isTracking = useTelemetryStore((s) => s.isTracking);
  const cameraEnabled = useTelemetryStore((s) => s.cameraEnabled);
  const calibration = useTelemetryStore((s) => s.calibration);
  const skipped = useTelemetryStore((s) => s.calibrationSkipped);

  const [phase, setPhase] = useState<Phase>('intro');
  const [step, setStep] = useState(0);
  const [faceOk, setFaceOk] = useState(false);
  const [retryMsg, setRetryMsg] = useState<string | null>(null);
  const [result, setResult] = useState<{ gazeErrorPct: number | null } | null>(null);
  const samples = useRef<RawSample[]>([]);
  const pending = useRef<(() => void) | null>(null);

  const open = isTracking && cameraEnabled && !calibration && !skipped;

  // Reset whenever the modal is (re)opened.
  useEffect(() => {
    if (open) {
      setPhase('intro');
      setStep(0);
      setRetryMsg(null);
      setResult(null);
      samples.current = [];
    }
  }, [open]);

  // Face-detected indicator.
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => {
      const l = visionEngine.getLatest();
      setFaceOk(!!l && l.faceFound && performance.now() - l.time < 500);
    }, 200);
    return () => clearInterval(id);
  }, [open]);

  if (!open) return null;

  const capture = () => {
    if (phase !== 'point') return;
    setPhase('capturing');
    setRetryMsg(null);
    const collected: FrameSample[] = [];
    let lastT = -1;
    const started = performance.now();
    const id = setInterval(() => {
      const l = visionEngine.getLatest();
      if (l && l.time !== lastT && l.faceFound && l.gaze) {
        lastT = l.time;
        collected.push(l);
      }
      if (performance.now() - started >= CAPTURE_MS) {
        clearInterval(id);
        // Drop blink frames: anything well below this point's typical eye openness.
        const med = collected.length ? median(collected.map((c) => c.ear)) : 0;
        const good = collected.filter((c) => c.ear > med * 0.75);
        if (good.length < MIN_SAMPLES) {
          setRetryMsg("Couldn't see your eyes clearly. Look at the dot and click it again.");
          setPhase('point');
          return;
        }
        samples.current.push(...good.map((s) => ({ point: step, s })));
        if (step < POINTS.length - 1) {
          setStep(step + 1);
          setPhase('point');
        } else {
          finish();
        }
      }
    }, 15);
  };

  const finish = () => {
    const all = samples.current;
    const center = all.filter((r) => r.point === CENTER).map((r) => r.s);
    const middleRow = all.filter((r) => POINTS[r.point][1] === 0.5).map((r) => r.s);

    const earBaseline = median(middleRow.map((s) => s.ear));
    const ipdBaseline = median(all.map((r) => r.s.ipd));
    const neutralYaw = median(center.map((s) => s.yaw));
    const neutralPitch = median(center.map((s) => s.pitch));
    const anchor = { x: median(center.map((s) => s.nose.x)), y: median(center.map((s) => s.nose.y)) };

    const gazeSamples: GazeSample[] = all.map(({ point, s }) => ({
      point,
      tx: POINTS[point][0],
      ty: POINTS[point][1],
      h: s.gaze!.h,
      v: s.gaze!.v,
      yaw: s.yaw - neutralYaw,
      pitch: s.pitch - neutralPitch,
    }));
    const gazeModel = fitGazeModel(gazeSamples);
    const gazeErrorPct = gazeModel ? leaveOnePointOutError(gazeSamples) : null;

    pending.current = () => {
      visionEngine.setCalibration({ earBaseline, ipdBaseline, anchor, neutralYaw, neutralPitch, gazeModel });
      useTelemetryStore.getState().setCalibration({
        time: Date.now(), earBaseline, ipdBaseline, anchor, neutralYaw, neutralPitch, gazeErrorPct,
      });
    };
    setResult({ gazeErrorPct });
    setPhase('done');
  };

  const skip = () => useTelemetryStore.getState().setCalibrationSkipped(true);

  const [px, py] = POINTS[step];

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/95 backdrop-blur-md flex flex-col items-center justify-center">
      {phase === 'intro' && (
        <div className="glass-panel max-w-lg p-8 text-center fade-in">
          <ScanFace className="w-12 h-12 text-baseline mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-3">Calibration</h2>
          <p className="text-slate-300 mb-4 text-sm leading-relaxed">
            Sit the way you normally work, with your face lit from the front. Nine dots will appear. For each one,
            <strong className="text-white"> look at it, click it, and keep looking for one second</strong> while it records.
          </p>
          <p className="text-slate-400 mb-6 text-xs leading-relaxed">
            This learns your normal eye openness, your head position and how your eyes map to the screen.
            Without it, NeuroPulse has to guess your baseline and can't draw a gaze heatmap.
          </p>
          <div className={`mb-6 text-sm font-semibold ${faceOk ? 'text-baseline' : 'text-warning'}`}>
            {faceOk ? '✓ Face detected' : 'Waiting for your face… (the tracker can take a few seconds to load)'}
          </div>
          <div className="flex gap-3 justify-center">
            <button onClick={skip} className="px-5 py-2.5 rounded-full bg-slate-800 text-slate-300 hover:bg-slate-700">
              Skip
            </button>
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

      {(phase === 'point' || phase === 'capturing') && (
        <>
          <div className="absolute top-10 text-center w-full max-w-md px-4">
            <p className="text-slate-300">Look at the dot, click it, keep looking until it moves.</p>
            <div className="w-full bg-slate-800 h-2 mt-4 rounded-full overflow-hidden">
              <div className="bg-baseline h-full transition-all duration-300" style={{ width: `${(step / POINTS.length) * 100}%` }} />
            </div>
            {!faceOk && <p className="text-warning text-sm mt-3">Face not detected. Check your camera and lighting.</p>}
            {retryMsg && (
              <p className="text-warning text-sm mt-3 flex items-center justify-center gap-2">
                <AlertTriangle className="w-4 h-4" /> {retryMsg}
              </p>
            )}
          </div>
          <AnimatePresence mode="wait">
            <motion.button
              key={step}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: phase === 'capturing' ? 0.6 : 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', damping: 15 }}
              className={`absolute ${phase === 'capturing' ? 'text-white' : 'text-baseline'} hover:text-white`}
              style={{ left: `${px * 100}%`, top: `${py * 100}%`, x: '-50%', y: '-50%' }}
              onClick={capture}
              aria-label={`Calibration point ${step + 1} of ${POINTS.length}`}
            >
              <div className="relative flex items-center justify-center">
                <Target className="w-12 h-12" />
                <div className="absolute w-2 h-2 rounded-full bg-current" />
              </div>
            </motion.button>
          </AnimatePresence>
        </>
      )}

      {phase === 'done' && result && (
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass-panel p-8 max-w-md text-center">
          <CheckCircle2 className="w-16 h-16 text-baseline mx-auto mb-4" />
          <h3 className="text-2xl font-bold text-white mb-3">Calibration complete</h3>
          {result.gazeErrorPct !== null ? (
            <p className="text-slate-300 text-sm mb-2">
              Estimated gaze error: <strong className={result.gazeErrorPct > 20 ? 'text-warning' : 'text-baseline'}>
                ≈ {result.gazeErrorPct.toFixed(0)}% of the screen
              </strong>
            </p>
          ) : (
            <p className="text-warning text-sm mb-2">Gaze mapping couldn't be fitted. Fatigue metrics still work.</p>
          )}
          <p className="text-slate-500 text-xs mb-6">
            Webcam gaze is coarse. It's fine for a heatmap of roughly where you looked, not for precise points.
            {result.gazeErrorPct !== null && result.gazeErrorPct > 20 && ' Recalibrating with better lighting and a still head usually helps.'}
          </p>
          <button
            onClick={() => pending.current?.()}
            className="px-6 py-2.5 rounded-full bg-baseline text-slate-900 font-bold"
          >
            Continue
          </button>
        </motion.div>
      )}
    </div>
  );
};
