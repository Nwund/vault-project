// ===============================
// File: src/main/services/pmv/auto-pmv-service.ts
//
// Auto-PMV generator. Takes 1-3 tags from the user and assembles a project:
//   1. Find candidate videos via tag overlap (calibrated AI tags + manual tags)
//   2. Score each candidate by tag-confidence × user-rating × view count
//   3. Pull the "best window" out of each (uses AI multi-frame analysis if
//      available; otherwise the middle 60% as a safer-than-edges default)
//   4. Generate one POV/perspective caption per clip via Tier 2 (Venice)
//   5. Cut the project on a target BPM grid (defaults to 128 BPM for EDM if
//      no music supplied) — output is a ProjectClip[] that the existing
//      PmvEditor can load directly
//
// What's intentionally DEFERRED to a follow-up turn:
//   - FFmpeg-based audio loudness scoring (`silencedetect` / `volumedetect`)
//     to pick the LOUDEST stretch of each video instead of the middle 60%
//   - FFmpeg-based motion / scene-change scoring for "most action" sections
//   - Real BPM detection on a user-supplied music file (the existing renderer
//     bpm-detector.ts handles this; we just consume the BPM number here)
// ===============================

import type { DB } from '../../db'

type RawDB = DB['raw']

export interface AutoPmvOptions {
  /** 1-3 tag names. Videos must have at least one of these to be considered. */
  tags: string[]
  /** Target total project length in seconds. Default 90 (≈ a 3-minute song halved). */
  targetDurationSec?: number
  /** Beats per clip — 1 = cut every beat, 2 = every 2 beats, etc. Default 2. */
  beatsPerClip?: number
  /** BPM of the backing music. Default 128 (EDM standard). */
  bpm?: number
  /** Max # videos to draw from. Default 12 (variety without bloat). */
  maxClipSources?: number
  /** Whether to call Tier 2 to generate POV captions. Default true. */
  generateCaptions?: boolean
  /** "Most active" portion of each source video. 0..1 — 0.6 means use the middle 60%. */
  videoActiveWindow?: number
}

export interface AutoPmvClip {
  /** Source media id (matches Vault's media table). */
  mediaId: string
  /** Source filename (display only). */
  filename: string
  /** Source path on disk — needed by ffmpeg / the editor preview. */
  path: string
  /** Section of the source video to use, in seconds. */
  startSec: number
  endSec: number
  /** Beat indices in the assembled project. */
  beatStart: number
  beatEnd: number
  /** Why this clip ranked here — useful for debugging + UI surfacing. */
  reason: string
  /** Optional POV caption from Tier 2; null when generation skipped/failed. */
  caption: string | null
  /** 0..1 score the ranker assigned. */
  score: number
}

export interface AutoPmvProject {
  bpm: number
  beatsPerClip: number
  totalBeats: number
  totalDurationSec: number
  clips: AutoPmvClip[]
  meta: {
    tags: string[]
    candidatesConsidered: number
    clipsGenerated: number
    captionsGenerated: number
    captionsRequested: number
    warnings: string[]
  }
}

interface CandidateRow {
  id: string
  path: string
  filename: string
  durationSec: number | null
  rating: number
  views: number
  matchedTagCount: number
  avgTagConf: number
}

export class AutoPmvService {
  private rawDb: RawDB
  private db: DB

  constructor(db: DB) {
    this.rawDb = db.raw
    this.db = db
  }

