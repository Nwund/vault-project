// ===============================
// File: src/main/services/ai/video-analyzer.ts
// AI-powered video analysis: scene detection, tagging, summaries, highlights
// ===============================

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegPath from 'ffmpeg-static'
import { getAiConfig } from '../../ai/aiTagger'

ffmpeg.setFfmpegPath(ffmpegPath as string)

export interface VideoScene {
  startTime: number      // seconds
  endTime: number        // seconds
  thumbnail?: string     // base64 or path
  tags: string[]         // detected tags for this scene
  description?: string   // AI-generated description
  intensity: number      // 0-1 score
}

export interface VideoAnalysis {
  mediaId: string
  duration: number
  scenes: VideoScene[]
  summary: string
  tags: Array<{ name: string; confidence: number; isNew: boolean }>
  highlights: Array<{ time: number; score: number; reason: string }>
  bestThumbnailTime: number
  analyzedAt: number
}

export interface AnalysisProgress {
  stage: 'extracting' | 'analyzing' | 'detecting' | 'summarizing'
  current: number
  total: number
  message: string
}

// Extract frames at regular intervals
async function extractFramesAtIntervals(
  videoPath: string,
  intervalSec: number = 5,
  maxFrames: number = 30
): Promise<Array<{ time: number; path: string }>> {
  const outDir = path.join(os.tmpdir(), 'Vault', 'analysis', crypto.randomUUID())
  fs.mkdirSync(outDir, { recursive: true })

  // Get video duration first
  const duration = await new Promise<number>((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) reject(err)
      else resolve(metadata.format.duration || 60)
    })
  })

  const frameCount = Math.min(maxFrames, Math.ceil(duration / intervalSec))
  const frames: Array<{ time: number; path: string }> = []

  for (let i = 0; i < frameCount; i++) {
    const time = Math.min(i * intervalSec, duration - 1)
    const framePath = path.join(outDir, `frame_${String(i).padStart(3, '0')}.jpg`)

    await new Promise<void>((resolve, reject) => {
      ffmpeg(videoPath)
        .seekInput(time)
        .outputOptions(['-vframes', '1', '-q:v', '3'])
        .output(framePath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run()
    })

    if (fs.existsSync(framePath)) {
      frames.push({ time, path: framePath })
    }
  }

  return frames
}

// Analyze a single frame with Ollama
async function analyzeFrame(
  imagePath: string,
  existingTags: string[] = []
): Promise<{
  tags: Array<{ name: string; confidence: number }>
  description: string
  intensity: number
}> {
  const aiConfig = getAiConfig()
  const imageB64 = fs.readFileSync(imagePath).toString('base64')

  const prompt = `You are analyzing a frame from an adult video for tagging and description.

TASK 1 - TAGS: Identify relevant tags. You can use existing tags OR suggest new ones.
Existing tags in library: ${existingTags.slice(0, 50).join(', ')}

TASK 2 - DESCRIPTION: Write a brief, tasteful 1-sentence description of what's happening.

TASK 3 - INTENSITY: Rate the intensity/explicitness from 0.0 (softcore/tease) to 1.0 (hardcore/climax).

Return JSON ONLY:
{
  "tags": [{"name": "tag_name", "confidence": 0.8}],
  "description": "Brief description of the scene",
  "intensity": 0.5
}`

  try {
    const res = await fetch(new URL('/api/chat', aiConfig.ollamaUrl).toString(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: aiConfig.ollamaModel,
        stream: false,
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: 'Analyze this frame.', images: [imageB64] }
        ]
      })
    })

    if (!res.ok) {
      return { tags: [], description: '', intensity: 0.5 }
    }

    const json = await res.json() as { message?: { content?: string } }
    const text = json?.message?.content ?? ''

    const match = text.match(/\{[\s\S]*\}/)
    if (match) {
      const parsed = JSON.parse(match[0])
      return {
        tags: Array.isArray(parsed.tags) ? parsed.tags : [],
        description: parsed.description || '',
        intensity: typeof parsed.intensity === 'number' ? parsed.intensity : 0.5
      }
    }
  } catch (e) {
    console.error('[VideoAnalyzer] Frame analysis failed:', e)
  }

  return { tags: [], description: '', intensity: 0.5 }
}

// Detect scene changes based on intensity shifts
function detectScenes(
  frameAnalyses: Array<{ time: number; tags: string[]; description: string; intensity: number }>
): VideoScene[] {
  if (frameAnalyses.length === 0) return []

  const scenes: VideoScene[] = []
  let currentScene: VideoScene = {
    startTime: 0,
    endTime: 0,
    tags: [],
    description: frameAnalyses[0]?.description,
    intensity: frameAnalyses[0]?.intensity || 0.5
  }

  const tagSet = new Set<string>()

  for (let i = 0; i < frameAnalyses.length; i++) {
    const frame = frameAnalyses[i]
    const prevFrame = frameAnalyses[i - 1]

    // Collect tags
    frame.tags.forEach(t => tagSet.add(t))

    // Detect scene change if intensity changes significantly
    const intensityChange = prevFrame ? Math.abs(frame.intensity - prevFrame.intensity) : 0

    if (intensityChange > 0.3 || i === frameAnalyses.length - 1) {
      // End current scene
      currentScene.endTime = frame.time
      currentScene.tags = Array.from(tagSet)
      scenes.push({ ...currentScene })

      // Start new scene
      if (i < frameAnalyses.length - 1) {
        tagSet.clear()
        currentScene = {
          startTime: frame.time,
          endTime: frame.time,
          tags: [],
          description: frame.description,
          intensity: frame.intensity
        }
      }
    }
  }

  return scenes
}

