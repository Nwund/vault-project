// File: src/renderer/components/HotkeyHelp.tsx
// Keyboard shortcut reference overlay

import React, { useState, useEffect, useCallback } from 'react'
import {
  Keyboard,
  X,
  Search,
  Play,
  Pause,
  Volume2,
  Heart,
  Star,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Home,
  Maximize,
  Settings,
  Tag,
  Filter
} from 'lucide-react'

interface HotkeyCategory {
  name: string
  icon: React.ElementType
  shortcuts: Array<{
    keys: string[]
    description: string
    context?: string
  }>
}

const HOTKEY_CATEGORIES: HotkeyCategory[] = [
  {
    name: 'Playback',
    icon: Play,
    shortcuts: [
      { keys: ['Space', 'K'], description: 'Play / Pause' },
      { keys: ['M'], description: 'Mute / Unmute' },
      { keys: ['↑', '↓'], description: 'Volume up / down' },
      { keys: ['J'], description: 'Rewind 10 seconds' },
      { keys: ['L', ';'], description: 'Forward 10 seconds' },
      { keys: ['0-9'], description: 'Seek to 0-90% of video' },
      { keys: [',', '.'], description: 'Frame backward / forward', context: 'when paused' },
      { keys: ['<', '>'], description: 'Decrease / increase speed' },
      { keys: ['Home', 'End'], description: 'Go to start / end' }
    ]
  },
  {
    name: 'Navigation',
    icon: ArrowRight,
    shortcuts: [
      { keys: ['H', '←'], description: 'Previous item' },
      { keys: ['L', '→'], description: 'Next item' },
      { keys: ['J', '↓'], description: 'Move down / Next row' },
      { keys: ['K', '↑'], description: 'Move up / Previous row' },
      { keys: ['G'], description: 'Go to first item' },
      { keys: ['Shift+G'], description: 'Go to last item' },
      { keys: ['Enter'], description: 'Open selected item' },
      { keys: ['Escape'], description: 'Close / Go back' }
    ]
  },
  {
    name: 'Actions',
    icon: Heart,
    shortcuts: [
      { keys: ['F'], description: 'Toggle favorite' },
      { keys: ['1-5'], description: 'Rate 1-5 stars', context: 'media viewer' },
      { keys: ['T'], description: 'Open tag editor' },
      { keys: ['Q'], description: 'Add to queue' },
      { keys: ['P'], description: 'Add to playlist' },
      { keys: ['I'], description: 'Show media info' },
      { keys: ['S'], description: 'Take screenshot', context: 'video player' },
      { keys: ['Delete', 'X'], description: 'Delete selected' }
    ]
  },
  {
    name: 'View',
    icon: Maximize,
    shortcuts: [
      { keys: ['F11', 'Shift+F'], description: 'Toggle fullscreen' },
      { keys: ['Ctrl+F', '/'], description: 'Focus search' },
      { keys: ['Ctrl+K'], description: 'Open command palette' },
      { keys: ['Ctrl+,'], description: 'Open settings' },
      { keys: ['Ctrl+1'], description: 'Library view' },
      { keys: ['Ctrl+2'], description: 'Browse view' },
      { keys: ['Ctrl+3'], description: 'Playlists' },
      { keys: ['[', ']'], description: 'Decrease / increase grid size' },
      { keys: ['Ctrl+Shift+T'], description: 'Toggle theater mode' }
    ]
  },
  {
    name: 'Selection',
    icon: Filter,
    shortcuts: [
      { keys: ['Ctrl+A'], description: 'Select all' },
      { keys: ['Ctrl+D'], description: 'Deselect all' },
      { keys: ['Ctrl+Click'], description: 'Toggle selection' },
      { keys: ['Shift+Click'], description: 'Range select' },
      { keys: ['Ctrl+Shift+I'], description: 'Invert selection' }
    ]
  }
]

interface HotkeyHelpProps {
  isOpen: boolean
  onClose: () => void
  className?: string
}

