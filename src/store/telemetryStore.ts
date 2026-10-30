import { create } from 'zustand';
import type {
  AcousticStats,
  Alert,
  CalibrationInfo,
  GazePoint,
  MFIBreakdown,
  ReactionResult,
  RestEvent,
  TelemetryDataPoint,
  VisionStats,
} from '../lib/types';

export type {
  AcousticStats,
  Alert,
  CalibrationInfo,
  GazePoint,
  MFIBreakdown,
  ReactionResult,
  RestEvent,
  TelemetryDataPoint,
  VisionStats,
} from '../lib/types';

const REACTION_BASELINE_KEY = 'neuropulse.reactionBaselineMs';
const MAX_GAZE_POINTS = 36000; // ~2 hours at 5 Hz
/** Minimum time between two rest-break prompts. */
export const REST_DEBOUNCE_MS = 5 * 60 * 1000;
/** 20-20-20 rule: a reminder every 20 minutes of tracking. */
export const REST_INTERVAL_MS = 20 * 60 * 1000;

function loadReactionBaseline(): number | null {
  try {
    const v = localStorage.getItem(REACTION_BASELINE_KEY);
    const n = v ? Number(v) : NaN;
    return Number.isFinite(n) && n > 100 ? n : null;
  } catch {
    return null;
  }
}

function saveReactionBaseline(v: number | null) {
  try {
    if (v === null) localStorage.removeItem(REACTION_BASELINE_KEY);
    else localStorage.setItem(REACTION_BASELINE_KEY, String(Math.round(v)));
  } catch {
    /* storage unavailable: keep it in memory only */
  }
}

export interface TelemetryState {
  // Live values
  mfi: number | null;
  breakdown: MFIBreakdown | null;
  vision: VisionStats | null;
  acoustic: AcousticStats | null;

  // Controls
  isTracking: boolean;
  cameraEnabled: boolean;
  audioMode: 'mic' | 'system';
  isCallAssistActive: boolean;

  // Calibration
  calibration: CalibrationInfo | null;
  calibrationSkipped: boolean;

  // Session
  sessionStart: number | null;
  sessionData: TelemetryDataPoint[];
  sessionGazePoints: GazePoint[];
  restBreakEvents: RestEvent[];
  reactionResults: ReactionResult[];
  reactionBaselineMs: number | null;

  // UI
  isSessionReportOpen: boolean;
  showMicroRestModal: boolean;
  microRestReason: RestEvent['reason'];
  lastMicroRestTime: number;
  showReactionTest: boolean;
  alerts: Alert[];

  setLive: (v: { mfi: number | null; breakdown: MFIBreakdown; vision: VisionStats | null; acoustic: AcousticStats | null }) => void;
  setIsTracking: (status: boolean) => void;
  setCameraEnabled: (status: boolean) => void;
  setAudioMode: (mode: 'mic' | 'system') => void;
  setCallAssistActive: (status: boolean) => void;

  setCalibration: (c: CalibrationInfo | null) => void;
  setCalibrationSkipped: (s: boolean) => void;

  beginSession: () => void;
  logDataPoint: (point: TelemetryDataPoint) => void;
  logGazePoint: (point: GazePoint) => void;
  addReactionResult: (r: ReactionResult) => void;
  setReactionBaseline: (ms: number | null) => void;

  setSessionReportOpen: (status: boolean) => void;
  triggerMicroRest: (reason: RestEvent['reason']) => void;
  closeMicroRest: () => void;
  setShowReactionTest: (status: boolean) => void;

  addAlert: (message: string, type: Alert['type']) => void;
  removeAlert: (id: string) => void;
  resetSessionData: () => void;
}

export const useTelemetryStore = create<TelemetryState>((set, get) => ({
  mfi: null,
  breakdown: null,
  vision: null,
  acoustic: null,

  isTracking: false,
  cameraEnabled: true,
  audioMode: 'mic',
  isCallAssistActive: false,

  calibration: null,
  calibrationSkipped: false,

  sessionStart: null,
  sessionData: [],
  sessionGazePoints: [],
  restBreakEvents: [],
  reactionResults: [],
  reactionBaselineMs: loadReactionBaseline(),

  isSessionReportOpen: false,
  showMicroRestModal: false,
  microRestReason: 'timer',
  lastMicroRestTime: 0,
  showReactionTest: false,
  alerts: [],

  setLive: ({ mfi, breakdown, vision, acoustic }) =>
    set({ mfi: mfi === null ? null : Math.max(0, Math.min(100, mfi)), breakdown, vision, acoustic }),
  setIsTracking: (status) => set({ isTracking: status }),
  setCameraEnabled: (status) => set({ cameraEnabled: status }),
  setAudioMode: (mode) => set({ audioMode: mode }),
  setCallAssistActive: (status) => set({ isCallAssistActive: status }),

  setCalibration: (c) => set({ calibration: c, calibrationSkipped: false }),
  setCalibrationSkipped: (s) => set({ calibrationSkipped: s }),

  beginSession: () => {
    if (get().sessionStart === null) {
      const now = Date.now();
      set({ sessionStart: now, lastMicroRestTime: now });
    }
  },
  logDataPoint: (point) => set((s) => ({ sessionData: [...s.sessionData, point] })),
  logGazePoint: (point) =>
    set((s) => {
      const pts = s.sessionGazePoints.length >= MAX_GAZE_POINTS ? s.sessionGazePoints.slice(1) : s.sessionGazePoints;
      return { sessionGazePoints: [...pts, point] };
    }),
  addReactionResult: (r) => set((s) => ({ reactionResults: [...s.reactionResults, r] })),
  setReactionBaseline: (ms) => {
    saveReactionBaseline(ms);
    set({ reactionBaselineMs: ms });
  },

  setSessionReportOpen: (status) => set({ isSessionReportOpen: status }),

  triggerMicroRest: (reason) => {
    const { lastMicroRestTime, showMicroRestModal, showReactionTest } = get();
    const now = Date.now();
    if (showMicroRestModal || showReactionTest) return;
    if (now - lastMicroRestTime < REST_DEBOUNCE_MS) return;
    set((s) => ({
      showMicroRestModal: true,
      microRestReason: reason,
      lastMicroRestTime: now,
      restBreakEvents: [...s.restBreakEvents, { time: now, reason }],
    }));
  },
  closeMicroRest: () => set({ showMicroRestModal: false, lastMicroRestTime: Date.now() }),
  setShowReactionTest: (status) => set({ showReactionTest: status }),

  addAlert: (message, type) => {
    if (get().alerts.some((a) => a.message === message)) return;
    const id = Math.random().toString(36).slice(2, 11);
    set((s) => ({ alerts: [...s.alerts, { id, message, type, timestamp: Date.now() }] }));
    setTimeout(() => get().removeAlert(id), type === 'severe' ? 12000 : 8000);
  },
  removeAlert: (id) => set((s) => ({ alerts: s.alerts.filter((a) => a.id !== id) })),

  resetSessionData: () =>
    set({
      sessionData: [],
      sessionGazePoints: [],
      restBreakEvents: [],
      reactionResults: [],
      sessionStart: null,
      mfi: null,
      breakdown: null,
    }),
}));
