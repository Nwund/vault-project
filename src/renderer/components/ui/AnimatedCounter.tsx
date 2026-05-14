// File: src/renderer/components/ui/AnimatedCounter.tsx
//
// Tween-counts-up number display. Extracted from App.tsx as part of
// #48 phase A. Uses requestAnimationFrame + ease-out-cubic over a
// configurable duration.

import { useEffect, useRef, useState } from 'react'
import { cn } from '../../utils/cn'

export function AnimatedCounter({
  value,
  duration = 1000,
  className = '',
}: {
  value: number
  duration?: number
  className?: string
}) {
  const [displayValue, setDisplayValue] = useState(0)
  const frameRef = useRef<number>(0)
  const prevValueRef = useRef(0)

  useEffect(() => {
    const startValue = prevValueRef.current
    const diff = value - startValue
    if (diff === 0) return

    const startTime = performance.now()
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      const current = Math.floor(startValue + diff * eased)
      setDisplayValue(current)

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate)
      } else {
        prevValueRef.current = value
      }
    }

    frameRef.current = requestAnimationFrame(animate)
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [value, duration])

  return <span className={cn('count-up', className)}>{displayValue.toLocaleString()}</span>
}