  /**
   * Score and rank candidate videos by how well they match the requested tags
   * using BOTH manually-applied tags AND high-confidence AI rich_tags.
   *
   * Manual tag match is weighted 1.5× since it represents ground truth from the
   * user; AI tag match is weighted by the calibrated confidence.
   */
  private rankCandidates(tags: string[], maxResults: number): CandidateRow[] {
    if (tags.length === 0) return []
    const tagsLower = tags.map((t) => t.trim().toLowerCase()).filter(Boolean)
    if (tagsLower.length === 0) return []

    // Manual tag match — videos with library tags whose names match the requested set.
    const tagPlaceholders = tagsLower.map(() => '?').join(',')
    const manualRows = this.rawDb.prepare(`
      SELECT m.id, m.path, m.filename, m.durationSec,
             COALESCE(ms.rating, 0) AS rating,
             COALESCE(ms.views, 0)  AS views,
             COUNT(DISTINCT t.id)   AS matched_tag_count
      FROM media m
      LEFT JOIN media_stats ms ON ms.mediaId = m.id
      INNER JOIN media_tags mt ON mt.mediaId = m.id
      INNER JOIN tags t ON t.id = mt.tagId
      WHERE m.type = 'video'
        AND LOWER(t.name) IN (${tagPlaceholders})
      GROUP BY m.id
      HAVING matched_tag_count > 0
      ORDER BY matched_tag_count DESC, views DESC
      LIMIT ?
    `).all(...tagsLower, Math.max(maxResults * 3, 30)) as Array<{
      id: string; path: string; filename: string; durationSec: number | null;
      rating: number; views: number; matched_tag_count: number
    }>

    const candidates = new Map<string, CandidateRow>()
    for (const r of manualRows) {
      candidates.set(r.id, {
        id: r.id, path: r.path, filename: r.filename, durationSec: r.durationSec,
        rating: r.rating, views: r.views,
        matchedTagCount: r.matched_tag_count,
        avgTagConf: 1.0  // manual tags are gospel
      })
    }

    // AI rich_tags match — score by tag presence + calibrated confidence.
    const aiRows = this.rawDb.prepare(`
      SELECT m.id, m.path, m.filename, m.durationSec,
             COALESCE(ms.rating, 0) AS rating,
             COALESCE(ms.views, 0)  AS views,
             ar.rich_tags
      FROM media m
      LEFT JOIN media_stats ms ON ms.mediaId = m.id
      INNER JOIN ai_analysis_results ar ON ar.media_id = m.id
      WHERE m.type = 'video' AND ar.rich_tags IS NOT NULL
    `).all() as Array<{
      id: string; path: string; filename: string; durationSec: number | null;
      rating: number; views: number; rich_tags: string
    }>

    const wantSet = new Set(tagsLower)
    for (const r of aiRows) {
      let matched = 0
      let confSum = 0
      try {
        const arr = JSON.parse(r.rich_tags) as Array<{ name: string; confidence: number }>
        for (const t of arr) {
          if (wantSet.has(String(t.name).toLowerCase()) && typeof t.confidence === 'number') {
            matched += 1
            confSum += Math.max(0, Math.min(1, t.confidence))
          }
        }
      } catch { continue }
      if (matched === 0) continue

      const avgConf = confSum / matched
      const existing = candidates.get(r.id)
      if (existing) {
        // Combine: prefer manual match count but boost by AI confidence
        existing.avgTagConf = Math.max(existing.avgTagConf, avgConf)
      } else {
        candidates.set(r.id, {
          id: r.id, path: r.path, filename: r.filename, durationSec: r.durationSec,
          rating: r.rating, views: r.views,
          matchedTagCount: matched,
          avgTagConf: avgConf
        })
      }
    }

    // Final score: tagFit × ratingBoost × viewsBoost
    // - tagFit:   matchedTagCount/wanted × avgTagConf, manual tags get +0.5 weight implicitly via avgConf=1
    // - rating:   1 + rating/10  (0..0.5 boost)
    // - views:    1 + log10(1+views)/8  (gentle popularity boost capped ~0.4)
    const wanted = tagsLower.length
    const scored = Array.from(candidates.values()).map((c) => {
      const tagFit = (c.matchedTagCount / wanted) * c.avgTagConf
      const ratingBoost = 1 + c.rating / 10
      const viewsBoost = 1 + Math.log10(1 + c.views) / 8
      const score = tagFit * ratingBoost * viewsBoost
      return { ...c, score }
    })

    scored.sort((a, b) => (b as any).score - (a as any).score)
    return scored.slice(0, maxResults) as CandidateRow[]
  }

