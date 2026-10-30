import type { GazePoint } from './types';

/** Draws a gaze density heatmap. `light` uses a white background (for the PDF). */
export function drawHeatmap(ctx: CanvasRenderingContext2D, gaze: GazePoint[], light = false, emptyMessage = 'Not enough gaze data.') {
  const w = ctx.canvas.width, h = ctx.canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = light ? '#FFFFFF' : '#0F172A';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = light ? 'rgba(15,23,42,0.08)' : 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= w; i += w / 16) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke(); }
  for (let j = 0; j <= h; j += h / 9) { ctx.beginPath(); ctx.moveTo(0, j); ctx.lineTo(w, j); ctx.stroke(); }

  if (gaze.length < 10) {
    ctx.fillStyle = light ? 'rgba(15,23,42,0.5)' : 'rgba(255,255,255,0.5)';
    ctx.font = `${Math.round(h / 18)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(emptyMessage, w / 2, h / 2);
    return;
  }
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
  let max = 0;
  for (const v of grid) if (v > max) max = v;
  const cw = w / gw, ch = h / gh;
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    const v = grid[y * gw + x] / max;
    if (v < 0.03) continue;
    const hue = 170 - 170 * v; // teal -> red
    ctx.fillStyle = `hsla(${hue}, 85%, ${light ? 48 : 55}%, ${0.15 + 0.7 * v})`;
    ctx.fillRect(x * cw, y * ch, cw + 0.5, ch + 0.5);
  }
  ctx.strokeStyle = light ? 'rgba(15,23,42,0.35)' : 'rgba(255,255,255,0.25)';
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
}
