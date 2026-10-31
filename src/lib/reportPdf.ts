import jsPDF from 'jspdf';
import type { GazePoint, TelemetryDataPoint } from './types';
import type { SessionStats } from './sessionStats';
import { MFI_LEVELS, DEFAULT_REACTION_BASELINE_MS } from './mfiCalculator';
import { drawHeatmap } from './heatmap';

type RGB = [number, number, number];
const C = {
  ink: [15, 23, 42] as RGB,
  muted: [100, 116, 139] as RGB,
  faint: [226, 232, 240] as RGB,
  panel: [248, 250, 252] as RGB,
  teal: [20, 184, 166] as RGB,
  amber: [245, 158, 11] as RGB,
  rose: [244, 63, 94] as RGB,
  white: [255, 255, 255] as RGB,
};

const PAGE_W = 210, PAGE_H = 297, M = 16, CONTENT_W = PAGE_W - 2 * M;

/** The built-in PDF fonts only cover basic Latin, so keep text ASCII. */
const ascii = (s: string) =>
  s.replace(/[–—]/g, '-').replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/≈/g, '~')
    .replace(/·/g, '|').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/°/g, ' deg')
    .replace(/[^\x20-\x7E]/g, '');

const fmt = (v: number | null | undefined, d = 0, suffix = '') => (v === null || v === undefined || !Number.isFinite(v) ? '-' : `${v.toFixed(d)}${suffix}`);
const fmtDur = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.round(s % 60);
  return h ? `${h} h ${m} min` : m ? `${m} min ${sec} s` : `${sec} s`;
};
const levelColor = (v: number | null): RGB => (v === null ? C.muted : v >= MFI_LEVELS.severe ? C.rose : v >= MFI_LEVELS.elevated ? C.amber : C.teal);
const statusOf = (ok: boolean, warn: boolean): { text: string; color: RGB } =>
  ok ? { text: 'Normal', color: C.teal } : warn ? { text: 'Watch', color: C.amber } : { text: 'High', color: C.rose };

