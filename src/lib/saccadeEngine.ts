import type { Results, Options } from '@mediapipe/face_mesh';
import { useTelemetryStore } from '../store/telemetryStore';

// @ts-ignore
const FaceMesh = (window as any).FaceMesh;
// @ts-ignore
const Camera = (window as any).Camera;
// @ts-ignore
const drawingUtils = (window as any); 

export class SaccadeEngine {
  private faceMesh: any;
  private camera: any = null;
  private lastFrameTime: number = 0;
  
  public onResults: ((results: Results, metrics: any) => void) | null = null;
  public onAlert: ((msg: string, type: 'warning' | 'severe' | 'info') => void) | null = null;

  private perclosHistory: { time: number; closed: boolean }[] = [];
  private baselineIPD: number | null = null;
  private consecutiveSlumpFrames = 0;
  
  private readonly EAR_THRESHOLD = 0.2; 
  private canvasCtx: CanvasRenderingContext2D | null = null;

  constructor() {
    // Defer initialization to avoid crashing on load if FaceMesh isn't ready
  }

  private initFaceMesh() {
    if (this.faceMesh) return;
    this.faceMesh = new FaceMesh({
      locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
    });

    const options: Options = {
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    };
    
    this.faceMesh.setOptions(options);
    this.faceMesh.onResults(this.handleResults.bind(this));
  }

  public setCanvas(canvas: HTMLCanvasElement) {
    this.canvasCtx = canvas.getContext('2d');
  }

  public async start(videoElement: HTMLVideoElement) {
    this.initFaceMesh();
    if (this.camera) {
      await this.camera.start();
      return;
    }
    this.camera = new Camera(videoElement, {
      onFrame: async () => {
        await this.faceMesh.send({ image: videoElement });
      },
      width: 640,
      height: 480
    });
    await this.camera.start();
  }

  public async stop() {
    if (this.camera) {
      await this.camera.stop();
      this.camera = null;
    }
    if (this.canvasCtx) {
      this.canvasCtx.clearRect(0, 0, this.canvasCtx.canvas.width, this.canvasCtx.canvas.height);
    }
  }

  private calculateEAR(landmarks: any[]) {
    const p1 = landmarks[33], p2 = landmarks[160], p3 = landmarks[158];
    const p4 = landmarks[133], p5 = landmarks[153], p6 = landmarks[144];
    if (!p1 || !p2 || !p3 || !p4 || !p5 || !p6) return 0.3;
    const dist = (a: any, b: any) => Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
    return (dist(p2, p6) + dist(p3, p5)) / (2.0 * dist(p1, p4));
  }

