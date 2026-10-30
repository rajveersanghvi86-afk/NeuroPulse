// Shared types used by the engines, the store and the UI.

/** Rolling 60-second summary of the eye / head signals. */
export interface VisionStats {
  faceVisible: boolean;
  /** Current eye openness (Eye Aspect Ratio, both eyes averaged, lightly smoothed). */
  ear: number;
  /** Live closure on the person's own scale: 0 = normal open, 1 = closed. */
  closure: number;
  /** True while a blink / closure is in progress. */
  eyesClosedNow: boolean;
  /** Blinks counted since the camera started. */
  totalBlinks: number;
  lastBlinkMs: number | null;
  /** Whether the closed-eye level was measured in calibration (otherwise estimated). */
  closedCalibrated: boolean;
  /** Face-tracker frames per second. Below ~15, short blinks can be missed. */
  fps: number;
  /** The open-eye EAR we compare against (calibrated, or estimated from recent frames). */
  earBaseline: number;
  baselineSource: 'calibrated' | 'adaptive' | 'default';
  /** Fraction of valid time (0-1) the eyes were at least ~80% closed (PERCLOS P80). */
  perclos: number;
  /** Normal blinks per minute. */
  blinkRate: number;
  blinkCount: number;
  /** Median duration of normal blinks in ms (null until 3+ blinks). */
  medianBlinkMs: number | null;
  /** Eye closures of 0.5 s or longer in the last 60 s. */
  longClosures: number;
  /** Median open-eye EAR divided by the baseline (1 = as open as usual). */
  eyeOpenness: number;
  /** Head pose in degrees. */
  yaw: number;
  pitch: number;
  roll: number;
  /** Mean brightness of the face area, 0-255. */
  lightLevel: number;
  /** 0-1, how usable the lighting is for eye tracking. */
  lightQuality: number;
  /** Fraction of the window with a usable face (0-1). */
  coverage: number;
  /** Seconds of usable eye data in the window. */
  validSeconds: number;
  /** True once there is enough data (20 s) for PERCLOS-style metrics. */
  warmupDone: boolean;
}

export interface AcousticStats {
  active: boolean;
  source: 'mic' | 'system';
  /** Power in the 2-4 kHz band, dBFS. */
  bandDb: number;
  /** Slowly tracked quiet-room level of the same band, dBFS. */
  floorDb: number;
  /** Share of 100 Hz-8 kHz power that falls in 2-4 kHz (0-1). */
  harshShare: number;
  /** Instant harshness score, 0-100. */
  instant: number;
  /** Exposure over the last few minutes (leaky integral of `instant`), 0-100. */
  exposure: number;
}

export interface MFIComponent {
  key: 'perclos' | 'blinkDuration' | 'eyelidDroop' | 'longClosures' | 'reaction' | 'acoustic';
  label: string;
  /** 0-100, null when not available. */
  score: number | null;
  /** Effective weight after confidence scaling (0 when unavailable). */
  weight: number;
}

export interface MFIBreakdown {
  /** Unsmoothed index 0-100, or null while warming up / no data. */
  raw: number | null;
  /** 0-1: how much of the full signal set was available and trustworthy. */
  confidence: number;
  components: MFIComponent[];
}

export interface ReactionResult {
  time: number;
  medianMs: number;
  meanMs: number;
  lapses: number;
  falseStarts: number;
  trials: number;
}

export interface CalibrationInfo {
  time: number;
  earBaseline: number;
  closedEar: number | null;
  ipdBaseline: number;
  anchor: { x: number; y: number };
  neutralYaw: number;
  neutralPitch: number;
  /** Leave-one-point-out gaze error as % of the screen size, null if the gaze fit failed. */
  gazeErrorPct: number | null;
}

export interface TelemetryDataPoint {
  time: number;
  mfi: number;
  confidence: number;
  faceVisible: boolean;
  perclos: number | null;
  blinkRate: number | null;
  blinkMs: number | null;
  eyeOpenness: number | null;
  acoustic: number | null;
}

export interface GazePoint {
  x: number; // 0-1 of the viewport
  y: number;
  time: number;
}

export interface Alert {
  id: string;
  message: string;
  type: 'warning' | 'severe' | 'info';
  timestamp: number;
}

export interface RestEvent {
  time: number;
  reason: 'fatigue' | 'timer';
}
