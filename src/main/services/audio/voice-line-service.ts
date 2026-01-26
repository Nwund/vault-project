// ===============================
// File: src/main/services/audio/voice-line-service.ts
// Manages and serves Diabella voice lines
// ===============================

import * as fs from 'fs'
import * as path from 'path'

export interface VoiceLine {
  id: string
  filename: string
  path: string
  category: string
  subcategory?: string
  intensity: number
  tags: string[]
  weight: number
  minSpiceLevel: number
  personalityPacks: string[]
  duration?: number
}

export interface VoiceLineStats {
  total: number
  byCategory: Record<string, number>
}

export class VoiceLineService {
  private voiceLines: Map<string, VoiceLine[]> = new Map()
  private audioBasePath: string
  private loaded: boolean = false

  constructor(audioBasePath: string) {
    this.audioBasePath = audioBasePath
  }

  async initialize(): Promise<void> {
    if (this.loaded) return
    await this.loadManifest()
    this.loaded = true
  }

  private async loadManifest(): Promise<void> {
    const manifestPath = path.join(this.audioBasePath, 'manifest.json')

    if (!fs.existsSync(manifestPath)) {
      console.log('No voice line manifest found at', manifestPath)
      return
    }

    try {
      const manifestContent = fs.readFileSync(manifestPath, 'utf-8')
      const manifest = JSON.parse(manifestContent)
      this.parseManifest(manifest)
      console.log(`Loaded ${this.getStats().total} voice lines`)
    } catch (e) {
      console.error('Error loading voice line manifest:', e)
    }
  }

  private parseManifest(manifest: any): void {
    if (!manifest.categories) return

    for (const [category, data] of Object.entries(manifest.categories as Record<string, any>)) {
      // Parse direct files
      if (data.files && Array.isArray(data.files)) {
        for (const file of data.files) {
          this.addVoiceLine(category, undefined, file)
        }
      }

      // Parse subcategories
      if (data.subcategories) {
        for (const [subcat, files] of Object.entries(data.subcategories as Record<string, any[]>)) {
          for (const file of files) {
            this.addVoiceLine(category, subcat, file)
          }
        }
      }
    }
  }

  private addVoiceLine(category: string, subcategory: string | undefined, fileData: any): void {
    const key = subcategory ? `${category}.${subcategory}` : category

    if (!this.voiceLines.has(key)) {
      this.voiceLines.set(key, [])
    }

    const filePath = subcategory
      ? path.join(this.audioBasePath, category, subcategory, fileData.filename)
      : path.join(this.audioBasePath, category, fileData.filename)

    // Verify file exists
    if (!fs.existsSync(filePath)) {
      return
    }

    // Get file size to estimate duration (smaller = shorter, preferred for climax)
    let fileSize = 0
    try {
      const stats = fs.statSync(filePath)
      fileSize = stats.size
    } catch {}

    // Calculate weight - prefer shorter clips for climax sounds
    // Shorter filename often = shorter clip, smaller file = shorter duration
    let weight = fileData.weight || 1
    if (category === 'climax' || subcategory === 'peak') {
      // Prefer files under 5MB (roughly 30 seconds of WAV)
      if (fileSize < 2 * 1024 * 1024) weight *= 4 // Under 2MB - highly preferred
      else if (fileSize < 5 * 1024 * 1024) weight *= 2 // Under 5MB - preferred
      else if (fileSize > 20 * 1024 * 1024) weight *= 0.3 // Over 20MB - deprioritized

      // Prefer shorter filenames (often indicate shorter, punchier clips)
      const nameLen = fileData.filename.replace(/\.[^.]+$/, '').length
      if (nameLen < 20) weight *= 1.5
      else if (nameLen > 50) weight *= 0.5
    }

    const voiceLine: VoiceLine = {
      id: `${key}_${fileData.filename}`,
      filename: fileData.filename,
      path: filePath,
      category,
      subcategory,
      intensity: fileData.intensity || 2,
      tags: fileData.tags || [],
      weight,
      minSpiceLevel: this.determineMinSpice(category, subcategory, fileData.intensity),
      personalityPacks: fileData.personalityPacks || ['all']
    }

    this.voiceLines.get(key)!.push(voiceLine)
  }

