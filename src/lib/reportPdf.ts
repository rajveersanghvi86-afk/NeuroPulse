import jsPDF from 'jspdf';
import type { GazePoint, TelemetryDataPoint } from './types';
import type { SessionStats } from './sessionStats';
import { MFI_LEVELS, DEFAULT_REACTION_BASELINE_MS } from './mfiCalculator';
import { drawHeatmap } from './heatmap';
import { t, currentLocale, isRtl } from '../i18n';
import type { TKey } from '../i18n';

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
  headerSub: [203, 213, 225] as RGB,
};

const PAGE_W = 210, PAGE_H = 297, M = 16, CONTENT_W = PAGE_W - 2 * M;
const PT_MM = 0.352778; // one point in millimetres
const K = 3; // canvas pixels per point for text drawn by the browser
const CANVAS_FONT =
  '"Helvetica Neue", Helvetica, Arial, "Noto Sans", "Noto Sans Devanagari", "Nirmala UI", "Noto Sans Arabic", ' +
  '"Noto Sans CJK SC", "Noto Sans CJK JP", "PingFang SC", "Hiragino Sans", "Microsoft YaHei", "Yu Gothic", sans-serif';

/** Swap typographic characters the built-in PDF fonts lack for plain ones. */
const latinize = (s: string) =>
  s.replace(/[–—]/g, '-').replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/≈/g, '~')
    .replace(/[‘’]/g, "'").replace(/[“”„]/g, '"').replace(/…/g, '...').replace(/✓/g, '');

/** The built-in PDF fonts only cover Western European characters. Anything else is drawn by the browser. */
// eslint-disable-next-line no-control-regex
const needsBrowserText = (s: string) => /[^\u0000-ÿ]/.test(s);

const fmt = (v: number | null | undefined, d = 0, suffix = '') => (v === null || v === undefined || !Number.isFinite(v) ? '-' : `${v.toFixed(d)}${suffix}`);
const fmtDur = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.round(s % 60);
  return h ? `${h} h ${m} min` : m ? `${m} min ${sec} s` : `${sec} s`;
};
const levelColor = (v: number | null): RGB => (v === null ? C.muted : v >= MFI_LEVELS.severe ? C.rose : v >= MFI_LEVELS.elevated ? C.amber : C.teal);
type Status = { text: string; color: RGB };
const statusOf = (ok: boolean, warn: boolean): Status =>
  ok ? { text: t('st_normal'), color: C.teal } : warn ? { text: t('st_watch'), color: C.amber } : { text: t('st_high'), color: C.rose };

type Align = 'left' | 'center' | 'right';
type Cell = { text: string; color?: RGB; bold?: boolean };
type Col = { label: string; w: number; align?: Align };

