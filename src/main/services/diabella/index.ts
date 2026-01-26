// File: src/main/services/diabella/index.ts
// Diabella Service - Main coordinator for all Diabella subsystems

import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { AvatarGenerator } from './avatar-generator'
import { ChatEngine } from './chat-engine'
import { VoiceEngine } from './voice-engine'
import { SoundManager } from './sound-manager'

export interface DiabellaSettings {
  enabled: boolean
  personality: string
  spiceLevel: number
  voiceEnabled: boolean
  voicePitch: number
  voiceSpeed: number
  avatarStyle: 'anime' | 'realistic' | 'fantasy' | 'cyberpunk' | 'gothic'
  currentOutfit: string
  soundsEnabled: boolean
  moanFrequency: 'never' | 'occasional' | 'frequent'
}

const DEFAULT_SETTINGS: DiabellaSettings = {
  enabled: true,
  personality: 'velvet',
  spiceLevel: 3,
  voiceEnabled: true,
  voicePitch: 0,
  voiceSpeed: 0.95,
  avatarStyle: 'anime',
  currentOutfit: 'elegant-dress',
  soundsEnabled: true,
  moanFrequency: 'occasional',
}

class DiabellaService {
  public avatar: AvatarGenerator
  public chat: ChatEngine
  public voice: VoiceEngine
  public sounds: SoundManager

  private dataDir: string
  private settings: DiabellaSettings
  private settingsPath: string

  constructor() {
    this.dataDir = path.join(app.getPath('userData'), 'diabella')
    this.settingsPath = path.join(this.dataDir, 'settings.json')

    this.ensureDirectories()
    this.settings = this.loadSettings()

    // Initialize all subsystems
    this.avatar = new AvatarGenerator(this.dataDir)
    this.chat = new ChatEngine(this.dataDir, this.settings.spiceLevel, this.settings.personality)
    this.voice = new VoiceEngine(this.dataDir)
    this.sounds = new SoundManager(this.dataDir)

    console.log('[Diabella] Service initialized')
    console.log('[Diabella] Data directory:', this.dataDir)
  }

  private ensureDirectories(): void {
    const dirs = [
      this.dataDir,
      path.join(this.dataDir, 'avatars'),
      path.join(this.dataDir, 'voice-cache'),
      path.join(this.dataDir, 'sounds'),
    ]
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
    })
  }

  private loadSettings(): DiabellaSettings {
    if (fs.existsSync(this.settingsPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.settingsPath, 'utf-8'))
        return { ...DEFAULT_SETTINGS, ...data }
      } catch (e) {
        console.error('[Diabella] Failed to load settings:', e)
      }
    }
    return { ...DEFAULT_SETTINGS }
  }

  saveSettings(): void {
    fs.writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2))
  }

  getSettings(): DiabellaSettings {
    return { ...this.settings }
  }

  updateSettings(updates: Partial<DiabellaSettings>): DiabellaSettings {
    this.settings = { ...this.settings, ...updates }
    this.saveSettings()

    // Update subsystems
    if (updates.spiceLevel !== undefined) {
      this.chat.setSpiceLevel(updates.spiceLevel)
    }
    if (updates.personality !== undefined) {
      this.chat.setPersonality(updates.personality)
    }

    return this.settings
  }
}

// Singleton instance
let diabellaInstance: DiabellaService | null = null

export function getDiabellaService(): DiabellaService {
  if (!diabellaInstance) {
    diabellaInstance = new DiabellaService()
  }
  return diabellaInstance
}

export function initDiabellaService(): DiabellaService {
  return getDiabellaService()
}

// Export for convenience
export const diabella = {
  get instance() {
    return getDiabellaService()
  },
  get avatar() {
    return getDiabellaService().avatar
  },
  get chat() {
    return getDiabellaService().chat
  },
  get voice() {
    return getDiabellaService().voice
  },
  get sounds() {
    return getDiabellaService().sounds
  },
}
