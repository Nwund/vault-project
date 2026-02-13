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

// Stop any currently playing sound (internal)
function stopSound(): void {
  if (trimTimeout) {
    clearTimeout(trimTimeout)
    trimTimeout = null
  }
  if (audioElement) {
    audioElement.pause()
    audioElement = null
  }
}

// Play appropriate sound for climax type (auto-trimmed to 3 seconds for punchy effect)
export async function playClimaxForType(
  climaxType: 'cum' | 'squirt' | 'orgasm',
  options?: SoundOptions
): Promise<boolean> {
  // All types use the peak climax sounds, trimmed to 3 seconds for punchy effect
  return playSoundFromCategory('climax', 'peak', {
    volume: options?.volume ?? 0.75,
    maxDuration: options?.maxDuration ?? 3,
    onEnd: options?.onEnd
  })
}