  /**
   * Pick a sub-window from a source video. Uses the middle `videoActiveWindow`
   * fraction to avoid intros / titles / blank ends — a robust heuristic when
   * we don't yet have ffmpeg-based loudness data.
   */
  private pickActiveWindow(durationSec: number, fraction: number): { startSec: number; endSec: number } {
    if (!durationSec || durationSec <= 0) return { startSec: 0, endSec: 0 }
    const f = Math.max(0.2, Math.min(1, fraction))
    const padding = (1 - f) / 2
    const startSec = durationSec * padding
    const endSec = durationSec * (1 - padding)
    return { startSec, endSec }
  }

  /**
   * Allocate clip slots across candidates so the project hits its target
   * duration in clips of (beatsPerClip / bps) seconds each.
   */
  private allocateSlots(
    candidates: CandidateRow[],
    targetDurationSec: number,
    bpm: number,
    beatsPerClip: number,
    activeWindow: number
  ): Array<{ candidate: CandidateRow; startSec: number; endSec: number; beatStart: number; beatEnd: number }> {
    const bps = bpm / 60
    const clipDurSec = beatsPerClip / bps
    const totalClips = Math.max(1, Math.floor(targetDurationSec / clipDurSec))

    const slots: Array<{ candidate: CandidateRow; startSec: number; endSec: number; beatStart: number; beatEnd: number }> = []
    let beatCursor = 0

    for (let i = 0; i < totalClips; i++) {
      // Round-robin through candidates so the user sees variety. If we have
      // fewer candidates than slots, this naturally repeats sources.
      const cand = candidates[i % candidates.length]
      if (!cand) break
      const dur = cand.durationSec ?? 0
      if (dur <= clipDurSec + 0.5) {
        // Source is too short — use it whole.
        slots.push({
          candidate: cand,
          startSec: 0,
          endSec: Math.min(dur, clipDurSec),
          beatStart: beatCursor,
          beatEnd: beatCursor + beatsPerClip
        })
      } else {
        const window = this.pickActiveWindow(dur, activeWindow)
        // Spread successive clips from the same source across its window.
        const sourceClipIndex = slots.filter((s) => s.candidate.id === cand.id).length
        const usableSpan = Math.max(clipDurSec, window.endSec - window.startSec - clipDurSec)
        const stride = usableSpan / Math.max(1, Math.ceil(totalClips / candidates.length))
        const startSec = Math.min(
          dur - clipDurSec,
          window.startSec + sourceClipIndex * stride
        )
        slots.push({
          candidate: cand,
          startSec,
          endSec: startSec + clipDurSec,
          beatStart: beatCursor,
          beatEnd: beatCursor + beatsPerClip
        })
      }
      beatCursor += beatsPerClip
    }
    return slots
  }

