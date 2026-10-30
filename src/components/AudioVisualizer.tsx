import React, { useEffect, useRef } from 'react';
import { useTelemetryStore } from '../store/telemetryStore';
import { acousticEngine } from '../lib/acousticEngine';

const MAX_HZ = 8000;

/** Live spectrum (0-8 kHz) drawn straight from the analyser; the 2-4 kHz band is highlighted. */
export const AudioVisualizer: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isTracking = useTelemetryStore((s) => s.isTracking);
  const acoustic = useTelemetryStore((s) => s.acoustic);

  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
        const dpr = window.devicePixelRatio || 1;
        const w = canvas.clientWidth, h = canvas.clientHeight;
        if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
          canvas.width = Math.round(w * dpr);
          canvas.height = Math.round(h * dpr);
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);

        const x2k = (2000 / MAX_HZ) * w, x4k = (4000 / MAX_HZ) * w;
        ctx.fillStyle = 'rgba(245, 158, 11, 0.08)';
        ctx.fillRect(x2k, 0, x4k - x2k, h);

        ctx.fillStyle = 'rgba(148, 163, 184, 0.6)';
        ctx.font = '10px monospace';
        for (const f of [1000, 2000, 4000, 6000]) ctx.fillText(`${f / 1000}k`, (f / MAX_HZ) * w + 2, h - 2);

        const spec = acousticEngine.getSpectrum();
        if (spec) {
          const bins = Math.min(spec.data.length, Math.floor(MAX_HZ / spec.binHz));
          const barW = w / bins;
          for (let i = 0; i < bins; i++) {
            const f = i * spec.binHz;
            const v = spec.data[i] / 255;
            ctx.fillStyle = f >= 2000 && f < 4000 ? 'rgba(245, 158, 11, 0.85)' : 'rgba(20, 184, 166, 0.7)';
            ctx.fillRect(i * barW, h - 12 - v * (h - 12), Math.max(1, barW - 0.5), v * (h - 12));
          }
        } else {
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
          ctx.beginPath();
          ctx.moveTo(0, h - 12);
          ctx.lineTo(w, h - 12);
          ctx.stroke();
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  const above = acoustic ? acoustic.bandDb - acoustic.floorDb : 0;

  return (
    <div className="w-full h-full relative">
      <canvas ref={canvasRef} className="w-full h-full" />
      <div className="absolute top-0 right-0 flex items-center gap-2 bg-slate-900/70 rounded px-2 py-1">
        <div className={`w-2 h-2 rounded-full ${acoustic?.active ? 'bg-baseline animate-pulse' : 'bg-slate-600'}`} />
        <span className="text-xs text-slate-300 font-mono">
          {!isTracking || !acoustic
            ? 'IDLE'
            : `2–4 kHz: +${Math.max(0, above).toFixed(0)} dB over room · ${(acoustic.harshShare * 100).toFixed(0)}% of energy · exposure ${acoustic.exposure.toFixed(0)}`}
        </span>
      </div>
    </div>
  );
};
