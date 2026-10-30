import React, { useRef, useEffect, useMemo, useState } from 'react';
import { useTelemetryStore } from '../store/telemetryStore';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea } from 'recharts';
import { Download, FileJson, Table, X, Info, Loader2 } from 'lucide-react';
import { MFI_LEVELS } from '../lib/mfiCalculator';
import { computeSessionStats } from '../lib/sessionStats';
import { drawHeatmap } from '../lib/heatmap';
import { COMPONENT_LABELS } from '../lib/sessionStats';

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

const fmt = (v: number | null | undefined, d = 0, suffix = '') => (v === null || v === undefined || !Number.isFinite(v) ? '–' : `${v.toFixed(d)}${suffix}`);
const fmtDuration = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.round(s % 60);
  return h ? `${h} h ${m} min` : `${m} min ${sec} s`;
};
const barColor = (v: number) => (v >= MFI_LEVELS.severe ? 'bg-severe' : v >= MFI_LEVELS.elevated ? 'bg-warning' : 'bg-baseline');

const Stat: React.FC<{ label: string; value: string; hint?: string; tone?: 'ok' | 'warn' | 'bad' }> = ({ label, value, hint, tone }) => (
  <div className="bg-slate-800/40 rounded-xl p-4 border border-white/5">
    <div className="text-xs uppercase tracking-wider text-slate-400 mb-1">{label}</div>
    <div className={`text-2xl font-bold ${tone === 'bad' ? 'text-severe' : tone === 'warn' ? 'text-warning' : 'text-white'}`}>{value}</div>
    {hint && <div className="text-xs text-slate-500 mt-1">{hint}</div>}
  </div>
);