  private determineMinSpice(category: string, subcategory: string | undefined, intensity: number): number {
    // Explicit categories require higher spice levels
    const explicitCategories = ['dirty_talk', 'moans', 'climax']
    const explicitSubcategories = ['explicit', 'extreme', 'intense', 'peak', 'heavy', 'panting']

    if (explicitCategories.includes(category)) {
      if (subcategory && explicitSubcategories.includes(subcategory)) {
        return 4
      }
      return 3
    }

    if (intensity >= 4) return 4
    if (intensity >= 3) return 3
    return 1
  }

  // Get a random voice line for a category
  getVoiceLine(
    category: string,
    subcategory?: string,
    options?: {
      spiceLevel?: number
      personality?: string
      intensity?: number
    }
  ): VoiceLine | null {
    const key = subcategory ? `${category}.${subcategory}` : category
    let lines = this.voiceLines.get(key)

    // If no exact match, try just the category
    if ((!lines || lines.length === 0) && subcategory) {
      // Try to find any subcategory under this category
      for (const [k, v] of this.voiceLines.entries()) {
        if (k.startsWith(category + '.')) {
          lines = v
          break
        }
      }
    }

    if (!lines || lines.length === 0) return null

    // Filter by spice level
    if (options?.spiceLevel !== undefined) {
      lines = lines.filter(l => l.minSpiceLevel <= options.spiceLevel!)
    }

    // Filter by personality
    if (options?.personality) {
      lines = lines.filter(l =>
        l.personalityPacks.includes('all') ||
        l.personalityPacks.includes(options.personality!)
      )
    }

    // Filter by intensity
    if (options?.intensity !== undefined) {
      lines = lines.filter(l => l.intensity === options.intensity)
    }

    if (lines.length === 0) return null

    // Weighted random selection
    const totalWeight = lines.reduce((sum, l) => sum + l.weight, 0)
    let random = Math.random() * totalWeight

    for (const line of lines) {
      random -= line.weight
      if (random <= 0) return line
    }

    return lines[0]
  }

  // Get multiple voice lines (for sequences)
  getVoiceLineSequence(
    categories: Array<{ category: string; subcategory?: string }>,
    options?: {
      spiceLevel?: number
      personality?: string
    }
  ): VoiceLine[] {
    const sequence: VoiceLine[] = []

    for (const { category, subcategory } of categories) {
      const line = this.getVoiceLine(category, subcategory, options)
      if (line) {
        sequence.push(line)
      }
    }

    return sequence
  }

  // Get the file path for playback
  getAudioPath(voiceLine: VoiceLine): string {
    return voiceLine.path
  }

  // Get audio as base64 for sending to renderer
  async getAudioBase64(voiceLine: VoiceLine): Promise<string | null> {
    try {
      const buffer = fs.readFileSync(voiceLine.path)
      return buffer.toString('base64')
    } catch (e) {
      return null
    }
  }

  // List all available categories
  getCategories(): string[] {
    return Array.from(this.voiceLines.keys())
  }

  // Get stats
  getStats(): VoiceLineStats {
    const stats: VoiceLineStats = {
      total: 0,
      byCategory: {}
    }

    for (const [key, lines] of this.voiceLines.entries()) {
      stats.total += lines.length
      stats.byCategory[key] = lines.length
    }

    return stats
  }

  // Check if any voice lines are available
  hasVoiceLines(): boolean {
    return this.voiceLines.size > 0 && this.getStats().total > 0
  }

  // Reload manifest (after organizing new files)
  async reload(): Promise<void> {
    this.voiceLines.clear()
    this.loaded = false
    await this.initialize()
  }
}
