export class AcousticEngine {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private dataArray: Uint8Array | null = null;
  
  // Call Assist Audio Pipeline
  private callAssistNode: BiquadFilterNode | null = null;
  private highShelfNode: BiquadFilterNode | null = null;
  private isCallAssistActive: boolean = false;

  public isInitialized = false;

  public async initialize(stream: MediaStream) {
    if (this.audioCtx) {
      this.close(); // Clean up if already initialized
    }
    
    this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.source = this.audioCtx.createMediaStreamSource(stream);
    
    // Core FFT Analyzer
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 1024;
    
    // Setup Call Assist Biquad Filters (initially bypassed)
    this.callAssistNode = this.audioCtx.createBiquadFilter();
    this.callAssistNode.type = 'notch';
    this.callAssistNode.frequency.value = 3000;
    this.callAssistNode.Q.value = 1.5;

    this.highShelfNode = this.audioCtx.createBiquadFilter();
    this.highShelfNode.type = 'highshelf';
    this.highShelfNode.frequency.value = 4000;
    this.highShelfNode.gain.value = 0; 

    // Routing: Source -> CallAssist -> HighShelf -> Analyser
    this.source.connect(this.callAssistNode);
    this.callAssistNode.connect(this.highShelfNode);
    this.highShelfNode.connect(this.analyser);

    const bufferLength = this.analyser.frequencyBinCount;
    this.dataArray = new Uint8Array(bufferLength);
    
    this.isInitialized = true;
  }

  public toggleCallAssist(active: boolean) {
    this.isCallAssistActive = active;
    if (this.callAssistNode && this.highShelfNode) {
      if (active) {
        this.callAssistNode.Q.value = 2.5; 
        this.highShelfNode.gain.value = -6; 
      } else {
        this.callAssistNode.Q.value = 0.001; 
        this.highShelfNode.gain.value = 0;
      }
    }
  }

  public getTelemetry() {
    if (!this.analyser || !this.dataArray) return { fftData: null, harshBandEnergy: 0 };
    
    this.analyser.getByteFrequencyData(this.dataArray as any);
    
    let harshBandEnergy = 0;
    const startBin = 46;
    const endBin = 93;
    
    for (let i = startBin; i < endBin && i < this.dataArray.length; i++) {
      harshBandEnergy += this.dataArray[i];
    }
    
    harshBandEnergy = harshBandEnergy / (endBin - startBin);

    return { fftData: this.dataArray, harshBandEnergy };
  }

  public setMitigationLevel(mfi: number) {
    if (!this.isCallAssistActive) return; 
    
    if (this.highShelfNode) {
      if (mfi > 75) {
        this.highShelfNode.gain.value = -12;
      } else if (mfi > 50) {
        this.highShelfNode.gain.value = -6;
      } else {
        this.highShelfNode.gain.value = -3;
      }
    }
  }

  public async analyzeVoiceTremor(): Promise<number> {
    if (!this.analyser || !this.dataArray) return 0;
    
    return new Promise((resolve) => {
      let samples = 0;
      let totalJitter = 0;
      let lastPeakBin = 0;

      const interval = setInterval(() => {
        this.analyser!.getByteFrequencyData(this.dataArray as any);
        
        let maxVal = 0;
        let peakBin = 0;
        for (let i = 0; i < this.dataArray!.length; i++) {
          if (this.dataArray![i] > maxVal) {
            maxVal = this.dataArray![i];
            peakBin = i;
          }
        }

        if (lastPeakBin !== 0) {
          totalJitter += Math.abs(peakBin - lastPeakBin);
        }
        lastPeakBin = peakBin;
        samples++;

        if (samples >= 50) { 
          clearInterval(interval);
          const avgJitter = (totalJitter / samples);
          resolve(Math.min(100, Math.round(avgJitter * 10)));
        }
      }, 100);
    });
  }

  public close() {
    if (this.audioCtx) {
      this.audioCtx.close();
      this.audioCtx = null;
      this.isInitialized = false;
    }
  }
}

export const acousticEngine = new AcousticEngine();
