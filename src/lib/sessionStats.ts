import type { CalibrationInfo, GazePoint, MFIComponent, ReactionResult, RestEvent, TelemetryDataPoint } from './types';
import { MFI_LEVELS, mfiLevel, DEFAULT_REACTION_BASELINE_MS } from './mfiCalculator';
import { summarizeGaze } from './heatmap';
import type { GazeSummary } from './heatmap';
import { t } from '../i18n';

export const COMPONENT_KEYS: MFIComponent['key'][] = ['perclos', 'blinkDuration', 'eyelidDroop', 'longClosures', 'reaction', 'acoustic'];

export interface Segment {
  fromMin: number;
  toMin: number;
  avgMfi: number | null;
  perclos: number | null;
  blinkRate: number | null;
  acoustic: number | null;
  confidence: number | null;
}

export interface SessionStats {
  start: number | null;
  end: number | null;
  wallSeconds: number;
  measuredSeconds: number;
  level: ReturnType<typeof mfiLevel>;
  /** Average MFI over the last ~20% of the session (at least a minute). */
  endMfi: number | null;
  endLevel: ReturnType<typeof mfiLevel>;
  avgMfi: number | null;
  peakMfi: number | null;
  p90Mfi: number | null;
  pctElevated: number;
  pctSevere: number;
  avgConfidence: number | null;
  faceVisiblePct: number | null;
  lookingDownPct: number | null;
  avgPerclos: number | null;
  peakPerclos: number | null;
  avgBlinkRate: number | null;
  medianBlinkMs: number | null;
  avgOpenness: number | null;
  totalBlinks: number | null;
  totalLongClosures: number | null;
  avgAcoustic: number | null;
  peakAcoustic: number | null;
  soundPresentPct: number | null;
  avgTiltDb: number | null;
  avgLight: number | null;
  avgFps: number | null;
  components: { key: MFIComponent['key']; label: string; avg: number | null; coveragePct: number }[];
  segments: Segment[];
  segmentMinutes: number;
  trendMfi: number | null; // last third minus first third
  reactions: ReactionResult[];
  reactionBaselineMs: number | null;
  restEvents: RestEvent[];
  gazeCount: number;
  gazeSummary: GazeSummary | null;
  calibration: CalibrationInfo | null;
  advice: string[];
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const nn = <T,>(xs: (T | null | undefined)[]) => xs.filter((x): x is T => x !== null && x !== undefined);
function median(xs: number[]) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function quantile(xs: number[], q: number) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}
/** Sum of increases of a cumulative counter that may reset to 0. */
function counterTotal(xs: (number | null)[]) {
  let total = 0, prev: number | null = null, seen = false;
  for (const x of xs) {
    if (x === null) continue;
    seen = true;
    if (prev === null) total += 0;
    else total += x >= prev ? x - prev : x;
    prev = x;
  }
  return seen ? total : null;
}

