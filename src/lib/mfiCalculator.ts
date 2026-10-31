import type { AcousticStats, MFIBreakdown, MFIComponent, VisionStats } from './types';

/** One set of thresholds, used by the gauge, panel, rest breaks and report. */
export const MFI_LEVELS = { elevated: 40, severe: 70 } as const;

export function mfiLevel(value: number | null): 'unknown' | 'nominal' | 'elevated' | 'severe' {
  if (value === null) return 'unknown';
  if (value >= MFI_LEVELS.severe) return 'severe';
  if (value >= MFI_LEVELS.elevated) return 'elevated';
  return 'nominal';
}

/** Linear map of x from [from, to] onto 0-100, clamped. Works for decreasing ranges too. */
export function scale(x: number, from: number, to: number): number {
  const t = (x - from) / (to - from);
  return Math.max(0, Math.min(1, t)) * 100;
}

/** Population default when the user has no personal reaction-time baseline yet (PVT median, rested adults). */
export const DEFAULT_REACTION_BASELINE_MS = 270;
/** A reaction test stops counting after this long. */
export const REACTION_MAX_AGE_MS = 30 * 60 * 1000;

export interface ReactionInput {
  medianMs: number;
  lapses: number;
  ageMs: number;
  baselineMs: number | null;
}

export interface MFIInputs {
  vision: VisionStats | null;
  acoustic: AcousticStats | null;
  reaction: ReactionInput | null;
}

// Nominal weights (sum to 1). Each one is scaled down by how much we trust the signal right now,
// and the result is re-normalised over what is available.
const WEIGHTS = {
  perclos: 0.3,
  blinkDuration: 0.15,
  eyelidDroop: 0.15,
  longClosures: 0.1,
  reaction: 0.15,
  acoustic: 0.15,
} as const;

/**
 * Multimodal Fatigue Index.
 *
 * Score ranges are based on commonly reported drowsiness markers:
 * - PERCLOS (P80): ~4% when alert, 15%+ is generally treated as drowsy.
 * - Blink duration (time the lids are more than half closed): alert ~80-150 ms; 350 ms+ is a strong drowsiness sign.
 * - Eyelid droop: lids resting 10-40% of the way from the person's open level to their closed level.
 * - Long closures: closures of 0.5 s+ (microsleep-like events).
 * - Reaction time (PVT): slowing of 20-120 ms over the personal baseline, plus lapses (>= 500 ms).
 * - Acoustic: minutes-long exposure to loud, treble-heavy (2-4 kHz) audio relative to the room's own baseline.
 */
export function computeMFI({ vision, acoustic, reaction }: MFIInputs): MFIBreakdown {
  const components: MFIComponent[] = [];

  const visionConf = vision
    ? Math.min(1, vision.coverage / 0.6) * (0.4 + 0.6 * vision.lightQuality)
    : 0;
  const visionReady = !!vision && vision.warmupDone && visionConf > 0.05;

  components.push({
    key: 'perclos',
    label: 'Eye closure (PERCLOS)',
    score: visionReady ? scale(vision!.perclos, 0.04, 0.2) : null,
    weight: visionReady ? WEIGHTS.perclos * visionConf : 0,
  });

  const blinkReady = visionReady && vision!.medianBlinkMs !== null && vision!.blinkCount >= 3;
  components.push({
    key: 'blinkDuration',
    label: 'Blink duration',
    score: blinkReady ? scale(vision!.medianBlinkMs!, 150, 350) : null,
    weight: blinkReady ? WEIGHTS.blinkDuration * visionConf : 0,
  });

  components.push({
    key: 'eyelidDroop',
    label: 'Eyelid droop',
    score: visionReady ? scale(vision!.eyeOpenness, 0.9, 0.6) : null,
    // A guessed baseline makes droop much less reliable.
    weight: visionReady ? WEIGHTS.eyelidDroop * visionConf * (vision!.baselineSource === 'calibrated' ? 1 : 0.4) : 0,
  });

  components.push({
    key: 'longClosures',
    label: 'Long eye closures',
    score: visionReady ? Math.min(100, vision!.longClosures * 40) : null,
    weight: visionReady ? WEIGHTS.longClosures * visionConf : 0,
  });

  if (reaction && reaction.ageMs < REACTION_MAX_AGE_MS) {
    const base = reaction.baselineMs ?? DEFAULT_REACTION_BASELINE_MS;
    const slowing = reaction.medianMs - base;
    const score = Math.min(100, scale(slowing, 20, 120) * 0.7 + Math.min(30, reaction.lapses * 10));
    // Fades out as the result gets older; a guessed baseline counts for less.
    const freshness = 1 - reaction.ageMs / REACTION_MAX_AGE_MS;
    components.push({
      key: 'reaction',
      label: 'Reaction time',
      score,
      weight: WEIGHTS.reaction * freshness * (reaction.baselineMs ? 1 : 0.5),
    });
  } else {
    components.push({ key: 'reaction', label: 'Reaction time', score: null, weight: 0 });
  }

  components.push({
    key: 'acoustic',
    label: 'Harsh audio exposure',
    score: acoustic?.active ? acoustic.exposure : null,
    weight: acoustic?.active ? WEIGHTS.acoustic : 0,
  });

  const totalWeight = components.reduce((a, c) => a + c.weight, 0);
  const hasCore = components.some(c => c.weight > 0 && c.key !== 'acoustic') || (!vision && totalWeight > 0);
  if (totalWeight <= 0 || !hasCore) {
    return { raw: null, confidence: 0, components };
  }

  const raw = components.reduce((a, c) => a + (c.score ?? 0) * c.weight, 0) / totalWeight;
  return { raw, confidence: Math.min(1, totalWeight), components };
}

/** Exponential smoothing with a time constant, so the dial doesn't jump on every blink. */
export class MFISmoother {
  private value: number | null = null;
  private lastTime = 0;
  private tauMs: number;
  constructor(tauMs = 15000) {
    this.tauMs = tauMs;
  }

  update(raw: number, now: number): number {
    if (this.value === null) {
      this.value = raw;
    } else {
      const dt = Math.max(0, now - this.lastTime);
      const alpha = 1 - Math.exp(-dt / this.tauMs);
      this.value += (raw - this.value) * alpha;
    }
    this.lastTime = now;
    return this.value;
  }

  reset() {
    this.value = null;
  }
}
