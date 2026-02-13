// Hook: Play looped ambient background audio
import { useEffect, useRef, useCallback } from 'react'

type AmbienceTrack = 'none' | 'soft_moans' | 'breathing' | 'heartbeat' | 'rain' | 'custom'

interface AmbienceSettings {
  enabled: boolean
  track: AmbienceTrack
  volume: number // 0-1
}

// Store audio elements and track URLs
let ambienceUrls: Record<AmbienceTrack, string[]> = {
  none: [],
  soft_moans: [],
  breathing: [],
  heartbeat: [],
  rain: [],
  custom: []
}

let loaded = false
let loading = false

async function loadAmbienceSounds() {
  if (loaded || loading) return
  loading = true

  try {
    // Get all sound files from the sound system
    const files: string[] = await window.api.uiSounds?.list?.() ?? []

    for (const file of files) {
      const filename = file.toLowerCase()
      const url = await window.api.uiSounds?.getUrl?.(file)
      if (!url) continue

      // Categorize by filename keywords
      if (filename.includes('moan') || filename.includes('mnc')) {
        ambienceUrls.soft_moans.push(url)
      }
      if (filename.includes('breath')) {
        ambienceUrls.breathing.push(url)
      }
      if (filename.includes('heart')) {
        ambienceUrls.heartbeat.push(url)
      }
      if (filename.includes('rain') || filename.includes('water')) {
        ambienceUrls.rain.push(url)
      }
    }

    loaded = true
    console.log('[Ambience] Loaded sounds:', {
      soft_moans: ambienceUrls.soft_moans.length,
      breathing: ambienceUrls.breathing.length,
      heartbeat: ambienceUrls.heartbeat.length,
      rain: ambienceUrls.rain.length
    })
  } catch (err) {
    console.error('[Ambience] Failed to load sounds:', err)
  } finally {
    loading = false
  }
}

export function useAmbienceAudio(settings: AmbienceSettings | null) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const trackIndexRef = useRef(0)
  const fadeTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Get current tracks for the selected ambience type
  const getTracks = useCallback((track: AmbienceTrack): string[] => {
    return ambienceUrls[track] || []
  }, [])

  // Play the next track in the sequence (looping)
  const playNextTrack = useCallback(() => {
    if (!settings?.enabled || settings.track === 'none') return

    const tracks = getTracks(settings.track)
    if (tracks.length === 0) {
      // If no dedicated tracks, use soft moans as fallback
      const fallbackTracks = ambienceUrls.soft_moans
      if (fallbackTracks.length === 0) return

      // Pick a random track
      const idx = Math.floor(Math.random() * fallbackTracks.length)
      const url = fallbackTracks[idx]

      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
      }

      const audio = new Audio(url)
      audio.volume = settings.volume
      audio.loop = false // We'll handle looping manually for variety

      audio.onended = () => {
        // Small delay before next track for variety
        fadeTimeoutRef.current = setTimeout(playNextTrack, 500 + Math.random() * 2000)
      }

      audio.onerror = (e) => {
        // Log which track failed, then try next
        console.warn('[Ambience] Audio error on fallback track:', url, e)
        fadeTimeoutRef.current = setTimeout(playNextTrack, 1000)
      }

      audioRef.current = audio
      audio.play().catch((err) => {
        if (err.name !== 'NotAllowedError' && err.name !== 'AbortError') {
          console.warn('[Ambience] Play failed:', err.name)
        }
      })
      return
    }

    // Pick random track from the category
    const idx = Math.floor(Math.random() * tracks.length)
    const url = tracks[idx]

    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
    }

    const audio = new Audio(url)
    audio.volume = settings.volume
    audio.loop = false

    audio.onended = () => {
      // Small delay before next track
      fadeTimeoutRef.current = setTimeout(playNextTrack, 500 + Math.random() * 2000)
    }

    audio.onerror = (e) => {
      // Log which track failed, then try next
      console.warn('[Ambience] Audio error:', url, e)
      fadeTimeoutRef.current = setTimeout(playNextTrack, 1000)
    }

    audioRef.current = audio
    audio.play().catch((err) => {
      if (err.name !== 'NotAllowedError' && err.name !== 'AbortError') {
        console.warn('[Ambience] Play failed:', err.name)
      }
    })
  }, [settings, getTracks])

  // Load sounds on mount
  useEffect(() => {
    loadAmbienceSounds()
  }, [])

  // Handle settings changes
  const loadCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    // Clear any pending timeout and interval
    if (fadeTimeoutRef.current) {
      clearTimeout(fadeTimeoutRef.current)
      fadeTimeoutRef.current = null
    }
    if (loadCheckIntervalRef.current) {
      clearInterval(loadCheckIntervalRef.current)
      loadCheckIntervalRef.current = null
    }

    if (!settings?.enabled || settings.track === 'none') {
      // Stop playback
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
        audioRef.current = null
      }
      return
    }

    // Start playback if enabled
    if (loaded) {
      playNextTrack()
    } else {
      // Wait for sounds to load then start
      loadCheckIntervalRef.current = setInterval(() => {
        if (loaded) {
          if (loadCheckIntervalRef.current) {
            clearInterval(loadCheckIntervalRef.current)
            loadCheckIntervalRef.current = null
          }
          playNextTrack()
        }
      }, 500)
    }

    return () => {
      if (fadeTimeoutRef.current) {
        clearTimeout(fadeTimeoutRef.current)
        fadeTimeoutRef.current = null
      }
      if (loadCheckIntervalRef.current) {
        clearInterval(loadCheckIntervalRef.current)
        loadCheckIntervalRef.current = null
      }
    }
  }, [settings?.enabled, settings?.track, playNextTrack])

  // Update volume when it changes
  useEffect(() => {
    if (audioRef.current && settings?.volume !== undefined) {
      audioRef.current.volume = settings.volume
    }
  }, [settings?.volume])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (fadeTimeoutRef.current) {
        clearTimeout(fadeTimeoutRef.current)
      }
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
        audioRef.current = null
      }
    }
  }, [])
}
