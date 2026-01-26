// File: src/renderer/utils/soundPlayer.ts
// Utility for playing sounds from the NSFW Soundpack

let audioElement: HTMLAudioElement | null = null
let trimTimeout: ReturnType<typeof setTimeout> | null = null

interface SoundOptions {
  volume?: number
  onEnd?: () => void
  maxDuration?: number // Auto-trim: max seconds to play (default 8)
}

// Play a sound from a category with auto-trim support
export async function playSoundFromCategory(
  category: string,
  subcategory?: string,
  options: SoundOptions = {}
): Promise<boolean> {
  try {
    const result = await window.api.audio.getVoiceLine(category, subcategory)
    if (!result?.audioBase64) return false

    // Stop any currently playing audio and clear trim timeout
    stopSound()

    // Determine MIME type from filename extension
    const ext = result.filename?.split('.').pop()?.toLowerCase() || 'mp3'
    const mimeTypes: Record<string, string> = {
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      ogg: 'audio/ogg',
      m4a: 'audio/mp4',
      flac: 'audio/flac',
      webm: 'audio/webm'
    }
    const mimeType = mimeTypes[ext] || 'audio/mpeg'

    audioElement = new Audio(`data:${mimeType};base64,${result.audioBase64}`)
    audioElement.volume = options.volume ?? 0.7

    // Auto-trim: stop after maxDuration seconds (default 8s for climax sounds)
    const maxDuration = options.maxDuration ?? 8

    const handleEnd = () => {
      if (trimTimeout) {
        clearTimeout(trimTimeout)
        trimTimeout = null
      }
      options.onEnd?.()
    }

    audioElement.onended = handleEnd

    // Set up auto-trim timeout
    trimTimeout = setTimeout(() => {
      if (audioElement) {
        // Fade out over 500ms
        const fadeOut = () => {
          if (audioElement && audioElement.volume > 0.1) {
            audioElement.volume = Math.max(0, audioElement.volume - 0.15)
            setTimeout(fadeOut, 50)
          } else if (audioElement) {
            audioElement.pause()
            handleEnd()
          }
        }
        fadeOut()
      }
    }, maxDuration * 1000)

    await audioElement.play()
    return true
  } catch (e) {
    console.warn('[SoundPlayer] Failed to play sound:', e)
    return false
  }
}

// Play a random greeting
export async function playGreeting(options?: SoundOptions): Promise<boolean> {
  return playSoundFromCategory('greetings', undefined, options)
}

// Play a random moan
export async function playMoan(intensity?: 'soft' | 'medium' | 'intense', options?: SoundOptions): Promise<boolean> {
  return playSoundFromCategory('moans', intensity, options)
}

// Play a random reaction
export async function playReaction(type?: 'positive' | 'surprised' | 'excited', options?: SoundOptions): Promise<boolean> {
  return playSoundFromCategory('reactions', type, options)
}

// Play encouragement
export async function playEncouragement(type?: 'gentle' | 'eager' | 'commanding', options?: SoundOptions): Promise<boolean> {
  return playSoundFromCategory('encouragement', type, options)
}

// Play teasing
export async function playTeasing(type?: 'playful' | 'seductive' | 'demanding', options?: SoundOptions): Promise<boolean> {
  return playSoundFromCategory('teasing', type, options)
}

// Stop any currently playing sound
export function stopSound(): void {
  if (trimTimeout) {
    clearTimeout(trimTimeout)
    trimTimeout = null
  }
  if (audioElement) {
    audioElement.pause()
    audioElement = null
  }
}

// Check if sounds are available
export async function hasSounds(): Promise<boolean> {
  try {
    const stats = await window.api.audio.getStats()
    return stats.hasVoiceLines
  } catch {
    return false
  }
}

// Play climax sounds
export async function playClimax(
  type: 'building' | 'peak' | 'afterglow' = 'peak',
  options?: SoundOptions
): Promise<boolean> {
  return playSoundFromCategory('climax', type, options)
}

// Play climax sequence (building -> peak -> afterglow)
export async function playClimaxSequence(options?: SoundOptions): Promise<void> {
  // Play peak/orgasm sound immediately
  const played = await playClimax('peak', {
    volume: options?.volume ?? 0.8,
    onEnd: async () => {
      // Optional: play afterglow after peak
      if (options?.onEnd) {
        options.onEnd()
      }
    }
  })

  if (!played) {
    // Fallback to moans if no climax sounds available
    await playMoan('intense', options)
  }
}

// Play appropriate sound for climax type (auto-trimmed to 3 seconds for punchy effect)
export async function playClimaxForType(
  climaxType: 'cum' | 'squirt' | 'orgasm',
  options?: SoundOptions
): Promise<boolean> {
  // All types use the peak climax sounds, trimmed to 3 seconds for punchy effect
  return playClimax('peak', {
    volume: options?.volume ?? 0.75, // Slightly lower volume
    maxDuration: options?.maxDuration ?? 3, // Climax sounds trimmed to 3s
    onEnd: options?.onEnd
  })
}

// Get sound stats
export async function getSoundStats(): Promise<{ total: number; categories: string[] }> {
  try {
    const stats = await window.api.audio.getStats()
    return {
      total: stats.total || 0,
      categories: stats.categories || []
    }
  } catch {
    return { total: 0, categories: [] }
  }
}
