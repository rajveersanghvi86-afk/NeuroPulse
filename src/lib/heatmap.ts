import type { GazePoint } from './types';

// Gaze points are stored in viewport units (0..1) and may run slightly off-screen (-0.1..1.1).
const DOMAIN_MIN = -0.1;
const DOMAIN_MAX = 1.1;
const DOMAIN = DOMAIN_MAX - DOMAIN_MIN;
const GW = 96;
const GH = 54;

export interface GazeSummary {
  /** Share of on-screen gaze in each cell of a 3x3 grid, row by row (sums to 1). */
  zones: number[];
  /** Index of the most-viewed cell. */
  topZone: number;
  /** Percent of on-screen gaze in the middle cell. */
  centerPct: number;
  /** Percent of all gaze samples that fell outside the screen. */
  offPct: number;
  /** Mean gaze position, in screen units. */
  mean: { x: number; y: number };
  /** How scattered the gaze was: 'focused' | 'moderate' | 'wide'. */
  spread: 'focused' | 'moderate' | 'wide';
}

export function summarizeGaze(gaze: GazePoint[]): GazeSummary | null {
  if (gaze.length < 10) return null;
  const zones = new Array(9).fill(0);
  let on = 0, sx = 0, sy = 0;
  for (const p of gaze) {
    if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) continue;
    on++;
    sx += p.x;
    sy += p.y;
    zones[Math.min(2, Math.floor(p.y * 3)) * 3 + Math.min(2, Math.floor(p.x * 3))]++;
  }
  if (on === 0) return null;
  const mean = { x: sx / on, y: sy / on };
  let varSum = 0;
  for (const p of gaze) {
    if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) continue;
    varSum += (p.x - mean.x) ** 2 + (p.y - mean.y) ** 2;
  }
  const sd = Math.sqrt(varSum / on);
  const norm = zones.map((z) => z / on);
  return {
    zones: norm,
    topZone: norm.indexOf(Math.max(...norm)),
    centerPct: norm[4] * 100,
    offPct: ((gaze.length - on) / gaze.length) * 100,
    mean,
    spread: sd < 0.16 ? 'focused' : sd < 0.26 ? 'moderate' : 'wide',
  };
}

// Colour ramp: cool (little time) to hot (most time).
const RAMP: [number, [number, number, number]][] = [
  [0, [59, 130, 246]],
  [0.3, [20, 184, 166]],
  [0.55, [132, 204, 22]],
  [0.78, [245, 158, 11]],
  [1, [244, 63, 94]],
];

function rampColor(v: number): [number, number, number] {
  for (let i = 1; i < RAMP.length; i++) {
    if (v <= RAMP[i][0]) {
      const [a, ca] = RAMP[i - 1], [b, cb] = RAMP[i];
      const k = (v - a) / (b - a);
      return [ca[0] + (cb[0] - ca[0]) * k, ca[1] + (cb[1] - ca[1]) * k, ca[2] + (cb[2] - ca[2]) * k];
    }
  }
  return RAMP[RAMP.length - 1][1];
}

export interface HeatmapOptions {
  /** White background for print. */
  light?: boolean;
  emptyMessage?: string;
  /** Legend labels, e.g. ['less', 'more']. */
  legend?: [string, string];
}

/**
 * Draws a smooth gaze-density heatmap: a picture of the screen with a 3x3 grid showing the share
 * of time in each area, a marker at the average gaze position, and a colour legend.
 */
