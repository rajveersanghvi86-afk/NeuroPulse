// Webcam gaze mapping, fitted from the 9-point calibration.
//
// Features: iris position inside each eye (horizontal and vertical, averaged over both eyes)
// plus head yaw/pitch relative to the calibration pose. We fit a ridge-regularised linear map
// to screen x and y. A linear model is used on purpose: with only 9 targets, higher-order
// models fit the calibration points perfectly and then extrapolate badly.

export interface GazeFeatures {
  h: number;
  v: number;
  yaw: number; // degrees, relative to the calibration pose
  pitch: number;
}

export interface GazeSample extends GazeFeatures {
  point: number; // calibration target index
  tx: number; // target 0-1
  ty: number;
}

export interface GazeModel {
  mean: number[];
  std: number[];
  wx: number[];
  wy: number[];
}

// Minimum spread used for normalisation, so a feature that barely moved during calibration
// (e.g. head yaw when the user kept still) can't get a huge coefficient from noise.
const STD_FLOOR = [0.01, 0.01, 3, 3];

const raw = (f: GazeFeatures) => [f.h, f.v, f.yaw, f.pitch];

function design(f: GazeFeatures, m: GazeModel | { mean: number[]; std: number[] }): number[] {
  const r = raw(f);
  return [1, ...r.map((x, i) => (x - m.mean[i]) / m.std[i])];
}

/** Solve A x = b with Gaussian elimination and partial pivoting. */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const piv = M[c][c] || 1e-12;
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / piv;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / (M[r][r] || 1e-12);
  }
  return x;
}

export function fitGazeModel(samples: GazeSample[], lambdaPerSample = 0.02): GazeModel | null {
  if (samples.length < 10) return null;
  const rows = samples.map(raw);
  const d = rows[0].length;
  const mean = Array.from({ length: d }, (_, i) => rows.reduce((a, r) => a + r[i], 0) / rows.length);
  const std = Array.from({ length: d }, (_, i) => {
    const v = rows.reduce((a, r) => a + (r[i] - mean[i]) ** 2, 0) / rows.length;
    return Math.max(Math.sqrt(v), STD_FLOOR[i]);
  });
  const norm = { mean, std };
  const X = samples.map(s => design(s, norm));
  const p = X[0].length;
  const lambda = lambdaPerSample * samples.length;

  const XtX = Array.from({ length: p }, (_, i) =>
    Array.from({ length: p }, (_, j) => X.reduce((a, r) => a + r[i] * r[j], 0) + (i === j && i > 0 ? lambda : 0)),
  );
  const Xty = (ys: number[]) => Array.from({ length: p }, (_, i) => X.reduce((a, r, k) => a + r[i] * ys[k], 0));

  const wx = solve(XtX, Xty(samples.map(s => s.tx)));
  const wy = solve(XtX, Xty(samples.map(s => s.ty)));
  if (![...wx, ...wy].every(Number.isFinite)) return null;
  return { mean, std, wx, wy };
}

export function predictGaze(model: GazeModel, f: GazeFeatures): { x: number; y: number } {
  const x = design(f, model);
  const dot = (w: number[]) => w.reduce((a, wi, i) => a + wi * x[i], 0);
  return { x: dot(model.wx), y: dot(model.wy) };
}

/**
 * Honest accuracy estimate: fit on 8 targets, predict the 9th, repeat for every target.
 * Returns the mean error as a percentage of the screen size.
 */
export function leaveOnePointOutError(samples: GazeSample[]): number | null {
  const points = [...new Set(samples.map(s => s.point))];
  if (points.length < 5) return null;
  const errors: number[] = [];
  for (const p of points) {
    const train = samples.filter(s => s.point !== p);
    const test = samples.filter(s => s.point === p);
    const model = fitGazeModel(train);
    if (!model || test.length === 0) continue;
    const preds = test.map(s => predictGaze(model, s));
    const px = preds.reduce((a, q) => a + q.x, 0) / preds.length;
    const py = preds.reduce((a, q) => a + q.y, 0) / preds.length;
    errors.push(Math.hypot(px - test[0].tx, py - test[0].ty));
  }
  if (errors.length === 0) return null;
  return (errors.reduce((a, e) => a + e, 0) / errors.length) * 100;
}