export function buildReportPdf(stats: SessionStats, data: TelemetryDataPoint[], gaze: GazePoint[]): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = M;

  const color = (c: RGB, kind: 'text' | 'fill' | 'draw') =>
    kind === 'text' ? doc.setTextColor(...c) : kind === 'fill' ? doc.setFillColor(...c) : doc.setDrawColor(...c);
  const font = (size: number, style: 'normal' | 'bold' = 'normal', c: RGB = C.ink) => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    color(c, 'text');
  };
  const text = (s: string, x: number, yy: number, opts?: { align?: 'left' | 'center' | 'right' }) => doc.text(ascii(s), x, yy, opts);
  const newPage = () => {
    doc.addPage();
    y = M;
  };
  const ensure = (h: number) => {
    if (y + h > PAGE_H - 18) newPage();
  };
  const heading = (s: string) => {
    ensure(14);
    y += 3;
    font(12.5, 'bold');
    text(s, M, y);
    color(C.teal, 'draw');
    doc.setLineWidth(0.6);
    doc.line(M, y + 1.8, M + 12, y + 1.8);
    y += 7;
  };
  const para = (s: string, size = 9.5, c: RGB = C.ink, indent = 0) => {
    font(size, 'normal', c);
    const lines = doc.splitTextToSize(ascii(s), CONTENT_W - indent) as string[];
    const lh = size * 0.45;
    ensure(lines.length * lh + 1);
    doc.text(lines, M + indent, y);
    y += lines.length * lh + 1.5;
  };
  const bullet = (s: string) => {
    font(9.5);
    const lines = doc.splitTextToSize(ascii(s), CONTENT_W - 6) as string[];
    ensure(lines.length * 4.3 + 1);
    color(C.teal, 'fill');
    doc.circle(M + 1.5, y - 1.2, 0.8, 'F');
    doc.text(lines, M + 5, y);
    y += lines.length * 4.3 + 1.2;
  };

  /** Table with a header row; each cell may be coloured. */
  const table = (cols: { label: string; w: number; align?: 'left' | 'right' | 'center' }[], rows: { text: string; color?: RGB; bold?: boolean }[][]) => {
    const rh = 6.4;
    const drawHeader = () => {
      color(C.ink, 'fill');
      doc.rect(M, y, CONTENT_W, rh, 'F');
      font(8.5, 'bold', C.white);
      let x = M;
      for (const c of cols) {
        const tx = c.align === 'right' ? x + c.w - 2 : c.align === 'center' ? x + c.w / 2 : x + 2;
        text(c.label, tx, y + 4.3, { align: c.align ?? 'left' });
        x += c.w;
      }
      y += rh;
    };
    ensure(rh * 2);
    drawHeader();
    rows.forEach((row, i) => {
      if (y + rh > PAGE_H - 18) {
        newPage();
        drawHeader();
      }
      if (i % 2 === 0) {
        color(C.panel, 'fill');
        doc.rect(M, y, CONTENT_W, rh, 'F');
      }
      let x = M;
      row.forEach((cell, j) => {
        const c = cols[j];
        font(8.8, cell.bold ? 'bold' : 'normal', cell.color ?? C.ink);
        const tx = c.align === 'right' ? x + c.w - 2 : c.align === 'center' ? x + c.w / 2 : x + 2;
        text(cell.text, tx, y + 4.3, { align: c.align ?? 'left' });
        x += c.w;
      });
      y += rh;
    });
    color(C.faint, 'draw');
    doc.setLineWidth(0.2);
    doc.line(M, y, M + CONTENT_W, y);
    y += 4;
  };

  // ---------- Header band ----------
  color(C.ink, 'fill');
  doc.rect(0, 0, PAGE_W, 34, 'F');
  font(20, 'bold', C.white);
  text('NeuroPulse', M, 15);
  color(C.teal, 'text');
  text('Session Report', M + 44, 15);
  font(9.5, 'normal', [203, 213, 225]);
  const startStr = stats.start ? new Date(stats.start).toLocaleString() : '-';
  const endStr = stats.end ? new Date(stats.end).toLocaleTimeString() : '-';
  text(`${startStr} - ${endStr}   |   Session length ${fmtDur(stats.wallSeconds)}   |   Measured ${fmtDur(stats.measuredSeconds)}`, M, 24);
  text(`Data confidence ${fmt(stats.avgConfidence === null ? null : stats.avgConfidence * 100, 0, '%')}   |   Calibrated: ${stats.calibration ? 'yes' : 'no'}   |   Generated ${new Date().toLocaleString()}`, M, 29);
  y = 44;

  // ---------- Overall result ----------
  const lvl = stats.level;
  const lvlColor = levelColor(stats.avgMfi);
  const lvlText = { unknown: 'Not enough data', nominal: 'Low fatigue', elevated: 'Moderate fatigue', severe: 'High fatigue' }[lvl];
  color(C.panel, 'fill');
  doc.roundedRect(M, y, CONTENT_W, 30, 2, 2, 'F');
  color(lvlColor, 'fill');
  doc.rect(M, y, 2.2, 30, 'F');
  font(9, 'bold', C.muted);
  text('OVERALL', M + 7, y + 7);
  font(18, 'bold', lvlColor);
  text(lvlText, M + 7, y + 16);
  font(9, 'normal', C.muted);
  const rankOf = { unknown: 0, nominal: 1, elevated: 2, severe: 3 };
  if (rankOf[stats.endLevel] > rankOf[lvl]) {
    font(9, 'bold', levelColor(stats.endMfi));
    text(`...rising to ${stats.endLevel === 'severe' ? 'high' : 'elevated'} (${fmt(stats.endMfi)}) by the end`, M + 7, y + 24);
  } else {
    text('Based on the average fatigue index (0-100)', M + 7, y + 24);
  }

  const kpis: [string, string][] = [
    ['Average MFI', fmt(stats.avgMfi)],
    ['Peak MFI', fmt(stats.peakMfi)],
    [`Time >= ${MFI_LEVELS.elevated}`, fmt(stats.pctElevated, 0, '%')],
    [`Time >= ${MFI_LEVELS.severe}`, fmt(stats.pctSevere, 0, '%')],
  ];
  kpis.forEach(([k, v], i) => {
    const x = M + 78 + i * 26;
    font(15, 'bold', i === 0 ? lvlColor : C.ink);
    text(v, x, y + 15);
    font(7.5, 'normal', C.muted);
    text(k, x, y + 21);
  });
  y += 38;

  // ---------- Recommendations ----------
  heading('Summary & recommendations');
  stats.advice.forEach(bullet);
  y += 2;

  // ---------- Timeline ----------
  heading('Fatigue over time');
  drawTimeline(doc, data, stats.restEvents.map((e) => e.time), M, y, CONTENT_W, 58);
  y += 66;
  font(8, 'normal', C.muted);
  const legend: [RGB, string][] = [[C.teal, 'Fatigue index (MFI)'], [C.amber, 'Harsh audio exposure'], [C.rose, 'Eye break taken']];
  let lx = M;
  legend.forEach(([c, label]) => {
    color(c, 'fill');
    doc.rect(lx, y - 2.4, 5, 1.6, 'F');
    font(8, 'normal', C.muted);
    text(label, lx + 7, y - 1);
    lx += 52;
  });
  y += 4;

  // ---------- Key measurements ----------
  heading('Key measurements');
  const r = stats.reactions[stats.reactions.length - 1];
  const base = stats.reactionBaselineMs;
  const perclos = stats.avgPerclos;
  const rows: { text: string; color?: RGB; bold?: boolean }[][] = [];
  const addRow = (name: string, value: string, typical: string, st: { text: string; color: RGB } | null) =>
    rows.push([{ text: name, bold: true }, { text: value }, { text: typical, color: C.muted }, st ? { text: st.text, color: st.color, bold: true } : { text: '-', color: C.muted }]);

  addRow('Eye closure (PERCLOS, avg)', perclos === null ? '-' : `${(perclos * 100).toFixed(1)}%`, 'under 8%',
    perclos === null ? null : statusOf(perclos < 0.08, perclos < 0.15));
  addRow('PERCLOS, worst minute', stats.peakPerclos === null ? '-' : `${(stats.peakPerclos * 100).toFixed(1)}%`, 'under 15%',
    stats.peakPerclos === null ? null : statusOf(stats.peakPerclos < 0.15, stats.peakPerclos < 0.25));
  addRow('Blinks counted', fmt(stats.totalBlinks), '-', null);
  addRow('Blink rate', fmt(stats.avgBlinkRate, 0, ' / min'), '10-25 / min',
    stats.avgBlinkRate === null ? null : statusOf(stats.avgBlinkRate >= 8 && stats.avgBlinkRate <= 30, stats.avgBlinkRate >= 5));
  addRow('Median blink duration', fmt(stats.medianBlinkMs, 0, ' ms'), '80-180 ms',
    stats.medianBlinkMs === null ? null : statusOf(stats.medianBlinkMs <= 200, stats.medianBlinkMs <= 300));
  addRow('Long closures (>= 0.5 s)', fmt(stats.totalLongClosures), '0-1',
    stats.totalLongClosures === null ? null : statusOf(stats.totalLongClosures <= 1, stats.totalLongClosures <= 4));
  addRow('Eye openness vs your normal', fmt(stats.avgOpenness === null ? null : stats.avgOpenness * 100, 0, '%'), '90-100%',
    stats.avgOpenness === null ? null : statusOf(stats.avgOpenness >= 0.9, stats.avgOpenness >= 0.75));
  addRow('Reaction time (last test)', r ? `${Math.round(r.medianMs)} ms (${r.lapses} lapses)` : 'not taken',
    `baseline ${Math.round(base ?? DEFAULT_REACTION_BASELINE_MS)} ms${base ? '' : ' (default)'}`,
    r ? statusOf(r.medianMs - (base ?? DEFAULT_REACTION_BASELINE_MS) <= 30 && r.lapses === 0, r.medianMs - (base ?? DEFAULT_REACTION_BASELINE_MS) <= 80 && r.lapses <= 1) : null);
  addRow('Harsh audio exposure (avg / peak)', stats.avgAcoustic === null ? '-' : `${fmt(stats.avgAcoustic)} / ${fmt(stats.peakAcoustic)}`, 'under 30',
    stats.avgAcoustic === null ? null : statusOf(stats.avgAcoustic < 30, stats.avgAcoustic < 55));
  addRow('Time with sound present', fmt(stats.soundPresentPct, 0, '%'), '-', null);
  addRow('Eye breaks taken', `${stats.restEvents.length} (${stats.restEvents.filter((e) => e.reason === 'fatigue').length} for fatigue)`, '1 per 20 min', null);
  table([{ label: 'Measure', w: 62 }, { label: 'Your value', w: 46 }, { label: 'Typical when alert', w: 44 }, { label: 'Status', w: CONTENT_W - 152, align: 'center' }], rows);

  // ---------- What drove it ----------
  heading('What drove the fatigue index');
  para('Average score of each signal while it was available (0 = no sign, 100 = strong sign). Coverage is the share of the session the signal was measured.', 8.5, C.muted);
  y += 1;
  for (const c of stats.components) {
    ensure(8);
    font(9, 'normal');
    text(c.label, M, y + 3.2);
    const bx = M + 52, bw = 92;
    color(C.faint, 'fill');
    doc.roundedRect(bx, y, bw, 4.2, 1, 1, 'F');
    if (c.avg !== null) {
      color(levelColor(c.avg), 'fill');
      doc.roundedRect(bx, y, Math.max(1.5, (bw * c.avg) / 100), 4.2, 1, 1, 'F');
    }
    font(9, 'bold', c.avg === null ? C.muted : C.ink);
    text(c.avg === null ? 'n/a' : c.avg.toFixed(0), bx + bw + 4, y + 3.3);
    font(8, 'normal', C.muted);
    text(`${c.coveragePct.toFixed(0)}% coverage`, M + CONTENT_W, y + 3.3, { align: 'right' });
    y += 7;
  }
  y += 2;

  // ---------- Segments ----------
  if (stats.segments.length > 1) {
    heading(`Breakdown by ${stats.segmentMinutes}-minute period`);
    table(
      [{ label: 'Period', w: 34 }, { label: 'Avg MFI', w: 28, align: 'right' }, { label: 'PERCLOS', w: 30, align: 'right' }, { label: 'Blinks/min', w: 30, align: 'right' }, { label: 'Harsh audio', w: 30, align: 'right' }, { label: 'Confidence', w: CONTENT_W - 152, align: 'right' }],
      stats.segments.map((sg) => [
        { text: `${sg.fromMin}-${sg.toMin} min` },
        { text: fmt(sg.avgMfi), color: levelColor(sg.avgMfi), bold: true },
        { text: sg.perclos === null ? '-' : `${(sg.perclos * 100).toFixed(1)}%` },
        { text: fmt(sg.blinkRate) },
        { text: fmt(sg.acoustic) },
        { text: sg.confidence === null ? '-' : `${(sg.confidence * 100).toFixed(0)}%`, color: C.muted },
      ]),
    );
  }

  // ---------- Reaction tests ----------
  if (stats.reactions.length) {
    heading('Reaction tests');
    table(
      [{ label: 'Time', w: 40 }, { label: 'Median', w: 30, align: 'right' }, { label: 'Mean', w: 30, align: 'right' }, { label: 'Lapses', w: 26, align: 'right' }, { label: 'False starts', w: 28, align: 'right' }, { label: 'vs baseline', w: CONTENT_W - 154, align: 'right' }],
      stats.reactions.map((t) => {
        const d = t.medianMs - (base ?? DEFAULT_REACTION_BASELINE_MS);
        return [
          { text: new Date(t.time).toLocaleTimeString() },
          { text: `${Math.round(t.medianMs)} ms`, bold: true },
          { text: `${Math.round(t.meanMs)} ms` },
          { text: String(t.lapses), color: t.lapses ? C.amber : C.ink },
          { text: String(t.falseStarts) },
          { text: `${d >= 0 ? '+' : ''}${Math.round(d)} ms`, color: d > 80 ? C.rose : d > 30 ? C.amber : C.teal },
        ];
      }),
    );
  }

  // ---------- Gaze heatmap ----------
  if (stats.gazeCount >= 10) {
    ensure(14 + 70); // keep the heading with its image
    heading('Where you looked (approximate)');
    const cw = 640, chh = 360;
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = chh;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      drawHeatmap(ctx, gaze, true);
      const iw = 120, ih = (iw * chh) / cw;
      ensure(ih + 10);
      doc.addImage(canvas.toDataURL('image/jpeg', 0.85), 'JPEG', M, y, iw, ih);
      font(8.5, 'normal', C.muted);
      const note = doc.splitTextToSize(ascii(
        `Webcam gaze estimate mapped to the browser window. Estimated error ~${fmt(stats.calibration?.gazeErrorPct ?? null)}% of the screen, so read it as rough areas, not exact points. Warmer = more time.`,
      ), CONTENT_W - iw - 6) as string[];
      doc.text(note, M + iw + 6, y + 4);
      y += ih + 6;
    }
  }

  // ---------- Data quality ----------
  heading('Data quality');
  table(
    [{ label: 'Item', w: 80 }, { label: 'Value', w: CONTENT_W - 80 }],
    [
      [{ text: 'Face visible', bold: true }, { text: fmt(stats.faceVisiblePct, 0, '% of measured time') }],
      [{ text: 'Looking below the screen (excluded)', bold: true }, { text: fmt(stats.lookingDownPct, 0, '% of measured time') }],
      [{ text: 'Lighting quality (avg)', bold: true }, { text: stats.avgLight === null ? '-' : `${(stats.avgLight * 100).toFixed(0)}%`, color: stats.avgLight !== null && stats.avgLight < 0.5 ? C.amber : C.ink }],
      [{ text: 'Face tracker speed (avg)', bold: true }, { text: fmt(stats.avgFps, 0, ' fps'), color: stats.avgFps !== null && stats.avgFps < 15 ? C.amber : C.ink }],
      [{ text: 'Calibration', bold: true }, { text: stats.calibration ? `yes${stats.calibration.closedLid === null ? ' (closed-eye level estimated)' : ' (closed-eye level measured)'}` : 'no (baseline estimated)' }],
      [{ text: 'Average confidence of the index', bold: true }, { text: stats.avgConfidence === null ? '-' : `${(stats.avgConfidence * 100).toFixed(0)}%` }],
    ],
  );

  // ---------- Method ----------
  heading('How to read this report');
  para('Fatigue index (MFI): a 0-100 blend of the signals above, weighted by how reliable each was at the time. 0-39 low, 40-69 elevated, 70+ high. It is smoothed over about 15 seconds.', 8.8);
  para('PERCLOS: share of time your eyes were at least 80% closed, measured on your own open-to-closed range from calibration. Your normal lid position is adjusted for where you look, and time spent looking well below the screen is excluded. It is one of the best-studied drowsiness measures.', 8.8);
  para('Reaction time: a short Psychomotor Vigilance Task. Slowing compared with your own rested baseline and lapses (>= 500 ms) are sensitive to sleepiness.', 8.8);
  para('Harsh audio: how loud the 2-4 kHz range was above your room\'s quiet level, weighted by how treble-heavy the sound was, averaged over about a minute. It is a comfort indicator, not a hearing-safety (SPL) measurement.', 8.8);
  y += 2;
  para('NeuroPulse is a wellbeing tool, not a medical device. It does not diagnose any condition. All processing happened in your browser and nothing was uploaded.', 8.2, C.muted);

  // ---------- Footer on every page ----------
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    color(C.faint, 'draw');
    doc.setLineWidth(0.2);
    doc.line(M, PAGE_H - 12, PAGE_W - M, PAGE_H - 12);
    font(7.5, 'normal', C.muted);
    text('NeuroPulse | wellbeing estimate, not a medical device', M, PAGE_H - 7);
    text(`Page ${i} of ${pages}`, PAGE_W - M, PAGE_H - 7, { align: 'right' });
  }
  return doc;
}

