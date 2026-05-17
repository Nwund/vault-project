// File: src/main/services/body-part-heatmap.ts
//
// #369 H-145 — Body-part heatmap indexer + scrubber overlay. Reads
// cached NudeNet detection frames from ai_analysis_results, bucketizes
// per-class scores onto a per-second timeline, and emits a compact
// heatmap the renderer can draw above the scrubber.
//
// Output shape:
//   timeline: Array<{ timeSec, classes: { CLASS_NAME: 0..1, ... }}>
//   summary:  { CLASS_NAME: totalSeconds, ... } (how long that part
//             was on-screen across the whole video)
//
// Renderer typically reduces `classes` to a single dominant-class
// color per bucket for the scrubber stripe, but the full per-class
// data is available for richer overlays (per-part scroll-jump).

import type Database from 'better-sqlite3'
type Raw = Database.Database

export interface HeatmapBucket {
  timeSec: number
  classes: Record<string, number>
  dominantClass: string | null
  dominantScore: number
}

export interface HeatmapSummary {
  durationSec: number
  bucketSec: number
  buckets: HeatmapBucket[]
  classTotals: Record<string, number>
}

interface NudeFrame {
  ts: number
  detections?: Array<{ cls: string; score: number; bbox?: [number, number, number, number] }>
  classes?: Record<string, number>
}

function readFrames(db: Raw, mediaId: string): NudeFrame[] {
  try {
    const row = db.prepare(`SELECT rich_tags FROM ai_analysis_results WHERE media_id = ?`).get(mediaId) as { rich_tags: string | null } | undefined
    if (!row?.rich_tags) return []
    const parsed = JSON.parse(row.rich_tags)
    const frames = parsed.nudityFrames ?? parsed.frames ?? parsed.nudeNetFrames ?? []
    return Array.isArray(frames) ? frames as NudeFrame[] : []
  } catch {
    return []
  }
}

export function buildHeatmap(db: Raw, mediaId: string, durationSec: number, bucketSec = 2): HeatmapSummary {
  const frames = readFrames(db, mediaId)
  const bucketCount = Math.max(1, Math.ceil(durationSec / bucketSec))
  const buckets: HeatmapBucket[] = Array.from({ length: bucketCount }, (_, i) => ({
    timeSec: i * bucketSec,
    classes: {},
    dominantClass: null,
    dominantScore: 0,
  }))
  for (const f of frames) {
    const idx = Math.min(bucketCount - 1, Math.floor(f.ts / bucketSec))
    const bucket = buckets[idx]
    // Two possible cache shapes — detections[] or classes{}.
    if (f.detections && Array.isArray(f.detections)) {
      for (const d of f.detections) {
        bucket.classes[d.cls] = Math.max(bucket.classes[d.cls] ?? 0, d.score)
      }
    } else if (f.classes) {
      for (const [cls, score] of Object.entries(f.classes)) {
        bucket.classes[cls] = Math.max(bucket.classes[cls] ?? 0, Number(score) || 0)
      }
    }
  }
  // Compute dominant class per bucket + class totals.
  const classTotals: Record<string, number> = {}
  for (const bucket of buckets) {
    let dominant: string | null = null
    let domScore = 0
    for (const [cls, score] of Object.entries(bucket.classes)) {
      if (score > domScore) { dominant = cls; domScore = score }
      // Class totals: count this bucket toward the class only if score is meaningful.
      if (score >= 0.3) classTotals[cls] = (classTotals[cls] ?? 0) + bucketSec
    }
    bucket.dominantClass = dominant
    bucket.dominantScore = domScore
  }
  return { durationSec, bucketSec, buckets, classTotals }
}

// Find timestamps where a specific body part appears (above threshold).
// Used by the "jump to next [class]" scrubber action.
export function findClassTimestamps(db: Raw, mediaId: string, targetClass: string, threshold = 0.5): number[] {
  const frames = readFrames(db, mediaId)
  const out: number[] = []
  let lastTs = -Infinity
  for (const f of frames) {
    let score = 0
    if (f.detections) {
      for (const d of f.detections) {
        if (d.cls === targetClass) score = Math.max(score, d.score)
      }
    } else if (f.classes && f.classes[targetClass]) {
      score = f.classes[targetClass]
    }
    if (score >= threshold && f.ts - lastTs > 2) {  // dedupe within 2s
      out.push(f.ts)
      lastTs = f.ts
    }
  }
  return out
}
