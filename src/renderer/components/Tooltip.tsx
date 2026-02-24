// File: src/renderer/components/Tooltip.tsx
// Contextual tooltip with keyboard shortcut display and position awareness

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'

interface TooltipProps {
  /** Tooltip content text */
  content: string
  /** Keyboard shortcut to display (e.g., "Ctrl+K" or ["Ctrl", "K"]) */
  shortcut?: string | string[]
  /** Hover delay before showing tooltip (ms) */
  delay?: number
  /** Position preference */
  position?: 'top' | 'bottom' | 'left' | 'right'
  /** Disable tooltip */
  disabled?: boolean
  /** Children to wrap */
  children: React.ReactNode
  /** Additional class name for tooltip */
  className?: string
}

interface TooltipPosition {
  top: number
  left: number
  origin: string
  placement: 'top' | 'bottom' | 'left' | 'right'
}

const TOOLTIP_GAP = 8

function calculatePosition(
  triggerRect: DOMRect,
  tooltipRect: DOMRect,
  preferredPosition: 'top' | 'bottom' | 'left' | 'right'
): TooltipPosition {
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  // Calculate positions for each direction
  const positions = {
    top: {
      top: triggerRect.top - tooltipRect.height - TOOLTIP_GAP,
      left: triggerRect.left + (triggerRect.width - tooltipRect.width) / 2,
      origin: 'center bottom',
      placement: 'top' as const
    },
    bottom: {
      top: triggerRect.bottom + TOOLTIP_GAP,
      left: triggerRect.left + (triggerRect.width - tooltipRect.width) / 2,
      origin: 'center top',
      placement: 'bottom' as const
    },
    left: {
      top: triggerRect.top + (triggerRect.height - tooltipRect.height) / 2,
      left: triggerRect.left - tooltipRect.width - TOOLTIP_GAP,
      origin: 'right center',
      placement: 'left' as const
    },
    right: {
      top: triggerRect.top + (triggerRect.height - tooltipRect.height) / 2,
      left: triggerRect.right + TOOLTIP_GAP,
      origin: 'left center',
      placement: 'right' as const
    }
  }

  // Check if preferred position fits
  let pos = positions[preferredPosition]

  // Flip if doesn't fit
  if (preferredPosition === 'top' && pos.top < 0) {
    pos = positions.bottom
  } else if (preferredPosition === 'bottom' && pos.top + tooltipRect.height > viewportHeight) {
    pos = positions.top
  } else if (preferredPosition === 'left' && pos.left < 0) {
    pos = positions.right
  } else if (preferredPosition === 'right' && pos.left + tooltipRect.width > viewportWidth) {
    pos = positions.left
  }

  // Clamp to viewport bounds
  pos.left = Math.max(8, Math.min(pos.left, viewportWidth - tooltipRect.width - 8))
  pos.top = Math.max(8, Math.min(pos.top, viewportHeight - tooltipRect.height - 8))

  return pos
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  shortcut,
  delay = 400,
  position = 'top',
  disabled = false,
  children,
  className = ''
}) => {
  const [isVisible, setIsVisible] = useState(false)
  const [tooltipPos, setTooltipPos] = useState<TooltipPosition | null>(null)
  const triggerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>()

  const showTooltip = useCallback(() => {
    if (disabled) return
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true)
    }, delay)
  }, [delay, disabled])

  const hideTooltip = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    setIsVisible(false)
  }, [])

  // Calculate position when visible
  useEffect(() => {
    if (isVisible && triggerRef.current && tooltipRef.current) {
      const triggerRect = triggerRef.current.getBoundingClientRect()
      const tooltipRect = tooltipRef.current.getBoundingClientRect()
      setTooltipPos(calculatePosition(triggerRect, tooltipRect, position))
    }
  }, [isVisible, position])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  const shortcutKeys = shortcut
    ? Array.isArray(shortcut)
      ? shortcut
      : shortcut.split('+').map(k => k.trim())
    : null

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
        className="inline-flex"
      >
        {children}
      </div>

      {isVisible && createPortal(
        <div
          ref={tooltipRef}
          className={`tooltip ${className}`}
          style={{
            top: tooltipPos?.top ?? -9999,
            left: tooltipPos?.left ?? -9999,
            '--tooltip-origin': tooltipPos?.origin ?? 'center bottom'
          } as React.CSSProperties}
          role="tooltip"
        >
          <span>{content}</span>
          {shortcutKeys && (
            <span className="tooltip-kbd">
              {shortcutKeys.map((key, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span className="opacity-50">+</span>}
                  <span>{key}</span>
                </React.Fragment>
              ))}
            </span>
          )}
        </div>,
        document.body
      )}
    </>
  )
}

// Hook for manual tooltip control
export function useTooltip() {
  const [isOpen, setIsOpen] = useState(false)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)

  const show = useCallback((x: number, y: number) => {
    setPosition({ x, y })
    setIsOpen(true)
  }, [])

  const hide = useCallback(() => {
    setIsOpen(false)
  }, [])

  return { isOpen, position, show, hide }
}

export default Tooltip