/** Vector line chart of MFI and harsh-audio exposure with level bands. */
function drawTimeline(doc: jsPDF, data: TelemetryDataPoint[], restTimes: number[], x: number, y: number, w: number, h: number) {
  const padL = 9, padB = 7;
  const px = x + padL, pw = w - padL, ph = h - padB;
  const yOf = (v: number) => y + ph - (Math.max(0, Math.min(100, v)) / 100) * ph;

  // Level bands
  doc.setFillColor(254, 242, 242);
  doc.rect(px, yOf(100), pw, yOf(MFI_LEVELS.severe) - yOf(100), 'F');
  doc.setFillColor(255, 251, 235);
  doc.rect(px, yOf(MFI_LEVELS.severe), pw, yOf(MFI_LEVELS.elevated) - yOf(MFI_LEVELS.severe), 'F');
  doc.setDrawColor(...C.faint);
  doc.setLineWidth(0.15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...C.muted);
  for (const g of [0, 25, 50, 75, 100]) {
    doc.line(px, yOf(g), px + pw, yOf(g));
    doc.text(String(g), px - 2, yOf(g) + 1, { align: 'right' });
  }

  if (data.length < 2) {
    doc.text('Not enough data for a timeline.', px + pw / 2, y + ph / 2, { align: 'center' });
    return;
  }
  const t0 = data[0].time, t1 = data[data.length - 1].time;
  const span = Math.max(1, t1 - t0);
  const xOf = (t: number) => px + ((t - t0) / span) * pw;

  // X axis ticks in minutes
  const totalMin = span / 60000;
  const step = [0.5, 1, 2, 5, 10, 15, 30, 60].find((s) => totalMin / s <= 8) ?? 60;
  for (let m = 0; m <= totalMin + 1e-6; m += step) {
    const tx = xOf(t0 + m * 60000);
    doc.line(tx, y + ph, tx, y + ph + 1);
    doc.text(`${Number.isInteger(m) ? m : m.toFixed(1)}`, tx, y + ph + 4, { align: 'center' });
  }
  doc.text('minutes', px + pw, y + ph + 6.5, { align: 'right' });

  // Downsample to at most ~400 points per line, averaging within buckets.
  const series = (get: (d: TelemetryDataPoint) => number | null) => {
    const buckets = Math.min(400, data.length);
    const pts: [number, number][] = [];
    for (let b = 0; b < buckets; b++) {
      const from = Math.floor((b * data.length) / buckets), to = Math.floor(((b + 1) * data.length) / buckets);
      let sum = 0, n = 0, tsum = 0;
      for (let i = from; i < to; i++) {
        const v = get(data[i]);
        if (v !== null) { sum += v; n++; tsum += data[i].time; }
      }
      if (n) pts.push([xOf(tsum / n), yOf(sum / n)]);
    }
    return pts;
  };
  const polyline = (pts: [number, number][], c: RGB, lw: number) => {
    if (pts.length < 2) return;
    doc.setDrawColor(...c);
    doc.setLineWidth(lw);
    for (let i = 1; i < pts.length; i++) doc.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
  };
  doc.setDrawColor(...C.rose);
  doc.setLineWidth(0.3);
  for (const rt of restTimes) {
    if (rt < t0 || rt > t1) continue;
    const rx = xOf(rt);
    for (let yy = y; yy < y + ph; yy += 2) doc.line(rx, yy, rx, Math.min(y + ph, yy + 1));
  }
  polyline(series((d) => d.acoustic), C.amber, 0.35);
  polyline(series((d) => d.mfi), C.teal, 0.7);

  doc.setDrawColor(...C.muted);
  doc.setLineWidth(0.25);
  doc.rect(px, y, pw, ph);
}

export function downloadReportPdf(stats: SessionStats, data: TelemetryDataPoint[], gaze: GazePoint[]) {
  const doc = buildReportPdf(stats, data, gaze);
  const day = stats.start ? new Date(stats.start).toISOString().slice(0, 10) : 'session';
  doc.save(`NeuroPulse_Report_${day}.pdf`);
}
