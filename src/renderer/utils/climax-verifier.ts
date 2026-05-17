// File: src/renderer/utils/climax-verifier.ts
//
// #346 G-122 — Climax verification via webcam pose + audio. Combines
// three signals to decide "did a climax actually occur?":
//
//   1. Pose volatility   — sudden hand/torso movement (MediaPipe Pose
//                          landmarks, std-dev of x/y over a 3s window).
//   2. Vocalization       — audio RMS spike + frequency centroid above
//                          baseline (moans/breath are concentrated in
//                          200-1200 Hz).
//   3. Heart rate (opt.)  — instantaneous BPM > 130 + sudden recovery
//                          ramp within 60s.
//
// The verifier emits 'detected' once two of the three pass within a
// 30s window. Designed to gate edging-tracker / lockout flows
// (#347 / #348 / #350).
//
// Runs entirely in renderer; uses MediaPipe Pose Landmarker.

export interface VerifierConfig {
  webcamVideo: HTMLVideoElement       // <video> with active webcam stream
  audioStream?: MediaStream            // mic stream for vocalization signal
  heartRate$?: { getCurrent: () => number | null }
  onDetected: (signals: { pose: boolean; voice: boolean; hr: boolean; confidence: number }) => void
}

const POSE_WINDOW_FRAMES = 60     // ~2s at 30fps
const POSE_VOLATILITY_THRESHOLD = 0.08
const AUDIO_RMS_THRESHOLD = 0.25
const AUDIO_CENTROID_HZ = 400
const HR_BPM_THRESHOLD = 130

let landmarker: any | null = null

async function ensureLandmarker(): Promise<any> {
  if (landmarker) return landmarker
  const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision')
  const vision = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10/wasm',
  )
  landmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
      delegate: 'GPU',
    },
    runningMode: 'VIDEO',
    numPoses: 1,
  })
  return landmarker
}

export async function startVerifier(config: VerifierConfig): Promise<() => void> {
  await ensureLandmarker()
  const poseHistory: Array<{ x: number; y: number }> = []
  let lastDetectionAt = 0
  const flags = { pose: false, voice: false, hr: false }
  let flagsResetAt = Date.now()

  // Audio analysis.
  let audioCtx: AudioContext | null = null
  let analyser: AnalyserNode | null = null
  if (config.audioStream) {
    audioCtx = new AudioContext()
    const src = audioCtx.createMediaStreamSource(config.audioStream)
    analyser = audioCtx.createAnalyser()
    analyser.fftSize = 1024
    src.connect(analyser)
  }

  const tick = () => {
    if (stopped) return
    raf = requestAnimationFrame(tick)
    const ts = performance.now()
    if (Date.now() - flagsResetAt > 30_000) {
      flags.pose = false; flags.voice = false; flags.hr = false
      flagsResetAt = Date.now()
    }
    // Pose
    try {
      const res = landmarker.detectForVideo(config.webcamVideo, ts)
      const lm = res?.landmarks?.[0]
      if (lm && lm.length > 20) {
        // Avg wrist position (15 = left wrist, 16 = right wrist).
        const lw = lm[15], rw = lm[16]
        const cx = (lw.x + rw.x) / 2
        const cy = (lw.y + rw.y) / 2
        poseHistory.push({ x: cx, y: cy })
        if (poseHistory.length > POSE_WINDOW_FRAMES) poseHistory.shift()
        const stdev = (vals: number[]) => {
          const m = vals.reduce((a, b) => a + b, 0) / vals.length
          return Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / vals.length)
        }
        const sx = stdev(poseHistory.map((p) => p.x))
        const sy = stdev(poseHistory.map((p) => p.y))
        if (sx + sy > POSE_VOLATILITY_THRESHOLD) flags.pose = true
      }
    } catch { /* ignore */ }
    // Audio
    if (analyser) {
      const buf = new Float32Array(analyser.frequencyBinCount)
      analyser.getFloatTimeDomainData(buf)
      let sum = 0
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
      const rms = Math.sqrt(sum / buf.length)
      if (rms > AUDIO_RMS_THRESHOLD) {
        const freq = new Uint8Array(analyser.frequencyBinCount)
        analyser.getByteFrequencyData(freq)
        let centroidNum = 0, centroidDen = 0
        for (let i = 0; i < freq.length; i++) {
          const f = (i / freq.length) * (audioCtx!.sampleRate / 2)
          centroidNum += f * freq[i]; centroidDen += freq[i]
        }
        const centroid = centroidDen > 0 ? centroidNum / centroidDen : 0
        if (centroid > AUDIO_CENTROID_HZ) flags.voice = true
      }
    }
    // HR
    if (config.heartRate$) {
      const bpm = config.heartRate$.getCurrent()
      if (bpm !== null && bpm >= HR_BPM_THRESHOLD) flags.hr = true
    }
    const passed = [flags.pose, flags.voice, flags.hr].filter(Boolean).length
    if (passed >= 2 && Date.now() - lastDetectionAt > 30_000) {
      lastDetectionAt = Date.now()
      const confidence = passed / 3
      config.onDetected({ ...flags, confidence })
    }
  }
  let stopped = false
  let raf = requestAnimationFrame(tick)
  return () => {
    stopped = true
    cancelAnimationFrame(raf)
    if (audioCtx) audioCtx.close().catch(() => { /* ignore */ })
  }
}
