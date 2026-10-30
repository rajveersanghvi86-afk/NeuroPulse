# NeuroPulse

**A privacy-first web app that estimates fatigue during long screen and video-call sessions, and helps you act on it.**

![Stack](https://img.shields.io/badge/Stack-React_19_%7C_TypeScript_%7C_Vite-blue)
![Computer Vision](https://img.shields.io/badge/Vision-MediaPipe_FaceMesh-orange)
![Audio Processing](https://img.shields.io/badge/Audio-Web_Audio_API-green)
![Privacy](https://img.shields.io/badge/Privacy-Runs_in_your_browser-brightgreen)

Live: https://rajveersanghvi86-afk.github.io/NeuroPulse/

> NeuroPulse is a wellbeing tool, not a medical device. Its numbers are estimates.

---

## What it measures

| Signal | How | Why it matters |
|---|---|---|
| **PERCLOS** | Share of time (60 s window, time-weighted) your eyes are ≥ 80% closed. Closure is measured on **your own** range, from your open-eye level to your closed-eye level, both taken in calibration, using the Eye Aspect Ratio of **both** eyes (3 lid distances each). The "open" level is adjusted for where you look (lids drop when you look down), time spent looking well below the screen is excluded, and a 3-frame median rejects single noisy frames. | One of the best-validated drowsiness measures. Alert ≈ < 8%, drowsy ≈ 15%+. |
| **Blink duration** | A blink is counted when the lids pass 50% closure and ends below 30% (hysteresis). Duration = time past half-closure; median of normal blinks (< 0.5 s). | Blinks slow down with fatigue. |
| **Eyelid droop** | Median open-eye EAR ÷ calibrated baseline. | Heavy lids are an early sign. |
| **Long closures** | Closures ≥ 0.5 s in the last minute. | Microsleep-like events. |
| **Reaction time** | A one-minute Psychomotor Vigilance Task (12 trials, 2–6 s random waits, lapses ≥ 500 ms). Compared with your personal baseline, which is saved locally. | Reaction-time slowing and lapses track sleepiness closely. |
| **Harsh audio exposure** | Loudness of 2–4 kHz above the room's own quiet level, weighted by treble balance (2–4 kHz vs 300–2000 Hz), integrated over about a minute. The dashboard also shows a plain "sound detected" level meter, and warns if the input is silent or the browser has paused audio. | Treble-heavy call audio is tiring. This is a comfort index, not an SPL/hearing-safety measure. |

Supporting measurements: **head pose in degrees** (from the 3D face mesh), **face lighting** (mean luminance of the face region), and **posture** relative to calibration (leaning in, head dropped). Frames with the head turned more than 25° or in very poor light are excluded from the eye metrics.

### Multimodal Fatigue Index (MFI)

Each signal is mapped to a 0–100 score. The MFI is the weighted average of the available signals:

$$MFI = \frac{\sum_i w_i \, c_i \, s_i}{\sum_i w_i \, c_i}$$

- Nominal weights $w$: PERCLOS 0.30, blink duration 0.15, eyelid droop 0.15, long closures 0.10, reaction time 0.15, audio 0.15.
- $c_i$ is a confidence factor. It covers how much of the last minute had a usable face, lighting quality, whether the baseline was calibrated, and how old the last reaction test is (results fade out over 30 minutes).
- The dial is smoothed with a 15 s exponential filter, and shows a **confidence** level plus a per-signal breakdown.
- Levels used everywhere: **0–39 low, 40–69 elevated, 70+ high.**

### Calibration

Nine dots (look at each and press Space or click it), then 3 seconds with eyes gently closed. NeuroPulse then records:
- your open-eye EAR baseline (middle-row targets) and your closed-eye level (MediaPipe's eyelids rarely look fully shut, so fixed thresholds miss blinks), your pupil distance and head position (for posture), and your neutral head pose;
- a **gaze model**: ridge-regularised linear regression from iris position inside the eye (both eyes) plus head yaw/pitch to screen coordinates. Its accuracy is reported honestly with leave-one-point-out cross-validation.

Without calibration, NeuroPulse estimates the baseline from recent frames (85th percentile of open-eye EAR). Eyelid-droop scores then count for less, and no gaze heatmap is recorded.

### Call Assist

Use **System (Tab Capture)** and share a web call's tab with "Share tab audio". NeuroPulse mutes the tab's own playback (`suppressLocalAudioPlayback`) and plays the audio back through a 3 kHz peaking cut and a high-shelf cut, which get stronger as the MFI rises. The audio measurement then reflects what you actually hear. In microphone mode, Call Assist is unavailable (it would cause feedback).

### Rest breaks

A 20-20-20 eye break is suggested every 20 minutes, or after the MFI has been elevated for 30 s, at most once every 5 minutes.

---

## Session report

**Finish Session** opens a summary. **Download PDF report** builds a multi-page A4 report in the browser, with:
- the overall result (and whether fatigue rose by the end) plus personalised recommendations
- a fatigue timeline with level bands and eye-break markers
- key measurements against typical alert ranges
- what drove the index, with a per-period breakdown
- reaction tests, the gaze heatmap, and data-quality notes

CSV (one row per second, including every signal score) and JSON exports are also available.

## Known limitations

- Webcam eye metrics are weaker with glasses, low or back lighting, and when you look down at a keyboard (lowered lids look like closure).
- Webcam gaze is coarse. Typical error is 10–20% of the screen.
- Browsers throttle background tabs, so keep NeuroPulse visible (e.g. in a side window) while tracking.
- Desktop apps (native Zoom/Teams) can't be captured by a browser. Use microphone mode or the web versions.

## Privacy

Everything runs in your browser. Video, audio and measurements are never uploaded. The MediaPipe model files are downloaded from jsDelivr; nothing is sent back. The reaction-time baseline is stored in your browser's localStorage.

---

## Local setup

Requires Node.js 18+.

```bash
git clone https://github.com/rajveersanghvi86-afk/NeuroPulse.git
cd NeuroPulse
npm install
npm run dev
```

Open the URL Vite prints (it includes the `/NeuroPulse/` base path). Click **Start Tracking**, allow camera/microphone, and complete calibration. Take a reaction test while you feel fresh to set your baseline. Click **Finish Session** for the summary and PDF/CSV/JSON export.

Pushing to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml`.

## Code map

- `src/lib/visionEngine.ts`: FaceMesh loop, EAR/blinks/PERCLOS, head pose, lighting, posture, gaze logging
- `src/lib/gazeModel.ts`: gaze regression and cross-validated error
- `src/lib/acousticEngine.ts`: audio capture, band analysis, room baseline, Call Assist EQ
- `src/lib/mfiCalculator.ts`: scoring, weights, thresholds, smoothing
- `src/App.tsx`: the 10 Hz loop that combines everything, logs data and triggers breaks
- `src/components/`: UI (calibration, reaction test, dashboard, report)