// Find highlight moments (high intensity frames)
function findHighlights(
  frameAnalyses: Array<{ time: number; intensity: number; description: string }>,
  topN: number = 5
): Array<{ time: number; score: number; reason: string }> {
  return frameAnalyses
    .map(f => ({
      time: f.time,
      score: f.intensity,
      reason: f.description || 'High intensity moment'
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
}

// Find best thumbnail time (interesting but not too explicit)
function findBestThumbnailTime(
  frameAnalyses: Array<{ time: number; intensity: number }>
): number {
  // Prefer frames with medium intensity (0.3-0.6) - interesting but appropriate
  const idealFrames = frameAnalyses.filter(f => f.intensity >= 0.3 && f.intensity <= 0.7)

  if (idealFrames.length > 0) {
    // Pick one from the middle of the video
    const midIndex = Math.floor(idealFrames.length / 2)
    return idealFrames[midIndex].time
  }

  // Fallback: frame at 20% of video
  return frameAnalyses[Math.floor(frameAnalyses.length * 0.2)]?.time || 0
}

// Generate overall summary from scene descriptions
async function generateSummary(scenes: VideoScene[]): Promise<string> {
  const aiConfig = getAiConfig()

  const descriptions = scenes
    .filter(s => s.description)
    .map((s, i) => `Scene ${i + 1} (${Math.floor(s.startTime)}s-${Math.floor(s.endTime)}s): ${s.description}`)
    .join('\n')

  if (!descriptions) return ''

  const prompt = `Based on these scene descriptions from an adult video, write a brief 2-3 sentence summary:

${descriptions}

Keep it tasteful but descriptive. Focus on the overall content and progression.`

  try {
    const res = await fetch(new URL('/api/chat', aiConfig.ollamaUrl).toString(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3.1',  // Use text model for summary
        stream: false,
        messages: [
          { role: 'user', content: prompt }
        ]
      })
    })

    if (res.ok) {
      const json = await res.json() as { message?: { content?: string } }
      return json?.message?.content?.trim() || ''
    }
  } catch (e) {
    console.error('[VideoAnalyzer] Summary generation failed:', e)
  }

  return scenes[0]?.description || ''
}

// Main analysis function
export async function analyzeVideo(
  videoPath: string,
  mediaId: string,
  existingTags: string[] = [],
  onProgress?: (progress: AnalysisProgress) => void
): Promise<VideoAnalysis> {
  const startTime = Date.now()

  // Stage 1: Extract frames
  onProgress?.({ stage: 'extracting', current: 0, total: 1, message: 'Extracting frames...' })
  const frames = await extractFramesAtIntervals(videoPath, 5, 24)  // Every 5 seconds, max 24 frames

  // Stage 2: Analyze each frame
  const frameAnalyses: Array<{
    time: number
    tags: Array<{ name: string; confidence: number }>
    description: string
    intensity: number
  }> = []

  for (let i = 0; i < frames.length; i++) {
    onProgress?.({
      stage: 'analyzing',
      current: i + 1,
      total: frames.length,
      message: `Analyzing frame ${i + 1}/${frames.length}...`
    })

    const analysis = await analyzeFrame(frames[i].path, existingTags)
    frameAnalyses.push({
      time: frames[i].time,
      ...analysis
    })
  }

  // Stage 3: Detect scenes
  onProgress?.({ stage: 'detecting', current: 0, total: 1, message: 'Detecting scenes...' })
  const scenes = detectScenes(
    frameAnalyses.map(f => ({
      time: f.time,
      tags: f.tags.map(t => t.name),
      description: f.description,
      intensity: f.intensity
    }))
  )

  // Collect all unique tags with confidence
  const tagMap = new Map<string, { confidence: number; isNew: boolean }>()
  for (const frame of frameAnalyses) {
    for (const tag of frame.tags) {
      const existing = tagMap.get(tag.name)
      const isNew = !existingTags.includes(tag.name)
      if (!existing || tag.confidence > existing.confidence) {
        tagMap.set(tag.name, { confidence: tag.confidence, isNew })
      }
    }
  }

  // Stage 4: Generate summary
  onProgress?.({ stage: 'summarizing', current: 0, total: 1, message: 'Generating summary...' })
  const summary = await generateSummary(scenes)

  // Find highlights and best thumbnail
  const highlights = findHighlights(frameAnalyses)
  const bestThumbnailTime = findBestThumbnailTime(frameAnalyses)

  // Get duration
  const duration = await new Promise<number>((resolve) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      resolve(metadata?.format?.duration || 0)
    })
  })

  // Cleanup temp frames
  for (const frame of frames) {
    try { fs.unlinkSync(frame.path) } catch {}
  }

  return {
    mediaId,
    duration,
    scenes,
    summary,
    tags: Array.from(tagMap.entries()).map(([name, data]) => ({
      name,
      confidence: data.confidence,
      isNew: data.isNew
    })),
    highlights,
    bestThumbnailTime,
    analyzedAt: Date.now()
  }
}

// Check if video analyzer is available
export async function isAnalyzerAvailable(): Promise<boolean> {
  const aiConfig = getAiConfig()
  try {
    const res = await fetch(new URL('/api/tags', aiConfig.ollamaUrl).toString(), {
      method: 'GET',
      signal: AbortSignal.timeout(3000)
    })
    return res.ok
  } catch {
    return false
  }
}
