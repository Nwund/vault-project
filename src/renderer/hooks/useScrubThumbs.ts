// File: src/renderer/hooks/useScrubThumbs.ts
//
// #331 D-71 — Renderer-side consumer for the MessagePort scrub-thumb
// channel. Each call to `getThumb(timeSec)` posts a request over the
// MessagePort, server-side ffmpeg extracts a single frame (bucketed to
// 1-second granularity, disk-cached), and we resolve when the reply
// arrives. The MessagePort bypasses the main-process IPC event loop,
// so request rates of ~30/s during seek scrubbing stay snappy.
//
// Usage:
//   const { getThumb, ready } = useScrubThumbs(videoPath)
//   const thumb = await getThumb(currentTimeSec)
//
// Returns null on misses (e.g. ffmpeg not installed, port closed).

import { useEffect, useRef, useState, useCallback } from 'react'

interface PortWrapper {
  post: (msg: any) => void
  onMessage: (cb: (msg: any) => void) => () => void
  close: () => void
}

export function useScrubThumbs(videoPath: string | null | undefined) {
  const [ready, setReady] = useState(false)
  const portRef = useRef<PortWrapper | null>(null)
  const pendingRef = useRef<Map<string, (dataUrl: string | null) => void>>(new Map())
  const reqIdRef = useRef(0)

  useEffect(() => {
    if (!videoPath || !(window as any).api?.messagePort?.open) {
      setReady(false)
      return
    }
    let cancelled = false
    let cleanup: (() => void) | null = null
    ;(async () => {
      try {
        const port = await window.api.messagePort.open('scrub-thumbs')
        if (cancelled) {
          port.close()
          return
        }
        portRef.current = port
        cleanup = port.onMessage((msg: any) => {
          if (msg?.kind !== 'thumb-reply') return
          const requestId = msg.requestId
          const resolver = pendingRef.current.get(requestId)
          if (resolver) {
            resolver(msg.dataUrl ?? null)
            pendingRef.current.delete(requestId)
          }
        })
        setReady(true)
      } catch (err) {
        console.warn('[useScrubThumbs] open failed:', err)
        setReady(false)
      }
    })()
    return () => {
      cancelled = true
      cleanup?.()
      try { portRef.current?.close() } catch { /* ignore */ }
      portRef.current = null
      // Reject all pending so callers don't hang
      pendingRef.current.forEach((r) => r(null))
      pendingRef.current.clear()
      setReady(false)
    }
  }, [videoPath])

  const getThumb = useCallback((timeSec: number): Promise<string | null> => {
    const port = portRef.current
    if (!port || !videoPath) return Promise.resolve(null)
    const requestId = `r${reqIdRef.current++}`
    return new Promise((resolve) => {
      pendingRef.current.set(requestId, resolve)
      port.post({ requestId, videoPath, timeSec })
      // Safety timeout in case the port goes dead
      setTimeout(() => {
        if (pendingRef.current.has(requestId)) {
          pendingRef.current.delete(requestId)
          resolve(null)
        }
      }, 5000)
    })
  }, [videoPath])

  return { getThumb, ready }
}
