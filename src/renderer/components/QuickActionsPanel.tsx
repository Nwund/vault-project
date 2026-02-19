// File: src/renderer/components/QuickActionsPanel.tsx
// Floating quick actions panel for rapid access to common operations

import React, { useState, useCallback, useEffect } from 'react'
import {
  Zap,
  Play,
  Shuffle,
  Heart,
  Star,
  Clock,
  ListOrdered,
  Sparkles,
  Film,
  Image,
  Settings,
  X,
  ChevronUp,
  ChevronDown,
  Maximize,
  Flame,
  Eye,
  Filter,
  TrendingUp,
  Timer,
  Grid3X3,
  BookOpen,
  Plus
} from 'lucide-react'

interface QuickAction {
  id: string
  icon: React.ElementType
  label: string
  shortcut?: string
  color?: string
  action: () => void
}

interface QuickActionsPanelProps {
  onPlayRandom?: () => void
  onPlayFavorite?: () => void
  onOpenQueue?: () => void
  onOpenDiscovery?: () => void
  onOpenEdgeMode?: () => void
  onOpenImmersive?: () => void
  onOpenTimer?: () => void
  onOpenStats?: () => void
  onOpenHistory?: () => void
  onToggleMoodSelector?: () => void
  onFilterVideos?: () => void
  onFilterImages?: () => void
  onFilterFavorites?: () => void
  position?: 'left' | 'right'
  className?: string
}

