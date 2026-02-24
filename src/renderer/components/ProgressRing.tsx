// File: src/renderer/components/ProgressRing.tsx
// SVG-based circular progress indicator with gradient stroke

import React from 'react'

interface ProgressRingProps {
  /** Progress value from 0-100. Set to -1 for indeterminate mode */
  progress: number
  /** Size variant */
  size?: 'sm' | 'md' | 'lg'
  /** Custom size in pixels (overrides size variant) */
  customSize?: number
  /** Stroke width */
  strokeWidth?: number
  /** Show percentage text in center */
  showText?: boolean
  /** Custom class name */
  className?: string
  /** Use gradient stroke (uses theme primary/secondary) */
  gradient?: boolean
}

const SIZE_MAP = {
  sm: 16,
  md: 24,
  lg: 40
}

const STROKE_MAP = {
  sm: 2,
  md: 3,
  lg: 4
}

export const ProgressRing: React.FC<ProgressRingProps> = ({
  progress,
  size = 'md',
  customSize,
  strokeWidth,
  showText = false,
  className = '',
  gradient = true
}) => {
  const diameter = customSize ?? SIZE_MAP[size]
  const stroke = strokeWidth ?? STROKE_MAP[size]
  const radius = (diameter - stroke) / 2
  const circumference = radius * 2 * Math.PI
  const isIndeterminate = progress < 0
  const normalizedProgress = Math.min(100, Math.max(0, progress))
  const strokeDasharray = isIndeterminate
    ? `${circumference * 0.25} ${circumference * 0.75}`
    : `${(normalizedProgress / 100) * circumference} ${circumference}`
  const strokeDashoffset = 0

  const gradientId = `progress-gradient-${React.useId()}`

  return (
    <div className={`inline-flex items-center justify-center ${className}`}>
      <svg
        width={diameter}
        height={diameter}
        className={`progress-ring ${isIndeterminate ? 'progress-ring-indeterminate' : ''}`}
        viewBox={`0 0 ${diameter} ${diameter}`}
      >
        {/* Gradient definition */}
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--primary)" />
            <stop offset="100%" stopColor="var(--secondary)" />
          </linearGradient>
        </defs>

        {/* Background circle */}
        <circle
          className="progress-ring-bg"
          cx={diameter / 2}
          cy={diameter / 2}
          r={radius}
          strokeWidth={stroke}
        />

        {/* Progress circle */}
        <circle
          className="progress-ring-value"
          cx={diameter / 2}
          cy={diameter / 2}
          r={radius}
          strokeWidth={stroke}
          strokeDasharray={strokeDasharray}
          strokeDashoffset={strokeDashoffset}
          style={{
            stroke: gradient ? `url(#${gradientId})` : 'var(--primary)',
            transition: isIndeterminate ? 'none' : 'stroke-dasharray 0.3s ease-out'
          }}
        />
      </svg>

      {/* Center text */}
      {showText && !isIndeterminate && size !== 'sm' && (
        <span
          className="absolute text-[var(--text)] font-medium"
          style={{ fontSize: diameter * 0.28 }}
        >
          {Math.round(normalizedProgress)}
        </span>
      )}
    </div>
  )
}

// Convenience wrapper for indeterminate spinner
export const Spinner: React.FC<{
  size?: 'sm' | 'md' | 'lg'
  className?: string
}> = ({ size = 'md', className = '' }) => (
  <ProgressRing progress={-1} size={size} className={className} />
)

export default ProgressRing
