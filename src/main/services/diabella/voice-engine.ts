// File: src/main/services/diabella/voice-engine.ts
// Diabella Voice Engine - Venice AI TTS Integration

import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'

const VENICE_API_KEY = 'VENICE-ADMIN-KEY-MR4aPzWn9SizUynYCAeazVw6jnAeZphb0aG0FC7dJ0'
const VENICE_TTS_URL = 'https://api.venice.ai/api/v1/audio/speech'

export interface VoiceSettings {
  speed: number      // 0.5 to 1.5
  voice: string      // Voice ID
}

const VOICE_PRESETS: Record<string, VoiceSettings> = {
  'sultry': { voice: 'af_sky', speed: 0.9 },
  'playful': { voice: 'af_sky', speed: 1.0 },
  'breathy': { voice: 'af_sky', speed: 0.85 },
  'excited': { voice: 'af_sky', speed: 1.1 },
  'whisper': { voice: 'af_sky', speed: 0.8 },
}

export class VoiceEngine {
  private cacheDir: string
  private currentPreset: string = 'sultry'
  private settings: VoiceSettings

  constructor(dataDir: string) {
    this.cacheDir = path.join(dataDir, 'voice-cache')
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true })
    }
    this.settings = { ...VOICE_PRESETS['sultry'] }
    console.log('[VoiceEngine] Initialized, cache:', this.cacheDir)
  }

  setPreset(preset: string): void {
    if (VOICE_PRESETS[preset]) {
      this.currentPreset = preset
      this.settings = { ...VOICE_PRESETS[preset] }
      console.log('[VoiceEngine] Preset set to:', preset)
    }
  }

  setSettings(settings: Partial<VoiceSettings>): void {
    this.settings = { ...this.settings, ...settings }
  }

  async speak(text: string): Promise<{ success: boolean; path?: string; error?: string }> {
    // Clean the text
    const cleanText = text
      .replace(/[💋🥵💦😈😉❤️💕]/g, '') // Remove emojis
      .replace(/\*[^*]+\*/g, '')           // Remove *actions*
      .trim()

    if (!cleanText) {
      return { success: false, error: 'No text to speak' }
    }

    const hash = this.hashText(cleanText + this.settings.speed + this.settings.voice)
    const cachePath = path.join(this.cacheDir, `${hash}.mp3`)

    // Check cache
    if (fs.existsSync(cachePath)) {
      console.log('[VoiceEngine] Cache hit:', hash)
      return { success: true, path: cachePath }
    }

    console.log('[VoiceEngine] Generating:', cleanText.substring(0, 50) + '...')

    try {
      const response = await fetch(VENICE_TTS_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VENICE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: cleanText,
          model: 'tts-kokoro',
          voice: this.settings.voice,
          response_format: 'mp3',
          speed: this.settings.speed,
        }),
      })

      console.log('[VoiceEngine] Response status:', response.status)

      if (!response.ok) {
        const error = await response.text()
        console.error('[VoiceEngine] API error:', error)
        return { success: false, error: `TTS API error: ${response.status}` }
      }

      const audioBuffer = await response.arrayBuffer()
      fs.writeFileSync(cachePath, Buffer.from(audioBuffer))

      console.log('[VoiceEngine] Saved to:', cachePath)
      return { success: true, path: cachePath }

    } catch (error: any) {
      console.error('[VoiceEngine] Error:', error)
      return { success: false, error: error.message || 'TTS failed' }
    }
  }

  private hashText(text: string): string {
    return crypto.createHash('md5').update(text).digest('hex').substring(0, 16)
  }

  clearCache(): void {
    try {
      const files = fs.readdirSync(this.cacheDir).filter(f => f.endsWith('.mp3'))
      for (const file of files) {
        fs.unlinkSync(path.join(this.cacheDir, file))
      }
      console.log('[VoiceEngine] Cache cleared')
    } catch (e) {
      console.error('[VoiceEngine] Failed to clear cache:', e)
    }
  }

  getPresets(): string[] {
    return Object.keys(VOICE_PRESETS)
  }

  getCurrentPreset(): string {
    return this.currentPreset
  }
}
