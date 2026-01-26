// File: src/main/services/diabella/avatar-generator.ts
// Diabella Avatar Generation - Venice AI Image Generation
// Uses tasteful/artistic prompts to avoid safety filter blur

import * as fs from 'fs'
import * as path from 'path'

const VENICE_API_KEY = 'VENICE-ADMIN-KEY-MR4aPzWn9SizUynYCAeazVw6jnAeZphb0aG0FC7dJ0'
const VENICE_URL = 'https://api.venice.ai/api/v1/images/generations'

export interface AvatarOptions {
  style: 'anime' | 'realistic' | 'fantasy' | 'cyberpunk' | 'gothic'
  outfit?: string
  expression?: string
  pose?: string
  arousalLevel?: number
  regenerate?: boolean
}

// Style-specific base prompts - using artistic language to avoid safety blur
const STYLE_PROMPTS: Record<string, string> = {
  anime: `masterpiece, best quality, beautiful anime woman named Diabella, high quality anime art,
big expressive eyes, long flowing dark hair with purple highlights, perfect anime face,
soft detailed lighting, vibrant colors, trending on artstation, detailed background,
portrait from waist up, looking at viewer, elegant pose`,

  realistic: `masterpiece, photorealistic, stunning beautiful woman named Diabella,
professional photography, long dark wavy hair, captivating green eyes,
natural studio lighting, flawless skin, high detail, fashion photography,
waist up portrait, looking at viewer, confident elegant pose`,

  fantasy: `masterpiece, fantasy digital art, enchanting woman named Diabella,
ethereal beauty, long flowing magical hair with purple glow, mesmerizing glowing eyes,
mystical markings, elegant fantasy attire, magical lighting effects,
detailed artstation quality, waist up portrait, alluring graceful pose`,

  cyberpunk: `masterpiece, cyberpunk digital art, gorgeous futuristic woman named Diabella,
neon-highlighted hair in pink and blue, glowing cybernetic eye implants,
confident expression, sleek futuristic outfit with LED accents,
neon city lighting, high tech aesthetic, waist up portrait, stylish pose`,

  gothic: `masterpiece, gothic digital art, alluring dark woman named Diabella,
long flowing black hair, dark smoky eyes, deep red lips, pale elegant skin,
black Victorian elegance, dramatic candlelight, dark romantic atmosphere,
waist up portrait, mysterious graceful pose`,
}

// Outfit descriptions - tasteful and artistic
const OUTFIT_PROMPTS: Record<string, string> = {
  'elegant-dress': 'wearing elegant black evening dress, sophisticated',
  'red-dress': 'wearing stunning red satin dress, elegant',
  'white-dress': 'wearing flowing white dress, angelic',
  'cocktail-dress': 'wearing chic cocktail dress, fashionable',
  'casual': 'wearing stylish crop top and jeans, casual chic',
  'swimwear': 'wearing elegant one-piece swimsuit, beach style',
  'formal': 'wearing professional business attire, confident',
  'fantasy-gown': 'wearing ethereal flowing gown, magical',
  'cyber-suit': 'wearing sleek futuristic bodysuit, tech wear',
  'gothic-dress': 'wearing elegant black gothic dress, dark romance',
}

// Expression descriptions
const EXPRESSION_PROMPTS: Record<string, string> = {
  neutral: 'soft welcoming smile, warm inviting eyes',
  flirty: 'playful smirk, winking, teasing expression',
  happy: 'bright genuine smile, joyful sparkling eyes',
  seductive: 'sultry gaze, half-closed eyes, pouty lips',
  mysterious: 'enigmatic smile, deep knowing gaze',
  confident: 'assured expression, powerful gaze',
  playful: 'mischievous grin, sparkling eyes',
  dreamy: 'soft distant gaze, peaceful expression',
}

// Pose descriptions
const POSE_PROMPTS: Record<string, string> = {
  standing: 'elegant standing pose, graceful posture',
  sitting: 'sitting gracefully, relaxed elegant pose',
  leaning: 'leaning forward slightly, engaged pose',
  profile: 'elegant profile view, graceful neck',
  three_quarter: 'three quarter view, dynamic angle',
}

export class AvatarGenerator {
  private cacheDir: string
  private likedAvatars: Set<string> = new Set()

