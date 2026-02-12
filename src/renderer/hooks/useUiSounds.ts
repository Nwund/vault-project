// Hook: Play UI sounds on button clicks and hovers with variety
import { useEffect, useRef } from 'react'

interface SoundCategory {
  urls: string[]
  lastPlayed: number
  lastIndex: number // Track last played index to avoid repeats
}

// Sound categories for different interactions
const soundCategories: {
  moan: SoundCategory
  wet: SoundCategory
  soft: SoundCategory
} = {
  moan: { urls: [], lastPlayed: 0, lastIndex: -1 },
  wet: { urls: [], lastPlayed: 0, lastIndex: -1 },
  soft: { urls: [], lastPlayed: 0, lastIndex: -1 }
}

let allSoundUrls: string[] = []
let loaded = false
let loading = false
let lastClickTime = 0
let lastHoverTime = 0
let currentAudio: HTMLAudioElement | null = null
let fadeInterval: ReturnType<typeof setInterval> | null = null

const CLICK_COOLDOWN = 100 // ms between click sounds
const HOVER_COOLDOWN = 200 // ms between hover sounds
const FADE_DURATION = 400 // ms to fade out
const START_OFFSET = 0.05 // seconds to skip at start (skip silence)
const MAX_PLAY_DURATION = 1.5 // max seconds to play before fade

async function loadSounds() {
  if (loaded || loading) return
  loading = true
  try {
    const files: string[] = await window.api.uiSounds.list()
    const urlPromises = files.map(async (f: string) => {
      const url = await window.api.uiSounds.getUrl(f)
      return { file: f.toLowerCase(), url }
    })
    const results = await Promise.all(urlPromises)

    // Shuffle results for initial randomness
    for (let i = results.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[results[i], results[j]] = [results[j], results[i]]
    }

    // Categorize sounds
    results.forEach(({ file, url }) => {
      allSoundUrls.push(url)
      if (file.includes('moan') || file.includes('mnc')) {
        soundCategories.moan.urls.push(url)
        // Also use quieter moans for soft category
        if (file.includes('moan 2') || file.includes('moan 3') || file.includes('moan 4') || file.includes('moan 5')) {
          soundCategories.soft.urls.push(url)
        }
      } else if (file.includes('wet')) {
        soundCategories.wet.urls.push(url)
      }
    })

    // Fallback: if soft is empty, use first few moans
    if (soundCategories.soft.urls.length === 0 && soundCategories.moan.urls.length > 0) {
      soundCategories.soft.urls = soundCategories.moan.urls.slice(0, 5)
    }

    loaded = true
    console.log('[UiSounds] Loaded:', {
      total: allSoundUrls.length,
      moans: soundCategories.moan.urls.length,
      wet: soundCategories.wet.urls.length,
      soft: soundCategories.soft.urls.length
    })
  } catch (e) {
    console.warn('[UiSounds] Failed to load:', e)
  } finally {
    loading = false
  }
}

function fadeOutAudio(audio: HTMLAudioElement, duration: number = FADE_DURATION) {
  if (fadeInterval) {
    clearInterval(fadeInterval)
    fadeInterval = null
  }

  const startVolume = audio.volume
  const steps = 20
  const stepTime = duration / steps
  const volumeStep = startVolume / steps
  let currentStep = 0

  fadeInterval = setInterval(() => {
    currentStep++
    audio.volume = Math.max(0, startVolume - (volumeStep * currentStep))

    if (currentStep >= steps) {
      if (fadeInterval) {
        clearInterval(fadeInterval)
        fadeInterval = null
      }
      audio.pause()
      audio.currentTime = 0
    }
  }, stepTime)
}

function playSound(
  category: 'moan' | 'wet' | 'soft' | 'random' = 'random',
  options: { volume?: number; pitch?: number; maxDuration?: number } = {}
) {
  // Select URL pool and category info
  let urls: string[]
  let categoryInfo: SoundCategory | null = null

  if (category === 'random') {
    urls = allSoundUrls
  } else {
    categoryInfo = soundCategories[category]
    urls = categoryInfo.urls.length > 0 ? categoryInfo.urls : allSoundUrls
  }

  if (urls.length === 0) {
    console.warn('[UiSounds] No sounds available for category:', category)
    return
  }

  // Pick random sound, avoiding the last played one for variety
  let index: number
  if (urls.length === 1) {
    index = 0
  } else if (categoryInfo && urls.length > 2) {
    // Avoid last 2 sounds for better variety
    do {
      index = Math.floor(Math.random() * urls.length)
    } while (index === categoryInfo.lastIndex)
    categoryInfo.lastIndex = index
  } else {
    index = Math.floor(Math.random() * urls.length)
  }

  const url = urls[index]

  try {
    // STOP previous sound immediately (no overlap/clipping)
    if (currentAudio) {
      if (fadeInterval) {
        clearInterval(fadeInterval)
        fadeInterval = null
      }
      currentAudio.pause()
      currentAudio.currentTime = 0
      currentAudio = null
    }

    const audio = new Audio(url)
    currentAudio = audio

    // Quieter base volume with random variation (±20%)
    const baseVolume = options.volume ?? 0.12
    const volumeVariation = 0.8 + Math.random() * 0.4
    audio.volume = Math.min(1, baseVolume * volumeVariation)

    // Wider pitch variation for more variety (0.85 - 1.15)
    const basePitch = options.pitch ?? 1
    const pitchVariation = 0.85 + Math.random() * 0.3
    audio.playbackRate = basePitch * pitchVariation

    // Start slightly into the audio to skip initial silence
    audio.currentTime = START_OFFSET

    // Set up auto-fade after max duration
    const maxDuration = options.maxDuration ?? MAX_PLAY_DURATION
    const fadeTimeout = setTimeout(() => {
      if (currentAudio === audio && !audio.paused) {
        fadeOutAudio(audio, FADE_DURATION)
      }
    }, maxDuration * 1000)

    // Clean up timeout if audio ends naturally
    audio.addEventListener('ended', () => {
      clearTimeout(fadeTimeout)
    }, { once: true })

    audio.play().catch((err) => {
      console.warn('[UiSounds] Failed to play sound:', err)
      clearTimeout(fadeTimeout)
    })

    // Update last played time for category
    if (categoryInfo) {
      categoryInfo.lastPlayed = Date.now()
    }
  } catch (err) {
    console.warn('[UiSounds] Error creating audio:', err)
  }
}

export function playClickSound() {
  const now = Date.now()
  if (now - lastClickTime < CLICK_COOLDOWN) return
  lastClickTime = now

  // If sounds not loaded yet, try loading
  if (!loaded && !loading) {
    void loadSounds()
  }

  // Quiet click sounds with short duration
  playSound('moan', { volume: 0.08, maxDuration: 1.0 })
}

export function useUiSounds(enabled: boolean) {
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled

  useEffect(() => {
    void loadSounds()
  }, [])

  useEffect(() => {
    if (!enabled) return

    const clickHandler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      // Play on button/clickable element clicks
      const isClickable =
        target.closest('button') ||
        target.closest('[role="button"]') ||
        target.closest('a') ||
        target.closest('.cursor-pointer') ||
        target.closest('[data-clickable]') ||
        target.tagName === 'BUTTON'

      if (isClickable) {
        playClickSound()
      }
    }

    document.addEventListener('click', clickHandler, true)

    return () => {
      document.removeEventListener('click', clickHandler, true)
    }
  }, [enabled])
}

// Export for direct use
export { playSound }