export function QuickActionsPanel({
  onPlayRandom,
  onPlayFavorite,
  onOpenQueue,
  onOpenDiscovery,
  onOpenEdgeMode,
  onOpenImmersive,
  onOpenTimer,
  onOpenStats,
  onOpenHistory,
  onToggleMoodSelector,
  onFilterVideos,
  onFilterImages,
  onFilterFavorites,
  position = 'left',
  className = ''
}: QuickActionsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [activeCategory, setActiveCategory] = useState<'play' | 'tools' | 'filter'>('play')

  const categories = {
    play: {
      label: 'Play',
      icon: Play,
      actions: [
        { id: 'random', icon: Shuffle, label: 'Random', shortcut: 'R', color: 'text-purple-400', action: onPlayRandom },
        { id: 'favorite', icon: Heart, label: 'Favorite', shortcut: 'F', color: 'text-pink-400', action: onPlayFavorite },
        { id: 'discovery', icon: Sparkles, label: 'Discovery', shortcut: 'D', color: 'text-cyan-400', action: onOpenDiscovery },
        { id: 'immersive', icon: Maximize, label: 'Immersive', shortcut: 'I', color: 'text-blue-400', action: onOpenImmersive }
      ]
    },
    tools: {
      label: 'Tools',
      icon: Zap,
      actions: [
        { id: 'queue', icon: ListOrdered, label: 'Queue', shortcut: 'Q', color: 'text-green-400', action: onOpenQueue },
        { id: 'edge', icon: Flame, label: 'Edge Mode', shortcut: 'E', color: 'text-red-400', action: onOpenEdgeMode },
        { id: 'timer', icon: Timer, label: 'Timer', shortcut: 'T', color: 'text-orange-400', action: onOpenTimer },
        { id: 'history', icon: Clock, label: 'History', shortcut: 'H', color: 'text-amber-400', action: onOpenHistory }
      ]
    },
    filter: {
      label: 'Filter',
      icon: Filter,
      actions: [
        { id: 'videos', icon: Film, label: 'Videos', color: 'text-indigo-400', action: onFilterVideos },
        { id: 'images', icon: Image, label: 'Images', color: 'text-emerald-400', action: onFilterImages },
        { id: 'favorites', icon: Star, label: 'Favorites', color: 'text-yellow-400', action: onFilterFavorites },
        { id: 'mood', icon: Sparkles, label: 'Mood', color: 'text-violet-400', action: onToggleMoodSelector }
      ]
    }
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (!e.altKey) return // Alt + key for quick actions

      switch (e.key.toLowerCase()) {
        case 'r':
          e.preventDefault()
          onPlayRandom?.()
          break
        case 'f':
          e.preventDefault()
          onPlayFavorite?.()
          break
        case 'd':
          e.preventDefault()
          onOpenDiscovery?.()
          break
        case 'q':
          e.preventDefault()
          onOpenQueue?.()
          break
        case 'e':
          e.preventDefault()
          onOpenEdgeMode?.()
          break
        case 't':
          e.preventDefault()
          onOpenTimer?.()
          break
        case 'i':
          e.preventDefault()
          onOpenImmersive?.()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onPlayRandom, onPlayFavorite, onOpenDiscovery, onOpenQueue, onOpenEdgeMode, onOpenTimer, onOpenImmersive])

  return (
    <div
      className={`fixed ${position === 'left' ? 'left-4' : 'right-4'} top-1/2 -translate-y-1/2 z-40 ${className}`}
    >
      {/* Toggle button */}
      <button
        onClick={() => setIsExpanded(prev => !prev)}
        className={`absolute ${position === 'left' ? '-right-10' : '-left-10'} top-1/2 -translate-y-1/2 w-8 h-12 bg-zinc-900/90 backdrop-blur-sm border border-zinc-700 rounded-lg flex flex-col items-center justify-center gap-0.5 hover:bg-zinc-800 transition shadow-lg`}
        title={isExpanded ? 'Hide quick actions' : 'Show quick actions'}
      >
        <Zap size={14} className="text-[var(--primary)]" />
        <span className="text-[8px] text-zinc-400">QA</span>
      </button>

      {/* Main panel */}
      <div
        className={`bg-zinc-900/95 backdrop-blur-xl rounded-2xl border border-zinc-700 shadow-2xl overflow-hidden transition-all duration-300 ${
          isExpanded ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'
        }`}
        style={{ width: isExpanded ? 200 : 0 }}
      >
        {/* Category tabs */}
        <div className="flex border-b border-zinc-800">
          {Object.entries(categories).map(([key, cat]) => {
            const Icon = cat.icon
            return (
              <button
                key={key}
                onClick={() => setActiveCategory(key as any)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs transition ${
                  activeCategory === key
                    ? 'bg-[var(--primary)]/20 text-[var(--primary)] border-b-2 border-[var(--primary)]'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Icon size={12} />
                {cat.label}
              </button>
            )
          })}
        </div>

        {/* Actions */}
        <div className="p-2 space-y-1">
          {categories[activeCategory].actions.map(action => {
            if (!action.action) return null
            const Icon = action.icon
            return (
              <button
                key={action.id}
                onClick={() => {
                  action.action?.()
                  setIsExpanded(false)
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-zinc-800 transition text-left group"
              >
                <Icon size={18} className={action.color || 'text-zinc-400'} />
                <span className="flex-1 text-sm text-zinc-300 group-hover:text-white">{action.label}</span>
                {(action as any).shortcut && (
                  <span className="text-[10px] text-zinc-600 bg-zinc-800 px-1.5 py-0.5 rounded">
                    Alt+{(action as any).shortcut}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Footer */}
        <div className="px-3 py-2 border-t border-zinc-800 text-center">
          <span className="text-[10px] text-zinc-600">Hold Alt + key for shortcuts</span>
        </div>
      </div>
    </div>
  )
}

// Floating action button for mobile-style quick access
export function FloatingActionButton({
  onPrimaryAction,
  onSecondaryActions,
  className = ''
}: {
  onPrimaryAction?: () => void
  onSecondaryActions?: Array<{ icon: React.ElementType; label: string; color?: string; action: () => void }>
  className?: string
}) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className={`fixed bottom-6 right-6 z-50 ${className}`}>
      {/* Secondary actions */}
      {isOpen && onSecondaryActions && (
        <div className="absolute bottom-16 right-0 space-y-2 mb-2">
          {onSecondaryActions.map((action, i) => {
            const Icon = action.icon
            return (
              <button
                key={i}
                onClick={() => {
                  action.action()
                  setIsOpen(false)
                }}
                className={`flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-800 shadow-lg hover:bg-zinc-700 transition transform origin-right animate-in slide-in-from-right-2`}
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <span className="text-sm text-zinc-300">{action.label}</span>
                <Icon size={18} className={action.color || 'text-white'} />
              </button>
            )
          })}
        </div>
      )}

      {/* Primary FAB */}
      <button
        onClick={() => {
          if (onSecondaryActions) {
            setIsOpen(prev => !prev)
          } else {
            onPrimaryAction?.()
          }
        }}
        className={`w-14 h-14 rounded-full bg-gradient-to-r from-[var(--primary)] to-pink-600 shadow-lg flex items-center justify-center transition-transform hover:scale-110 ${
          isOpen ? 'rotate-45' : ''
        }`}
      >
        <Plus size={24} className="text-white" />
      </button>
    </div>
  )
}

// Compact quick action bar for toolbars
export function QuickActionBar({
  actions,
  className = ''
}: {
  actions: Array<{ icon: React.ElementType; label: string; shortcut?: string; color?: string; action: () => void }>
  className?: string
}) {
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {actions.map((action, i) => {
        const Icon = action.icon
        return (
          <button
            key={i}
            onClick={action.action}
            className={`p-2 rounded-lg hover:bg-zinc-800 transition group relative`}
            title={`${action.label}${action.shortcut ? ` (${action.shortcut})` : ''}`}
          >
            <Icon size={16} className={action.color || 'text-zinc-400 group-hover:text-white'} />
          </button>
        )
      })}
    </div>
  )
}

export default QuickActionsPanel
