import React, { useEffect, useRef } from 'react';
import { useTelemetryStore } from '../store/telemetryStore';
import { CameraOff, AlertTriangle, Headphones } from 'lucide-react';
import { visionEngine } from '../lib/visionEngine';

const Row: React.FC<{ label: string; value: string; tone?: 'ok' | 'warn' | 'bad' | 'muted' }> = ({ label, value, tone = 'ok' }) => (
  <div className="flex justify-between gap-4 mb-1 last:mb-0">
    <span className="text-slate-400">{label}</span>
    <span className={
      tone === 'bad' ? 'text-severe font-bold' : tone === 'warn' ? 'text-warning font-bold' : tone === 'muted' ? 'text-slate-500' : 'text-baseline'
    }>{value}</span>
  </div>
);

export const WebcamFeed: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isTracking = useTelemetryStore((s) => s.isTracking);
  const cameraEnabled = useTelemetryStore((s) => s.cameraEnabled);
  const vision = useTelemetryStore((s) => s.vision);
  const isCallAssistActive = useTelemetryStore((s) => s.isCallAssistActive);
  const calibration = useTelemetryStore((s) => s.calibration);

  const active = isTracking && cameraEnabled;

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    const videoEl = videoRef.current;

    navigator.mediaDevices
      .getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' } })
      .then(async (s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        const video = videoRef.current, canvas = canvasRef.current;
        if (!video || !canvas) return;
        video.srcObject = s;
        await video.play().catch(() => {});
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        try {
          visionEngine.start(video, canvas);
        } catch (e) {
          console.error(e);
          useTelemetryStore.getState().addAlert('Face tracker failed to load. Check your connection and reload.', 'severe');
        }
      })
      .catch((err) => {
        console.error('Camera error:', err);
        useTelemetryStore.getState().addAlert('Camera access denied. Turn the camera off to use audio-only mode.', 'severe');
      });

    return () => {
      cancelled = true;
      visionEngine.stop();
      stream?.getTracks().forEach((t) => t.stop());
      if (videoEl) videoEl.srcObject = null;
    };
  }, [active]);

  const v = vision;
  const warm = v?.warmupDone;

  return (
    <div className="w-full h-full relative bg-slate-900/50 flex items-center justify-center overflow-hidden">
      {!cameraEnabled ? (
        <div className="flex flex-col items-center text-slate-500 gap-2">
          <CameraOff className="w-12 h-12" />
          <p>Camera off (audio-only mode)</p>
          <p className="text-xs text-slate-600 max-w-xs text-center">The fatigue index uses audio and reaction tests only, so it's a rougher estimate.</p>
        </div>
      ) : !isTracking ? (
        <div className="flex flex-col items-center text-slate-500 gap-2">
          <CameraOff className="w-12 h-12" />
          <p>Camera offline</p>
        </div>
      ) : (
        <>
          <video ref={videoRef} className="w-full h-full object-cover rounded-xl -scale-x-100" autoPlay playsInline muted />
          <canvas ref={canvasRef} width={640} height={480} className="absolute top-0 left-0 w-full h-full pointer-events-none object-cover -scale-x-100" />

          {v && !v.faceVisible && (
            <div className="absolute inset-0 bg-red-900/40 backdrop-blur-sm flex flex-col items-center justify-center z-10">
              <AlertTriangle className="w-12 h-12 text-severe mb-2 animate-pulse" />
              <p className="text-white font-bold text-lg">Face not visible</p>
              <p className="text-slate-300 text-sm">Eye tracking paused</p>
            </div>
          )}

          {isCallAssistActive && (
            <div className="absolute top-4 right-4 bg-baseline/90 backdrop-blur-md px-3 py-1.5 rounded-full text-xs font-bold text-slate-900 border border-white/20 z-20 shadow-lg flex items-center gap-2">
              <Headphones className="w-4 h-4" /> Call Assist on
            </div>
          )}

          {v && (
            <div className="absolute top-4 left-4 bg-slate-900/80 backdrop-blur-md px-3 py-2 rounded-lg text-xs font-mono text-slate-300 border border-white/10 z-20 shadow-lg min-w-[210px]">
              <Row
                label="Eye openness"
                value={`${Math.round((v.ear / v.earBaseline) * 100)}%`}
                tone={v.ear / v.earBaseline < 0.75 ? 'warn' : 'ok'}
              />
              <Row
                label="PERCLOS (% time closed, 60 s)"
                value={warm ? `${(v.perclos * 100).toFixed(1)}%` : `warming up ${Math.round(v.validSeconds)}/20 s`}
                tone={!warm ? 'muted' : v.perclos > 0.15 ? 'bad' : v.perclos > 0.08 ? 'warn' : 'ok'}
              />
              <div className="flex justify-between items-center gap-4 mb-1">
                <span className="text-slate-400">Eyelids</span>
                <span className="flex items-center gap-2">
                  <span className="w-14 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <span
                      className={`block h-full ${v.eyesClosedNow ? 'bg-warning' : 'bg-baseline'}`}
                      style={{ width: `${Math.min(100, Math.max(0, v.closure * 100))}%` }}
                    />
                  </span>
                  <span className={v.eyesClosedNow ? 'text-warning font-bold' : 'text-baseline'}>{v.eyesClosedNow ? 'closed' : 'open'}</span>
                </span>
              </div>
              <Row label="Blinks counted" value={`${v.totalBlinks}${v.lastBlinkMs !== null ? ` · last ${v.lastBlinkMs.toFixed(0)} ms` : ''}`} />
              <Row label="Blinks / min" value={warm ? v.blinkRate.toFixed(0) : '–'} tone={warm ? 'ok' : 'muted'} />
              <Row
                label="Median blink"
                value={v.medianBlinkMs !== null ? `${v.medianBlinkMs.toFixed(0)} ms` : '–'}
                tone={v.medianBlinkMs === null ? 'muted' : v.medianBlinkMs > 300 ? 'bad' : v.medianBlinkMs > 200 ? 'warn' : 'ok'}
              />
              <Row
                label="Head yaw / pitch"
                value={`${v.yaw.toFixed(0)}° / ${v.pitch.toFixed(0)}°`}
                tone={Math.abs(v.yaw) > 25 || Math.abs(v.pitch) > 25 ? 'warn' : 'ok'}
              />
              {v.lookingDown && <Row label="Looking down" value="eye metrics paused" tone="warn" />}
              <Row label="Tracker speed" value={`${v.fps.toFixed(0)} fps`} tone={v.fps < 12 ? 'bad' : v.fps < 20 ? 'warn' : 'ok'} />
              <Row label="Lighting" value={`${Math.round(v.lightQuality * 100)}%`} tone={v.lightQuality < 0.4 ? 'bad' : v.lightQuality < 0.7 ? 'warn' : 'ok'} />
              <div className="mt-2 pt-2 border-t border-white/10 text-[10px] text-slate-500">
                {calibration
                  ? `Calibrated${calibration.closedEar === null ? ' (closed-eye level estimated)' : ''}${calibration.gazeErrorPct !== null ? ` · gaze error ≈ ${calibration.gazeErrorPct.toFixed(0)}% of screen` : ''}`
                  : `Not calibrated · baseline ${v.baselineSource === 'adaptive' ? 'estimated' : 'default'}`}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