  async generate(
    options: AutoPmvOptions,
    tier2: { generateCaptions: (path: string, style: any) => Promise<{ topText: string | null; bottomText: string | null }> } | null,
    frameExtractor: { extractFrames: (path: string, type: 'video', durationSec?: number | null) => Promise<Array<{ path: string }>> } | null
  ): Promise<AutoPmvProject> {
    const tags = (options.tags || []).map((t) => String(t).trim()).filter(Boolean)
    const targetDuration = Math.max(15, Math.min(600, options.targetDurationSec ?? 90))
    const bpm = Math.max(60, Math.min(220, options.bpm ?? 128))
    const beatsPerClip = Math.max(1, Math.min(16, options.beatsPerClip ?? 2))
    const maxSources = Math.max(1, Math.min(48, options.maxClipSources ?? 12))
    const activeWindow = Math.max(0.3, Math.min(1, options.videoActiveWindow ?? 0.6))
    const generateCaptions = options.generateCaptions !== false
    const warnings: string[] = []

    // 1. Rank candidates
    const candidates = this.rankCandidates(tags, maxSources)
    if (candidates.length === 0) {
      return {
        bpm, beatsPerClip, totalBeats: 0, totalDurationSec: 0, clips: [],
        meta: {
          tags, candidatesConsidered: 0, clipsGenerated: 0,
          captionsGenerated: 0, captionsRequested: 0,
          warnings: [`No videos in library matched any of: ${tags.join(', ')}`]
        }
      }
    }

    // 2. Allocate clip slots across candidates on a beat grid
    const slots = this.allocateSlots(candidates, targetDuration, bpm, beatsPerClip, activeWindow)

    // 3. Build clips with reason strings + (optional) Tier 2 POV captions
    let captionsGenerated = 0
    let captionsRequested = 0
    const clips: AutoPmvClip[] = []
    for (const slot of slots) {
      const { candidate: c } = slot
      let caption: string | null = null

      if (generateCaptions && tier2 && frameExtractor) {
        captionsRequested += 1
        try {
          // Pull a representative frame from this clip's window to feed Tier 2.
          // We use the FrameExtractor's existing logic so frame caching is shared.
          const frames = await frameExtractor.extractFrames(c.path, 'video', c.durationSec ?? null)
          if (frames.length > 0) {
            // Prefer the middle frame — most representative of the clip's mood.
            const f = frames[Math.floor(frames.length / 2)]
            const cap = await tier2.generateCaptions(f.path, 'pov')
            // POV style returns the line as bottomText; fall back to top if needed.
            caption = (cap.bottomText || cap.topText || null) || null
            if (caption) captionsGenerated += 1
          }
        } catch (err) {
          warnings.push(`Caption gen failed for ${c.filename}: ${(err as Error)?.message ?? err}`)
        }
      }

      clips.push({
        mediaId: c.id,
        filename: c.filename,
        path: c.path,
        startSec: slot.startSec,
        endSec: slot.endSec,
        beatStart: slot.beatStart,
        beatEnd: slot.beatEnd,
        reason: `${c.matchedTagCount}/${tags.length} tags · score ${(c as any).score?.toFixed(2)}`,
        caption,
        score: (c as any).score ?? 0
      })
    }

    return {
      bpm,
      beatsPerClip,
      totalBeats: slots.length * beatsPerClip,
      totalDurationSec: clips.reduce((s, c) => s + (c.endSec - c.startSec), 0),
      clips,
      meta: {
        tags,
        candidatesConsidered: candidates.length,
        clipsGenerated: clips.length,
        captionsGenerated,
        captionsRequested,
        warnings
      }
    }
  }

