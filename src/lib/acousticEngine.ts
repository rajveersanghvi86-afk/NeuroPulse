import type { AcousticStats } from './types';

const BAND_LO_HZ = 2000;
const BAND_HI_HZ = 4000;
const TOTAL_LO_HZ = 100;
const TOTAL_HI_HZ = 8000;
const EXPOSURE_TAU_MS = 120000; // exposure reflects roughly the last few minutes
const FLOOR_RISE_DB_PER_S = 0.05; // the room baseline creeps up slowly, drops quickly
const SILENCE_DB = -140;
const MIN_FLOOR_DB = -95;

export type AudioStartResult = { ok: true } | { ok: false; message: string };

/**
 * Listens to the microphone or to a shared browser tab and measures how much loud,
 * treble-heavy (2-4 kHz) sound you're exposed to, relative to the room's own quiet level.
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
  private floorDb: number | null = null;
  private exposure = 0;
  private lastSample = 0;
  private last: AcousticStats | null = null;

  get isActive() {
    return !!this.analyser;
  }

  get canProcessPlayback() {
    return this.isActive && this.mode === 'system';
  }

  async start(mode: 'mic' | 'system'): Promise<AudioStartResult> {
    this.stop();
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
          return { ok: false, message: 'No tab audio shared. Pick a browser tab and tick "Share tab audio".' };
        }
      } else {
        stream = await navigator.mediaDevices.getUserMedia({ audio: raw });
      }
    } catch {
      return { ok: false, message: 'Audio access was denied, so audio tracking is off.' };
    }

    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    await ctx.resume().catch(() => {});
    this.ctx = ctx;
    this.stream = stream;
    this.source = ctx.createMediaStreamSource(stream);

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.6;
    this.analyser.minDecibels = -100;
    this.analyser.maxDecibels = -20;
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

    stream.getAudioTracks()[0]?.addEventListener('ended', () => this.stop());
    this.floorDb = null;
    this.exposure = 0;
    this.lastSample = 0;
    this.applyCallAssist(0);
    return { ok: true };
  }

  stop() {
    this.stream?.getTracks().forEach(t => t.stop());
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.stream = null;
    this.source = null;
    this.analyser = null;
    this.presence = null;
    this.shelf = null;
    this.last = null;
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
    const band = power(BAND_LO_HZ, BAND_HI_HZ);
    const total = power(TOTAL_LO_HZ, TOTAL_HI_HZ);
    const bandDb = band > 0 ? 10 * Math.log10(band) : -160;
    const harshShare = total > 0 ? band / total : 0;

    // Room baseline: follows quiet moments quickly, rises only slowly during continuous sound.
    // Digital silence (no data yet, or a muted tab) is ignored, and the floor never goes below
    // MIN_FLOOR_DB so silence can't make ordinary sound look extremely loud.
    if (bandDb > SILENCE_DB) {
      const level = Math.max(MIN_FLOOR_DB, bandDb);
      if (this.floorDb === null) this.floorDb = level;
      else if (level < this.floorDb) this.floorDb += (level - this.floorDb) * 0.3;
      else this.floorDb += Math.min(level - this.floorDb, FLOOR_RISE_DB_PER_S * (dt / 1000));
    }
    if (this.floorDb === null) {
      this.last = { active: true, source: this.mode, bandDb, floorDb: bandDb, harshShare, instant: 0, exposure: this.exposure };
      return this.last;
    }

    // Loudness above the room baseline (10-35 dB maps to 0-1), weighted by how treble-heavy it is.
    const excess = bandDb - this.floorDb;
    const level = Math.max(0, Math.min(1, (excess - 10) / 25));
    const shareFactor = Math.max(0, Math.min(1, (harshShare - 0.05) / 0.3));
    const instant = 100 * level * (0.5 + 0.5 * shareFactor);

    this.exposure += (instant - this.exposure) * (1 - Math.exp(-dt / EXPOSURE_TAU_MS));

    this.last = {
      active: true,
      source: this.mode,
      bandDb,
      floorDb: this.floorDb,
      harshShare,
      instant,
      exposure: this.exposure,
    };
    return this.last;
  }

  /** Spectrum for drawing: bytes 0-255 per bin, plus the bin width in Hz. */
  getSpectrum(): { data: Uint8Array; binHz: number } | null {
    if (!this.analyser || !this.ctx) return null;
    this.analyser.getByteFrequencyData(this.bytes);
    return { data: this.bytes, binHz: this.ctx.sampleRate / this.analyser.fftSize };
  }
}

export const acousticEngine = new AcousticEngine();
