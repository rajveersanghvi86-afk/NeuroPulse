import type { AcousticStats } from './types';

const HARSH_LO_HZ = 2000;
const HARSH_HI_HZ = 4000;
const BODY_LO_HZ = 300; // the "body" of speech/music the harsh band is compared against
const BODY_HI_HZ = 2000;
const TOTAL_LO_HZ = 100;
const TOTAL_HI_HZ = 8000;
const EXPOSURE_TAU_MS = 60000; // exposure reflects roughly the last minute or two
const FLOOR_RISE_DB_PER_S = 0.05; // the room baseline creeps up slowly, drops quickly
const SILENCE_DB = -140; // below this the input is digital silence (muted / nothing playing)
const MIN_FLOOR_DB = -120;
/** Sound counts as "present" this many dB above the room's quiet level. */
const SOUND_PRESENT_DB = 6;

export type AudioStartResult = { ok: true } | { ok: false; message: string };

/**
 * Listens to the microphone or to a shared browser tab.
 *
 * Measures how loud the sound is above the room's own quiet level, and how treble-heavy it is
 * (2-4 kHz compared with 300-2000 Hz). The two combine into a "harsh audio" score, which is
 * integrated over time into an exposure value.
 *
 * In tab mode, "Call Assist" really changes what you hear: the tab's own playback is muted
 * (suppressLocalAudioPlayback) and the audio is played back through a de-harshing EQ instead.
 */
export class AcousticEngine {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private presence: BiquadFilterNode | null = null;
  private shelf: BiquadFilterNode | null = null;
  private freq: Float32Array<ArrayBuffer> = new Float32Array(0);
  private bytes: Uint8Array<ArrayBuffer> = new Uint8Array(0);

  private mode: 'mic' | 'system' = 'mic';
  private callAssist = false;
  private harshFloorDb: number | null = null;
  private totalFloorDb: number | null = null;
  private exposure = 0;
  private lastSample = 0;
  private silentSince: number | null = null;
  private generation = 0;

  get isActive() {
    return !!this.analyser;
  }

  get contextState(): AudioContextState | 'none' {
    return this.ctx?.state ?? 'none';
  }

  /**
   * Create/resume the AudioContext. Call this directly inside a click handler: some browsers
   * (Safari in particular) keep a context created later, after an `await`, paused and silent.
   */
  unlock() {
    if (!this.ctx || this.ctx.state === 'closed') {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
    }
    this.ctx.resume().catch(() => {});
  }

