// File: src/renderer/components/DraggableFab.tsx
//
// Floating Action Button + radial menu wrapper that can be dragged around the
// viewport. Click (low total movement) toggles the menu via onClick; drag (over
// threshold) repositions the FAB and decays with momentum after release so it
// glides to a stop instead of snapping. Position persists to localStorage.

import React, { useCallback, useEffect, useRef, useState } from 'react'

const STORAGE_KEY = 'vault.fab.pos.v1'
const CLICK_THRESHOLD_PX = 6        // movement below this counts as a click, not a drag
const FRICTION = 0.92               // per-frame velocity multiplier (lower = stops sooner)
const MIN_VELOCITY = 0.18           // below this px/frame, snap to rest
const EDGE_PADDING = 12             // viewport margin so the FAB never sits flush
const FAB_SIZE = 56                 // matches .fab in index.css

interface DraggableFabProps {
  open: boolean
  onClick: () => void
  /** Rendered menu items (the <button className="fab-menu-item">…</button> list). */
  children?: React.ReactNode
  fabContent: React.ReactNode
  title?: string
  className?: string
}

type Pos = { x: number; y: number }

function loadPos(): Pos | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const v = JSON.parse(raw)
    if (typeof v?.x === 'number' && typeof v?.y === 'number') return v
  } catch {}
  return null
}

function defaultPos(): Pos {
  // Bottom-right by default, matching the original CSS.
  const pad = 24
  return {
    x: Math.max(0, (typeof window !== 'undefined' ? window.innerWidth : 1280) - FAB_SIZE - pad),
    y: Math.max(0, (typeof window !== 'undefined' ? window.innerHeight : 720) - FAB_SIZE - pad)
  }
}

function clampToViewport(p: Pos): Pos {
  const w = typeof window !== 'undefined' ? window.innerWidth : 1280
  const h = typeof window !== 'undefined' ? window.innerHeight : 720
  return {
    x: Math.max(EDGE_PADDING, Math.min(p.x, w - FAB_SIZE - EDGE_PADDING)),
    y: Math.max(EDGE_PADDING, Math.min(p.y, h - FAB_SIZE - EDGE_PADDING))
  }
}

const DraggableFab: React.FC<DraggableFabProps> = ({ open, onClick, children, fabContent, title, className }) => {
  const [pos, setPos] = useState<Pos>(() => clampToViewport(loadPos() ?? defaultPos()))
  const [isDragging, setIsDragging] = useState(false)

  // Refs for handlers that shouldn't trigger re-renders.
  const dragRef = useRef<{
    active: boolean
    startMouseX: number
    startMouseY: number
    startPosX: number
    startPosY: number
    lastT: number
    lastX: number
    lastY: number
    vx: number
    vy: number
    moved: boolean
  } | null>(null)
  const rafRef = useRef<number | null>(null)

  // Persist position changes (debounced via rAF).
  const savePending = useRef(false)
  useEffect(() => {
    if (savePending.current) return
    savePending.current = true
    requestAnimationFrame(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(pos)) } catch {}
      savePending.current = false
    })
  }, [pos])

  // Re-clamp on viewport resize so the FAB never ends up off-screen.
  useEffect(() => {
    const onResize = () => setPos((p) => clampToViewport(p))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const stopMomentum = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [])

  const startMomentum = useCallback((vx: number, vy: number) => {
    let curVx = vx
    let curVy = vy

    const tick = () => {
      setPos((p) => {
        const next = clampToViewport({ x: p.x + curVx, y: p.y + curVy })
        // If we hit a wall, kill the perpendicular component so the FAB doesn't
        // jitter against the edge.
        if (next.x !== p.x + curVx) curVx = 0
        if (next.y !== p.y + curVy) curVy = 0
        return next
      })
      curVx *= FRICTION
      curVy *= FRICTION
      if (Math.abs(curVx) < MIN_VELOCITY && Math.abs(curVy) < MIN_VELOCITY) {
        rafRef.current = null
        return
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    stopMomentum()
    rafRef.current = requestAnimationFrame(tick)
  }, [stopMomentum])

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Only left-button / primary touch — don't hijack right-click etc.
    if (e.button !== undefined && e.button !== 0) return
    stopMomentum()
    e.currentTarget.setPointerCapture(e.pointerId)
    const now = performance.now()
    dragRef.current = {
      active: true,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startPosX: pos.x,
      startPosY: pos.y,
      lastT: now,
      lastX: e.clientX,
      lastY: e.clientY,
      vx: 0,
      vy: 0,
      moved: false
    }
    setIsDragging(true)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d || !d.active) return
    const dx = e.clientX - d.startMouseX
    const dy = e.clientY - d.startMouseY
    if (!d.moved && Math.hypot(dx, dy) > CLICK_THRESHOLD_PX) {
      d.moved = true
    }
    if (d.moved) {
      // Velocity is the per-event delta normalized to roughly per-frame speed.
      const now = performance.now()
      const dt = Math.max(1, now - d.lastT)
      d.vx = ((e.clientX - d.lastX) / dt) * 16  // ≈ px / 60fps frame
      d.vy = ((e.clientY - d.lastY) / dt) * 16
      d.lastT = now
      d.lastX = e.clientX
      d.lastY = e.clientY
      setPos(clampToViewport({ x: d.startPosX + dx, y: d.startPosY + dy }))
    }
  }

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d) return
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch {}
    setIsDragging(false)
    if (!d.moved) {
      // It was a click — toggle the menu.
      onClick()
    } else {
      // Released after a real drag — let it glide to a stop.
      startMomentum(d.vx, d.vy)
    }
    d.active = false
    dragRef.current = null
  }

  const onPointerCancel = () => {
    setIsDragging(false)
    dragRef.current = null
  }

  // Open menu position: above the FAB by default, but flip below if FAB is near
  // the top of the screen so the menu doesn't go off-viewport. The container
  // is sized to the FAB width so each menu item centers on the FAB axis;
  // align-items: center handles the menu-item (44px) inside the FAB column
  // (56px). `right: auto` overrides the `.fab-menu { right: 24px }` rule from
  // index.css that would otherwise stretch the container.
  const menuBelow = pos.y < 220
  const menuStyle: React.CSSProperties = menuBelow
    ? { left: pos.x, top: pos.y + FAB_SIZE + 12 }
    : { left: pos.x, bottom: window.innerHeight - pos.y + 12 }

  return (
    <>
      {open && (
        <div
          className="fab-menu"
          style={{
            position: 'fixed',
            ...menuStyle,
            right: 'auto',
            width: FAB_SIZE,
            alignItems: 'center',
            zIndex: 999,
          }}
        >
          {children}
        </div>
      )}
      <div
        className={'fab ' + (className ?? '')}
        style={{
          // Override the bottom/right defaults from index.css when controlled by us.
          position: 'fixed',
          left: pos.x,
          top: pos.y,
          right: 'auto',
          bottom: 'auto',
          // Disable the rotate-on-hover transform during drag — feels janky otherwise.
          transition: isDragging ? 'none' : undefined,
          cursor: isDragging ? 'grabbing' : 'grab',
          touchAction: 'none', // we handle our own pointer move
          userSelect: 'none'
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        title={title}
      >
        {fabContent}
      </div>
    </>
  )
}

export default DraggableFab
