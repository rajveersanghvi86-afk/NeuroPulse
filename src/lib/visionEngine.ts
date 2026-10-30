import type { NormalizedLandmark, NormalizedLandmarkList, Options, Results } from '@mediapipe/face_mesh';
import { useTelemetryStore } from '../store/telemetryStore';
import type { VisionStats } from './types';
import type { GazeFeatures, GazeModel } from './gazeModel';
import { predictGaze } from './gazeModel';

export const FACE_MESH_VERSION = '0.4.1633559619';

// MediaPipe FaceMesh landmark indices (refineLandmarks: true adds 468-477 for the irises).
// "Right"/"left" are the subject's own eyes.
const RIGHT_EYE_EAR = [33, 160, 158, 133, 153, 144]; // p1..p6
const LEFT_EYE_EAR = [362, 385, 387, 263, 373, 380];
const RIGHT_EYE_CORNERS = [33, 133]; // both pairs go left -> right in the image
const LEFT_EYE_CORNERS = [362, 263];
const RIGHT_IRIS = 468;
const LEFT_IRIS = 473;
const NOSE_TIP = 1;
const FOREHEAD = 10;
const CHIN = 152;
const FACE_LEFT = 234;
const FACE_RIGHT = 454;

const WINDOW_MS = 60000;
const DEFAULT_EAR_BASELINE = 0.28;

// Eye-closure thresholds as a fraction of the open-eye baseline.
const BLINK_START_RATIO = 0.6; // lids most of the way down
const BLINK_END_RATIO = 0.72; // hysteresis so noise doesn't split one blink into two
const PERCLOS_CLOSED_RATIO = 0.45; // ~80% closed (PERCLOS P80)
const LONG_CLOSURE_MS = 500;
const MAX_HEAD_DEVIATION_DEG = 25; // beyond this the eye shape is too distorted to trust

export interface VisionCalibration {
  earBaseline: number;
  ipdBaseline: number;
  anchor: { x: number; y: number };
  neutralYaw: number;
  neutralPitch: number;
  gazeModel: GazeModel | null;
}

/** Everything measured on the most recent frame. */
export interface FrameSample {
  time: number;
  faceFound: boolean;
  ear: number;
  yaw: number;
  pitch: number;
  roll: number;
  ipd: number;
  nose: { x: number; y: number };
  gaze: { h: number; v: number } | null;
  valid: boolean;
  eyesClosed: boolean;
}

interface FrameRecord {
  t: number;
  dt: number;
  valid: boolean;
  closed: boolean;
  inBlink: boolean;
  ear: number;
}

type Pt = { x: number; y: number; z: number };

const DEG = 180 / Math.PI;
const dist2 = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))];
}

export class VisionEngine {
  private faceMesh: any = null;
  private video: HTMLVideoElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private running = false;
  private busy = false;
  private rafId = 0;
  private lastVideoTime = -1;

  private calibration: VisionCalibration | null = null;
  private latest: FrameSample | null = null;

  private frames: FrameRecord[] = [];
  private blinks: { t: number; dur: number }[] = [];
  private blinkStart: number | null = null;
  private lastFrameT = 0;
  private startedAt = 0;
  private smoothedEar = DEFAULT_EAR_BASELINE;

  private adaptiveBaseline: number | null = null;
  private lastBaselineUpdate = 0;

  private lightCanvas: HTMLCanvasElement | null = null;
  private lightLevel = 128;
  private lastLightCheck = 0;

  private since: Record<string, number | null> = {};
  private alertCooldown: Record<string, number> = {};
  private lastGazeLog = 0;

  // ---------- lifecycle ----------