  /**
   * #178 — Build a PMV from a single folder + an externally-supplied BPM.
   *
   * Skips the tag-ranker entirely. Walks `folderPath` for video files,
   * uses ffprobe to read each one's duration, treats every video as an
   * equally-weighted candidate, then runs the same beat-grid allocator
   * + caption pipeline as `generate()`.
   *
   * The renderer is responsible for detecting BPM from the user-supplied
   * music file (bpm-detector.ts already handles that with Web Audio) and
   * passing the number in here.
   */
  async generateFromFolder(
    options: {
      folderPath: string
      bpm: number
      targetDurationSec?: number
      beatsPerClip?: number
      maxClipSources?: number
      generateCaptions?: boolean
      videoActiveWindow?: number
    },
    tier2: { generateCaptions: (path: string, style: any) => Promise<{ topText: string | null; bottomText: string | null }> } | null,
    frameExtractor: { extractFrames: (path: string, type: 'video', durationSec?: number | null) => Promise<Array<{ path: string }>> } | null,
  ): Promise<AutoPmvProject> {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const targetDuration = Math.max(15, Math.min(600, options.targetDurationSec ?? 90))
    const bpm = Math.max(60, Math.min(220, options.bpm))
    const beatsPerClip = Math.max(1, Math.min(16, options.beatsPerClip ?? 2))
    const maxSources = Math.max(1, Math.min(48, options.maxClipSources ?? 12))
    const activeWindow = Math.max(0.3, Math.min(1, options.videoActiveWindow ?? 0.6))
    const generateCaptions = options.generateCaptions !== false
    const warnings: string[] = []

    // Recursive scan with depth cap so a misclick on a huge tree
    // doesn't lock up the main process.
    const VIDEO_EXT = new Set(['.mp4', '.mov', '.mkv', '.webm', '.avi', '.m4v', '.mpg', '.mpeg', '.wmv'])
    const found: string[] = []
    const stack: Array<{ dir: string; depth: number }> = [{ dir: options.folderPath, depth: 0 }]
    while (stack.length > 0 && found.length < maxSources * 4) {
      const cur = stack.pop()!
      let entries: import('node:fs').Dirent[] = []
      try { entries = fs.readdirSync(cur.dir, { withFileTypes: true }) } catch { continue }
      for (const e of entries) {
        const full = path.join(cur.dir, e.name)
        if (e.isDirectory()) {
          if (cur.depth < 3) stack.push({ dir: full, depth: cur.depth + 1 })
        } else if (e.isFile() && VIDEO_EXT.has(path.extname(e.name).toLowerCase())) {
          found.push(full)
        }
      }
    }

    if (found.length === 0) {
      return {
        bpm, beatsPerClip, totalBeats: 0, totalDurationSec: 0, clips: [],
        meta: { tags: [], candidatesConsidered: 0, clipsGenerated: 0, captionsGenerated: 0, captionsRequested: 0, warnings: [`No video files under ${options.folderPath}`] }
      }
    }

    // Probe each file for duration via ffprobe.
    const ffpaths = await import('../../ffpaths')
    const probe = ffpaths.ffprobeBin
    const { spawnSync } = await import('node:child_process')
    const candidates: CandidateRow[] = []
    for (const filePath of found.slice(0, maxSources)) {
      let durationSec: number | null = null
      if (probe) {
        try {
          const r = spawnSync(probe, [
            '-v', 'error', '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1', filePath,
          ], { encoding: 'utf8' })
          const d = Number(r.stdout.trim())
          if (Number.isFinite(d) && d > 0) durationSec = d
        } catch { /* skip */ }
      }
      candidates.push({
        // Use the path as id since these are unindexed files; the
        // PmvEditor only displays it, so the format doesn't matter.
        id: `folder:${filePath}`,
        path: filePath,
        filename: path.basename(filePath),
        durationSec,
        rating: 0,
        views: 0,
        matchedTagCount: 1,
        avgTagConf: 0.5,
      })
    }

    const slots = this.allocateSlots(candidates, targetDuration, bpm, beatsPerClip, activeWindow)
    let captionsGenerated = 0
    let captionsRequested = 0
    const clips: AutoPmvClip[] = []
    for (const slot of slots) {
      const { candidate: c } = slot
      let caption: string | null = null
      if (generateCaptions && tier2 && frameExtractor) {
        captionsRequested += 1
        try {
          const frames = await frameExtractor.extractFrames(c.path, 'video', c.durationSec ?? null)
          if (frames.length > 0) {
            const f = frames[Math.floor(frames.length / 2)]
            const cap = await tier2.generateCaptions(f.path, 'pov')
            caption = (cap.bottomText || cap.topText || null) || null
            if (caption) captionsGenerated += 1
          }
        } catch (err) {
          warnings.push(`Caption gen failed for ${c.filename}: ${(err as Error)?.message ?? err}`)
        }
      }
      clips.push({
        mediaId: c.id,
        filename: c.filename,
        path: c.path,
        startSec: slot.startSec,
        endSec: slot.endSec,
        beatStart: slot.beatStart,
        beatEnd: slot.beatEnd,
        reason: `Folder-scan pick @ beat ${slot.beatStart}`,
        caption,
        score: 0.5,
      })
    }

    return {
      bpm, beatsPerClip, totalBeats: clips[clips.length - 1]?.beatEnd ?? 0,
      totalDurationSec: clips.reduce((s, c) => s + (c.endSec - c.startSec), 0),
      clips,
      meta: {
        tags: [`folder:${path.basename(options.folderPath)}`],
        candidatesConsidered: candidates.length,
        clipsGenerated: clips.length,
        captionsGenerated,
        captionsRequested,
        warnings,
      },
    }
  }
}

let singleton: AutoPmvService | null = null
export function getAutoPmvService(db: DB): AutoPmvService {
  if (!singleton) singleton = new AutoPmvService(db)
  return singleton
}
