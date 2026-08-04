import React, { useEffect, useRef } from 'react';
import { useTelemetryStore } from '../store/telemetryStore';
import { CameraOff, AlertTriangle, Headphones } from 'lucide-react';
import { saccadeEngine } from '../lib/saccadeEngine';

export const WebcamFeed: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { isTracking, ear, perclos, latency, lightingQuality, outOfFrame, isCallAssistActive, cameraEnabled } = useTelemetryStore();

  useEffect(() => {
    if (isTracking && cameraEnabled && videoRef.current && canvasRef.current) {
      saccadeEngine.setCanvas(canvasRef.current);
      
      navigator.mediaDevices.getUserMedia({ video: true }).then(stream => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          saccadeEngine.start(videoRef.current);
        }
      }).catch(err => {
        console.error("Camera error:", err);
        useTelemetryStore.getState().addAlert("⚠️ Camera access denied.", "severe");
      });
    } else {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
        videoRef.current.srcObject = null;
        saccadeEngine.stop();
      }
    }
  }, [isTracking, cameraEnabled]);

  return (
    <div className="w-full h-full relative bg-slate-900/50 flex items-center justify-center overflow-hidden">
      {!cameraEnabled ? (
        <div className="flex flex-col items-center text-slate-500 gap-2">
          <CameraOff className="w-12 h-12" />
          <p>Camera Disabled (Audio-Only Mode)</p>
        </div>
      ) : !isTracking ? (
        <div className="flex flex-col items-center text-slate-500 gap-2">
          <CameraOff className="w-12 h-12" />
          <p>Camera Offline</p>
        </div>
      ) : (
        <>
          <video 
            ref={videoRef} 
            className="w-full h-full object-cover rounded-xl -scale-x-100"
            autoPlay 
            playsInline 
            muted
          />
          <canvas 
            ref={canvasRef} 
            width={640}
            height={480}
            className="absolute top-0 left-0 w-full h-full pointer-events-none object-cover -scale-x-100"
          />
          
          {outOfFrame && (
            <div className="absolute inset-0 bg-red-900/40 backdrop-blur-sm flex flex-col items-center justify-center z-10">
              <AlertTriangle className="w-12 h-12 text-severe mb-2 animate-pulse" />
              <p className="text-white font-bold text-lg">Subject Out of Frame</p>
              <p className="text-slate-300 text-sm">Tracking Paused</p>
            </div>
          )}

          {/* Phase 3: Call Assist Active Badge */}
          {isCallAssistActive && (
            <div className="absolute top-4 right-4 bg-baseline/90 backdrop-blur-md px-3 py-1.5 rounded-full text-xs font-bold text-slate-900 border border-white/20 z-20 shadow-lg flex items-center gap-2 animate-pulse">
              <Headphones className="w-4 h-4" /> 
              [ 🎧 CALL ASSIST ACTIVE ]
            </div>
          )}

          <div className="absolute top-4 left-4 bg-slate-900/80 backdrop-blur-md px-3 py-2 rounded-lg text-xs font-mono text-slate-300 border border-white/10 z-20 shadow-lg">
            <div className="flex justify-between gap-4 mb-1">
              <span className="text-slate-400">EAR</span>
              <span className={ear < 0.2 ? 'text-severe font-bold' : 'text-baseline'}>{ear.toFixed(2)}</span>
            </div>
            <div className="flex justify-between gap-4 mb-1">
              <span className="text-slate-400">PERCLOS</span>
              <span className={perclos > 0.15 ? 'text-warning font-bold' : 'text-baseline'}>{(perclos * 100).toFixed(1)}%</span>
            </div>
            <div className="flex justify-between gap-4 mb-1">
              <span className="text-slate-400">Latency</span>
              <span className="text-baseline">{latency.toFixed(0)} ms</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-400">C_light</span>
              <span className={lightingQuality < 0.7 ? 'text-warning font-bold' : 'text-baseline'}>{lightingQuality.toFixed(2)}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