export const SessionReportModal: React.FC<{ onClosed?: () => void }> = ({ onClosed }) => {
  const open = useTelemetryStore((s) => s.isSessionReportOpen);
  const sessionData = useTelemetryStore((s) => s.sessionData);
  const gaze = useTelemetryStore((s) => s.sessionGazePoints);
  const restEvents = useTelemetryStore((s) => s.restBreakEvents);
  const reactions = useTelemetryStore((s) => s.reactionResults);
  const reactionBaselineMs = useTelemetryStore((s) => s.reactionBaselineMs);
  const calibration = useTelemetryStore((s) => s.calibration);
  const sessionStart = useTelemetryStore((s) => s.sessionStart);
  const heatmapRef = useRef<HTMLCanvasElement>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  const stats = useMemo(
    () => computeSessionStats({ data: sessionData, gaze, reactions, reactionBaselineMs, restEvents, calibration, sessionStart }),
    [sessionData, gaze, reactions, reactionBaselineMs, restEvents, calibration, sessionStart],
  );

  const chartData = useMemo(() => {
    const t0 = sessionData[0]?.time ?? 0;
    const step = Math.max(1, Math.floor(sessionData.length / 600));
    const out = [];
    for (let i = 0; i < sessionData.length; i += step) {
      const d = sessionData[i];
      out.push({ min: Math.round(((d.time - t0) / 60000) * 100) / 100, mfi: Math.round(d.mfi), acoustic: d.acoustic === null ? null : Math.round(d.acoustic) });
    }
    return out;
  }, [sessionData]);

  useEffect(() => {
    if (!open || !heatmapRef.current) return;
    const ctx = heatmapRef.current.getContext('2d');
    if (ctx) drawHeatmap(ctx, gaze, false, calibration ? 'Not enough gaze data yet.' : 'Calibrate to record a gaze heatmap.');
  }, [open, gaze, calibration]);

  if (!open) return null;

  const handleClose = () => {
    useTelemetryStore.getState().resetSessionData();
    useTelemetryStore.getState().setSessionReportOpen(false);
    onClosed?.();
  };

  const exportPDF = async () => {
    setPdfBusy(true);
    try {
      // Loaded on demand so the PDF library doesn't slow down the dashboard.
      const { downloadReportPdf } = await import('../lib/reportPdf');
      downloadReportPdf(stats, sessionData, gaze);
    } finally {
      setPdfBusy(false);
    }
  };

  const exportJSON = () =>
    download(
      JSON.stringify({ summary: { ...stats, calibration: undefined }, calibration, telemetry: sessionData, gaze, reactionTests: reactions, restBreaks: restEvents }, null, 2),
      'application/json',
      'NeuroPulse_Session.json',
    );

  const exportCSV = () => {
    const keys = Object.keys(COMPONENT_LABELS) as (keyof typeof COMPONENT_LABELS)[];
    const head = ['time_iso', 'mfi', 'confidence', 'face_visible', 'looking_down', 'perclos', 'blinks_per_min', 'median_blink_ms', 'eye_openness',
      'harsh_audio_exposure', 'sound_above_room_db', 'treble_balance_db', 'light_quality', 'tracker_fps', 'blinks_total', 'long_closures_total',
      ...keys.map((k) => `score_${k}`)].join(',');
    const f = (v: number | null | undefined, d = 3) => (v === null || v === undefined ? '' : v.toFixed(d));
    const rows = sessionData.map((d) =>
      [new Date(d.time).toISOString(), d.mfi, d.confidence, d.faceVisible ? 1 : 0, d.lookingDown ? 1 : 0, f(d.perclos, 4), f(d.blinkRate, 1), f(d.blinkMs, 0), f(d.eyeOpenness),
        f(d.acoustic, 1), f(d.soundDb, 1), f(d.tiltDb, 1), f(d.lightQuality, 2), f(d.fps, 1), d.totalBlinks ?? '', d.totalLongClosures ?? '',
        ...keys.map((k) => f(d.scores?.[k], 1))].join(','));
    download([head, ...rows].join('\n'), 'text/csv', 'NeuroPulse_Session.csv');
  };

  const style = {
    unknown: { box: 'bg-slate-800/40 border-slate-600 text-slate-300', title: 'Not enough data' },
    nominal: { box: 'bg-baseline/10 border-baseline text-baseline', title: 'Low fatigue' },
    elevated: { box: 'bg-warning/10 border-warning text-warning', title: 'Moderate fatigue' },
    severe: { box: 'bg-severe/10 border-severe text-severe', title: 'High fatigue' },
  }[stats.level];

  const lastReaction = reactions[reactions.length - 1];
  const tone = (ok: boolean, warn: boolean) => (ok ? 'ok' : warn ? 'warn' : 'bad') as 'ok' | 'warn' | 'bad';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/95 overflow-y-auto py-10 px-4 flex flex-col items-center">
      <div className="w-full max-w-4xl flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold text-white">Session Summary</h2>
        <button onClick={handleClose} className="p-2 bg-slate-800 rounded-full hover:bg-slate-700 text-slate-300" aria-label="Close and clear session">
          <X className="w-6 h-6" />
        </button>
      </div>

      <div className="w-full max-w-4xl grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <button onClick={exportPDF} disabled={pdfBusy} className="flex items-center justify-center gap-2 py-3 bg-baseline text-slate-900 font-bold hover:bg-baseline/80 rounded-xl disabled:opacity-60">
          {pdfBusy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />} Download PDF report
        </button>
        <button onClick={exportCSV} className="flex items-center justify-center gap-2 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl border border-white/10">
          <Table className="w-5 h-5" /> Export CSV (per second)
        </button>
        <button onClick={exportJSON} className="flex items-center justify-center gap-2 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl border border-white/10">
          <FileJson className="w-5 h-5" /> Export JSON (everything)
        </button>
      </div>

      <div className="w-full max-w-4xl glass-panel p-8 flex flex-col gap-8 bg-[#0B0F19]">
        <div className="flex flex-wrap gap-4 justify-between items-start border-b border-white/10 pb-6">
          <div>
            <h3 className="text-2xl font-bold text-white mb-1">NeuroPulse Session Report</h3>
            <p className="text-slate-400 text-sm">
              {stats.start ? new Date(stats.start).toLocaleString() : ''} · Length {fmtDuration(stats.wallSeconds)} · Measured {fmtDuration(stats.measuredSeconds)}
              {stats.avgConfidence !== null && ` · Confidence ${(stats.avgConfidence * 100).toFixed(0)}%`}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className={`px-4 py-2 rounded-lg font-bold border ${style.box}`}>{style.title}</div>
            {({ unknown: 0, nominal: 1, elevated: 2, severe: 3 })[stats.endLevel] > ({ unknown: 0, nominal: 1, elevated: 2, severe: 3 })[stats.level] && (
              <span className={`text-xs font-semibold ${stats.endLevel === 'severe' ? 'text-severe' : 'text-warning'}`}>
                …rising to {stats.endLevel === 'severe' ? 'high' : 'elevated'} ({fmt(stats.endMfi)}) by the end
              </span>
            )}
          </div>
        </div>

        <div className={`p-4 rounded-xl border ${style.box} flex items-start gap-4`}>
          <Info className="w-6 h-6 mt-1 shrink-0" />
          <div>
            <h4 className="font-bold text-white mb-2">Summary & recommendations</h4>
            <ul className="list-disc pl-5 space-y-1 text-slate-300 text-sm">
              {stats.advice.map((a, i) => <li key={i}>{a}</li>)}
            </ul>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Average MFI" value={fmt(stats.avgMfi, 0, '%')} hint={`Peak ${fmt(stats.peakMfi, 0, '%')}`}
            tone={stats.avgMfi === null ? undefined : tone(stats.avgMfi < MFI_LEVELS.elevated, stats.avgMfi < MFI_LEVELS.severe)} />
          <Stat label="Time elevated+" value={fmt(stats.pctElevated, 0, '%')} hint={`High: ${fmt(stats.pctSevere, 0, '%')}`} />
          <Stat label="Avg. PERCLOS" value={stats.avgPerclos === null ? '–' : `${(stats.avgPerclos * 100).toFixed(1)}%`}
            hint={`Worst minute ${stats.peakPerclos === null ? '–' : (stats.peakPerclos * 100).toFixed(1) + '%'} · alert < 8%`}
            tone={stats.avgPerclos === null ? undefined : tone(stats.avgPerclos < 0.08, stats.avgPerclos < 0.15)} />
          <Stat label="Blinks" value={fmt(stats.totalBlinks)} hint={`${fmt(stats.avgBlinkRate, 0)} / min · median ${fmt(stats.medianBlinkMs, 0, ' ms')}`} />
          <Stat label="Long closures" value={fmt(stats.totalLongClosures)} hint="Eyes shut ≥ 0.5 s"
            tone={stats.totalLongClosures === null ? undefined : tone(stats.totalLongClosures <= 1, stats.totalLongClosures <= 4)} />
          <Stat label="Reaction test" value={lastReaction ? `${Math.round(lastReaction.medianMs)} ms` : '–'}
            hint={lastReaction ? `${reactions.length} test(s) · baseline ${reactionBaselineMs ? Math.round(reactionBaselineMs) + ' ms' : 'not set'}` : 'None taken'} />
          <Stat label="Harsh audio" value={stats.avgAcoustic === null ? '–' : `${stats.avgAcoustic.toFixed(0)}/100`}
            hint={`Sound present ${fmt(stats.soundPresentPct, 0, '%')} of the time`}
            tone={stats.avgAcoustic === null ? undefined : tone(stats.avgAcoustic < 30, stats.avgAcoustic < 55)} />
          <Stat label="Eye breaks" value={String(restEvents.length)} hint={`${restEvents.filter((e) => e.reason === 'fatigue').length} triggered by fatigue`} />
        </div>

        <div>
          <h4 className="text-sm uppercase tracking-wider text-slate-400 mb-4">Fatigue over time (minutes)</h4>
          <div className="h-64 w-full">
            {chartData.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                  <ReferenceArea y1={MFI_LEVELS.severe} y2={100} fill="#F43F5E" fillOpacity={0.06} />
                  <ReferenceArea y1={MFI_LEVELS.elevated} y2={MFI_LEVELS.severe} fill="#F59E0B" fillOpacity={0.06} />
                  <XAxis dataKey="min" type="number" domain={['dataMin', 'dataMax']} stroke="#64748B" fontSize={11} tickFormatter={(v) => (v < 10 ? v.toFixed(1) : v.toFixed(0))} />
                  <YAxis domain={[0, 100]} stroke="#64748B" fontSize={11} />
                  {stats.restEvents.map((e) => (
                    <ReferenceLine key={e.time} x={Math.round(((e.time - (sessionData[0]?.time ?? 0)) / 60000) * 100) / 100} stroke="#F43F5E" strokeDasharray="3 3" strokeOpacity={0.6} />
                  ))}
                  <Tooltip contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', borderRadius: '8px' }} labelFormatter={(v) => `${Number(v).toFixed(1)} min`} />
                  <Line type="monotone" dataKey="mfi" stroke="#14B8A6" strokeWidth={2.5} dot={false} name="MFI" isAnimationActive={false} />
                  <Line type="monotone" dataKey="acoustic" stroke="#F59E0B" strokeWidth={1} dot={false} opacity={0.7} name="Harsh audio" isAnimationActive={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-500 text-sm">Not enough data for a timeline.</div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <h4 className="text-sm uppercase tracking-wider text-slate-400 mb-4">What drove the index</h4>
            <div className="flex flex-col gap-3">
              {stats.components.map((c) => (
                <div key={c.key} className={c.avg === null ? 'opacity-40' : ''}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-300">{c.label}</span>
                    <span className="text-slate-400 font-mono">{c.avg === null ? 'n/a' : `${c.avg.toFixed(0)} · ${c.coveragePct.toFixed(0)}% coverage`}</span>
                  </div>
                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${barColor(c.avg ?? 0)}`} style={{ width: `${c.avg === null ? 0 : Math.max(2, c.avg)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h4 className="text-sm uppercase tracking-wider text-slate-400 mb-4">Where you looked (approximate)</h4>
            <div className="w-full aspect-video rounded-lg overflow-hidden border border-white/5">
              <canvas ref={heatmapRef} width={640} height={360} className="w-full h-full" />
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Expect an error of roughly {calibration?.gazeErrorPct != null ? `${calibration.gazeErrorPct.toFixed(0)}%` : '10-20%'} of the screen.
            </p>
          </div>
        </div>

        {stats.segments.length > 1 && (
          <div>
            <h4 className="text-sm uppercase tracking-wider text-slate-400 mb-4">By {stats.segmentMinutes}-minute period</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-400 text-xs uppercase">
                    <th className="text-left py-2">Period</th><th className="text-right">MFI</th><th className="text-right">PERCLOS</th><th className="text-right">Blinks/min</th><th className="text-right">Harsh audio</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.segments.map((s) => (
                    <tr key={s.fromMin} className="border-t border-white/5 text-slate-300">
                      <td className="py-1.5">{s.fromMin}–{s.toMin} min</td>
                      <td className={`text-right font-bold ${s.avgMfi !== null && s.avgMfi >= MFI_LEVELS.severe ? 'text-severe' : s.avgMfi !== null && s.avgMfi >= MFI_LEVELS.elevated ? 'text-warning' : 'text-baseline'}`}>{fmt(s.avgMfi)}</td>
                      <td className="text-right">{s.perclos === null ? '–' : `${(s.perclos * 100).toFixed(1)}%`}</td>
                      <td className="text-right">{fmt(s.blinkRate)}</td>
                      <td className="text-right">{fmt(s.acoustic)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="border-t border-white/10 pt-6 text-xs text-slate-500 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>Face visible: <span className="text-slate-300">{fmt(stats.faceVisiblePct, 0, '%')}</span></div>
          <div>Looking below screen: <span className="text-slate-300">{fmt(stats.lookingDownPct, 0, '%')}</span></div>
          <div>Lighting: <span className="text-slate-300">{stats.avgLight === null ? '–' : `${(stats.avgLight * 100).toFixed(0)}%`}</span></div>
          <div>Tracker: <span className="text-slate-300">{fmt(stats.avgFps, 0, ' fps')}</span></div>
        </div>
        <p className="text-xs text-slate-500">NeuroPulse is a wellbeing tool, not a medical device. It does not diagnose any condition. The PDF has the full breakdown and explanations.</p>
      </div>
    </div>
  );
};