  private initFaceMesh() {
    if (this.faceMesh) return;
    const FaceMesh = (window as any).FaceMesh;
    if (!FaceMesh) throw new Error('MediaPipe FaceMesh failed to load');
    this.faceMesh = new FaceMesh({
      locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@${FACE_MESH_VERSION}/${file}`,
    });
    const options: Options = {
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    };
    this.faceMesh.setOptions(options);
    this.faceMesh.onResults((r: Results) => this.handleResults(r));
  }

  start(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
    this.initFaceMesh();
    this.video = video;
    this.ctx = canvas.getContext('2d');
    this.resetWindows();
    this.running = true;

    const loop = () => {
      if (!this.running) return;
      const v = this.video;
      if (v && v.readyState >= 2 && v.currentTime !== this.lastVideoTime && !this.busy) {
        this.lastVideoTime = v.currentTime;
        this.busy = true;
        this.faceMesh
          .send({ image: v })
          .catch((e: unknown) => console.error('FaceMesh error:', e))
          .finally(() => {
            this.busy = false;
          });
      }
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    if (this.ctx) this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
    this.video = null;
    this.latest = null;
    this.resetWindows();
  }

  private resetWindows() {
    this.frames = [];
    this.blinks = [];
    this.blinkStart = null;
    this.lastFrameT = 0;
    this.startedAt = performance.now();
    this.adaptiveBaseline = null;
    this.since = {};
  }

  setCalibration(c: VisionCalibration | null) {
    this.calibration = c;
    // Start the windows fresh so old frames judged against the old baseline don't linger.
    this.frames = [];
    this.blinks = [];
    this.blinkStart = null;
    this.startedAt = performance.now();
  }

  getLatest(): FrameSample | null {
    return this.latest;
  }

  currentBaseline(): { value: number; source: VisionStats['baselineSource'] } {
    if (this.calibration) return { value: this.calibration.earBaseline, source: 'calibrated' };
    if (this.adaptiveBaseline) return { value: this.adaptiveBaseline, source: 'adaptive' };
    return { value: DEFAULT_EAR_BASELINE, source: 'default' };
  }

  // ---------- per-frame measurement ----------

  private handleResults(results: Results) {
    if (!this.running) return;
    const t = performance.now();
    const dt = this.lastFrameT ? Math.min(100, t - this.lastFrameT) : 33;
    this.lastFrameT = t;

    const W = this.video?.videoWidth || 640;
    const H = this.video?.videoHeight || 480;
    const lms = results.multiFaceLandmarks?.[0];

    this.pruneWindows(t);

    if (!lms || lms.length < 478) {
      this.latest = {
        time: t, faceFound: false, ear: 0, yaw: 0, pitch: 0, roll: 0, ipd: 0,
        nose: { x: 0.5, y: 0.5 }, gaze: null, valid: false, eyesClosed: false,
      };
      this.endBlink(t, false);
      this.frames.push({ t, dt, valid: false, closed: false, inBlink: false, ear: 0 });
      this.sustained('noFace', true, t, 2000, () =>
        this.alert('noFace', 'Face not visible: eye tracking paused.', 'severe', 30000));
      this.measureLight(t, null, W, H);
      this.draw(null);
      return;
    }
    this.sustained('noFace', false, t, 0, () => {});

    // Pixel-space points (z uses the same scale as x in MediaPipe's output).
    const P = (i: number): Pt => ({ x: lms[i].x * W, y: lms[i].y * H, z: lms[i].z * W });

    // Eye Aspect Ratio, both eyes, in pixel space so the 4:3 frame doesn't skew it.
    const earOf = (idx: number[]) => {
      const [p1, p2, p3, p4, p5, p6] = idx.map(P);
      const w = dist2(p1, p4);
      return w > 0 ? (dist2(p2, p6) + dist2(p3, p5)) / (2 * w) : 0;
    };
    const ear = (earOf(RIGHT_EYE_EAR) + earOf(LEFT_EYE_EAR)) / 2;

    // Head pose in degrees from the face's own axes.
    const fl = P(FACE_LEFT), fr = P(FACE_RIGHT);
    const ax = fr.x - fl.x, ay = fr.y - fl.y, az = fr.z - fl.z;
    const yaw = Math.atan2(az, Math.hypot(ax, ay)) * DEG;
    const roll = Math.atan2(ay, ax) * DEG;
    const top = P(FOREHEAD), chin = P(CHIN);
    const bx = chin.x - top.x, by = chin.y - top.y, bz = chin.z - top.z;
    const pitch = Math.atan2(-bz, Math.hypot(bx, by)) * DEG;

    // Distance between pupils, corrected for head turn; grows as you lean in.
    const ipd = dist2(P(RIGHT_IRIS), P(LEFT_IRIS)) / Math.max(0.5, Math.cos(yaw / DEG));

    // Iris position inside each eye: h along the corner-to-corner line (0..1), v perpendicular to it.
    const irisPos = (corners: number[], iris: number) => {
      const c1 = P(corners[0]), c2 = P(corners[1]), ir = P(iris);
      const ex = c2.x - c1.x, ey = c2.y - c1.y;
      const L2 = ex * ex + ey * ey || 1;
      const rx = ir.x - c1.x, ry = ir.y - c1.y;
      return { h: (rx * ex + ry * ey) / L2, v: (ex * ry - ey * rx) / L2 };
    };
    const gr = irisPos(RIGHT_EYE_CORNERS, RIGHT_IRIS);
    const gl = irisPos(LEFT_EYE_CORNERS, LEFT_IRIS);
    const gaze = { h: (gr.h + gl.h) / 2, v: (gr.v + gl.v) / 2 };

    const nose = { x: lms[NOSE_TIP].x, y: lms[NOSE_TIP].y };

    const cal = this.calibration;
    const yawDev = yaw - (cal?.neutralYaw ?? 0);
    const pitchDev = pitch - (cal?.neutralPitch ?? 0);
    const pitchLimit = cal ? MAX_HEAD_DEVIATION_DEG : 35; // without calibration we don't know the neutral pitch
    const headOk = Math.abs(yawDev) < MAX_HEAD_DEVIATION_DEG && Math.abs(pitchDev) < pitchLimit;
    const valid = headOk && this.lightLevel >= 25;

    this.updateAdaptiveBaseline(t);
    const baseline = this.currentBaseline().value;
    const ratio = ear / baseline;

    // Blink state machine.
    if (valid) {
      if (this.blinkStart === null) {
        if (ratio < BLINK_START_RATIO) this.blinkStart = t;
      } else if (ratio > BLINK_END_RATIO) {
        this.endBlink(t, true);
      }
    } else {
      this.endBlink(t, false);
    }
    const closed = valid && ratio < PERCLOS_CLOSED_RATIO;

    this.frames.push({ t, dt, valid, closed, inBlink: this.blinkStart !== null, ear });
    if (valid && this.blinkStart === null) this.smoothedEar += (ear - this.smoothedEar) * 0.3;

    this.latest = {
      time: t, faceFound: true, ear, yaw, pitch, roll, ipd, nose, gaze, valid,
      eyesClosed: this.blinkStart !== null,
    };

    // Safety / posture checks.
    this.sustained('away', !headOk, t, 3000, () =>
      this.alert('away', 'Head turned away from the screen: eye metrics paused.', 'info', 60000));
    if (cal) {
      this.sustained('close', ipd > cal.ipdBaseline * 1.3, t, 5000, () =>
        this.alert('close', 'Posture: you are leaning much closer to the screen than when you calibrated.', 'warning', 120000));
      this.sustained('slump', nose.y - cal.anchor.y > 0.12, t, 5000, () =>
        this.alert('slump', 'Posture: your head has dropped well below your calibrated position.', 'warning', 120000));
    }

    this.measureLight(t, lms, W, H);
    this.sustained('lowLight', this.lightLevel < 45, t, 5000, () =>
      this.alert('lowLight', 'Low lighting: eye measurements are less reliable. Add light in front of you.', 'warning', 120000));

    // Gaze heatmap logging (5 Hz) when we have a gaze model.
    if (cal?.gazeModel && valid && this.blinkStart === null && t - this.lastGazeLog >= 200) {
      this.lastGazeLog = t;
      const g = predictGaze(cal.gazeModel, { ...gaze, yaw: yawDev, pitch: pitchDev });
      if (Number.isFinite(g.x) && Number.isFinite(g.y)) {
        useTelemetryStore.getState().logGazePoint({
          x: Math.max(-0.1, Math.min(1.1, g.x)),
          y: Math.max(-0.1, Math.min(1.1, g.y)),
          time: Date.now(),
        });
      }
    }

    this.draw(lms, nose);
  }

  private endBlink(t: number, record: boolean) {
    if (this.blinkStart === null) return;
    const dur = t - this.blinkStart;
    this.blinkStart = null;
    if (record && dur >= 50) this.blinks.push({ t, dur });
  }

  private pruneWindows(t: number) {
    while (this.frames.length && t - this.frames[0].t > WINDOW_MS) this.frames.shift();
    while (this.blinks.length && t - this.blinks[0].t > WINDOW_MS) this.blinks.shift();
  }

  /** Without calibration, estimate the open-eye EAR as a high percentile of recent valid frames. */
  private updateAdaptiveBaseline(t: number) {
    if (this.calibration || t - this.lastBaselineUpdate < 1000) return;
    this.lastBaselineUpdate = t;
    const ears = this.frames.filter(f => f.valid && !f.inBlink).map(f => f.ear);
    if (ears.length >= 300) this.adaptiveBaseline = percentile(ears, 0.85);
  }

  private measureLight(t: number, lms: NormalizedLandmarkList | null, W: number, H: number) {
    if (!this.video || t - this.lastLightCheck < 500) return;
    this.lastLightCheck = t;
    if (!this.lightCanvas) {
      this.lightCanvas = document.createElement('canvas');
      this.lightCanvas.width = 32;
      this.lightCanvas.height = 32;
    }
    const c = this.lightCanvas.getContext('2d', { willReadFrequently: true });
    if (!c) return;
    let sx = 0, sy = 0, sw = W, sh = H;
    if (lms) {
      let minX = 1, minY = 1, maxX = 0, maxY = 0;
      for (const p of lms as NormalizedLandmark[]) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
      }
      sx = Math.max(0, minX * W); sy = Math.max(0, minY * H);
      sw = Math.max(8, Math.min(W - sx, (maxX - minX) * W));
      sh = Math.max(8, Math.min(H - sy, (maxY - minY) * H));
    }
    try {
      c.drawImage(this.video, sx, sy, sw, sh, 0, 0, 32, 32);
      const d = c.getImageData(0, 0, 32, 32).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      this.lightLevel = sum / (d.length / 4);
    } catch {
      /* frame not ready */
    }
  }

  // ---------- alerts ----------

  /** Runs `fire` once a condition has held for `holdMs`. */
  private sustained(key: string, cond: boolean, t: number, holdMs: number, fire: () => void) {
    if (!cond) {
      this.since[key] = null;
      return;
    }
    if (this.since[key] == null) this.since[key] = t;
    if (t - (this.since[key] as number) >= holdMs) fire();
  }

  private alert(key: string, msg: string, type: 'warning' | 'severe' | 'info', cooldownMs: number) {
    const now = Date.now();
    if (now - (this.alertCooldown[key] ?? 0) < cooldownMs) return;
    this.alertCooldown[key] = now;
    useTelemetryStore.getState().addAlert(msg, type);
  }

  // ---------- rolling stats ----------

  getStats(): VisionStats {
    const t = performance.now();
    this.pruneWindows(t);
    const valid = this.frames.filter(f => f.valid);
    const validMs = valid.reduce((a, f) => a + f.dt, 0);
    const closedMs = valid.filter(f => f.closed).reduce((a, f) => a + f.dt, 0);
    const windowMs = Math.max(1000, Math.min(WINDOW_MS, t - this.startedAt));

    const normal = this.blinks.filter(b => b.dur < LONG_CLOSURE_MS);
    const long = this.blinks.filter(b => b.dur >= LONG_CLOSURE_MS);
    const validMin = validMs / 60000;

    const { value: baseline, source } = this.currentBaseline();
    const openEars = valid.filter(f => !f.inBlink && !f.closed).map(f => f.ear);
    const openness = openEars.length >= 30 ? median(openEars) / baseline : 1;

    const latest = this.latest;
    const faceVisible = !!latest && latest.faceFound && t - latest.time < 1000;
    const lightQuality = Math.max(0, Math.min(1, (this.lightLevel - 35) / (85 - 35)));

    return {
      faceVisible,
      ear: this.smoothedEar,
      earBaseline: baseline,
      baselineSource: source,
      perclos: validMs > 0 ? closedMs / validMs : 0,
      blinkRate: validMin > 0.15 ? normal.length / validMin : 0,
      blinkCount: normal.length,
      medianBlinkMs: normal.length >= 3 ? median(normal.map(b => b.dur)) : null,
      longClosures: long.length,
      eyeOpenness: openness,
      yaw: latest?.faceFound ? latest.yaw - (this.calibration?.neutralYaw ?? 0) : 0,
      pitch: latest?.faceFound ? latest.pitch - (this.calibration?.neutralPitch ?? 0) : 0,
      roll: latest?.faceFound ? latest.roll : 0,
      lightLevel: this.lightLevel,
      lightQuality,
      coverage: Math.min(1, validMs / windowMs),
      validSeconds: validMs / 1000,
      warmupDone: validMs >= 20000,
    };
  }

  // ---------- overlay ----------

  private draw(lms: NormalizedLandmarkList | null, nose?: { x: number; y: number }) {
    const ctx = this.ctx;
    if (!ctx) return;
    const w = ctx.canvas.width, h = ctx.canvas.height;
    ctx.clearRect(0, 0, w, h);
    if (!lms) return;
    const win = window as any;
    if (win.drawConnectors) {
      const eyeColor = this.blinkStart !== null ? '#F59E0B' : '#14B8A6';
      win.drawConnectors(ctx, lms, win.FACEMESH_TESSELATION, { color: '#C0C0C030', lineWidth: 0.5 });
      win.drawConnectors(ctx, lms, win.FACEMESH_RIGHT_EYE, { color: eyeColor, lineWidth: 1 });
      win.drawConnectors(ctx, lms, win.FACEMESH_LEFT_EYE, { color: eyeColor, lineWidth: 1 });
      win.drawConnectors(ctx, lms, win.FACEMESH_RIGHT_IRIS, { color: '#14B8A6', lineWidth: 1 });
      win.drawConnectors(ctx, lms, win.FACEMESH_LEFT_IRIS, { color: '#14B8A6', lineWidth: 1 });
    }

    const anchor = this.calibration?.anchor;
    if (anchor && nose) {
      const ax = anchor.x * w, ay = anchor.y * h, nx = nose.x * w, ny = nose.y * h;
      const drift = Math.hypot(nose.x - anchor.x, nose.y - anchor.y) * 100;
      this.crosshair(ctx, ax, ay, 'rgba(20,184,166,0.8)', 15);
      let color = 'rgba(20,184,166,0.8)';
      if (drift > 15) {
        color = 'rgba(244,63,94,0.9)';
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(nx, ny);
        ctx.strokeStyle = color;
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
        // The canvas is mirrored with CSS, so flip the text back.
        ctx.save();
        ctx.scale(-1, 1);
        ctx.fillStyle = color;
        ctx.font = 'bold 16px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Move back toward your calibrated position', -w / 2, 30);
        ctx.restore();
      } else if (drift > 8) {
        color = 'rgba(245,158,11,0.9)';
      }
      this.crosshair(ctx, nx, ny, color, 10);
    }
  }

  private crosshair(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, size: number) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - size, y);
    ctx.lineTo(x + size, y);
    ctx.moveTo(x, y - size);
    ctx.lineTo(x, y + size);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, size * 1.5, 0, 2 * Math.PI);
    ctx.stroke();
  }
}

export const visionEngine = new VisionEngine();

export type { GazeFeatures };