  async start(mode: 'mic' | 'system'): Promise<AudioStartResult> {
    this.stop();
    const gen = ++this.generation;
    this.mode = mode;
    // Turn off browser voice processing: it changes levels and would skew the measurement.
    const raw = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
    let stream: MediaStream;
    try {
      if (mode === 'system') {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: true, // required by browsers; we stop the video track straight away
          audio: { ...raw, suppressLocalAudioPlayback: true } as MediaTrackConstraints,
        });
        stream.getVideoTracks().forEach(t => t.stop());
        if (stream.getAudioTracks().length === 0) {
          stream.getTracks().forEach(t => t.stop());
          return { ok: false, message: 'No tab audio was shared. Choose a browser tab and tick "Share tab audio" (Chrome/Edge).' };
        }
      } else {
        stream = await navigator.mediaDevices.getUserMedia({ audio: raw });
      }
    } catch (e) {
      const name = (e as Error)?.name;
      return {
        ok: false,
        message: name === 'NotFoundError'
          ? 'No microphone was found. Plug one in or pick "System (Tab Capture)".'
          : 'Audio access was denied, so audio tracking is off. Allow the microphone in your browser\'s site settings.',
      };
    }
    if (gen !== this.generation) {
      // stop() was called while we were waiting for permission.
      stream.getTracks().forEach(t => t.stop());
      return { ok: false, message: '' };
    }

    this.unlock();
    const ctx = this.ctx!;
    await ctx.resume().catch(() => {});
    this.stream = stream;
    this.source = ctx.createMediaStreamSource(stream);

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.6;
    // Wide display range so quiet laptop mics still show up in the spectrum.
    this.analyser.minDecibels = -115;
    this.analyser.maxDecibels = -30;
    this.freq = new Float32Array(this.analyser.frequencyBinCount);
    this.bytes = new Uint8Array(this.analyser.frequencyBinCount);

    // De-harshing EQ (flat while Call Assist is off).
    this.presence = ctx.createBiquadFilter();
    this.presence.type = 'peaking';
    this.presence.frequency.value = 3000;
    this.presence.Q.value = 1.0;
    this.presence.gain.value = 0;
    this.shelf = ctx.createBiquadFilter();
    this.shelf.type = 'highshelf';
    this.shelf.frequency.value = 6000;
    this.shelf.gain.value = 0;

    if (mode === 'system') {
      // Tab audio -> EQ -> speakers. We measure after the EQ, i.e. what you actually hear.
      this.source.connect(this.presence);
      this.presence.connect(this.shelf);
      this.shelf.connect(ctx.destination);
      this.shelf.connect(this.analyser);
    } else {
      // Microphone: measure the raw room sound. Never play it back (that would cause feedback).
      this.source.connect(this.analyser);
    }

    stream.getAudioTracks()[0]?.addEventListener('ended', () => {
      if (gen === this.generation) this.stop();
    });
    this.harshFloorDb = null;
    this.totalFloorDb = null;
    this.exposure = 0;
    this.lastSample = 0;
    this.silentSince = null;
    this.applyCallAssist(0);
    return { ok: true };
  }

  /** Stops capture. The AudioContext is kept (suspended) so it stays unlocked for next time. */
  stop() {
    this.generation++;
    this.stream?.getTracks().forEach(t => t.stop());
    try {
      this.source?.disconnect();
      this.presence?.disconnect();
      this.shelf?.disconnect();
    } catch {
      /* already disconnected */
    }
    this.ctx?.suspend().catch(() => {});
    this.stream = null;
    this.source = null;
    this.analyser = null;
    this.presence = null;
    this.shelf = null;
  }

  setCallAssist(active: boolean, mfi = 0) {
    this.callAssist = active;
    this.applyCallAssist(mfi);
  }

  /** Stronger de-harshing as fatigue rises. */
  setMitigationLevel(mfi: number) {
    if (this.callAssist) this.applyCallAssist(mfi);
  }

  private applyCallAssist(mfi: number) {
    if (!this.presence || !this.shelf || !this.ctx) return;
    const now = this.ctx.currentTime;
    let presence = 0, shelf = 0;
    if (this.callAssist && this.mode === 'system') {
      presence = mfi >= 70 ? -9 : mfi >= 40 ? -6 : -4;
      shelf = mfi >= 70 ? -6 : -3;
    }
    this.presence.gain.setTargetAtTime(presence, now, 0.2);
    this.shelf.gain.setTargetAtTime(shelf, now, 0.2);
  }

  private binRange(lo: number, hi: number): [number, number] {
    const binHz = (this.ctx?.sampleRate ?? 48000) / (this.analyser?.fftSize ?? 2048);
    return [Math.max(1, Math.round(lo / binHz)), Math.min(this.freq.length, Math.round(hi / binHz))];
  }

  /** Room baseline: follows quiet moments quickly, rises only slowly during continuous sound. */
  private trackFloor(floor: number | null, db: number, dt: number): number | null {
    if (db <= SILENCE_DB) return floor;
    const level = Math.max(MIN_FLOOR_DB, db);
    if (floor === null) return level;
    if (level < floor) return floor + (level - floor) * 0.3;
    return floor + Math.min(level - floor, FLOOR_RISE_DB_PER_S * (dt / 1000));
  }

  /** Call ~10 times per second. */
  sample(): AcousticStats | null {
    if (!this.analyser) return null;
    const now = performance.now();
    const dt = this.lastSample ? Math.min(1000, now - this.lastSample) : 100;
    this.lastSample = now;

    this.analyser.getFloatFrequencyData(this.freq);
    const power = (lo: number, hi: number) => {
      const [a, b] = this.binRange(lo, hi);
      let p = 0;
      for (let i = a; i < b; i++) {
        const db = this.freq[i];
        if (Number.isFinite(db)) p += Math.pow(10, db / 10);
      }
      return p;
    };
    const toDb = (p: number) => (p > 0 ? 10 * Math.log10(p) : -160);
    const harsh = power(HARSH_LO_HZ, HARSH_HI_HZ);
    const body = power(BODY_LO_HZ, BODY_HI_HZ);
    const total = power(TOTAL_LO_HZ, TOTAL_HI_HZ);
    const bandDb = toDb(harsh);
    const totalDb = toDb(total);

    this.harshFloorDb = this.trackFloor(this.harshFloorDb, bandDb, dt);
    this.totalFloorDb = this.trackFloor(this.totalFloorDb, totalDb, dt);

    const silent = totalDb <= SILENCE_DB;
    if (silent) this.silentSince ??= now;
    else this.silentSince = null;

    const floorDb = this.harshFloorDb ?? bandDb;
    const totalFloor = this.totalFloorDb ?? totalDb;
    const soundAboveRoomDb = Math.max(0, totalDb - totalFloor);
    const soundPresent = !silent && soundAboveRoomDb >= SOUND_PRESENT_DB;

    // Treble balance: 2-4 kHz relative to 300-2000 Hz. Typical speech/music sits around -15 to -25 dB;
    // tinny, compressed or shrill audio is closer to -5 dB.
    const tiltDb = harsh > 0 && body > 0 ? 10 * Math.log10(harsh / body) : -40;

    // Loudness of the harsh band above the room (6-30 dB maps to 0-1), weighted by treble balance.
    const level = Math.max(0, Math.min(1, (bandDb - floorDb - 6) / 24));
    const trebleFactor = Math.max(0, Math.min(1, (tiltDb + 22) / 17));
    const instant = silent ? 0 : 100 * level * (0.35 + 0.65 * trebleFactor);

    this.exposure += (instant - this.exposure) * (1 - Math.exp(-dt / EXPOSURE_TAU_MS));

    return {
      active: true,
      source: this.mode,
      bandDb,
      floorDb,
      totalDb,
      soundAboveRoomDb,
      soundPresent,
      silentForMs: this.silentSince === null ? 0 : now - this.silentSince,
      harshShare: total > 0 ? harsh / total : 0,
      tiltDb,
      instant,
      exposure: this.exposure,
    };
  }

  /** Spectrum for drawing: bytes 0-255 per bin, plus the bin width in Hz. */
  getSpectrum(): { data: Uint8Array; binHz: number } | null {
    if (!this.analyser || !this.ctx) return null;
    this.analyser.getByteFrequencyData(this.bytes);
    return { data: this.bytes, binHz: this.ctx.sampleRate / this.analyser.fftSize };
  }
}

export const acousticEngine = new AcousticEngine();
