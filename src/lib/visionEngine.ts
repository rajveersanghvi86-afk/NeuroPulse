import { DrawingUtils, FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { useTelemetryStore } from '../store/telemetryStore';
import type { VisionStats } from './types';
import type { GazeFeatures, GazeModel } from './gazeModel';
import { predictGaze } from './gazeModel';

// The tracker's WASM and model are served from this site (copied in at build time), not a CDN.
const ASSET_BASE = import.meta.env.BASE_URL;
const WASM_PATH = `${ASSET_BASE}mediapipe/wasm`;
const MODEL_PATH = `${ASSET_BASE}models/face_landmarker.task`;

// Face Landmarker landmark indices (same 478-point topology as FaceMesh, 468-477 are the irises).
// "Right"/"left" are the subject's own eyes.
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

/*
 * Eye closure comes from the model's trained "eyeBlink" blendshape score (0 = open, ~1 = shut),
 * averaged over both eyes. It is much steadier than measuring lid shape from landmarks.
 * We then map it onto each person's own range: 0 = their open level, 1 = their closed level.
 */
const DEFAULT_OPEN_LID = 0.08;
const DEFAULT_CLOSED_LID = 0.65;
const BLINK_START_CLOSURE = 0.5; // lids at least half way down
const BLINK_END_CLOSURE = 0.3; // hysteresis so noise doesn't split one blink into two
const PERCLOS_CLOSURE = 0.8; // PERCLOS P80: at least 80% closed
const LONG_CLOSURE_MS = 500;
const MAX_HEAD_DEVIATION_DEG = 25; // beyond this the eye readings are too distorted to trust
const LIGHT_CHECK_MS = 1000;

export type TrackerStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface VisionCalibration {
  /** Blink score with eyes normally open (looking at the middle of the screen). */
  openLid: number;
  /** Blink score with eyes gently closed, or null if that step was skipped. */
  closedLid: number | null;
  /**
   * Lids drop when you look down, which raises the blink score a little.
   * expectedOpen = openLid + lidLookSlope * (lookDown - lookDown.middle)
   */
  lidLookSlope: number;
  /** "Eyes looking down" score at the top, middle and bottom calibration rows. */
  lookDown: { top: number; middle: number; bottom: number } | null;
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
  /** Raw blink score, both eyes averaged (0 open .. ~1 closed). */
  lid: number;
  /** "Looking down" score, both eyes averaged. */
  lookDown: number;
  /** 0 = eyes at their normal open level, 1 = at their closed level. */
  closure: number;
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
  lid: number;
  closure: number;
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

let landmarkerPromise: Promise<FaceLandmarker> | null = null;

let delegateUsed: 'GPU' | 'CPU' | null = null;

async function createLandmarker(): Promise<FaceLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
  const options = (delegate: 'GPU' | 'CPU') => ({
    baseOptions: { modelAssetPath: MODEL_PATH, delegate },
    runningMode: 'VIDEO' as const,
    numFaces: 1,
    outputFaceBlendshapes: true,
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  try {
    // GPU is several times faster and keeps the page responsive.
    const lm = await FaceLandmarker.createFromOptions(fileset, options('GPU'));
    delegateUsed = 'GPU';
    return lm;
  } catch (e) {
    console.warn('GPU face tracking unavailable, falling back to CPU', e);
    const lm = await FaceLandmarker.createFromOptions(fileset, options('CPU'));
    delegateUsed = 'CPU';
    return lm;
  }
}

export class VisionEngine {
  private landmarker: FaceLandmarker | null = null;
  private status: TrackerStatus = 'idle';
  private video: HTMLVideoElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private drawer: DrawingUtils | null = null;
  private running = false;
  private runId = 0;
  private lastVideoTime = -1;
  private lastTimestamp = 0;
  /** Earliest time the next frame may be processed (keeps the tracker from hogging the page). */
  private nextAllowed = 0;

  private calibration: VisionCalibration | null = null;
  private latest: FrameSample | null = null;

  private frames: FrameRecord[] = [];
  private blinks: { t: number; dur: number }[] = [];
  private blinkStart: number | null = null;
  private blinkTotal = 0;
  private longClosureTotal = 0;
  private recentClosure: number[] = [];
  private lookSmooth: number | null = null;
  /** Slow average of closure between blinks (0 = eyes at their usual open level). */
  private restClosure = 0;
  private lookingDown = false;
  private lastBlinkMs: number | null = null;
  private lastFrameT = 0;
  private startedAt = 0;

  private adaptiveOpen: number | null = null;
  private lastBaselineUpdate = 0;

  private lightCanvas: HTMLCanvasElement | null = null;
  private lightLevel = 128;
  private lastLightCheck = 0;

  private since: Record<string, number | null> = {};
  private alertCooldown: Record<string, number> = {};
  private lastGazeLog = 0;

  // ---------- lifecycle ----------

  getStatus(): TrackerStatus {
    return this.status;
  }

  async start(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
    const run = ++this.runId;
    this.video = video;
    this.ctx = canvas.getContext('2d');
    this.drawer = this.ctx ? new DrawingUtils(this.ctx) : null;
    this.resetWindows();
    this.running = true;

    if (!this.landmarker) {
      this.status = 'loading';
      landmarkerPromise ??= createLandmarker();
      try {
        this.landmarker = await landmarkerPromise;
      } catch (e) {
        landmarkerPromise = null;
        this.status = 'error';
        throw e;
      }
    }
    this.status = 'ready';
    if (run !== this.runId || !this.running) return;

    const v = video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };
    // Process each new camera frame once; requestVideoFrameCallback fires exactly when one arrives.
    const schedule = () => {
      if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(step);
      else requestAnimationFrame(step);
    };
    const step = () => {
      if (!this.running || run !== this.runId) return;
      this.processFrame();
      schedule();
    };
    schedule();
  }

  stop() {
    this.running = false;
    this.runId++;
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
    this.adaptiveOpen = null;
    this.since = {};
    this.recentClosure = [];
    this.lookSmooth = null;
    this.lookingDown = false;
    this.restClosure = 0;
  }

  setCalibration(c: VisionCalibration | null) {
    this.calibration = c;
    // Start the windows fresh so old frames judged against the old baseline don't linger.
    this.frames = [];
    this.blinks = [];
    this.blinkStart = null;
    this.restClosure = 0;
    this.startedAt = performance.now();
  }

  getLatest(): FrameSample | null {
    return this.latest;
  }

  private openLevel(): { value: number; source: VisionStats['baselineSource'] } {
    if (this.calibration) return { value: this.calibration.openLid, source: 'calibrated' };
    if (this.adaptiveOpen !== null) return { value: this.adaptiveOpen, source: 'adaptive' };
    return { value: DEFAULT_OPEN_LID, source: 'default' };
  }

  private closedLevel(open: number): number {
    const c = this.calibration?.closedLid;
    if (c != null && c > open + 0.15) return c;
    return Math.max(DEFAULT_CLOSED_LID, open + 0.35);
  }

  // ---------- per-frame measurement ----------

  private processFrame() {
    const video = this.video;
    const lm = this.landmarker;
    if (!video || !lm || video.readyState < 2 || video.currentTime === this.lastVideoTime) return;
    const now = performance.now();
    if (now < this.nextAllowed) return;
    this.lastVideoTime = video.currentTime;
    const ts = Math.max(this.lastTimestamp + 1, now);
    this.lastTimestamp = ts;
    let result;
    try {
      result = lm.detectForVideo(video, ts);
    } catch (e) {
      console.error('Face tracking error:', e);
      return;
    }
    // On slow (CPU-only) machines, leave at least a quarter of the time for the rest of the page.
    const cost = performance.now() - now;
    this.nextAllowed = performance.now() + cost / 3;
    const shapes: Record<string, number> = {};
    for (const c of result.faceBlendshapes?.[0]?.categories ?? []) shapes[c.categoryName] = c.score;
    this.handleFrame(result.faceLandmarks?.[0] ?? null, shapes);
  }

  private handleFrame(lms: NormalizedLandmark[] | null, shapes: Record<string, number>) {
    const t = performance.now();
    const dt = this.lastFrameT ? Math.min(100, t - this.lastFrameT) : 33;
    this.lastFrameT = t;

    const W = this.video?.videoWidth || 640;
    const H = this.video?.videoHeight || 480;

    this.pruneWindows(t);

    if (!lms || lms.length < 478) {
      this.latest = {
        time: t, faceFound: false, lid: 0, lookDown: 0, closure: 0, yaw: 0, pitch: 0, roll: 0, ipd: 0,
        nose: { x: 0.5, y: 0.5 }, gaze: null, valid: false, eyesClosed: false,
      };
      this.endBlink(t, false);
      this.frames.push({ t, dt, valid: false, closed: false, inBlink: false, lid: 0, closure: 0 });
      this.sustained('noFace', true, t, 2000, () =>
        this.alert('noFace', 'Face not visible: eye tracking paused.', 'severe', 30000));
      this.measureLight(t, null, W, H);
      this.draw(null);
      return;
    }
    this.sustained('noFace', false, t, 0, () => {});

    // Pixel-space points (z uses the same scale as x in MediaPipe's output).
    const P = (i: number): Pt => ({ x: lms[i].x * W, y: lms[i].y * H, z: lms[i].z * W });

    const lid = ((shapes.eyeBlinkLeft ?? 0) + (shapes.eyeBlinkRight ?? 0)) / 2;
    const lookDown = ((shapes.eyeLookDownLeft ?? 0) + (shapes.eyeLookDownRight ?? 0)) / 2;

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

    this.updateAdaptiveOpen(t);
    const open = this.openLevel().value;
    const closedLid = this.closedLevel(open);

    // Looking down lowers the lids a little; follow that so it isn't read as tiredness.
    // The look-down score is only updated while the eye isn't mid-blink (it's unreliable then).
    const ld = cal?.lookDown;
    const expectedFor = (look: number | null) => {
      if (!cal || !ld || look === null) return open;
      const e = open + cal.lidLookSlope * (look - ld.middle);
      return Math.min(closedLid - 0.25 * (closedLid - open), Math.max(open - 0.05, Math.min(open + 0.35, e)));
    };
    const closureFor = (o: number) => Math.max(0, Math.min(1.2, (lid - o) / Math.max(1e-3, closedLid - o)));
    let expectedOpen = expectedFor(lookDown);
    let closure = closureFor(expectedOpen);
    if (closure < 0.6) {
      this.lookSmooth = this.lookSmooth === null ? lookDown : this.lookSmooth + (lookDown - this.lookSmooth) * 0.5;
    } else {
      expectedOpen = expectedFor(this.lookSmooth);
      closure = closureFor(expectedOpen);
    }

    // Looking well below the screen (keyboard, phone): lids drop for reasons other than tiredness.
    const look = this.lookSmooth ?? lookDown;
    this.lookingDown = ld && ld.bottom > ld.top
      ? look - ld.bottom > Math.max(0.12, 0.6 * (ld.bottom - ld.top))
      : look > 0.55;
    const valid = headOk && this.lightLevel >= 25 && !this.lookingDown;

    // Blink state machine. Thresholds sit above the current resting level, so drooping eyes
    // (resting at, say, 35% closure) still have blinks that start and end.
    const rest = this.restClosure;
    const startAt = Math.max(BLINK_START_CLOSURE, rest + 0.4);
    const endAt = Math.max(BLINK_END_CLOSURE, rest + 0.2);
    if (valid) {
      if (this.blinkStart === null) {
        if (closure >= startAt) this.blinkStart = t;
        else this.restClosure += (Math.min(closure, 0.6) - this.restClosure) * Math.min(1, dt / 3000);
      } else {
        // Keep adapting slowly during a closure too, so a lasting droop can't leave a "blink" open forever.
        this.restClosure += (Math.min(closure, 0.6) - this.restClosure) * Math.min(1, dt / 10000);
        if (closure <= endAt) this.endBlink(t, true);
      }
    } else {
      this.endBlink(t, false);
    }

    // PERCLOS uses a 3-frame median so a single noisy frame can't count as "closed".
    this.recentClosure.push(closure);
    if (this.recentClosure.length > 3) this.recentClosure.shift();
    const closureFiltered = this.recentClosure.length === 3 ? median(this.recentClosure) : closure;
    // Counted as closed if the 3-frame median agrees, or if it's part of a blink that began on an
    // earlier frame (very short blinks at low frame rates may only have one fully-closed frame).
    const inEarlierBlink = this.blinkStart !== null && this.blinkStart < t;
    const closed = valid && closure >= PERCLOS_CLOSURE && (closureFiltered >= PERCLOS_CLOSURE || inEarlierBlink);

    this.frames.push({ t, dt, valid, closed, inBlink: this.blinkStart !== null, lid, closure });

    this.latest = {
      time: t, faceFound: true, lid, lookDown, closure, yaw, pitch, roll, ipd, nose, gaze, valid,
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
    if (record && dur >= 40) {
      this.blinks.push({ t, dur });
      this.blinkTotal++;
      if (dur >= LONG_CLOSURE_MS) this.longClosureTotal++;
      this.lastBlinkMs = dur;
    }
  }

  private pruneWindows(t: number) {
    while (this.frames.length && t - this.frames[0].t > WINDOW_MS) this.frames.shift();
    while (this.blinks.length && t - this.blinks[0].t > WINDOW_MS) this.blinks.shift();
  }

  /** Without calibration, estimate the open-eye blink score from recent frames (a low percentile). */
  private updateAdaptiveOpen(t: number) {
    if (this.calibration || t - this.lastBaselineUpdate < 500) return;
    this.lastBaselineUpdate = t;
    const lids = this.frames.filter(f => f.valid && !f.inBlink).map(f => f.lid);
    // A couple of seconds of open-eye frames is enough for a first estimate; it keeps refining.
    if (lids.length >= 30) this.adaptiveOpen = Math.min(0.4, percentile(lids, 0.3));
  }

  /** Mean brightness of the face area, sampled once a second at 16x16 (cheap). */
  private measureLight(t: number, lms: NormalizedLandmark[] | null, W: number, H: number) {
    if (!this.video || t - this.lastLightCheck < LIGHT_CHECK_MS) return;
    this.lastLightCheck = t;
    if (!this.lightCanvas) {
      this.lightCanvas = document.createElement('canvas');
      this.lightCanvas.width = 16;
      this.lightCanvas.height = 16;
    }
    const c = this.lightCanvas.getContext('2d', { willReadFrequently: true });
    if (!c) return;
    let sx = 0, sy = 0, sw = W, sh = H;
    if (lms) {
      let minX = 1, minY = 1, maxX = 0, maxY = 0;
      for (const p of lms) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
      }
      sx = Math.max(0, minX * W); sy = Math.max(0, minY * H);
      sw = Math.max(8, Math.min(W - sx, (maxX - minX) * W));
      sh = Math.max(8, Math.min(H - sy, (maxY - minY) * H));
    }
    try {
      c.drawImage(this.video, sx, sy, sw, sh, 0, 0, 16, 16);
      const d = c.getImageData(0, 0, 16, 16).data;
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
    let validMs = 0, closedMs = 0, recentFrames = 0;
    const openClosures: number[] = [];
    for (const f of this.frames) {
      if (t - f.t <= 2000) recentFrames++;
      if (!f.valid) continue;
      validMs += f.dt;
      if (f.closed) closedMs += f.dt;
      if (!f.inBlink && !f.closed) openClosures.push(f.closure);
    }
    const windowMs = Math.max(1000, Math.min(WINDOW_MS, t - this.startedAt));

    const normal = this.blinks.filter(b => b.dur < LONG_CLOSURE_MS);
    const long = this.blinks.filter(b => b.dur >= LONG_CLOSURE_MS);
    const validMin = validMs / 60000;

    const { value: open, source } = this.openLevel();
    // 1 = lids at their usual open position; 0.7 = resting 30% of the way to closed.
    const openness = openClosures.length >= 30 ? 1 - median(openClosures) : 1;

    const latest = this.latest;
    const faceVisible = !!latest && latest.faceFound && t - latest.time < 1000;
    const lightQuality = Math.max(0, Math.min(1, (this.lightLevel - 35) / (85 - 35)));

    return {
      faceVisible,
      trackerStatus: this.status,
      trackerDelegate: delegateUsed,
      lid: faceVisible ? latest!.lid : 0,
      closure: faceVisible ? latest!.closure : 0,
      eyesClosedNow: faceVisible && this.blinkStart !== null,
      totalBlinks: this.blinkTotal,
      totalLongClosures: this.longClosureTotal,
      lookingDown: this.lookingDown,
      lastBlinkMs: this.lastBlinkMs,
      closedCalibrated: this.calibration?.closedLid != null,
      fps: recentFrames / 2,
      openLid: open,
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

  private draw(lms: NormalizedLandmark[] | null, nose?: { x: number; y: number }) {
    const ctx = this.ctx;
    if (!ctx) return;
    const w = ctx.canvas.width, h = ctx.canvas.height;
    ctx.clearRect(0, 0, w, h);
    if (!lms || !this.drawer) return;
    const eyeColor = this.blinkStart !== null ? '#F59E0B' : '#14B8A6';
    // Outline only: the full tessellation is costly to draw every frame.
    this.drawer.drawConnectors(lms, FaceLandmarker.FACE_LANDMARKS_FACE_OVAL, { color: '#C0C0C060', lineWidth: 1 });
    this.drawer.drawConnectors(lms, FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE, { color: eyeColor, lineWidth: 1 });
    this.drawer.drawConnectors(lms, FaceLandmarker.FACE_LANDMARKS_LEFT_EYE, { color: eyeColor, lineWidth: 1 });
    this.drawer.drawConnectors(lms, FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS, { color: '#14B8A6', lineWidth: 1 });
    this.drawer.drawConnectors(lms, FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS, { color: '#14B8A6', lineWidth: 1 });

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
