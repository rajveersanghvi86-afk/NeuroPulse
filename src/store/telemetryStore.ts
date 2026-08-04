import { create } from 'zustand';

export interface TelemetryDataPoint {
  time: number;
  mfi: number;
  ear: number;
  latency: number;
  harshEnergy: number;
}

export interface GazePoint {
  x: number; // Normalized 0-1
  y: number; // Normalized 0-1
  time: number;
}

export interface HeadAnchor {
  x: number;
  y: number;
  z: number;
}

export interface Alert {
  id: string;
  message: string;
  type: 'warning' | 'severe' | 'info';
  timestamp: number;
}

export interface TelemetryState {
  mfi: number;
  ear: number;
  perclos: number; 
  lightingQuality: number; 
  latency: number;
  isCalibrated: boolean;
  outOfFrame: boolean;
  
  earBaseline: number;
  latencyBaseline: number;
  
  fftData: Uint8Array | null;
  harshBandEnergy: number;

  isTracking: boolean;
  isSessionReportOpen: boolean;
  
  isCallAssistActive: boolean;
  showMicroRestModal: boolean;
  lastMicroRestTime: number; 
  showVoiceCheckIn: boolean;
  
  // Phase 4 States
  calibrationAnchor: HeadAnchor | null;
  sessionGazePoints: GazePoint[];
  audioMode: 'mic' | 'system';
  cameraEnabled: boolean;
  restBreakEvents: number[];
  
  sessionData: TelemetryDataPoint[];
  alerts: Alert[];
  
  setMFI: (val: number) => void;
  setVisualMetrics: (ear: number, perclos: number, lightingQuality: number, latency: number, outOfFrame: boolean) => void;
  setCalibrationStatus: (status: boolean) => void;
  setAcousticMetrics: (fftData: Uint8Array, harshBandEnergy: number) => void;
  setIsTracking: (status: boolean) => void;
  setSessionReportOpen: (status: boolean) => void;
  
  setCallAssistActive: (status: boolean) => void;
  triggerMicroRest: () => void;
  closeMicroRest: () => void;
  setVoiceCheckIn: (status: boolean) => void;

  setCalibrationAnchor: (anchor: HeadAnchor | null) => void;
  setAudioMode: (mode: 'mic' | 'system') => void;
  setCameraEnabled: (status: boolean) => void;
  logGazePoint: (point: GazePoint) => void;

  addAlert: (message: string, type: Alert['type']) => void;
  removeAlert: (id: string) => void;
  logDataPoint: (point: TelemetryDataPoint) => void;
  resetSessionData: () => void;
}

export const useTelemetryStore = create<TelemetryState>((set, get) => ({
  mfi: 0,
  ear: 0.3,
  perclos: 0,
  lightingQuality: 1,
  latency: 200,
  isCalibrated: false,
  outOfFrame: false,
  
  earBaseline: 0.30,
  latencyBaseline: 200,
  
  fftData: null,
  harshBandEnergy: 0,

  isTracking: false,
  isSessionReportOpen: false,
  
  isCallAssistActive: false,
  showMicroRestModal: false,
  lastMicroRestTime: 0,
  showVoiceCheckIn: false,

  calibrationAnchor: null,
  sessionGazePoints: [],
  audioMode: 'mic',
  cameraEnabled: true,
  restBreakEvents: [],

  sessionData: [],
  alerts: [],
  
  setMFI: (val) => set({ mfi: Math.max(0, Math.min(100, val)) }),
  setVisualMetrics: (ear, perclos, lightingQuality, latency, outOfFrame) => 
    set({ ear, perclos, lightingQuality, latency, outOfFrame }),
  setCalibrationStatus: (status) => set({ isCalibrated: status }),
  setAcousticMetrics: (fftData, harshBandEnergy) => set({ fftData, harshBandEnergy }),
  setIsTracking: (status) => set({ isTracking: status }),
  setSessionReportOpen: (status) => set({ isSessionReportOpen: status }),
  
  setCallAssistActive: (status) => set({ isCallAssistActive: status }),
  
  triggerMicroRest: () => {
    const { lastMicroRestTime } = get();
    const now = Date.now();
    // 3-minute debounce (180,000 ms)
    if (now - lastMicroRestTime > 180000) {
      set((state) => ({ 
        showMicroRestModal: true, 
        lastMicroRestTime: now,
        restBreakEvents: [...state.restBreakEvents, now]
      }));
    }
  },
  closeMicroRest: () => set({ showMicroRestModal: false }),
  setVoiceCheckIn: (status) => set({ showVoiceCheckIn: status }),

  setCalibrationAnchor: (anchor) => set({ calibrationAnchor: anchor }),
  setAudioMode: (mode) => set({ audioMode: mode }),
  setCameraEnabled: (status) => set({ cameraEnabled: status }),
  logGazePoint: (point) => set((state) => ({ sessionGazePoints: [...state.sessionGazePoints, point] })),

  addAlert: (message, type) => set((state) => {
    if (state.alerts.some(a => a.message === message)) return state;
    return {
      alerts: [...state.alerts, { id: Math.random().toString(36).substr(2, 9), message, type, timestamp: Date.now() }]
    };
  }),
  
  removeAlert: (id) => set((state) => ({
    alerts: state.alerts.filter((a) => a.id !== id)
  })),

  logDataPoint: (point) => set((state) => ({
    sessionData: [...state.sessionData, point]
  })),

  resetSessionData: () => set({ sessionData: [], sessionGazePoints: [], mfi: 0 })
}));
