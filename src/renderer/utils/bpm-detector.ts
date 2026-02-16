// File: src/renderer/utils/bpm-detector.ts
// BPM detection for PMV Editor using peak detection algorithm (client-side)

export interface BpmResult {
  bpm: number
  confidence: number
  method: 'peak' | 'fallback'
}

export interface PeakDetectionOptions {
  minBpm?: number
  maxBpm?: number
  sampleWindowSeconds?: number
}

const DEFAULT_OPTIONS: Required<PeakDetectionOptions> = {
  minBpm: 60,
  maxBpm: 200,
  sampleWindowSeconds: 30
}

export function detectBpmFromBuffer(
  channelData: Float32Array,
  sampleRate: number,
  options: PeakDetectionOptions = {}
): BpmResult {
  const opts = { ...DEFAULT_OPTIONS, ...options }

  const maxSamples = Math.floor(opts.sampleWindowSeconds * sampleRate)
  const data = channelData.length > maxSamples
    ? channelData.slice(0, maxSamples)
    : channelData

  const filtered = lowPassFilter(data, sampleRate, 150)
  const envelope = calculateEnergyEnvelope(filtered, sampleRate)
  const peaks = findPeaks(envelope, sampleRate)

  if (peaks.length < 4) {
    return { bpm: 120, confidence: 0, method: 'fallback' }
  }

  const intervals: number[] = []
  for (let i = 1; i < peaks.length; i++) {
    const interval = peaks[i] - peaks[i - 1]
    const bpm = 60 / interval
    if (bpm >= opts.minBpm && bpm <= opts.maxBpm) {
      intervals.push(interval)
    }
  }

  if (intervals.length === 0) {
    return { bpm: 120, confidence: 0, method: 'fallback' }
  }

  const { mostCommonInterval, confidence } = findMostCommonInterval(intervals)
  const bpm = Math.round(60 / mostCommonInterval)

  return {
    bpm: Math.max(opts.minBpm, Math.min(opts.maxBpm, bpm)),
    confidence,
    method: 'peak'
  }
}

function lowPassFilter(data: Float32Array, sampleRate: number, cutoff: number): Float32Array {
  const rc = 1 / (2 * Math.PI * cutoff)
  const dt = 1 / sampleRate
  const alpha = dt / (rc + dt)
  const filtered = new Float32Array(data.length)
  filtered[0] = data[0]
  for (let i = 1; i < data.length; i++) {
    filtered[i] = filtered[i - 1] + alpha * (data[i] - filtered[i - 1])
  }
  return filtered
}

function calculateEnergyEnvelope(data: Float32Array, sampleRate: number): { times: number[], values: number[] } {
  const windowSize = Math.floor(sampleRate * 0.01)
  const hopSize = Math.floor(windowSize / 2)
  const times: number[] = []
  const values: number[] = []
  for (let i = 0; i + windowSize <= data.length; i += hopSize) {
    let sum = 0
    for (let j = 0; j < windowSize; j++) {
      sum += data[i + j] * data[i + j]
    }
    times.push((i + windowSize / 2) / sampleRate)
    values.push(Math.sqrt(sum / windowSize))
  }
  return { times, values }
}

function findPeaks(envelope: { times: number[], values: number[] }, _sampleRate: number): number[] {
  const { times, values } = envelope
  if (values.length < 3) return []
  const maxVal = Math.max(...values)
  const threshold = maxVal * 0.3
  const minPeakDistance = 10
  const peaks: number[] = []
  for (let i = 1; i < values.length - 1; i++) {
    if (values[i] > values[i - 1] && values[i] > values[i + 1] && values[i] > threshold) {
      if (peaks.length === 0 || i - peaks[peaks.length - 1] >= minPeakDistance) {
        peaks.push(i)
      }
    }
  }
  return peaks.map(i => times[i])
}

function findMostCommonInterval(intervals: number[]): { mostCommonInterval: number, confidence: number } {
  const binSize = 0.005
  const bins: Map<number, number[]> = new Map()
  for (const interval of intervals) {
    const binIndex = Math.round(interval / binSize)
    const existing = bins.get(binIndex) || []
    existing.push(interval)
    bins.set(binIndex, existing)
  }
  let maxCount = 0
  let bestBin: number[] = []
  for (const [, binIntervals] of bins) {
    if (binIntervals.length > maxCount) {
      maxCount = binIntervals.length
      bestBin = binIntervals
    }
  }
  const avgInterval = bestBin.reduce((a, b) => a + b, 0) / bestBin.length
  const confidence = Math.min(1, maxCount / (intervals.length * 0.5))
  return { mostCommonInterval: avgInterval, confidence }
}

export const COMMON_BPMS = [
  60, 70, 80, 85, 90, 95, 100, 105, 110, 115,
  120, 125, 128, 130, 135, 140, 145, 150, 160, 170, 180
]

export function roundToCommonBpm(bpm: number, tolerance = 2): number {
  for (const common of COMMON_BPMS) {
    if (Math.abs(bpm - common) <= tolerance) return common
  }
  return bpm
}
