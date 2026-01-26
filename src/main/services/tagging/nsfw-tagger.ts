// ===============================
// File: src/main/services/tagging/nsfw-tagger.ts
// Auto-tags media using NSFWJS (optional - requires tensorflow)
// ===============================

import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'
import * as os from 'os'

export interface NSFWPrediction {
  className: 'Drawing' | 'Hentai' | 'Neutral' | 'Porn' | 'Sexy'
  probability: number
}

export interface TagResult {
  filePath: string
  predictions: NSFWPrediction[]
  primaryTag: string
  confidence: number
  suggestedTags: string[]
  error?: string
}

// Tag mappings from NSFWJS classes to more descriptive tags
const TAG_MAP: Record<string, string[]> = {
  'Porn': ['explicit', 'adult', 'xxx', 'hardcore'],
  'Sexy': ['sexy', 'sensual', 'provocative', 'softcore'],
  'Hentai': ['hentai', 'anime', 'drawn', 'explicit', 'animated'],
  'Drawing': ['drawn', 'illustration', 'art', 'artwork'],
  'Neutral': ['sfw', 'neutral', 'clean']
}

export class NSFWTagger {
  private model: any = null
  private modelLoaded: boolean = false
  private nsfwjs: any = null
  private tf: any = null
  private available: boolean = false

  constructor() {
    // Try to load tensorflow and nsfwjs
    this.checkAvailability()
  }

  private checkAvailability(): void {
    try {
      // Try to require the modules - they may not be installed
      this.tf = require('@tensorflow/tfjs-node')
      this.nsfwjs = require('nsfwjs')
      this.available = true
      console.log('NSFWJS tagger is available')
    } catch (e) {
      this.available = false
      console.log('NSFWJS not available - auto-tagging disabled. Install with: npm install nsfwjs @tensorflow/tfjs-node')
    }
  }

  isAvailable(): boolean {
    return this.available
  }

  async loadModel(): Promise<boolean> {
    if (!this.available) return false
    if (this.modelLoaded) return true

    try {
      this.model = await this.nsfwjs.load()
      this.modelLoaded = true
      console.log('NSFWJS model loaded successfully')
      return true
    } catch (e) {
      console.error('Failed to load NSFWJS model:', e)
      return false
    }
  }

  async tagImage(imagePath: string): Promise<TagResult> {
    if (!this.available) {
      return this.createErrorResult(imagePath, 'NSFWJS not available')
    }

    if (!this.modelLoaded) {
      const loaded = await this.loadModel()
      if (!loaded) {
        return this.createErrorResult(imagePath, 'Failed to load model')
      }
    }

    try {
      // Read image
      const imageBuffer = fs.readFileSync(imagePath)
      const imageTensor = this.tf.node.decodeImage(imageBuffer, 3)

      // Get predictions
      const predictions = await this.model.classify(imageTensor)

      // Clean up tensor
      imageTensor.dispose()

      // Process predictions
      return this.processResults(imagePath, predictions)
    } catch (e: any) {
      return this.createErrorResult(imagePath, e.message)
    }
  }

  async tagVideo(videoPath: string, frameCount: number = 5): Promise<TagResult> {
    if (!this.available) {
      return this.createErrorResult(videoPath, 'NSFWJS not available')
    }

    try {
      // Extract frames using ffmpeg and tag each
      const frames = await this.extractFrames(videoPath, frameCount)
      const results: TagResult[] = []

      for (const frame of frames) {
        const result = await this.tagImage(frame)
        results.push(result)
        // Clean up temp frame
        try {
          fs.unlinkSync(frame)
        } catch {}
      }

      // Aggregate results
      return this.aggregateResults(videoPath, results)
    } catch (e: any) {
      return this.createErrorResult(videoPath, e.message)
    }
  }

  private async extractFrames(videoPath: string, count: number): Promise<string[]> {
    const tempDir = path.join(os.tmpdir(), 'vault-nsfw-frames')

    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }

