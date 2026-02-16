// File: src/main/services/pmv/bpm-detector.ts
// BPM detection for PMV Editor using peak detection algorithm

/**
 * BPM Detection using peak detection in the time domain
 *
 * Algorithm:
 * 1. Filter audio to focus on bass frequencies (low-pass filter)
 * 2. Detect peaks above a threshold
 * 3. Calculate intervals between consecutive peaks
 * 4. Find the most common interval and convert to BPM
 */

export interface BpmResult {
  bpm: number
  confidence: number // 0-1 indicating detection confidence
  method: 'peak' | 'fallback'
}

export interface PeakDetectionOptions {
  minBpm?: number
  maxBpm?: number
  sampleWindowSeconds?: number // How many seconds to analyze
}

const DEFAULT_OPTIONS: Required<PeakDetectionOptions> = {
  minBpm: 60,
  maxBpm: 200,
  sampleWindowSeconds: 30 // Analyze first 30 seconds
}

/**
 * Detect BPM from audio buffer data (for use in renderer)
 * This analyzes the raw PCM data from Web Audio API
 */
export function detectBpmFromBuffer(
  channelData: Float32Array,
  sampleRate: number,
  options: PeakDetectionOptions = {}
): BpmResult {
  const opts = { ...DEFAULT_OPTIONS, ...options }

  // Limit analysis to sampleWindowSeconds
  const maxSamples = Math.floor(opts.sampleWindowSeconds * sampleRate)
  const data = channelData.length > maxSamples
    ? channelData.slice(0, maxSamples)
    : channelData

  // Apply low-pass filter to isolate bass/kick frequencies
  const filtered = lowPassFilter(data, sampleRate, 150) // 150Hz cutoff

  // Calculate energy envelope
  const envelope = calculateEnergyEnvelope(filtered, sampleRate)

  // Find peaks in the envelope
  const peaks = findPeaks(envelope, sampleRate)

  if (peaks.length < 4) {
    // Not enough peaks detected, return fallback
    return {
      bpm: 120, // Common default
      confidence: 0,
      method: 'fallback'
    }
  }

  // Calculate intervals between peaks
  const intervals: number[] = []
  for (let i = 1; i < peaks.length; i++) {
    const interval = peaks[i] - peaks[i - 1]
    // Filter out unreasonable intervals
    const bpm = 60 / interval
    if (bpm >= opts.minBpm && bpm <= opts.maxBpm) {
      intervals.push(interval)
    }
  }

  if (intervals.length === 0) {
    return {
      bpm: 120,
      confidence: 0,
      method: 'fallback'
    }
  }

  // Find most common interval using histogram
  const { mostCommonInterval, confidence } = findMostCommonInterval(intervals)

  const bpm = Math.round(60 / mostCommonInterval)

  return {
    bpm: Math.max(opts.minBpm, Math.min(opts.maxBpm, bpm)),
    confidence,
    method: 'peak'
  }
}

/**
 * Simple low-pass filter implementation
 */
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

/**
 * Calculate energy envelope using root mean square over windows
 */
function calculateEnergyEnvelope(data: Float32Array, sampleRate: number): { times: number[], values: number[] } {
  const windowSize = Math.floor(sampleRate * 0.01) // 10ms windows
  const hopSize = Math.floor(windowSize / 2) // 50% overlap

  const times: number[] = []
  const values: number[] = []

  for (let i = 0; i + windowSize <= data.length; i += hopSize) {
    let sum = 0
    for (let j = 0; j < windowSize; j++) {
      sum += data[i + j] * data[i + j]
    }
    const rms = Math.sqrt(sum / windowSize)

    times.push((i + windowSize / 2) / sampleRate)
    values.push(rms)
  }

  return { times, values }
}

/**
 * Find peaks in the energy envelope
 */
function findPeaks(envelope: { times: number[], values: number[] }, sampleRate: number): number[] {
  const { times, values } = envelope

  if (values.length < 3) return []

  // Calculate threshold as a percentage of max value
  const maxVal = Math.max(...values)
  const threshold = maxVal * 0.3 // 30% of max

  // Minimum distance between peaks (in samples)
  const minPeakDistance = 10 // ~200ms between beats minimum

  const peaks: number[] = []

  for (let i = 1; i < values.length - 1; i++) {
    // Check if this is a local maximum above threshold
    if (values[i] > values[i - 1] &&
        values[i] > values[i + 1] &&
        values[i] > threshold) {
      // Check minimum distance from last peak
      if (peaks.length === 0 || i - peaks[peaks.length - 1] >= minPeakDistance) {
        peaks.push(i)
      }
    }
  }

  // Convert peak indices to times
  return peaks.map(i => times[i])
}

/**
 * Find the most common interval using histogram binning
 */
function findMostCommonInterval(intervals: number[]): { mostCommonInterval: number, confidence: number } {
  // Bin intervals (5ms bins)
  const binSize = 0.005
  const bins: Map<number, number[]> = new Map()

  for (const interval of intervals) {
    const binIndex = Math.round(interval / binSize)
    const existing = bins.get(binIndex) || []
    existing.push(interval)
    bins.set(binIndex, existing)
  }

  // Find bin with most intervals
  let maxCount = 0
  let bestBin: number[] = []

  for (const [, binIntervals] of bins) {
    if (binIntervals.length > maxCount) {
      maxCount = binIntervals.length
      bestBin = binIntervals
    }
  }

  // Average the intervals in the best bin
  const avgInterval = bestBin.reduce((a, b) => a + b, 0) / bestBin.length

  // Confidence is based on how many intervals fell into this bin
  const confidence = Math.min(1, maxCount / (intervals.length * 0.5))

  return { mostCommonInterval: avgInterval, confidence }
}

/**
 * Common BPM values for music (for rounding to nearest common tempo)
 */
export const COMMON_BPMS = [
  60, 70, 80, 85, 90, 95, 100, 105, 110, 115,
  120, 125, 128, 130, 135, 140, 145, 150, 160, 170, 180
]

/**
 * Round to nearest common BPM if close enough
 */
export function roundToCommonBpm(bpm: number, tolerance = 2): number {
  for (const common of COMMON_BPMS) {
    if (Math.abs(bpm - common) <= tolerance) {
      return common
    }
  }
  return bpm
}
