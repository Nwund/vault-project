// File: src/renderer/components/QuickRating.tsx
// Quick rating component with hover preview and keyboard support

import React, { useState, useCallback, useEffect } from 'react'
import { Star, X } from 'lucide-react'

interface QuickRatingProps {
  value: number
  onChange: (rating: number) => void
  size?: 'sm' | 'md' | 'lg'
  showClear?: boolean
  interactive?: boolean
  showValue?: boolean
  className?: string
}

export function QuickRating({
  value,
  onChange,
  size = 'md',
  showClear = true,
  interactive = true,
  showValue = false,
  className = ''
}: QuickRatingProps) {
  const [hoverValue, setHoverValue] = useState<number | null>(null)

  const displayValue = hoverValue ?? value

  const sizes = {
    sm: { star: 14, gap: 'gap-0.5' },
    md: { star: 20, gap: 'gap-1' },
    lg: { star: 28, gap: 'gap-1.5' }
  }

  const { star: starSize, gap } = sizes[size]

  const handleClick = useCallback((rating: number) => {
    if (!interactive) return
    // Toggle off if clicking same rating
    if (rating === value) {
      onChange(0)
    } else {
      onChange(rating)
    }
  }, [value, onChange, interactive])

  const handleClear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onChange(0)
  }, [onChange])

  return (
    <div className={`flex items-center ${gap} ${className}`}>
      {[1, 2, 3, 4, 5].map(rating => (
        <button
          key={rating}
          onClick={() => handleClick(rating)}
          onMouseEnter={() => interactive && setHoverValue(rating)}
          onMouseLeave={() => setHoverValue(null)}
          disabled={!interactive}
          className={`transition-transform ${interactive ? 'hover:scale-110 cursor-pointer' : 'cursor-default'}`}
        >
          <Star
            size={starSize}
            className={`transition-colors ${
              rating <= displayValue
                ? 'text-amber-400'
                : 'text-zinc-600'
            }`}
            fill={rating <= displayValue ? 'currentColor' : 'none'}
          />
        </button>
      ))}

      {showValue && (
        <span className="ml-1 text-sm text-zinc-400">
          {value > 0 ? value.toFixed(1) : '-'}
        </span>
      )}

      {showClear && value > 0 && interactive && (
        <button
          onClick={handleClear}
          className="ml-1 p-0.5 rounded hover:bg-zinc-800 transition text-zinc-500 hover:text-zinc-300"
          title="Clear rating"
        >
          <X size={12} />
        </button>
      )}
    </div>
  )
}

// Inline rating with label
export function RatingWithLabel({
  value,
  onChange,
  label,
  className = ''
}: {
  value: number
  onChange: (rating: number) => void
  label?: string
  className?: string
}) {
  return (
    <div className={`flex items-center justify-between ${className}`}>
      {label && <span className="text-sm text-zinc-400">{label}</span>}
      <QuickRating value={value} onChange={onChange} size="sm" />
    </div>
  )
}

// Rating badge for display
export function RatingBadge({
  value,
  size = 'md',
  className = ''
}: {
  value: number
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  if (!value || value === 0) return null

  const sizes = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-sm px-2 py-1',
    lg: 'text-base px-3 py-1.5'
  }

  return (
    <div className={`flex items-center gap-1 bg-amber-500/20 text-amber-400 rounded ${sizes[size]} ${className}`}>
      <Star size={size === 'sm' ? 10 : size === 'md' ? 12 : 14} fill="currentColor" />
      <span>{value}</span>
    </div>
  )
}

// Quick rating popup for media cards
export function QuickRatingPopup({
  mediaId,
  currentRating,
  onRate,
  position = 'bottom',
  className = ''
}: {
  mediaId: string
  currentRating: number
  onRate: (mediaId: string, rating: number) => void
  position?: 'top' | 'bottom'
  className?: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [tempRating, setTempRating] = useState(currentRating)

  const handleRate = useCallback((rating: number) => {
    onRate(mediaId, rating)
    setIsOpen(false)
  }, [mediaId, onRate])

  // Keyboard support
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '1' && e.key <= '5') {
        handleRate(parseInt(e.key))
      } else if (e.key === '0' || e.key === 'Backspace') {
        handleRate(0)
      } else if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, handleRate])

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(prev => !prev)}
        className={`p-1.5 rounded-lg transition ${
          currentRating > 0
            ? 'bg-amber-500/20 text-amber-400'
            : 'bg-black/50 text-white hover:bg-black/70'
        }`}
      >
        <Star size={14} fill={currentRating > 0 ? 'currentColor' : 'none'} />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />

          {/* Popup */}
          <div
            className={`absolute ${
              position === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'
            } left-1/2 -translate-x-1/2 z-50 bg-zinc-900 rounded-xl p-3 shadow-xl border border-zinc-700 animate-in zoom-in-95`}
          >
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map(rating => (
                <button
                  key={rating}
                  onClick={() => handleRate(rating)}
                  onMouseEnter={() => setTempRating(rating)}
                  onMouseLeave={() => setTempRating(currentRating)}
                  className="p-1 hover:scale-125 transition-transform"
                >
                  <Star
                    size={24}
                    className={`transition-colors ${
                      rating <= tempRating ? 'text-amber-400' : 'text-zinc-600'
                    }`}
                    fill={rating <= tempRating ? 'currentColor' : 'none'}
                  />
                </button>
              ))}
            </div>
            <div className="text-center text-xs text-zinc-500 mt-2">
              Press 1-5 to rate, 0 to clear
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// Average rating display
export function AverageRating({
  ratings,
  className = ''
}: {
  ratings: number[]
  className?: string
}) {
  const average = ratings.length > 0
    ? ratings.reduce((a, b) => a + b, 0) / ratings.length
    : 0

  const distribution = [1, 2, 3, 4, 5].map(star =>
    ratings.filter(r => Math.round(r) === star).length
  )

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center gap-2">
        <span className="text-3xl font-bold text-white">{average.toFixed(1)}</span>
        <div>
          <QuickRating value={Math.round(average)} onChange={() => {}} interactive={false} size="sm" />
          <div className="text-xs text-zinc-500">{ratings.length} ratings</div>
        </div>
      </div>

      {/* Distribution bars */}
      <div className="space-y-1">
        {[5, 4, 3, 2, 1].map(star => {
          const count = distribution[star - 1]
          const percentage = ratings.length > 0 ? (count / ratings.length) * 100 : 0
          return (
            <div key={star} className="flex items-center gap-2 text-xs">
              <span className="w-3 text-zinc-400">{star}</span>
              <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-400 transition-all"
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <span className="w-6 text-right text-zinc-500">{count}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default QuickRating