    try {
      // Get video duration
      const durationCmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`
      const duration = parseFloat(execSync(durationCmd).toString().trim())

      // Calculate frame intervals
      const interval = duration / (count + 1)
      const frames: string[] = []

      for (let i = 1; i <= count; i++) {
        const timestamp = interval * i
        const outputPath = path.join(tempDir, `frame_${Date.now()}_${i}.jpg`)

        execSync(`ffmpeg -ss ${timestamp} -i "${videoPath}" -vframes 1 -q:v 2 "${outputPath}" -y`, {
          stdio: 'pipe'
        })
        frames.push(outputPath)
      }

      return frames
    } catch (e) {
      console.error('Error extracting frames:', e)
      return []
    }
  }

  private aggregateResults(filePath: string, results: TagResult[]): TagResult {
    if (results.length === 0) {
      return this.createErrorResult(filePath, 'No frames extracted')
    }

    // Average predictions across frames
    const avgPredictions: Record<string, number[]> = {}

    for (const result of results) {
      for (const pred of result.predictions) {
        if (!avgPredictions[pred.className]) {
          avgPredictions[pred.className] = []
        }
        avgPredictions[pred.className].push(pred.probability)
      }
    }

    const predictions: NSFWPrediction[] = Object.entries(avgPredictions).map(([className, probs]) => ({
      className: className as NSFWPrediction['className'],
      probability: probs.reduce((a, b) => a + b, 0) / probs.length
    }))

    return this.processResults(filePath, predictions)
  }

  private processResults(filePath: string, predictions: NSFWPrediction[]): TagResult {
    const sorted = [...predictions].sort((a, b) => b.probability - a.probability)
    const primary = sorted[0]
    const suggestedTags = this.generateTags(predictions)

    return {
      filePath,
      predictions,
      primaryTag: primary.className.toLowerCase(),
      confidence: primary.probability,
      suggestedTags
    }
  }

  private generateTags(predictions: NSFWPrediction[]): string[] {
    const tags: string[] = []
    const threshold = 0.3 // Include tags with >30% confidence

    for (const pred of predictions) {
      if (pred.probability >= threshold) {
        const mappedTags = TAG_MAP[pred.className] || [pred.className.toLowerCase()]
        tags.push(...mappedTags)
      }
    }

    return [...new Set(tags)] // Remove duplicates
  }

  private createErrorResult(filePath: string, error: string): TagResult {
    return {
      filePath,
      predictions: [],
      primaryTag: 'unknown',
      confidence: 0,
      suggestedTags: [],
      error
    }
  }

  // Batch process a directory
  async tagDirectory(
    dirPath: string,
    options?: {
      recursive?: boolean
      onProgress?: (current: number, total: number, file: string) => void
    }
  ): Promise<TagResult[]> {
    if (!this.available) {
      return []
    }

    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
    const videoExtensions = ['.mp4', '.webm', '.avi', '.mov', '.mkv']
    const results: TagResult[] = []

    const files = this.getFiles(dirPath, options?.recursive ?? true)
    const mediaFiles = files.filter(f => {
      const ext = path.extname(f).toLowerCase()
      return imageExtensions.includes(ext) || videoExtensions.includes(ext)
    })

    for (let i = 0; i < mediaFiles.length; i++) {
      const file = mediaFiles[i]
      const ext = path.extname(file).toLowerCase()

      options?.onProgress?.(i + 1, mediaFiles.length, file)

      try {
        if (imageExtensions.includes(ext)) {
          results.push(await this.tagImage(file))
        } else if (videoExtensions.includes(ext)) {
          results.push(await this.tagVideo(file))
        }
      } catch (error) {
        console.error(`Error tagging ${file}:`, error)
        results.push(this.createErrorResult(file, String(error)))
      }
    }

    return results
  }

  private getFiles(dir: string, recursive: boolean): string[] {
    const files: string[] = []

    const scan = (currentDir: string) => {
      if (!fs.existsSync(currentDir)) return

      const items = fs.readdirSync(currentDir)
      for (const item of items) {
        const fullPath = path.join(currentDir, item)
        try {
          const stat = fs.statSync(fullPath)

          if (stat.isDirectory() && recursive) {
            scan(fullPath)
          } else if (stat.isFile()) {
            files.push(fullPath)
          }
        } catch {}
      }
    }

    scan(dir)
    return files
  }
}