  constructor(dataDir: string) {
    this.cacheDir = path.join(dataDir, 'avatars')
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true })
    }
    this.loadLikedAvatars()
    console.log('[AvatarGenerator] Initialized, cache:', this.cacheDir)
  }

  private loadLikedAvatars(): void {
    const likesPath = path.join(this.cacheDir, 'liked.json')
    if (fs.existsSync(likesPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(likesPath, 'utf-8'))
        this.likedAvatars = new Set(data)
      } catch (e) {
        console.error('[AvatarGenerator] Failed to load liked avatars:', e)
      }
    }
  }

  private saveLikedAvatars(): void {
    const likesPath = path.join(this.cacheDir, 'liked.json')
    fs.writeFileSync(likesPath, JSON.stringify([...this.likedAvatars]))
  }

  likeAvatar(avatarPath: string): void {
    this.likedAvatars.add(avatarPath)
    this.saveLikedAvatars()
  }

  unlikeAvatar(avatarPath: string): void {
    this.likedAvatars.delete(avatarPath)
    this.saveLikedAvatars()
  }

  async generate(options: AvatarOptions): Promise<{ success: boolean; path?: string; error?: string }> {
    const style = options.style || 'anime'
    const outfit = options.outfit || 'elegant-dress'
    const expression = options.expression || 'flirty'
    const pose = options.pose || 'standing'
    const arousal = options.arousalLevel || 1

    const cacheKey = `${style}_${outfit}_${expression}_${pose}`
    const cachePath = path.join(this.cacheDir, `${cacheKey}.png`)

    // Return cached if exists and not forcing regeneration
    if (!options.regenerate && fs.existsSync(cachePath)) {
      console.log('[AvatarGenerator] Using cached:', cachePath)
      return { success: true, path: cachePath }
    }

    // Build the prompt
    const prompt = this.buildPrompt(style, outfit, expression, pose, arousal)

    console.log('[AvatarGenerator] Generating new image...')
    console.log('[AvatarGenerator] Style:', style, '| Outfit:', outfit, '| Expression:', expression)
    console.log('[AvatarGenerator] Prompt preview:', prompt.substring(0, 150) + '...')

    try {
      const response = await fetch(VENICE_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VENICE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: prompt,
          model: 'fluently-xl',
          n: 1,
          size: '1024x1024',
          response_format: 'b64_json',
        }),
      })

      console.log('[AvatarGenerator] Response status:', response.status)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[AvatarGenerator] API Error:', errorText)
        return { success: false, error: `Venice API error: ${response.status}` }
      }

      const data = await response.json()

      if (!data.data?.[0]?.b64_json) {
        console.error('[AvatarGenerator] No image data in response')
        return { success: false, error: 'No image data in response' }
      }

      // Save to cache
      const imageBuffer = Buffer.from(data.data[0].b64_json, 'base64')
      fs.writeFileSync(cachePath, imageBuffer)

      console.log('[AvatarGenerator] Saved to:', cachePath)
      console.log('[AvatarGenerator] File size:', imageBuffer.length, 'bytes')

      return { success: true, path: cachePath }

    } catch (error: any) {
      console.error('[AvatarGenerator] Generation failed:', error)

      // Try to return a cached avatar as fallback
      const fallback = this.getRandomCachedAvatar()
      if (fallback) {
        console.log('[AvatarGenerator] Using fallback:', fallback)
        return { success: true, path: fallback }
      }

      return { success: false, error: error.message || 'Unknown error' }
    }
  }

  private buildPrompt(
    style: string,
    outfit: string,
    expression: string,
    pose: string,
    arousalLevel: number
  ): string {
    const parts: string[] = []

    // Base style prompt
    const basePrompt = STYLE_PROMPTS[style] || STYLE_PROMPTS.anime
    parts.push(basePrompt)

    // Outfit
    const outfitPrompt = OUTFIT_PROMPTS[outfit] || OUTFIT_PROMPTS['elegant-dress']
    parts.push(outfitPrompt)

    // Expression
    const expressionPrompt = EXPRESSION_PROMPTS[expression] || EXPRESSION_PROMPTS.flirty
    parts.push(expressionPrompt)

    // Pose
    const posePrompt = POSE_PROMPTS[pose] || POSE_PROMPTS.standing
    parts.push(posePrompt)

    // Arousal-based subtle modifiers (keep it artistic)
    if (arousalLevel >= 7) {
      parts.push('flushed cheeks, slightly parted lips, intense gaze')
    } else if (arousalLevel >= 4) {
      parts.push('subtle blush, warm lighting')
    }

    // Quality tags
    parts.push('highly detailed, sharp focus, beautiful lighting')

    // Negative prompt elements to add
    parts.push('solo, single person')

    return parts.join(', ')
  }

  getRandomCachedAvatar(): string | null {
    if (!fs.existsSync(this.cacheDir)) return null

    const files = fs.readdirSync(this.cacheDir).filter(f => f.endsWith('.png'))
    if (files.length === 0) return null

    // Prefer liked avatars
    const likedFiles = files.filter(f => this.likedAvatars.has(path.join(this.cacheDir, f)))
    if (likedFiles.length > 0) {
      return path.join(this.cacheDir, likedFiles[Math.floor(Math.random() * likedFiles.length)])
    }

    return path.join(this.cacheDir, files[Math.floor(Math.random() * files.length)])
  }

  clearCache(): void {
    try {
      const files = fs.readdirSync(this.cacheDir).filter(f => f.endsWith('.png'))
      for (const file of files) {
        fs.unlinkSync(path.join(this.cacheDir, file))
      }
      console.log('[AvatarGenerator] Cache cleared')
    } catch (e) {
      console.error('[AvatarGenerator] Failed to clear cache:', e)
    }
  }

  getCachedStyles(): string[] {
    try {
      const files = fs.readdirSync(this.cacheDir).filter(f => f.endsWith('.png'))
      return files.map(f => f.replace('.png', ''))
    } catch {
      return []
    }
  }

  getOutfitOptions(): string[] {
    return Object.keys(OUTFIT_PROMPTS)
  }

  getExpressionOptions(): string[] {
    return Object.keys(EXPRESSION_PROMPTS)
  }

  getStyleOptions(): string[] {
    return Object.keys(STYLE_PROMPTS)
  }
}