export function computeSessionStats(input: {
  data: TelemetryDataPoint[];
  gaze: GazePoint[];
  reactions: ReactionResult[];
  reactionBaselineMs: number | null;
  restEvents: RestEvent[];
  calibration: CalibrationInfo | null;
  sessionStart: number | null;
}): SessionStats {
  const { data } = input;
  const n = data.length;
  const mfis = data.map((d) => d.mfi);
  const start = input.sessionStart ?? data[0]?.time ?? null;
  const end = data[n - 1]?.time ?? null;
  const eye = data.filter((d) => d.perclos !== null);

  const components = COMPONENT_KEYS.map((key) => {
    const vals = nn(data.map((d) => d.scores?.[key]));
    return { key, label: t(`c_${key}`), avg: mean(vals), coveragePct: n ? (vals.length / n) * 100 : 0 };
  });

  // Segment length so the table has at most ~12 rows.
  const minutes = n ? (data[n - 1].time - data[0].time) / 60000 : 0;
  const segmentMinutes = [1, 2, 5, 10, 15, 30, 60].find((m) => minutes / m <= 12) ?? 60;
  const segments: Segment[] = [];
  if (n) {
    const t0 = data[0].time;
    const buckets = new Map<number, TelemetryDataPoint[]>();
    for (const d of data) {
      const b = Math.floor((d.time - t0) / (segmentMinutes * 60000));
      if (!buckets.has(b)) buckets.set(b, []);
      buckets.get(b)!.push(d);
    }
    for (const [b, pts] of [...buckets.entries()].sort((a, c) => a[0] - c[0])) {
      segments.push({
        fromMin: b * segmentMinutes,
        toMin: Math.min((b + 1) * segmentMinutes, Math.ceil(minutes * 10) / 10),
        avgMfi: mean(pts.map((p) => p.mfi)),
        perclos: mean(nn(pts.map((p) => p.perclos))),
        blinkRate: mean(nn(pts.map((p) => p.blinkRate))),
        acoustic: mean(nn(pts.map((p) => p.acoustic))),
        confidence: mean(pts.map((p) => p.confidence)),
      });
    }
  }

  const third = Math.floor(n / 3);
  const trendMfi = third >= 30 ? (mean(mfis.slice(-third))! - mean(mfis.slice(0, third))!) : null;

  const tail = Math.max(60, Math.floor(n * 0.2));
  const endMfi = n >= 120 ? mean(mfis.slice(-tail)) : null;

  const s: SessionStats = {
    start,
    endMfi,
    endLevel: mfiLevel(endMfi),
    end,
    wallSeconds: start && end ? (end - start) / 1000 : 0,
    measuredSeconds: n,
    level: mfiLevel(mean(mfis)),
    avgMfi: mean(mfis),
    peakMfi: n ? Math.max(...mfis) : null,
    p90Mfi: quantile(mfis, 0.9),
    pctElevated: n ? (mfis.filter((m) => m >= MFI_LEVELS.elevated).length / n) * 100 : 0,
    pctSevere: n ? (mfis.filter((m) => m >= MFI_LEVELS.severe).length / n) * 100 : 0,
    avgConfidence: mean(data.map((d) => d.confidence)),
    faceVisiblePct: n ? (data.filter((d) => d.faceVisible).length / n) * 100 : null,
    lookingDownPct: n ? (data.filter((d) => d.lookingDown).length / n) * 100 : null,
    avgPerclos: mean(eye.map((d) => d.perclos!)),
    peakPerclos: eye.length ? Math.max(...eye.map((d) => d.perclos!)) : null,
    avgBlinkRate: mean(nn(eye.map((d) => d.blinkRate))),
    medianBlinkMs: median(nn(eye.map((d) => d.blinkMs))),
    avgOpenness: mean(nn(eye.map((d) => d.eyeOpenness))),
    totalBlinks: counterTotal(data.map((d) => d.totalBlinks ?? null)),
    totalLongClosures: counterTotal(data.map((d) => d.totalLongClosures ?? null)),
    avgAcoustic: mean(nn(data.map((d) => d.acoustic))),
    peakAcoustic: data.some((d) => d.acoustic !== null) ? Math.max(...nn(data.map((d) => d.acoustic))) : null,
    soundPresentPct: data.some((d) => d.soundDb != null) ? (data.filter((d) => (d.soundDb ?? 0) >= 6).length / n) * 100 : null,
    avgTiltDb: mean(nn(data.map((d) => d.tiltDb))),
    avgLight: mean(nn(data.map((d) => d.lightQuality))),
    avgFps: mean(nn(data.map((d) => d.fps)).filter((f) => f > 0)),
    components,
    segments,
    segmentMinutes,
    trendMfi,
    reactions: input.reactions,
    reactionBaselineMs: input.reactionBaselineMs,
    restEvents: input.restEvents,
    gazeCount: input.gaze.length,
    gazeSummary: summarizeGaze(input.gaze),
    calibration: input.calibration,
    advice: [],
  };
  s.advice = buildAdvice(s);
  return s;
}

function buildAdvice(s: SessionStats): string[] {
  const out: string[] = [];
  if (s.measuredSeconds < 60) return [t('adv_short')];
  const rank = { unknown: 0, nominal: 1, elevated: 2, severe: 3 };
  if (rank[s.endLevel] > rank[s.level]) {
    out.push(t(s.endLevel === 'severe' ? 'adv_endHigh' : 'adv_endElev', { v: s.endMfi!.toFixed(0) }));
  } else if (s.level === 'severe') out.push(t('adv_high'));
  else if (s.level === 'elevated') out.push(t('adv_mod'));
  else out.push(t('adv_low'));

  if (s.trendMfi !== null && s.trendMfi > 10) out.push(t('adv_trend', { v: s.trendMfi.toFixed(0) }));
  if (s.avgPerclos !== null && s.avgPerclos > 0.08) out.push(t('adv_perclos', { v: (s.avgPerclos * 100).toFixed(1) }));
  if (s.totalLongClosures && s.totalLongClosures >= 3) out.push(t('adv_long', { n: s.totalLongClosures }));
  if (s.medianBlinkMs !== null && s.medianBlinkMs > 220) out.push(t('adv_slowBlink', { v: s.medianBlinkMs.toFixed(0) }));
  if (s.avgBlinkRate !== null && s.avgBlinkRate < 8) out.push(t('adv_fewBlinks', { v: s.avgBlinkRate.toFixed(0) }));
  const r = s.reactions[s.reactions.length - 1];
  if (r) {
    const base = s.reactionBaselineMs ?? DEFAULT_REACTION_BASELINE_MS;
    if (r.medianMs - base > 40 || r.lapses >= 2) out.push(t('adv_rt', { a: Math.round(r.medianMs), b: Math.round(base) }));
  } else {
    out.push(t('adv_noTest'));
  }
  if (s.avgAcoustic !== null && s.avgAcoustic > 30) out.push(t('adv_audio'));
  if (s.restEvents.length === 0 && s.wallSeconds > 25 * 60) out.push(t('adv_noBreaks'));
  if (s.avgLight !== null && s.avgLight < 0.5) out.push(t('adv_light'));
  return out;
}
