# NeuroPulse

**A privacy-first desktop & web platform that measures, predicts, and actively mitigates Cognitive Fatigue and Acoustic Strain in digital workers.**

![NeuroPulse Tech Stack](https://img.shields.io/badge/Stack-React_18_%7C_TypeScript_%7C_Vite-blue)
![Computer Vision](https://img.shields.io/badge/Vision-MediaPipe_FaceMesh-orange)
![Audio Processing](https://img.shields.io/badge/Audio-Web_Audio_API-green)
![Privacy](https://img.shields.io/badge/Privacy-100%25_Local_Browser_RAM-brightgreen)

---

## 🏗️ System Architecture

NeuroPulse combines two primary engines running asynchronously in the browser main-thread (optimized to prevent Web Worker serialization bottlenecks) to compute a real-time **Multimodal Fatigue Index (MFI)**.

1. **SaccadeGaze Engine (Visual & Neurological Biometrics):**
   - Utilizes `@mediapipe/face_mesh` and `@mediapipe/drawing_utils` loaded via CDN directly into memory.
   - **Safety Guardrails**: Real-time alerts for Posture Slumping (IPD tracking), Head Drift ($>30^\circ$), and Low Lighting.
   - Computes Eye Aspect Ratio (EAR) and PERCLOS over a 60-second rolling window.
   - **9-Point Calibration**: Interactive spatial calibration utilizing Inverse Distance Weighting (IDW) with a $1.25\times$ boundary expansion factor.

2. **Psychoacoustic Engine (Acoustic Stress & Signal Processing):**
   - Taps into the Web Audio API (`AudioContext`, `AnalyserNode`).
   - Runs a real-time FFT Spectral Analysis to monitor the harsh **2kHz–4kHz band**.
   - Applies Low-Latency Perceptual Smoothing (via `BiquadFilterNode`) to notch out fatigue-inducing compression artifacts in VoIP streams (like Teams/Slack).

## 🧮 Clinical & Mathematical Foundation

### Multimodal Fatigue Index (MFI)
The unified adaptive state equation governs the fatigue dial:
$$MFI(t) = w_1 \cdot \left(\frac{L_{\text{live}} - L_{\text{base}}}{L_{\text{base}}}\right) + w_2 \cdot (1 - \overline{EAR}_{60\text{s}}) + w_3 \cdot \int_{t-k}^{t} A(\tau) \, d\tau$$

Where:
- $L_{\text{live}}$ is the current saccadic latency.
- $\overline{EAR}_{60\text{s}}$ represents the PERCLOS rolling average.
- $A(\tau)$ is the acoustic energy in the 2kHz-4kHz band.
- Weights $w_1, w_2, w_3$ dynamically adapt based on a calculated Lighting Quality Metric ($\mathcal{C}_{\text{light}}$).

### Spatial Calibration (IDW)
Calibration leverages Inverse Distance Weighting to interpolate live gaze vectors:
$$w_i(x) = \frac{1}{d(x, x_i)^p}$$
$$u(x) = \frac{\sum_{i=1}^{N} w_i(x) u_i}{\sum_{i=1}^{N} w_i(x)}$$

---

## 🔒 Privacy Statement
**NeuroPulse operates 100% Client-Side.**
All computer vision (FaceMesh), audio processing (FFT / Notch Filters), and post-session analytics occur exclusively in your browser's local RAM. **No video, audio, or biometric telemetry is ever transmitted to a remote server.** The application strictly relies on local WASM and Canvas API execution.

---

## 🛠️ Local Installation & Setup Guide

### Prerequisites
- Node.js (v18+)
- npm (v9+)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/rajveersanghvi86-afk/NeuroPulse.git
   cd NeuroPulse
   ```

2. **Install Dependencies:**
   ```bash
   npm install
   ```

3. **Start the Local Development Server:**
   ```bash
   npm run dev
   ```

4. **Access the Dashboard:**
   Navigate to `http://localhost:5173` in your browser.
   - Click **"Start Telemetry"**.
   - Grant the required Camera and Microphone permissions.
   - Follow the 9-point spatial calibration modal.
   - Observe live HUD metrics over the vision overlay and real-time MFI updates.
   - Click **"Finish Session"** to view the post-session Heatmap and export JSON/CSV/PDF reports.

---

## 🖥️ Active Workspace Mitigation UI
When the MFI transitions into *Elevated* or *Severe* states, NeuroPulse simulates OS-level adaptations:
- **Display Profile Shift**: Simulates OS contrast reduction and warmth shifts ($>60\%$).
- **IDE Syntax Simplifier**: Toggles a mock syntax simplification ($>75\%$).
- **Status Auto-Sync**: Simulates a Slack/Teams presence update to "Deep Work / Low Cognitive Bandwidth" ($>75\%$).
