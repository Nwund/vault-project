// File: src/renderer/components/MoodSelector.tsx
// Mood-based filtering for media browsing

import React, { useState, useCallback } from 'react'
import { Flame, Heart, Sparkles, Zap, Moon, Coffee, Sun, Waves, Wind, Droplets, X } from 'lucide-react'

export interface Mood {
  id: string
  name: string
  icon: React.ElementType
  color: string
  bgColor: string
  description: string
  filters: {
    minDuration?: number
    maxDuration?: number
    minRating?: number
    tags?: string[]
    sortBy?: string
    energy?: 'low' | 'medium' | 'high'
  }
}

export const MOODS: Mood[] = [
  {
    id: 'passionate',
    name: 'Passionate',
    icon: Flame,
    color: 'text-red-400',
    bgColor: 'bg-red-500/20',
    description: 'Intense, high-energy content',
    filters: {
      minRating: 4,
      energy: 'high',
      sortBy: 'rating'
    }
  },
  {
    id: 'romantic',
    name: 'Romantic',
    icon: Heart,
    color: 'text-pink-400',
    bgColor: 'bg-pink-500/20',
    description: 'Soft, sensual vibes',
    filters: {
      tags: ['romantic', 'sensual', 'couple', 'intimate'],
      energy: 'medium',
      sortBy: 'rating'
    }
  },
  {
    id: 'quick',
    name: 'Quick Hit',
    icon: Zap,
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/20',
    description: 'Short clips under 5 mins',
    filters: {
      maxDuration: 300,
      sortBy: 'views'
    }
  },
  {
    id: 'marathon',
    name: 'Marathon',
    icon: Moon,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/20',
    description: 'Long-form content 30+ mins',
    filters: {
      minDuration: 1800,
      sortBy: 'duration'
    }
  },
  {
    id: 'fresh',
    name: 'Fresh',
    icon: Sparkles,
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/20',
    description: 'Recently added content',
    filters: {
      sortBy: 'newest'
    }
  },
  {
    id: 'chill',
    name: 'Chill',
    icon: Coffee,
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/20',
    description: 'Relaxed, slow-paced',
    filters: {
      energy: 'low',
      tags: ['solo', 'softcore', 'tease']
    }
  },
  {
    id: 'energetic',
    name: 'Energetic',
    icon: Sun,
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/20',
    description: 'High-tempo, dynamic',
    filters: {
      energy: 'high',
      minRating: 3
    }
  },
  {
    id: 'dreamy',
    name: 'Dreamy',
    icon: Waves,
    color: 'text-indigo-400',
    bgColor: 'bg-indigo-500/20',
    description: 'Artistic, aesthetic vibes',
    filters: {
      tags: ['artistic', 'aesthetic', 'cinematic']
    }
  },
  {
    id: 'wild',
    name: 'Wild',
    icon: Wind,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/20',
    description: 'Adventurous content',
    filters: {
      tags: ['outdoor', 'public', 'adventure'],
      energy: 'high'
    }
  },
  {
    id: 'variety',
    name: 'Variety',
    icon: Droplets,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/20',
    description: 'Mix it up randomly',
    filters: {
      sortBy: 'random'
    }
  }
]

interface MoodSelectorProps {
  selectedMood: Mood | null
  onSelectMood: (mood: Mood | null) => void
  compact?: boolean
  className?: string
}

export function MoodSelector({
  selectedMood,
  onSelectMood,
  compact = false,
  className = ''
}: MoodSelectorProps) {
  const [expanded, setExpanded] = useState(false)

  const handleSelect = useCallback((mood: Mood) => {
    if (selectedMood?.id === mood.id) {
      onSelectMood(null)
    } else {
      onSelectMood(mood)
    }
    setExpanded(false)
  }, [selectedMood, onSelectMood])

  const clearMood = useCallback(() => {
    onSelectMood(null)
  }, [onSelectMood])

  // Compact inline view
  if (compact) {
    return (
      <div className={`flex items-center gap-1 ${className}`}>
        {selectedMood ? (
          <button
            onClick={clearMood}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${selectedMood.bgColor} ${selectedMood.color} text-sm font-medium transition hover:opacity-80`}
          >
            <selectedMood.icon size={14} />
            {selectedMood.name}
            <X size={12} className="ml-1 opacity-60" />
          </button>
        ) : (
          <div className="relative">
            <button
              onClick={() => setExpanded(prev => !prev)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white text-sm transition"
            >
              <Sparkles size={14} />
              Mood
            </button>

            {expanded && (
              <div className="absolute top-full left-0 mt-1 w-48 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl z-50 py-1 max-h-64 overflow-auto">
                {MOODS.map(mood => (
                  <button
                    key={mood.id}
                    onClick={() => handleSelect(mood)}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-zinc-800 transition text-left"
                  >
                    <mood.icon size={16} className={mood.color} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white">{mood.name}</div>
                      <div className="text-[10px] text-zinc-500 truncate">{mood.description}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // Full grid view
  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold flex items-center gap-2">
          <Sparkles size={16} className="text-[var(--primary)]" />
          Pick Your Mood
        </h3>
        {selectedMood && (
          <button
            onClick={clearMood}
            className="text-xs text-zinc-400 hover:text-white transition flex items-center gap-1"
          >
            <X size={12} />
            Clear
          </button>
        )}
      </div>

      <div className="grid grid-cols-5 gap-2">
        {MOODS.map(mood => {
          const isSelected = selectedMood?.id === mood.id
          const Icon = mood.icon

          return (
            <button
              key={mood.id}
              onClick={() => handleSelect(mood)}
              className={`group flex flex-col items-center gap-1 p-3 rounded-xl transition ${
                isSelected
                  ? `${mood.bgColor} border-2 border-current ${mood.color}`
                  : 'bg-zinc-800/50 hover:bg-zinc-800 border-2 border-transparent'
              }`}
              title={mood.description}
            >
              <Icon
                size={24}
                className={isSelected ? mood.color : 'text-zinc-400 group-hover:text-white'}
              />
              <span className={`text-xs font-medium ${isSelected ? mood.color : 'text-zinc-400 group-hover:text-white'}`}>
                {mood.name}
              </span>
            </button>
          )
        })}
      </div>

      {/* Selected mood description */}
      {selectedMood && (
        <div className={`mt-3 p-3 rounded-xl ${selectedMood.bgColor} ${selectedMood.color}`}>
          <div className="flex items-center gap-2">
            <selectedMood.icon size={18} />
            <div>
              <span className="font-semibold">{selectedMood.name}</span>
              <span className="text-sm opacity-80 ml-2">{selectedMood.description}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Apply mood filters to media list
export function applyMoodFilter<T extends { type: string; durationSec?: number | null; rating?: number }>(
  items: T[],
  mood: Mood | null
): T[] {
  if (!mood) return items

  const { filters } = mood

  return items.filter(item => {
    // Duration filter
    if (filters.minDuration && (item.durationSec || 0) < filters.minDuration) {
      return false
    }
    if (filters.maxDuration && (item.durationSec || 0) > filters.maxDuration) {
      return false
    }

    // Rating filter
    if (filters.minRating && (item.rating || 0) < filters.minRating) {
      return false
    }

    return true
  })
}

export default MoodSelector
