import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTelemetryStore } from '../store/telemetryStore';
import type { ReactionResult } from '../lib/types';
import { DEFAULT_REACTION_BASELINE_MS } from '../lib/mfiCalculator';
import { Timer, X } from 'lucide-react';

// A short Psychomotor Vigilance Task (PVT). Full PVT runs 10 min, PVT-B 3 min; this is ~1 min,
// so treat single results as indicative and compare against your own baseline.
const TRIALS = 12;
const MIN_WAIT_MS = 2000;
const MAX_WAIT_MS = 6000;
const LAPSE_MS = 500;
const ANTICIPATION_MS = 100;
const TIMEOUT_MS = 3000;

type Phase = 'intro' | 'waiting' | 'stimulus' | 'feedback' | 'done';

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export const ReactionTestModal: React.FC = () => {
  const open = useTelemetryStore((s) => s.showReactionTest);
  const baseline = useTelemetryStore((s) => s.reactionBaselineMs);

  const [phase, setPhase] = useState<Phase>('intro');
  const [trial, setTrial] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [result, setResult] = useState<ReactionResult | null>(null);

  const rts = useRef<number[]>([]);
  const falseStarts = useRef(0);
  const onset = useRef(0);
  const timer = useRef<number>(0);
  const raf = useRef<number>(0);
  const phaseRef = useRef<Phase>('intro');
  phaseRef.current = phase;

  const clearTimers = () => {
    clearTimeout(timer.current);
    cancelAnimationFrame(raf.current);
  };

  const close = useCallback(() => {
    clearTimers();
    useTelemetryStore.getState().setShowReactionTest(false);
  }, []);

  useEffect(() => {
    if (open) {
      setPhase('intro');
      setTrial(0);
      setResult(null);
      rts.current = [];
      falseStarts.current = 0;
    }
    return clearTimers;
  }, [open]);

  const scheduleStimulus = () => {
    setPhase('waiting');
    const wait = MIN_WAIT_MS + Math.random() * (MAX_WAIT_MS - MIN_WAIT_MS);
    timer.current = window.setTimeout(() => {
      setPhase('stimulus');
      setElapsed(0);
      // Onset = the first animation frame after the stimulus is committed (≈ when it is painted).
      raf.current = requestAnimationFrame(() => {
        onset.current = performance.now();
        const tick = () => {
          setElapsed(performance.now() - onset.current);
          raf.current = requestAnimationFrame(tick);
        };
        raf.current = requestAnimationFrame(tick);
      });
      timer.current = window.setTimeout(() => record(TIMEOUT_MS), TIMEOUT_MS);
    }, wait);
  };

  const finish = () => {
    const list = rts.current;
    const r: ReactionResult = {
      time: Date.now(),
      medianMs: median(list),
      meanMs: list.reduce((a, b) => a + b, 0) / list.length,
      lapses: list.filter((x) => x >= LAPSE_MS).length,
      falseStarts: falseStarts.current,
      trials: list.length,
    };
    const store = useTelemetryStore.getState();
    store.addReactionResult(r);
    if (store.reactionBaselineMs === null) store.setReactionBaseline(r.medianMs);
    setResult(r);
    setPhase('done');
  };

  const record = (rt: number) => {
    clearTimers();
    rts.current.push(rt);
    setFeedback(rt >= TIMEOUT_MS ? 'Missed' : `${Math.round(rt)} ms`);
    setPhase('feedback');
    const next = rts.current.length;
    setTrial(next);
    timer.current = window.setTimeout(() => {
      if (next >= TRIALS) finish();
      else scheduleStimulus();
    }, 700);
  };

  const respond = useCallback(() => {
    const p = phaseRef.current;
    if (p === 'waiting') {
      clearTimers();
      falseStarts.current++;
      setFeedback('Too early! Wait for the numbers.');
      setPhase('feedback');
      timer.current = window.setTimeout(scheduleStimulus, 1000);
    } else if (p === 'stimulus') {
      if (!onset.current) return;
      const rt = performance.now() - onset.current;
      onset.current = 0;
      if (rt < ANTICIPATION_MS) {
        clearTimers();
        falseStarts.current++;
        setFeedback('Too early! Wait for the numbers.');
        setPhase('feedback');
        timer.current = window.setTimeout(scheduleStimulus, 1000);
      } else {
        record(rt);
      }
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        if (phaseRef.current === 'intro') scheduleStimulus();
        else respond();
      } else if (e.key === 'Escape') {
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, respond, close]);

  if (!open) return null;

  const base = baseline ?? DEFAULT_REACTION_BASELINE_MS;
  const slowing = result ? result.medianMs - base : 0;
  const running = phase === 'waiting' || phase === 'stimulus' || phase === 'feedback';

  return (
    <div className="fixed inset-0 z-[70] bg-slate-950 flex flex-col items-center justify-center p-6 select-none">
      <div className="relative w-full max-w-lg glass-panel p-8 flex flex-col items-center border border-white/10">
        <button onClick={close} className="absolute top-4 right-4 text-slate-400 hover:text-white" aria-label="Close">
          <X className="w-6 h-6" />
        </button>

        <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-2"><Timer className="w-6 h-6 text-baseline" /> Reaction Test</h2>

        {phase === 'intro' && (
          <>
            <p className="text-slate-300 text-center mb-3 text-sm leading-relaxed">
              A counter will appear in the box at random moments. As soon as it does, press <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-white">Space</kbd> or tap the box.
              {TRIALS} rounds, about one minute.
            </p>
            <p className="text-slate-500 text-center mb-6 text-xs">
              Reaction time slows measurably with fatigue and sleep loss. This is a short version of the Psychomotor
              Vigilance Task. Your first result becomes your personal baseline, so take it when you feel fresh.
            </p>
            <button onClick={scheduleStimulus} className="px-8 py-3 bg-baseline text-slate-900 rounded-full font-bold hover:bg-baseline/80">
              Start
            </button>
          </>
        )}

        {running && (
          <>
            <p className="text-slate-400 text-sm mb-4">Round {Math.min(trial + 1, TRIALS)} / {TRIALS}</p>
            <button
              onPointerDown={respond}
              className={`w-full h-48 rounded-2xl border-2 flex items-center justify-center text-5xl font-mono font-bold transition-colors ${
                phase === 'stimulus' ? 'border-warning bg-warning/10 text-warning' : 'border-slate-700 bg-slate-800/50 text-slate-500'
              }`}
            >
              {phase === 'stimulus' ? Math.round(elapsed) : phase === 'feedback' ? <span className="text-2xl text-slate-200">{feedback}</span> : <span className="text-xl">wait…</span>}
            </button>
          </>
        )}

        {phase === 'done' && result && (
          <div className="flex flex-col items-center gap-3 w-full">
            <div className={`text-5xl font-bold ${slowing > 80 || result.lapses >= 2 ? 'text-severe' : slowing > 30 || result.lapses === 1 ? 'text-warning' : 'text-baseline'}`}>
              {Math.round(result.medianMs)} ms
            </div>
            <p className="text-slate-400 text-sm uppercase tracking-wider">Median reaction time</p>
            <div className="grid grid-cols-3 gap-3 w-full text-center text-sm mt-2">
              <div className="bg-slate-800/50 rounded-lg p-2"><div className="text-white font-bold">{result.lapses}</div><div className="text-slate-500 text-xs">lapses (≥500 ms)</div></div>
              <div className="bg-slate-800/50 rounded-lg p-2"><div className="text-white font-bold">{result.falseStarts}</div><div className="text-slate-500 text-xs">false starts</div></div>
              <div className="bg-slate-800/50 rounded-lg p-2">
                <div className="text-white font-bold">{baseline === null ? '–' : `${slowing >= 0 ? '+' : ''}${Math.round(slowing)} ms`}</div>
                <div className="text-slate-500 text-xs">vs your baseline</div>
              </div>
            </div>
            <p className="text-slate-400 text-sm text-center mt-2">
              {baseline !== null && Math.abs(result.medianMs - baseline) < 1
                ? 'Saved as your baseline. Future tests are compared with this.'
                : slowing > 80 || result.lapses >= 2
                ? 'Noticeably slower than your baseline: a sign of fatigue. Consider a proper break.'
                : slowing > 30 || result.lapses === 1
                ? 'Slightly slower than your baseline.'
                : 'In line with your baseline.'}
            </p>
            <p className="text-slate-500 text-xs text-center">This result feeds into the fatigue index for the next 30 minutes.</p>
            <div className="flex gap-3 mt-3">
              <button
                onClick={() => useTelemetryStore.getState().setReactionBaseline(result.medianMs)}
                className="px-4 py-2 bg-slate-800 text-slate-300 rounded-full hover:bg-slate-700 text-sm"
              >
                Use as my baseline
              </button>
              <button onClick={close} className="px-6 py-2 bg-baseline text-slate-900 rounded-full font-bold hover:bg-baseline/80 text-sm">
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