export function HotkeyHelp({
  isOpen,
  onClose,
  className = ''
}: HotkeyHelpProps) {
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  // Filter shortcuts
  const filteredCategories = HOTKEY_CATEGORIES.map(cat => ({
    ...cat,
    shortcuts: cat.shortcuts.filter(s =>
      !search ||
      s.description.toLowerCase().includes(search.toLowerCase()) ||
      s.keys.some(k => k.toLowerCase().includes(search.toLowerCase()))
    )
  })).filter(cat => cat.shortcuts.length > 0)

  // Close on escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className={`bg-zinc-900 rounded-2xl border border-zinc-700 shadow-2xl w-[700px] max-w-[90vw] max-h-[80vh] overflow-hidden ${className}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/20 flex items-center justify-center">
              <Keyboard size={20} className="text-[var(--primary)]" />
            </div>
            <div>
              <h2 className="font-semibold">Keyboard Shortcuts</h2>
              <p className="text-xs text-zinc-400">Quick reference for all hotkeys</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-zinc-800 transition">
            <X size={20} />
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b border-zinc-800">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search shortcuts..."
              className="w-full pl-10 pr-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm outline-none focus:border-[var(--primary)]"
              autoFocus
            />
          </div>
        </div>

        {/* Categories */}
        <div className="flex border-b border-zinc-800 px-6 gap-2 py-2 overflow-x-auto">
          <button
            onClick={() => setActiveCategory(null)}
            className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition ${
              activeCategory === null
                ? 'bg-[var(--primary)] text-white'
                : 'bg-zinc-800 text-zinc-400 hover:text-white'
            }`}
          >
            All
          </button>
          {HOTKEY_CATEGORIES.map(cat => (
            <button
              key={cat.name}
              onClick={() => setActiveCategory(cat.name)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition ${
                activeCategory === cat.name
                  ? 'bg-[var(--primary)] text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              <cat.icon size={14} />
              {cat.name}
            </button>
          ))}
        </div>

        {/* Shortcuts list */}
        <div className="overflow-y-auto max-h-[50vh] p-6">
          {filteredCategories.length === 0 ? (
            <div className="text-center text-zinc-500 py-8">
              No shortcuts found for "{search}"
            </div>
          ) : (
            <div className="space-y-6">
              {filteredCategories
                .filter(cat => !activeCategory || cat.name === activeCategory)
                .map(category => (
                  <div key={category.name}>
                    <div className="flex items-center gap-2 mb-3">
                      <category.icon size={16} className="text-zinc-500" />
                      <h3 className="text-sm font-medium text-zinc-400">{category.name}</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {category.shortcuts.map((shortcut, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 transition"
                        >
                          <div>
                            <span className="text-sm">{shortcut.description}</span>
                            {shortcut.context && (
                              <span className="text-[10px] text-zinc-500 ml-2">
                                ({shortcut.context})
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            {shortcut.keys.map((key, j) => (
                              <React.Fragment key={key}>
                                {j > 0 && <span className="text-zinc-600 text-xs">/</span>}
                                <kbd className="px-2 py-0.5 bg-zinc-700 border border-zinc-600 rounded text-xs font-mono">
                                  {key}
                                </kbd>
                              </React.Fragment>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-zinc-800 text-center">
          <span className="text-xs text-zinc-500">
            Press <kbd className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-[10px]">?</kbd> anytime to show this help
          </span>
        </div>
      </div>
    </div>
  )
}

// Hook to show hotkey help
export function useHotkeyHelp() {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        const target = e.target as HTMLElement
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          e.preventDefault()
          setIsOpen(true)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return {
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    toggle: () => setIsOpen(prev => !prev)
  }
}

// Mini shortcut hint
export function ShortcutHint({
  keys,
  className = ''
}: {
  keys: string[]
  className?: string
}) {
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`}>
      {keys.map((key, i) => (
        <React.Fragment key={key}>
          {i > 0 && <span className="text-zinc-600">+</span>}
          <kbd className="px-1 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-[10px] font-mono">
            {key}
          </kbd>
        </React.Fragment>
      ))}
    </span>
  )
}

// Keyboard shortcut indicator button
export function HotkeyHelpButton({
  onClick,
  className = ''
}: {
  onClick: () => void
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition ${className}`}
      title="Keyboard shortcuts"
    >
      <Keyboard size={16} className="text-zinc-400" />
      <span className="text-sm text-zinc-400">?</span>
    </button>
  )
}

export default HotkeyHelp