export function drawHeatmap(ctx: CanvasRenderingContext2D, gaze: GazePoint[], opts: HeatmapOptions = {}) {
  const { light = false, emptyMessage = '', legend } = opts;
  const w = ctx.canvas.width, h = ctx.canvas.height;
  const ink = light ? '15,23,42' : '255,255,255';
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = light ? '#F8FAFC' : '#0B1220';
  ctx.fillRect(0, 0, w, h);

  // The screen rectangle inside the plot area (the margin shows gaze that went off-screen).
  const X = (x: number) => ((x - DOMAIN_MIN) / DOMAIN) * w;
  const Y = (y: number) => ((y - DOMAIN_MIN) / DOMAIN) * h;
  const sx0 = X(0), sy0 = Y(0), sw = X(1) - sx0, sh = Y(1) - sy0;
  ctx.fillStyle = light ? '#FFFFFF' : '#111A2E';
  ctx.fillRect(sx0, sy0, sw, sh);

  const summary = summarizeGaze(gaze);
  if (!summary) {
    ctx.strokeStyle = `rgba(${ink},0.25)`;
    ctx.strokeRect(sx0, sy0, sw, sh);
    ctx.fillStyle = `rgba(${ink},0.55)`;
    ctx.font = `${Math.round(h / 20)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emptyMessage, w / 2, h / 2);
    return;
  }

  // Density grid with a Gaussian splat per sample.
  const grid = new Float32Array(GW * GH);
  const R = 4, SIGMA2 = 2 * 1.8 * 1.8;
  for (const p of gaze) {
    const gx = ((p.x - DOMAIN_MIN) / DOMAIN) * GW, gy = ((p.y - DOMAIN_MIN) / DOMAIN) * GH;
    const cx = Math.floor(gx), cy = Math.floor(gy);
    for (let dy = -R; dy <= R; dy++) {
      const y = cy + dy;
      if (y < 0 || y >= GH) continue;
      for (let dx = -R; dx <= R; dx++) {
        const x = cx + dx;
        if (x < 0 || x >= GW) continue;
        const ddx = x + 0.5 - gx, ddy = y + 0.5 - gy;
        grid[y * GW + x] += Math.exp(-(ddx * ddx + ddy * ddy) / SIGMA2);
      }
    }
  }
  let max = 0;
  for (const v of grid) if (v > max) max = v;

  // Paint the grid into a small image, then scale it up with smoothing for soft edges.
  const small = document.createElement('canvas');
  small.width = GW;
  small.height = GH;
  const sctx = small.getContext('2d')!;
  const img = sctx.createImageData(GW, GH);
  for (let i = 0; i < grid.length; i++) {
    const v = Math.pow(grid[i] / max, 0.6); // lift the quieter areas so they stay visible
    const [r, g, b] = rampColor(v);
    img.data[i * 4] = r;
    img.data[i * 4 + 1] = g;
    img.data[i * 4 + 2] = b;
    img.data[i * 4 + 3] = v < 0.04 ? 0 : Math.min(235, 60 + v * 220);
  }
  sctx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(small, 0, 0, w, h);

  // Screen outline and 3x3 grid.
  ctx.strokeStyle = `rgba(${ink},0.55)`;
  ctx.lineWidth = Math.max(1.5, w / 400);
  ctx.strokeRect(sx0, sy0, sw, sh);
  ctx.strokeStyle = `rgba(${ink},0.2)`;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 5]);
  for (let i = 1; i < 3; i++) {
    ctx.beginPath(); ctx.moveTo(sx0 + (sw * i) / 3, sy0); ctx.lineTo(sx0 + (sw * i) / 3, sy0 + sh); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx0, sy0 + (sh * i) / 3); ctx.lineTo(sx0 + sw, sy0 + (sh * i) / 3); ctx.stroke();
  }
  ctx.setLineDash([]);

  // Share of time per area.
  const fs = Math.round(h / 22);
  ctx.font = `bold ${fs}px sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  summary.zones.forEach((z, i) => {
    const zx = sx0 + (sw * (i % 3)) / 3 + fs * 0.4, zy = sy0 + (sh * Math.floor(i / 3)) / 3 + fs * 0.35;
    const label = `${Math.round(z * 100)}%`;
    ctx.fillStyle = light ? 'rgba(255,255,255,0.8)' : 'rgba(11,18,32,0.65)';
    ctx.fillRect(zx - fs * 0.2, zy - fs * 0.15, ctx.measureText(label).width + fs * 0.4, fs * 1.25);
    ctx.fillStyle = i === summary.topZone ? (light ? '#0F766E' : '#5EEAD4') : `rgba(${ink},0.85)`;
    ctx.fillText(label, zx, zy);
  });

  // Average gaze position.
  const mx = X(summary.mean.x), my = Y(summary.mean.y), r = h / 30;
  ctx.strokeStyle = light ? '#0F172A' : '#FFFFFF';
  ctx.lineWidth = Math.max(1.5, w / 350);
  ctx.beginPath(); ctx.arc(mx, my, r, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(mx - r * 1.6, my); ctx.lineTo(mx + r * 1.6, my); ctx.moveTo(mx, my - r * 1.6); ctx.lineTo(mx, my + r * 1.6); ctx.stroke();

  // Legend.
  if (legend) {
    const lw = w * 0.2, lh = h / 45, lx = w - lw - w * 0.02, ly = h - lh - fs * 0.5;
    const grad = ctx.createLinearGradient(lx, 0, lx + lw, 0);
    RAMP.forEach(([stop, c]) => grad.addColorStop(stop, `rgb(${c[0]},${c[1]},${c[2]})`));
    ctx.fillStyle = grad;
    ctx.fillRect(lx, ly, lw, lh);
    ctx.font = `${Math.round(fs * 0.75)}px sans-serif`;
    ctx.fillStyle = `rgba(${ink},0.7)`;
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'left';
    ctx.fillText(legend[0], lx, ly - 2);
    ctx.textAlign = 'right';
    ctx.fillText(legend[1], lx + lw, ly - 2);
  }
}
