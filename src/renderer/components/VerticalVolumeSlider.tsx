// File: src/renderer/components/VerticalVolumeSlider.tsx
//
// Custom vertical volume control. Replaces the old <input type="range">
// approach which had three bugs:
//   1. Once the volume hit 0, dragging back up was unreliable because
//      browsers re-apply the thumb at currentValue position before the
//      pointer event fires.
//   2. The hover-to-open + mouseLeave-to-close pattern dismissed itself
//      on tiny cursor wobbles, especially during drags.
//   3. The slider was small and horizontal — the user wanted vertical
//      with a bigger hit area.
//
// This component owns its own pointer logic. Pointer capture means the
// drag continues even if the cursor leaves the track, so dragging up
// and down both work without surprise. Click-outside closes via the
// onClose callback.

import { useEffect, useRef } from 'react'

interface Props {
  value: number  // 0-1
  onChange: (v: number) => void
  onClose: () => void
}

export function VerticalVolumeSlider({ value, onChange, onClose }: Props) {
  const trackRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)

  // Click-outside dismiss. Listens once mounted so the click that OPENED
  // the slider (which triggered this mount) doesn't immediately close it.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const el = popupRef.current
      if (!el) return
      if (!el.contains(e.target as Node)) onClose()
    }
    // Defer attach by one tick so the opening click doesn't bubble here.
    const t = setTimeout(() => document.addEventListener('mousedown', handler), 0)
    return () => {
      clearTimeout(t)
      document.removeEventListener('mousedown', handler)
    }
  }, [onClose])

  const update = (clientY: number) => {
    const el = trackRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    // Map clientY → 0-1, with 1 at the TOP of the track and 0 at the
    // BOTTOM. clamp at edges so dragging beyond the track still pins.
    const offset = clientY - rect.top
    let v = 1 - offset / rect.height
    v = Math.max(0, Math.min(1, v))
    onChange(v)
  }

  return (
    <div
      ref={popupRef}
      className="no-drag absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-3 bg-black/95 rounded-xl border border-white/20 shadow-2xl flex flex-col items-center gap-2"
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        ref={trackRef}
        onPointerDown={(e) => {
          e.stopPropagation()
          draggingRef.current = true
          try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* ignore */ }
          update(e.clientY)
        }}
        onPointerMove={(e) => {
          if (draggingRef.current) update(e.clientY)
        }}
        onPointerUp={(e) => {
          draggingRef.current = false
          try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
        }}
        onPointerCancel={() => { draggingRef.current = false }}
        // Wide outer hit area, narrow visible track centered inside.
        className="relative w-8 h-32 cursor-pointer touch-none flex justify-center"
      >
        {/* Visible track */}
        <div className="relative w-1.5 h-full bg-white/15 rounded-full overflow-hidden">
          <div
            className="absolute bottom-0 left-0 right-0 bg-pink-400/90 transition-[height] duration-75"
            style={{ height: `${value * 100}%` }}
          />
        </div>
        {/* Thumb */}
        <div
          className="absolute left-1/2 w-4 h-4 -translate-x-1/2 bg-white rounded-full shadow ring-2 ring-pink-400/40 pointer-events-none transition-[bottom] duration-75"
          style={{ bottom: `calc(${value * 100}% - 8px)` }}
        />
      </div>
      <div className="text-[10px] text-white/70 tabular-nums">{Math.round(value * 100)}%</div>
    </div>
  )
}