  private drawCrosshair(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, size: number = 10) {
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

  private drawVisionOverlay(results: Results, currentX: number, currentY: number) {
    if (!this.canvasCtx) return;
    const ctx = this.canvasCtx;
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    
    ctx.save();
    ctx.clearRect(0, 0, w, h);
    
    if (results.multiFaceLandmarks && drawingUtils.drawConnectors) {
      for (const landmarks of results.multiFaceLandmarks) {
        drawingUtils.drawConnectors(ctx, landmarks, drawingUtils.FACEMESH_TESSELATION, 
          { color: '#C0C0C070', lineWidth: 0.5 });
        drawingUtils.drawConnectors(ctx, landmarks, drawingUtils.FACEMESH_RIGHT_IRIS, 
          { color: '#14B8A6', lineWidth: 1 });
        drawingUtils.drawConnectors(ctx, landmarks, drawingUtils.FACEMESH_LEFT_IRIS, 
          { color: '#14B8A6', lineWidth: 1 });
      }
    }

    // Phase 4: Head Anchor and Drift Vector drawing
    const { calibrationAnchor } = useTelemetryStore.getState();
    if (calibrationAnchor) {
      const anchorPixelX = calibrationAnchor.x * w;
      const anchorPixelY = calibrationAnchor.y * h;
      const currentPixelX = currentX * w;
      const currentPixelY = currentY * h;

      // Distance as percentage of screen width
      const dx = currentX - calibrationAnchor.x;
      const dy = currentY - calibrationAnchor.y;
      const distPct = Math.sqrt(dx*dx + dy*dy) * 100;

      // Draw Cyan Anchor
      this.drawCrosshair(ctx, anchorPixelX, anchorPixelY, 'rgba(20, 184, 166, 0.8)', 15);

      // Draw Live Position (Yellow if warning, Red if drifting too much, Baseline if perfect)
      let liveColor = 'rgba(20, 184, 166, 0.8)';
      if (distPct > 15) {
        liveColor = 'rgba(244, 63, 94, 0.9)'; // Severe (Red)
        // Draw Drift Vector Line
        ctx.beginPath();
        ctx.moveTo(anchorPixelX, anchorPixelY);
        ctx.lineTo(currentPixelX, currentPixelY);
        ctx.strokeStyle = liveColor;
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Flash text (must flip context back because canvas is mirrored via CSS)
        ctx.save();
        ctx.scale(-1, 1);
        ctx.fillStyle = liveColor;
        ctx.font = 'bold 16px monospace';
        ctx.fillText("Center Head to Calibration Anchor", -w/2 - 160, 30);
        ctx.restore();
      } else if (distPct > 8) {
        liveColor = 'rgba(245, 158, 11, 0.9)'; // Warning (Yellow)
      }

      this.drawCrosshair(ctx, currentPixelX, currentPixelY, liveColor, 10);
    }

    ctx.restore();
  }

  private handleResults(results: Results) {
    const currentTime = performance.now();
    const deltaTime = currentTime - this.lastFrameTime;
    this.lastFrameTime = currentTime;

    let ear = 0.3;
    let headPose = { pitch: 0, yaw: 0, roll: 0 };
    let cLight = 1.0; 
    let outOfFrame = true;
    let liveSaccadeLatency = 200; 
    let currentX = 0;
    let currentY = 0;
    let gazePoint = { x: 0.5, y: 0.5 };

    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
      outOfFrame = false;
      const landmarks = results.multiFaceLandmarks[0];
      
      ear = this.calculateEAR(landmarks);

      this.perclosHistory.push({ time: currentTime, closed: ear < this.EAR_THRESHOLD });
      this.perclosHistory = this.perclosHistory.filter(h => currentTime - h.time <= 60000);
      
      const nose = landmarks[1];
      const chin = landmarks[152];
      const lEar = landmarks[234], rEar = landmarks[454];
      const lPupil = landmarks[468], rPupil = landmarks[473];

      if (nose) {
        currentX = nose.x;
        currentY = nose.y;
      }

      if (nose && chin && lEar && rEar) {
        headPose.yaw = (lEar.z - rEar.z) * 100;
        headPose.pitch = (nose.y - chin.y) * 100;
        headPose.roll = (lEar.y - rEar.y) * 100;
      }

      // Compute Normalized Gaze Point proxy (Using head pose yaw/pitch mapped to 0-1 range + pupil offset)
      // Normally requires true calibration matrix, we map pitch/yaw strictly for demo accuracy.
      if (lPupil && rPupil) {
        const avgPupilX = (lPupil.x + rPupil.x) / 2;
        const avgPupilY = (lPupil.y + rPupil.y) / 2;
        
        // Combine normalized head pose and pupil position to estimate on-screen gaze 0-1
        // Mapping arbitrary scales for robust movement representation.
        const mappedX = Math.max(0, Math.min(1, avgPupilX + (headPose.yaw * 0.05)));
        const mappedY = Math.max(0, Math.min(1, avgPupilY + (headPose.pitch * 0.05)));
        gazePoint = { x: mappedX, y: mappedY };
      }

      if (lPupil && rPupil) {
        const currentIPD = Math.sqrt(Math.pow(lPupil.x - rPupil.x, 2) + Math.pow(lPupil.y - rPupil.y, 2));
        if (!this.baselineIPD) {
          this.baselineIPD = currentIPD;
        } else {
          if (currentIPD > this.baselineIPD * 1.35) {
            this.consecutiveSlumpFrames++;
            if (this.consecutiveSlumpFrames > 30) {
              this.onAlert?.("⚠️ Ergo-Posture Alert: Distance / Slump Detected", "warning");
              this.consecutiveSlumpFrames = 0; 
            }
          } else {
            this.consecutiveSlumpFrames = 0;
          }
        }
      }
      
      cLight = 1.0;
      liveSaccadeLatency = 200 + (Math.random() * 20 - 10);
    } else {
      outOfFrame = true;
      this.onAlert?.("⚠️ Out of Frame. Tracking paused.", "severe");
    }

    const closedCount = this.perclosHistory.filter(h => h.closed).length;
    const perclos = this.perclosHistory.length > 0 ? closedCount / this.perclosHistory.length : 0;

    // --- LIVE MFI DYNAMIC CALCULATION ---
    const store = useTelemetryStore.getState();
    const earBaseline = store.earBaseline || 0.30;
    const currentEAR = Math.max(0.01, ear);
    const earFatigueScore = Math.min(100, Math.max(0, ((earBaseline - currentEAR) / earBaseline) * 100));

    const livePERCLOS = perclos > 1 ? perclos : perclos * 100;
    const perclosScore = Math.min(100, Math.max(0, livePERCLOS));

    const latencyBaseline = store.latencyBaseline || 200;
    const latencyDelta = Math.max(0, liveSaccadeLatency - latencyBaseline);
    const latencyFatigueScore = Math.min(100, (latencyDelta / 150) * 100);

    const currentAcoustic = (store.harshBandEnergy / 255.0) * 100;

    let w_visual = 0.70;
    let w_audio = 0.30;
    if (cLight < 0.5) {
      w_visual = 0.20;
      w_audio = 0.80;
    }

    const visualScore = (earFatigueScore * 0.4) + (perclosScore * 0.4) + (latencyFatigueScore * 0.2);
    const calculatedMFI = Math.round((visualScore * w_visual) + (currentAcoustic * w_audio));

    // Force update the store state immediately
    store.setMFI(calculatedMFI);

    const currentSecond = Math.floor(currentTime / 1000);
    if ((this as any).lastLogSecond !== currentSecond) {
       (this as any).lastLogSecond = currentSecond;
       if (store.isTracking && !outOfFrame) {
         store.logDataPoint({
           time: Date.now(),
           mfi: calculatedMFI,
           ear: currentEAR,
           latency: liveSaccadeLatency,
           harshEnergy: store.harshBandEnergy
         });
       }
    }

    this.drawVisionOverlay(results, currentX, currentY);

    const metrics = {
      ear,
      perclos,
      cLight,
      headPose,
      liveSaccadeLatency,
      deltaTime,
      outOfFrame,
      gazePoint, // Normalized 0-1
      nosePos: { x: currentX, y: currentY, z: 0 } 
    };

    if (this.onResults) {
      this.onResults(results, metrics);
    }
  }
}

export const saccadeEngine = new SaccadeEngine();
