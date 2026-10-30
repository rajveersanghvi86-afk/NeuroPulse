import React, { useRef, useEffect, useMemo } from 'react';
import { useTelemetryStore } from '../store/telemetryStore';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Download, FileJson, Table, X, Info } from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { MFI_LEVELS, mfiLevel } from '../lib/mfiCalculator';

function download(content: string, type: string, name: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const fmtDuration = (s: number) => `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;

const Stat: React.FC<{ label: string; value: string; hint?: string }> = ({ label, value, hint }) => (
  <div className="bg-slate-800/40 rounded-xl p-4 border border-white/5">
    <div className="text-xs uppercase tracking-wider text-slate-400 mb-1">{label}</div>
    <div className="text-2xl font-bold text-white">{value}</div>
    {hint && <div className="text-xs text-slate-500 mt-1">{hint}</div>}
  </div>
);

export const SessionReportModal: React.FC<{ onClosed?: () => void }> = ({ onClosed }) => {
  const open = useTelemetryStore((s) => s.isSessionReportOpen);
  const sessionData = useTelemetryStore((s) => s.sessionData);
  const gaze = useTelemetryStore((s) => s.sessionGazePoints);
  const restEvents = useTelemetryStore((s) => s.restBreakEvents);
  const reactions = useTelemetryStore((s) => s.reactionResults);
  const reactionBaseline = useTelemetryStore((s) => s.reactionBaselineMs);
  const calibration = useTelemetryStore((s) => s.calibration);
  const sessionStart = useTelemetryStore((s) => s.sessionStart);
  const reportRef = useRef<HTMLDivElement>(null);
  const heatmapRef = useRef<HTMLCanvasElement>(null);

  const stats = useMemo(() => {
    const mfis = sessionData.map((d) => d.mfi);
    const eye = sessionData.filter((d) => d.perclos !== null);
    const n = mfis.length;
    return {
      seconds: n,
      avgMfi: mean(mfis),
      peakMfi: n ? Math.max(...mfis) : null,
      pctElevated: n ? (mfis.filter((m) => m >= MFI_LEVELS.elevated).length / n) * 100 : 0,
      pctSevere: n ? (mfis.filter((m) => m >= MFI_LEVELS.severe).length / n) * 100 : 0,
      avgPerclos: mean(eye.map((d) => d.perclos!)),
      avgBlinkRate: mean(eye.map((d) => d.blinkRate!)),
      avgBlinkMs: mean(eye.filter((d) => d.blinkMs !== null).map((d) => d.blinkMs!)),
      avgAcoustic: mean(sessionData.filter((d) => d.acoustic !== null).map((d) => d.acoustic!)),
      avgConfidence: mean(sessionData.map((d) => d.confidence)),
    };
  }, [sessionData]);

  const chartData = useMemo(() => {
    const t0 = sessionData[0]?.time ?? 0;
    return sessionData.map((d) => ({
      min: Math.round(((d.time - t0) / 60000) * 100) / 100,
      mfi: d.mfi,
      acoustic: d.acoustic === null ? null : Math.round(d.acoustic),
    }));
  }, [sessionData]);

  useEffect(() => {
    if (!open || !heatmapRef.current) return;
    const ctx = heatmapRef.current.getContext('2d');
    if (!ctx) return;
    const w = ctx.canvas.width, h = ctx.canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < w; i += 40) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke(); }
    for (let j = 0; j < h; j += 40) { ctx.beginPath(); ctx.moveTo(0, j); ctx.lineTo(w, j); ctx.stroke(); }

    if (gaze.length < 10) {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '13px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(calibration ? 'Not enough gaze data yet.' : 'Calibrate to record a gaze heatmap.', w / 2, h / 2);
      return;
    }
    // Density grid, then colour by relative density.
    const gw = 64, gh = 36;
    const grid = new Float32Array(gw * gh);
    for (const p of gaze) {
      const gx = Math.floor(Math.max(0, Math.min(0.999, p.x)) * gw);
      const gy = Math.floor(Math.max(0, Math.min(0.999, p.y)) * gh);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const x = gx + dx, y = gy + dy;
        if (x >= 0 && x < gw && y >= 0 && y < gh) grid[y * gw + x] += Math.exp(-(dx * dx + dy * dy) / 2);
      }
    }
    const max = Math.max(...grid);
    const cw = w / gw, ch = h / gh;
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const v = grid[y * gw + x] / max;
      if (v < 0.03) continue;
      const hue = 170 - 170 * v; // teal -> red
      ctx.fillStyle = `hsla(${hue}, 85%, 55%, ${0.15 + 0.7 * v})`;
      ctx.fillRect(x * cw, y * ch, cw + 0.5, ch + 0.5);
    }
  }, [open, gaze, calibration]);

  if (!open) return null;

  const handleClose = () => {
    useTelemetryStore.getState().resetSessionData();
    useTelemetryStore.getState().setSessionReportOpen(false);
    onClosed?.();
  };

  const exportPDF = async () => {
    if (!reportRef.current) return;
    const canvas = await html2canvas(reportRef.current, { backgroundColor: '#0B0F19', scale: 2 });
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight();
    const imgH = (canvas.height * pw) / canvas.width;
    const img = canvas.toDataURL('image/png');
    // Split tall reports across pages.
    for (let y = 0; y < imgH; y += ph) {
      if (y > 0) pdf.addPage();
      pdf.addImage(img, 'PNG', 0, -y, pw, imgH);
    }
    pdf.save('NeuroPulse_Session_Report.pdf');
  };

  const exportJSON = () =>
    download(JSON.stringify({ sessionStart, calibration, telemetry: sessionData, gaze, reactionTests: reactions, restBreaks: restEvents }, null, 2),
      'application/json', 'NeuroPulse_Session.json');

  const exportCSV = () => {
    const head = 'time_iso,mfi,confidence,face_visible,perclos,blinks_per_min,median_blink_ms,eye_openness,acoustic_exposure';
    const f = (v: number | null, d = 3) => (v === null ? '' : v.toFixed(d));
    const rows = sessionData.map((d) =>
      [new Date(d.time).toISOString(), d.mfi, d.confidence, d.faceVisible ? 1 : 0, f(d.perclos), f(d.blinkRate, 1), f(d.blinkMs, 0), f(d.eyeOpenness), f(d.acoustic, 1)].join(','));
    download([head, ...rows].join('\n'), 'text/csv', 'NeuroPulse_Session.csv');
  };

  const level = mfiLevel(stats.avgMfi);
  const style = {
    unknown: { box: 'bg-slate-800/40 border-slate-600 text-slate-300', title: 'Not enough data' },
    nominal: { box: 'bg-baseline/10 border-baseline text-baseline', title: 'Low fatigue' },
    elevated: { box: 'bg-warning/10 border-warning text-warning', title: 'Moderate fatigue' },
    severe: { box: 'bg-severe/10 border-severe text-severe', title: 'High fatigue' },
  }[level];

  let advice = 'Track for at least a minute with your face visible to get a meaningful summary.';
  if (level === 'nominal') advice = 'Few fatigue signs this session. Keep taking short eye breaks every 20 minutes.';
  if (level === 'elevated') advice = 'Some fatigue signs. A proper 10-15 minute break away from screens is a good idea before more demanding work.';
  if (level === 'severe') advice = 'Strong fatigue signs. Stop for a real rest. If you are about to drive, consider a nap or caffeine first.';
  if (stats.pctSevere > 10 && level !== 'severe') advice += ` You spent ${stats.pctSevere.toFixed(0)}% of the session in the high range.`;

  const lastReaction = reactions[reactions.length - 1];

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/90 backdrop-blur-md overflow-y-auto py-10 px-4 flex flex-col items-center">
      <div className="w-full max-w-4xl flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold text-white">Session Summary</h2>
        <button onClick={handleClose} className="p-2 bg-slate-800 rounded-full hover:bg-slate-700 text-slate-300" aria-label="Close and clear session">
          <X className="w-6 h-6" />
        </button>
      </div>

      <div className="w-full max-w-4xl grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <button onClick={exportPDF} className="flex items-center justify-center gap-2 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl border border-white/10">
          <Download className="w-5 h-5" /> Export PDF
        </button>
        <button onClick={exportJSON} className="flex items-center justify-center gap-2 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl border border-white/10">
          <FileJson className="w-5 h-5" /> Export JSON
        </button>
        <button onClick={exportCSV} className="flex items-center justify-center gap-2 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl border border-white/10">
          <Table className="w-5 h-5" /> Export CSV
        </button>
      </div>

      <div ref={reportRef} className="w-full max-w-4xl glass-panel p-8 flex flex-col gap-8 bg-[#0B0F19]">
        <div className="flex flex-wrap gap-4 justify-between items-start border-b border-white/10 pb-6">
          <div>
            <h3 className="text-2xl font-bold text-white mb-1">NeuroPulse Session Report</h3>
            <p className="text-slate-400 text-sm">
              {sessionStart ? new Date(sessionStart).toLocaleString() : ''} · Measured time: {fmtDuration(stats.seconds)}
              {stats.avgConfidence !== null && ` · Avg. confidence ${(stats.avgConfidence * 100).toFixed(0)}%`}
            </p>
          </div>
          <div className={`px-4 py-2 rounded-lg font-bold border ${style.box}`}>{style.title}</div>
        </div>

        <div className={`p-4 rounded-xl border ${style.box} flex items-start gap-4`}>
          <Info className="w-6 h-6 mt-1 shrink-0" />
          <div>
            <h4 className="font-bold text-white mb-1">Recommendation</h4>
            <p className="text-slate-300">{advice}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Average MFI" value={stats.avgMfi === null ? '–' : `${stats.avgMfi.toFixed(0)}%`} hint={stats.peakMfi === null ? undefined : `Peak ${stats.peakMfi.toFixed(0)}%`} />
          <Stat label="Time elevated+" value={`${stats.pctElevated.toFixed(0)}%`} hint={`MFI ≥ ${MFI_LEVELS.elevated}`} />
          <Stat label="Avg. PERCLOS" value={stats.avgPerclos === null ? '–' : `${(stats.avgPerclos * 100).toFixed(1)}%`} hint="Alert ≈ under 8%" />
          <Stat label="Blinks / min" value={stats.avgBlinkRate === null ? '–' : stats.avgBlinkRate.toFixed(0)}
            hint={stats.avgBlinkMs === null ? undefined : `Median length ${stats.avgBlinkMs.toFixed(0)} ms`} />
          <Stat label="Harsh audio" value={stats.avgAcoustic === null ? '–' : `${stats.avgAcoustic.toFixed(0)}/100`} hint="Avg. exposure" />
          <Stat label="Reaction test" value={lastReaction ? `${Math.round(lastReaction.medianMs)} ms` : '–'}
            hint={lastReaction && reactionBaseline ? `Baseline ${Math.round(reactionBaseline)} ms · ${reactions.length} test(s)` : reactions.length ? `${reactions.length} test(s)` : 'None taken'} />
          <Stat label="Eye breaks" value={String(restEvents.length)} hint={`${restEvents.filter((e) => e.reason === 'fatigue').length} triggered by fatigue`} />
          <Stat label="Calibration" value={calibration ? 'Yes' : 'No'} hint={calibration?.gazeErrorPct != null ? `Gaze error ≈ ${calibration.gazeErrorPct.toFixed(0)}%` : undefined} />
        </div>

        <div>
          <h4 className="text-sm uppercase tracking-wider text-slate-400 mb-4">Timeline (minutes)</h4>
          <div className="h-64 w-full">
            {chartData.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                  <XAxis dataKey="min" type="number" domain={['dataMin', 'dataMax']} stroke="#64748B" fontSize={11} tickFormatter={(v) => (v < 10 ? v.toFixed(1) : v.toFixed(0))} />
                  <YAxis domain={[0, 100]} stroke="#64748B" fontSize={11} />
                  <ReferenceLine y={MFI_LEVELS.elevated} stroke="#F59E0B" strokeDasharray="4 4" strokeOpacity={0.4} />
                  <ReferenceLine y={MFI_LEVELS.severe} stroke="#F43F5E" strokeDasharray="4 4" strokeOpacity={0.4} />
                  <Tooltip contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', borderRadius: '8px' }} labelFormatter={(v) => `${Number(v).toFixed(1)} min`} />
                  <Line type="monotone" dataKey="mfi" stroke="#14B8A6" strokeWidth={2.5} dot={false} name="MFI" isAnimationActive={false} />
                  <Line type="monotone" dataKey="acoustic" stroke="#F59E0B" strokeWidth={1} dot={false} opacity={0.6} name="Harsh audio" isAnimationActive={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-500 text-sm">Not enough data for a timeline.</div>
            )}
          </div>
        </div>

        <div>
          <h4 className="text-sm uppercase tracking-wider text-slate-400 mb-4">Where you looked (approximate)</h4>
          <div className="w-full max-w-xl mx-auto aspect-video bg-slate-900 rounded-lg overflow-hidden border border-white/5">
            <canvas ref={heatmapRef} width={640} height={360} className="w-full h-full" />
          </div>
          <p className="text-xs text-slate-500 mt-2 text-center">
            Webcam gaze estimate mapped to the browser window. Expect an error of roughly
            {calibration?.gazeErrorPct != null ? ` ${calibration.gazeErrorPct.toFixed(0)}%` : ' 10-20%'} of the screen.
          </p>
        </div>

        <div className="border-t border-white/10 pt-6">
          <h4 className="text-sm uppercase tracking-wider text-slate-400 mb-4">What these mean</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-slate-300">
            <div><strong className="text-white block mb-1">Fatigue Index (MFI)</strong>A 0-100 blend of the measures below, weighted by how reliable each one was. 0-39 low, 40-69 elevated, 70+ high.</div>
            <div><strong className="text-white block mb-1">PERCLOS</strong>The share of time your eyes were at least ~80% closed. It's one of the best-studied drowsiness measures. Alert people are usually under ~8%, and 15%+ is a common drowsiness threshold.</div>
            <div><strong className="text-white block mb-1">Blink length</strong>Blinks get slower when you're tired. It's measured as the time your lids are more than half closed: roughly 80-180 ms when alert.</div>
            <div><strong className="text-white block mb-1">Reaction time</strong>A short Psychomotor Vigilance Task. Slowing compared with your own rested baseline, and lapses (≥500 ms), track sleepiness well.</div>
            <div><strong className="text-white block mb-1">Harsh audio</strong>How loud the 2-4 kHz range was above your room's quiet level, and how treble-heavy it was, averaged over minutes. It's a comfort indicator, not a hearing-safety (SPL) measurement.</div>
            <div><strong className="text-white block mb-1">Limits</strong>Glasses, poor lighting, looking down at a keyboard and head turns all reduce accuracy. Low-confidence periods count for less.</div>
          </div>
          <p className="text-xs text-slate-500 mt-6">NeuroPulse is a wellbeing tool, not a medical device. It does not diagnose any condition.</p>
        </div>
      </div>
    </div>
  );
};
