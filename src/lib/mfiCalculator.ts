import { useTelemetryStore } from '../store/telemetryStore';

export class MFICalculator {
  private mfiHistory: number[] = [];
  
  public calculateMFI(
    liveSaccadeLatency: number,
    perclos: number, // rolling 60s
    lightingQuality: number,
    currentHarshEnergy: number,
    liveEAR: number
  ): number {
    
    // 1. EAR Fatigue Score (0 to 100)
    // Baseline EAR is usually ~0.30. Drooping EAR is <= 0.15.
    const earBaseline = (useTelemetryStore.getState() as any).earBaseline || 0.30;
    const currentEAR = Math.max(0.01, liveEAR);
    
    // If currentEAR drops below baseline, score increases toward 100%
    const earFatigueScore = Math.min(100, Math.max(0, ((earBaseline - currentEAR) / earBaseline) * 100));
    
    // 2. PERCLOS Score (0 to 100)
    // If PERCLOS is 60%, perclosScore = 60.
    // Ensure perclos is scaled correctly (0 to 1 -> 0 to 100) or if it's already 0-1.
    // The spec says "If PERCLOS is 60%, perclosScore = 60". If perclos is passed as 0.6, we must multiply by 100.
    const livePERCLOS = perclos > 1 ? perclos : perclos * 100;
    const perclosScore = Math.min(100, Math.max(0, livePERCLOS));
    
    // 3. Saccadic Latency Score (0 to 100)
    const latencyBaseline = (useTelemetryStore.getState() as any).latencyBaseline || 200; // ms
    const latencyDelta = Math.max(0, liveSaccadeLatency - latencyBaseline);
    const latencyFatigueScore = Math.min(100, (latencyDelta / 150) * 100); // 150ms delay = 100% fatigue
    
    // 4. Acoustic Load Score (0 to 100)
    // Map currentHarshEnergy to 0-100. Assume max expected energy is 255.
    const liveAcousticLoad = (currentHarshEnergy / 255.0) * 100;
    const acousticScore = Math.min(100, Math.max(0, liveAcousticLoad));
    
    // --- FINAL WEIGHTED MFI (0 - 100%) ---
    // Dynamically weighted based on camera confidence (C_light)
    let w_visual = 0.70; // 70% weight on Eye/PERCLOS/Latency
    let w_audio = 0.30;  // 30% weight on Audio
    
    const c_light = lightingQuality;
    if (c_light < 0.5) {
      w_visual = 0.20; // Fallback in dark rooms
      w_audio = 0.80;
    }
    
    const visualFatigueCombined = (earFatigueScore * 0.4) + (perclosScore * 0.4) + (latencyFatigueScore * 0.2);
    const finalMFI = Math.round((visualFatigueCombined * w_visual) + (acousticScore * w_audio));

    // Rolling average smoothing (last 10 samples)
    this.mfiHistory.push(finalMFI);
    if (this.mfiHistory.length > 10) {
      this.mfiHistory.shift();
    }

    const smoothedMFI = this.mfiHistory.reduce((a, b) => a + b, 0) / this.mfiHistory.length;
    return smoothedMFI;
  }
}

export const mfiEngine = new MFICalculator();