export function buildReportPdf(stats: SessionStats, data: TelemetryDataPoint[], gaze: GazePoint[]): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const rtl = isRtl();
  const locale = currentLocale();
  let y = M;

  // ---------- text engine ----------
  const cur = { size: 10, bold: false, color: C.ink };
  const measureCtx = document.createElement('canvas').getContext('2d')!;
  const canvasFont = () => `${cur.bold ? 'bold ' : ''}${cur.size * K}px ${CANVAS_FONT}`;
  const imageCache = new Map<string, { data: string; alias: string; wpx: number; hpx: number }>();

  const setSize = (size: number) => {
    cur.size = size;
    doc.setFontSize(size);
  };
  const font = (size: number, style: 'normal' | 'bold' = 'normal', color: RGB = C.ink) => {
    cur.bold = style === 'bold';
    cur.color = color;
    doc.setFont('helvetica', style);
    doc.setTextColor(...color);
    setSize(size);
  };

  /** Width of a string in mm at the current font. */
  const widthOf = (s: string) => {
    const plain = latinize(s);
    if (!needsBrowserText(plain)) return doc.getTextWidth(plain);
    measureCtx.font = canvasFont();
    return (measureCtx.measureText(s).width / K) * PT_MM;
  };

  /** Draws text the built-in fonts can't, by letting the browser render it and embedding the result. */
  const browserText = (s: string, x: number, yy: number, align: Align) => {
    const key = `${s}|${cur.size}|${cur.bold}|${cur.color.join()}`;
    let img = imageCache.get(key);
    if (!img) {
      measureCtx.font = canvasFont();
      const wpx = Math.ceil(measureCtx.measureText(s).width) + 2 * K;
      const hpx = Math.ceil(cur.size * K * 1.75);
      const cv = document.createElement('canvas');
      cv.width = wpx;
      cv.height = hpx;
      const g = cv.getContext('2d')!;
      g.font = canvasFont();
      g.fillStyle = `rgb(${cur.color.join()})`;
      g.textBaseline = 'alphabetic';
      g.direction = rtl ? 'rtl' : 'ltr';
      g.textAlign = 'left';
      g.fillText(s, K, cur.size * K * 1.25);
      img = { data: cv.toDataURL('image/png'), alias: `txt${imageCache.size}`, wpx, hpx };
      imageCache.set(key, img);
    }
    const wmm = (img.wpx / K) * PT_MM, hmm = (img.hpx / K) * PT_MM, pad = PT_MM;
    const x0 = align === 'right' ? x - wmm + pad : align === 'center' ? x - wmm / 2 : x - pad;
    doc.addImage(img.data, 'PNG', x0, yy - 1.25 * cur.size * PT_MM, wmm, hmm, img.alias, 'FAST');
  };

  /** Draws one line. With maxW, the font shrinks until the text fits. */
  const text = (s: string, x: number, yy: number, opts: { align?: Align; maxW?: number } = {}) => {
    if (!s) return;
    const original = cur.size;
    if (opts.maxW) while (widthOf(s) > opts.maxW && cur.size > 4.5) setSize(cur.size * 0.94);
    const plain = latinize(s);
    if (!needsBrowserText(plain)) doc.text(plain, x, yy, { align: opts.align ?? 'left' });
    else browserText(s, x, yy, opts.align ?? 'left');
    if (cur.size !== original) setSize(original);
  };

  /** Splits text into lines no wider than maxW (handles languages without spaces). */
  const wrap = (s: string, maxW: number): string[] => {
    const plain = latinize(s);
    if (!needsBrowserText(plain)) return doc.splitTextToSize(plain, maxW) as string[];
    const noSpaces = /[぀-ヿ㐀-鿿]/.test(s);
    const tokens = noSpaces ? Array.from(s) : s.split(' ');
    const sep = noSpaces ? '' : ' ';
    const lines: string[] = [];
    let line = '';
    for (const tok of tokens) {
      const next = line ? line + sep + tok : tok;
      if (line && widthOf(next) > maxW) {
        lines.push(line);
        line = tok;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
    return lines;
  };

  // ---------- layout helpers ----------
  const fill = (c: RGB) => doc.setFillColor(...c);
  const stroke = (c: RGB) => doc.setDrawColor(...c);
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
    text(s, rtl ? M + CONTENT_W : M, y, { maxW: CONTENT_W, align: rtl ? 'right' : 'left' });
    stroke(C.teal);
    doc.setLineWidth(0.6);
    if (rtl) doc.line(M + CONTENT_W - 12, y + 1.8, M + CONTENT_W, y + 1.8);
    else doc.line(M, y + 1.8, M + 12, y + 1.8);
    y += 7;
  };
  /** A wrapped block of text; right-aligned for right-to-left languages. */
  const block = (s: string, size: number, color: RGB, indent: number, lineH: number) => {
    font(size, 'normal', color);
    const lines = wrap(s, CONTENT_W - indent);
    ensure(lines.length * lineH + 1);
    lines.forEach((ln, i) => {
      if (rtl) text(ln, M + CONTENT_W - indent, y + i * lineH, { align: 'right' });
      else text(ln, M + indent, y + i * lineH);
    });
    return lines.length * lineH;
  };
  const para = (s: string, size = 9.5, color: RGB = C.ink) => {
    y += block(s, size, color, 0, size * 0.45) + 1.5;
  };
  const bullet = (s: string) => {
    const h = block(s, 9.5, C.ink, 5, 4.3);
    fill(C.teal);
    doc.circle(rtl ? M + CONTENT_W - 1.5 : M + 1.5, y - 1.2, 0.8, 'F');
    y += h + 1.2;
  };

  const table = (cols: Col[], rows: Cell[][]) => {
    const rh = 6.4;
    const cellText = (s: string, c: Col, x: number) => {
      const tx = c.align === 'right' ? x + c.w - 2 : c.align === 'center' ? x + c.w / 2 : x + 2;
      text(s, tx, y + 4.3, { align: c.align ?? 'left', maxW: c.w - 3 });
    };
    const drawHeader = () => {
      fill(C.ink);
      doc.rect(M, y, CONTENT_W, rh, 'F');
      let x = M;
      for (const c of cols) {
        font(8.5, 'bold', C.white);
        cellText(c.label, c, x);
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
        fill(C.panel);
        doc.rect(M, y, CONTENT_W, rh, 'F');
      }
      let x = M;
      row.forEach((cell, j) => {
        font(8.8, cell.bold ? 'bold' : 'normal', cell.color ?? C.ink);
        cellText(cell.text, cols[j], x);
        x += cols[j].w;
      });
      y += rh;
    });
    stroke(C.faint);
    doc.setLineWidth(0.2);
    doc.line(M, y, M + CONTENT_W, y);
    y += 4;
  };

  /** Vector line chart of MFI and harsh-audio exposure with level bands and eye-break markers. */
  const timeline = (x: number, top: number, w: number, h: number) => {
    const padL = 9, padB = 7;
    const px = x + padL, pw = w - padL, ph = h - padB;
    const yOf = (v: number) => top + ph - (Math.max(0, Math.min(100, v)) / 100) * ph;

    doc.setFillColor(254, 242, 242);
    doc.rect(px, yOf(100), pw, yOf(MFI_LEVELS.severe) - yOf(100), 'F');
    doc.setFillColor(255, 251, 235);
    doc.rect(px, yOf(MFI_LEVELS.severe), pw, yOf(MFI_LEVELS.elevated) - yOf(MFI_LEVELS.severe), 'F');
    stroke(C.faint);
    doc.setLineWidth(0.15);
    font(7, 'normal', C.muted);
    for (const g of [0, 25, 50, 75, 100]) {
      doc.line(px, yOf(g), px + pw, yOf(g));
      text(String(g), px - 2, yOf(g) + 1, { align: 'right' });
    }
    if (data.length < 2) {
      text(t('p_noTimeline'), px + pw / 2, top + ph / 2, { align: 'center' });
      return;
    }
    const t0 = data[0].time, t1 = data[data.length - 1].time;
    const span = Math.max(1, t1 - t0);
    const xOf = (time: number) => px + ((time - t0) / span) * pw;

    const totalMin = span / 60000;
    const step = [0.5, 1, 2, 5, 10, 15, 30, 60].find((s) => totalMin / s <= 8) ?? 60;
    for (let m = 0; m <= totalMin + 1e-6; m += step) {
      const tx = xOf(t0 + m * 60000);
      doc.line(tx, top + ph, tx, top + ph + 1);
      text(`${Number.isInteger(m) ? m : m.toFixed(1)}`, tx, top + ph + 4, { align: 'center' });
    }
    text(t('p_minutes'), px + pw, top + ph + 6.8, { align: 'right' });

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
      stroke(c);
      doc.setLineWidth(lw);
      for (let i = 1; i < pts.length; i++) doc.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
    };
    stroke(C.rose);
    doc.setLineWidth(0.3);
    for (const e of stats.restEvents) {
      if (e.time < t0 || e.time > t1) continue;
      const rx = xOf(e.time);
      for (let yy = top; yy < top + ph; yy += 2) doc.line(rx, yy, rx, Math.min(top + ph, yy + 1));
    }
    polyline(series((d) => d.acoustic), C.amber, 0.35);
    polyline(series((d) => d.mfi), C.teal, 0.7);
    stroke(C.muted);
    doc.setLineWidth(0.25);
    doc.rect(px, top, pw, ph);
  };

  // ---------- header band ----------
  fill(C.ink);
  doc.rect(0, 0, PAGE_W, 34, 'F');
  font(20, 'bold', C.white);
  text('NeuroPulse', M, 15);
  const brandW = widthOf('NeuroPulse');
  font(20, 'bold', C.teal);
  text(t('p_title'), M + brandW + 3, 15, { maxW: CONTENT_W - brandW - 3 });
  font(9.5, 'normal', C.headerSub);
  const startStr = stats.start ? new Date(stats.start).toLocaleString(locale) : '-';
  const endStr = stats.end ? new Date(stats.end).toLocaleTimeString(locale) : '-';
  const yesNo = t(stats.calibration ? 'yes' : 'no');
  text(`${startStr} - ${endStr}   |   ${t('p_length')}: ${fmtDur(stats.wallSeconds)}   |   ${t('p_measured')}: ${fmtDur(stats.measuredSeconds)}`, M, 24, { maxW: CONTENT_W });
  text(
    `${t('p_conf')}: ${fmt(stats.avgConfidence === null ? null : stats.avgConfidence * 100, 0, '%')}   |   ${t('p_calibrated')}: ${yesNo}   |   ${t('p_generated')}: ${new Date().toLocaleString(locale)}`,
    M, 29, { maxW: CONTENT_W },
  );
  y = 44;

  // ---------- overall result ----------
  const lvl = stats.level;
  const lvlColor = levelColor(stats.avgMfi);
  const lvlKey: Record<typeof lvl, TKey> = { unknown: 'p_lvUnknown', nominal: 'p_lvLow', elevated: 'p_lvMod', severe: 'p_lvHigh' };
  fill(C.panel);
  doc.roundedRect(M, y, CONTENT_W, 30, 2, 2, 'F');
  fill(lvlColor);
  doc.rect(M, y, 2.2, 30, 'F');
  font(9, 'bold', C.muted);
  text(t('p_overall'), M + 7, y + 7, { maxW: 66 });
  font(18, 'bold', lvlColor);
  text(t(lvlKey[lvl]), M + 7, y + 16, { maxW: 66 });
  const rank = { unknown: 0, nominal: 1, elevated: 2, severe: 3 };
  if (rank[stats.endLevel] > rank[lvl]) {
    font(9, 'bold', levelColor(stats.endMfi));
    text(t(stats.endLevel === 'severe' ? 'p_riseHigh' : 'p_riseElev', { v: fmt(stats.endMfi) }), M + 7, y + 24, { maxW: 66 });
  } else {
    font(9, 'normal', C.muted);
    text(t('p_basedOn'), M + 7, y + 24, { maxW: 66 });
  }
  const kpis: [string, string][] = [
    [t('p_avgMfi'), fmt(stats.avgMfi)],
    [t('p_peakMfi'), fmt(stats.peakMfi)],
    [t('p_timeAbove', { v: MFI_LEVELS.elevated }), fmt(stats.pctElevated, 0, '%')],
    [t('p_timeAbove', { v: MFI_LEVELS.severe }), fmt(stats.pctSevere, 0, '%')],
  ];
  kpis.forEach(([k, v], i) => {
    const x = M + 78 + i * 26;
    font(15, 'bold', i === 0 ? lvlColor : C.ink);
    text(v, x, y + 15);
    font(7.5, 'normal', C.muted);
    text(k, x, y + 21, { maxW: 24 });
  });
  y += 38;

  // ---------- recommendations ----------
  heading(t('p_recs'));
  stats.advice.forEach(bullet);
  y += 2;

  // ---------- timeline ----------
  ensure(14 + 72);
  heading(t('p_timeline'));
  timeline(M, y, CONTENT_W, 58);
  y += 67;
  const legend: [RGB, string][] = [[C.teal, t('d_mfi')], [C.amber, t('c_acoustic')], [C.rose, t('p_legendBreak')]];
  legend.forEach(([c, label], i) => {
    const lx = M + i * (CONTENT_W / 3);
    fill(c);
    doc.rect(lx, y - 2.4, 5, 1.6, 'F');
    font(8, 'normal', C.muted);
    text(label, lx + 7, y - 1, { maxW: CONTENT_W / 3 - 9 });
  });
  y += 4;

  // ---------- key measurements ----------
  ensure(14 + 4 * 6.4);
  heading(t('p_key'));
  const r = stats.reactions[stats.reactions.length - 1];
  const base = stats.reactionBaselineMs;
  const baseMs = base ?? DEFAULT_REACTION_BASELINE_MS;
  const perclos = stats.avgPerclos;
  const rows: Cell[][] = [];
  const addRow = (name: string, value: string, typical: string, st: Status | null) =>
    rows.push([{ text: name, bold: true }, { text: value }, { text: typical, color: C.muted }, st ? { text: st.text, color: st.color, bold: true } : { text: '-', color: C.muted }]);

  addRow(t('row_perclosAvg'), perclos === null ? '-' : `${(perclos * 100).toFixed(1)}%`, t('typ_under', { v: '8%' }),
    perclos === null ? null : statusOf(perclos < 0.08, perclos < 0.15));
  addRow(t('row_perclosWorst'), stats.peakPerclos === null ? '-' : `${(stats.peakPerclos * 100).toFixed(1)}%`, t('typ_under', { v: '15%' }),
    stats.peakPerclos === null ? null : statusOf(stats.peakPerclos < 0.15, stats.peakPerclos < 0.25));
  addRow(t('h_blinks'), fmt(stats.totalBlinks), '-', null);
  addRow(t('row_rate'), fmt(stats.avgBlinkRate, 0, ' / min'), '10-25 / min',
    stats.avgBlinkRate === null ? null : statusOf(stats.avgBlinkRate >= 8 && stats.avgBlinkRate <= 30, stats.avgBlinkRate >= 5));
  addRow(t('row_blinkDur'), fmt(stats.medianBlinkMs, 0, ' ms'), '80-180 ms',
    stats.medianBlinkMs === null ? null : statusOf(stats.medianBlinkMs <= 200, stats.medianBlinkMs <= 300));
  addRow(t('row_long'), fmt(stats.totalLongClosures), '0-1',
    stats.totalLongClosures === null ? null : statusOf(stats.totalLongClosures <= 1, stats.totalLongClosures <= 4));
  addRow(t('row_open'), fmt(stats.avgOpenness === null ? null : stats.avgOpenness * 100, 0, '%'), '90-100%',
    stats.avgOpenness === null ? null : statusOf(stats.avgOpenness >= 0.9, stats.avgOpenness >= 0.75));
  addRow(t('row_rt'), r ? `${Math.round(r.medianMs)} ms (${t('row_lapses', { n: r.lapses })})` : t('row_notTaken'),
    `${t('row_baseline', { v: Math.round(baseMs) })}${base ? '' : ` ${t('row_default')}`}`,
    r ? statusOf(r.medianMs - baseMs <= 30 && r.lapses === 0, r.medianMs - baseMs <= 80 && r.lapses <= 1) : null);
  addRow(t('row_audio'), stats.avgAcoustic === null ? '-' : `${fmt(stats.avgAcoustic)} / ${fmt(stats.peakAcoustic)}`, t('typ_under', { v: 30 }),
    stats.avgAcoustic === null ? null : statusOf(stats.avgAcoustic < 30, stats.avgAcoustic < 55));
  addRow(t('row_sound'), fmt(stats.soundPresentPct, 0, '%'), '-', null);
  addRow(t('row_breaks'), `${stats.restEvents.length} ${t('row_forFatigue', { n: stats.restEvents.filter((e) => e.reason === 'fatigue').length })}`, t('typ_per20'), null);
  table([{ label: t('p_measure'), w: 74 }, { label: t('p_yours'), w: 40 }, { label: t('p_typical'), w: 38 }, { label: t('p_status'), w: CONTENT_W - 152, align: 'center' }], rows);

  // ---------- what drove it ----------
  ensure(14 + 20);
  heading(t('p_drivers'));
  para(t('p_driversNote'), 8.5, C.muted);
  y += 1;
  for (const c of stats.components) {
    ensure(8);
    font(9, 'normal');
    text(c.label, M, y + 3.2, { maxW: 50 });
    const bx = M + 52, bw = 86;
    fill(C.faint);
    doc.roundedRect(bx, y, bw, 4.2, 1, 1, 'F');
    if (c.avg !== null) {
      fill(levelColor(c.avg));
      doc.roundedRect(bx, y, Math.max(1.5, (bw * c.avg) / 100), 4.2, 1, 1, 'F');
    }
    font(9, 'bold', c.avg === null ? C.muted : C.ink);
    text(c.avg === null ? t('na') : c.avg.toFixed(0), bx + bw + 3, y + 3.3, { maxW: 9 });
    font(8, 'normal', C.muted);
    text(t('p_coverage', { v: c.coveragePct.toFixed(0) }), M + CONTENT_W, y + 3.3, { align: 'right', maxW: 26 });
    y += 7;
  }
  y += 2;

  // ---------- per-period breakdown ----------
  if (stats.segments.length > 1) {
    ensure(14 + 4 * 6.4);
    heading(t('p_byPeriod', { n: stats.segmentMinutes }));
    table(
      [{ label: t('p_period'), w: 34 }, { label: 'MFI', w: 24, align: 'right' }, { label: 'PERCLOS', w: 28, align: 'right' }, { label: t('h_bpm'), w: 30, align: 'right' },
        { label: t('p_harsh'), w: 32, align: 'right' }, { label: t('p_conf'), w: CONTENT_W - 148, align: 'right' }],
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

  // ---------- reaction tests ----------
  if (stats.reactions.length) {
    ensure(14 + 3 * 6.4);
    heading(t('p_rtests'));
    table(
      [{ label: t('p_time'), w: 30 }, { label: t('p_median'), w: 26, align: 'right' }, { label: t('p_mean'), w: 26, align: 'right' }, { label: t('p_lapses'), w: 26, align: 'right' },
        { label: t('p_false'), w: 30, align: 'right' }, { label: t('p_vsBase'), w: CONTENT_W - 138, align: 'right' }],
      stats.reactions.map((rt) => {
        const d = rt.medianMs - baseMs;
        return [
          { text: new Date(rt.time).toLocaleTimeString(locale) },
          { text: `${Math.round(rt.medianMs)} ms`, bold: true },
          { text: `${Math.round(rt.meanMs)} ms` },
          { text: String(rt.lapses), color: rt.lapses ? C.amber : C.ink },
          { text: String(rt.falseStarts) },
          { text: `${d >= 0 ? '+' : ''}${Math.round(d)} ms`, color: d > 80 ? C.rose : d > 30 ? C.amber : C.teal },
        ];
      }),
    );
  }

  // ---------- gaze heatmap ----------
  const gs = stats.gazeSummary;
  if (gs) {
    const cw = 960, chh = 540, iw = 112, ih = (iw * chh) / cw;
    ensure(14 + ih + 6);
    heading(t('p_where'));
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = chh;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      drawHeatmap(ctx, gaze, { light: true, legend: [t('hm_less'), t('hm_more')] });
      doc.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', M, y, iw, ih);
      const colX = M + iw + 5, colW = CONTENT_W - iw - 5;
      let ty = y + 4;
      const side = (s: string, size: number, color: RGB, bold = false) => {
        font(size, bold ? 'bold' : 'normal', color);
        for (const ln of wrap(s, colW)) {
          text(ln, rtl ? colX + colW : colX, ty, { align: rtl ? 'right' : 'left' });
          ty += size * 0.47;
        }
        ty += 1.6;
      };
      const spreadKey: Record<typeof gs.spread, TKey> = { focused: 'hm_focused', moderate: 'hm_moderate', wide: 'hm_wide' };
      side(t('hm_top', { v: t(`z_${gs.topZone}` as TKey) }), 9, C.ink, true);
      side(t('hm_center', { v: gs.centerPct.toFixed(0) }), 9, C.ink);
      side(t('hm_off', { v: gs.offPct.toFixed(0) }), 9, C.ink);
      side(t('hm_spread', { v: t(spreadKey[gs.spread]) }), 9, C.ink);
      ty += 1;
      const err = stats.calibration?.gazeErrorPct;
      side(t('p_gazeNote', { v: err != null ? `~${err.toFixed(0)}%` : '10-20%' }), 7.8, C.muted);
      y += Math.max(ih, ty - y) + 6;
    }
  }

  // ---------- data quality ----------
  ensure(14 + 7 * 6.4); // keep the heading with its table
  heading(t('p_quality'));
  const cal = stats.calibration;
  table(
    [{ label: t('p_item'), w: 80 }, { label: t('p_value'), w: CONTENT_W - 80 }],
    [
      [{ text: t('p_faceVisible'), bold: true }, { text: stats.faceVisiblePct === null ? '-' : t('q_ofMeasured', { v: stats.faceVisiblePct.toFixed(0) }) }],
      [{ text: t('p_lookBelow'), bold: true }, { text: stats.lookingDownPct === null ? '-' : t('q_ofMeasured', { v: stats.lookingDownPct.toFixed(0) }) }],
      [{ text: t('p_lightQ'), bold: true }, { text: stats.avgLight === null ? '-' : `${(stats.avgLight * 100).toFixed(0)}%`, color: stats.avgLight !== null && stats.avgLight < 0.5 ? C.amber : C.ink }],
      [{ text: t('h_speed'), bold: true }, { text: fmt(stats.avgFps, 0, ' fps'), color: stats.avgFps !== null && stats.avgFps < 15 ? C.amber : C.ink }],
      [{ text: t('p_calibrated'), bold: true }, { text: t(cal ? (cal.closedLid === null ? 'q_calEst' : 'q_calMeasured') : 'q_calNo') }],
      [{ text: t('q_conf'), bold: true }, { text: stats.avgConfidence === null ? '-' : `${(stats.avgConfidence * 100).toFixed(0)}%` }],
    ],
  );

  // ---------- how to read ----------
  ensure(14 + 16);
  heading(t('p_howTo'));
  para(t('how_mfi'), 8.8);
  para(t('how_perclos'), 8.8);
  para(t('how_rt'), 8.8);
  para(t('how_audio'), 8.8);
  y += 2;
  para(`${t('p_disc')} ${t('p_private')}`, 8.2, C.muted);

  // ---------- footer on every page ----------
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    stroke(C.faint);
    doc.setLineWidth(0.2);
    doc.line(M, PAGE_H - 12, PAGE_W - M, PAGE_H - 12);
    font(7.5, 'normal', C.muted);
    text(t('p_footer'), M, PAGE_H - 7, { maxW: CONTENT_W - 40 });
    text(t('p_page', { a: i, b: pages }), PAGE_W - M, PAGE_H - 7, { align: 'right', maxW: 36 });
  }
  return doc;
}

export function downloadReportPdf(stats: SessionStats, data: TelemetryDataPoint[], gaze: GazePoint[]) {
  const doc = buildReportPdf(stats, data, gaze);
  const day = stats.start ? new Date(stats.start).toISOString().slice(0, 10) : 'session';
  doc.save(`NeuroPulse_Report_${day}.pdf`);
}
