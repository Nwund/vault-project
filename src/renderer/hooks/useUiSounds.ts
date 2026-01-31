// Hook: Play a random UI sound on button clicks
import { useEffect, useRef, useCallback } from 'react'

let soundUrls: string[] = []
let loaded = false
let loading = false

async function loadSounds() {
  if (loaded || loading) return
  loading = true
  try {
    const files = await window.api.uiSounds.list()
    const urls = await Promise.all(files.map((f: string) => window.api.uiSounds.getUrl(f)))
    soundUrls = urls
    loaded = true
  } catch (e) {
    console.warn('[UiSounds] Failed to load:', e)
  } finally {
    loading = false
  }
}

function playRandom() {
  if (soundUrls.length === 0) return
  const url = soundUrls[Math.floor(Math.random() * soundUrls.length)]
  try {
    const audio = new Audio(url)
    audio.volume = 0.15
    audio.play().catch(() => {})
  } catch {}
}

export function useUiSounds(enabled: boolean) {
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled

  useEffect(() => {
    void loadSounds()
  }, [])

  useEffect(() => {
    if (!enabled) return

    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      // Play on button/clickable element clicks
      if (
        target.closest('button') ||
        target.closest('[role="button"]') ||
        target.closest('a') ||
        target.closest('.cursor-pointer')
      ) {
        playRandom()
      }
    }

    document.addEventListener('click', handler, true)
    return () => document.removeEventListener('click', handler, true)
  }, [enabled])
}
