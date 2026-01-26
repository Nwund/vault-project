// File: src/main/services/diabella/sound-manager.ts
// Diabella Sound Manager - Sound Effect Management

import * as fs from 'fs'
import * as path from 'path'

interface SoundCategory {
  files: string[]
  lastPlayed: number
  cooldown: number // ms
}

export class SoundManager {
  private soundDir: string
  private categories: Map<string, SoundCategory> = new Map()

  constructor(dataDir: string) {
    this.soundDir = path.join(dataDir, 'sounds')
    if (!fs.existsSync(this.soundDir)) {
      fs.mkdirSync(this.soundDir, { recursive: true })
    }
    this.scanSounds()
    console.log('[SoundManager] Initialized, sounds dir:', this.soundDir)
  }

  scanSounds(): void {
    this.categories.clear()

    if (!fs.existsSync(this.soundDir)) {
      console.log('[SoundManager] Sound directory does not exist')
      return
    }

    const files = fs.readdirSync(this.soundDir).filter(f =>
      f.endsWith('.mp3') || f.endsWith('.wav') || f.endsWith('.ogg')
    )

    console.log('[SoundManager] Found', files.length, 'sound files')

    // Categorize by filename keywords
    files.forEach(file => {
      const lower = file.toLowerCase()
      const fullPath = path.join(this.soundDir, file)

      let category = 'ambient'

      if (lower.includes('moan')) {
        if (lower.includes('soft') || lower.includes('light')) category = 'moan_soft'
        else if (lower.includes('loud') || lower.includes('intense')) category = 'moan_loud'
        else category = 'moan'
      }
      else if (lower.includes('gasp')) category = 'gasp'
      else if (lower.includes('breath')) {
        if (lower.includes('heavy')) category = 'breath_heavy'
        else category = 'breath'
      }
      else if (lower.includes('cum') || lower.includes('orgasm')) category = 'orgasm'
      else if (lower.includes('giggle') || lower.includes('laugh')) category = 'giggle'
      else if (lower.includes('whisper')) category = 'whisper'
      else if (lower.includes('wet') || lower.includes('slop')) category = 'wet'
      else if (lower.includes('kiss')) category = 'kiss'
      else if (lower.includes('sigh')) category = 'sigh'
      else if (lower.includes('whimper')) category = 'whimper'

      if (!this.categories.has(category)) {
        this.categories.set(category, {
          files: [],
          lastPlayed: 0,
          cooldown: this.getCooldown(category),
        })
      }
      this.categories.get(category)!.files.push(fullPath)
    })

    console.log('[SoundManager] Categories:', Array.from(this.categories.keys()))
  }

  private getCooldown(category: string): number {
    // Cooldowns in milliseconds to prevent spam
    const cooldowns: Record<string, number> = {
      'moan': 10000,
      'moan_soft': 8000,
      'moan_loud': 15000,
      'gasp': 5000,
      'breath': 3000,
      'breath_heavy': 5000,
      'orgasm': 30000,
      'giggle': 10000,
      'whisper': 8000,
      'wet': 5000,
      'kiss': 8000,
      'sigh': 6000,
      'whimper': 8000,
      'ambient': 2000,
    }
    return cooldowns[category] || 5000
  }

  getSound(category: string): string | null {
    const cat = this.categories.get(category)
    if (!cat || cat.files.length === 0) {
      return null
    }

    // Check cooldown
    const now = Date.now()
    if (now - cat.lastPlayed < cat.cooldown) {
      return null
    }

    // Get random sound from category
    const file = cat.files[Math.floor(Math.random() * cat.files.length)]
    cat.lastPlayed = now

    return file
  }

  getSoundForEvent(event: string): string | null {
    const eventMapping: Record<string, string[]> = {
      'greeting': ['giggle', 'whisper', 'sigh'],
      'message': ['breath', 'sigh'],
      'aroused': ['moan_soft', 'moan', 'breath_heavy'],
      'very_aroused': ['moan', 'moan_loud', 'breath_heavy'],
      'edge': ['gasp', 'moan_soft', 'whimper'],
      'orgasm': ['orgasm', 'moan_loud'],
      'flirty': ['giggle', 'kiss'],
      'happy': ['giggle', 'sigh'],
      'thinking': ['breath', 'whisper'],
      'tease': ['giggle', 'whisper'],
      'desperate': ['moan', 'whimper', 'breath_heavy'],
      'idle': ['breath', 'sigh'],
    }

    const categories = eventMapping[event] || ['ambient']

    // Try each category in order until we find one
    for (const category of categories) {
      const sound = this.getSound(category)
      if (sound) return sound
    }

    return null
  }

  hasAnySounds(): boolean {
    return this.categories.size > 0 &&
      Array.from(this.categories.values()).some(c => c.files.length > 0)
  }

  getStats(): Record<string, number> {
    const stats: Record<string, number> = {}
    this.categories.forEach((cat, name) => {
      stats[name] = cat.files.length
    })
    return stats
  }

  getCategories(): string[] {
    return Array.from(this.categories.keys())
  }

  // Allow adding sounds from external folder
  importSoundsFrom(sourceDir: string): number {
    if (!fs.existsSync(sourceDir)) {
      console.log('[SoundManager] Source directory does not exist:', sourceDir)
      return 0
    }

    let imported = 0
    const files = fs.readdirSync(sourceDir).filter(f =>
      f.endsWith('.mp3') || f.endsWith('.wav') || f.endsWith('.ogg')
    )

    for (const file of files) {
      const sourcePath = path.join(sourceDir, file)
      const targetPath = path.join(this.soundDir, file)

      if (!fs.existsSync(targetPath)) {
        try {
          fs.copyFileSync(sourcePath, targetPath)
          imported++
        } catch (e) {
          console.error('[SoundManager] Failed to copy:', file, e)
        }
      }
    }

    if (imported > 0) {
      this.scanSounds() // Rescan after import
    }

    console.log('[SoundManager] Imported', imported, 'sounds')
    return imported
  }
}
