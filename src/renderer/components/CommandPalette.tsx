// File: src/renderer/components/CommandPalette.tsx
// Command palette for quick actions with fuzzy search

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  Command,
  Search,
  Play,
  Film,
  Image,
  Tag,
  Star,
  Heart,
  List,
  Settings,
  Download,
  Upload,
  RefreshCw,
  Trash2,
  FolderOpen,
  Eye,
  EyeOff,
  Shuffle,
  Clock,
  Calendar,
  BarChart3,
  Zap,
  Shield,
  Tv,
  Music,
  Home,
  Grid,
  Sparkles,
  ChevronRight,
  X,
  ArrowUp,
  ArrowDown,
  CornerDownLeft,
  BookOpen,
  StickyNote,
  Link2,
  ListOrdered,
  Layers
} from 'lucide-react'

interface CommandAction {
  id: string
  title: string
  subtitle?: string
  icon: React.ElementType
  category: 'navigation' | 'media' | 'playback' | 'library' | 'tools' | 'settings'
  keywords: string[]
  shortcut?: string[]
  action: () => void
}

interface CommandPaletteProps {
  isOpen: boolean
  onClose: () => void
  onNavigate: (path: string) => void
  onPlayMedia?: (mediaId?: string) => void
  onAction?: (actionId: string) => void
  currentMediaId?: string
}

export function CommandPalette({
  isOpen,
  onClose,
  onNavigate,
  onPlayMedia,
  onAction,
  currentMediaId
}: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Define all available commands
  const allCommands: CommandAction[] = useMemo(() => [
    // Navigation
    { id: 'go-home', title: 'Go to Home', icon: Home, category: 'navigation', keywords: ['home', 'dashboard', 'start'], shortcut: ['Ctrl', 'H'], action: () => onNavigate('/') },
    { id: 'go-library', title: 'Go to Library', icon: Grid, category: 'navigation', keywords: ['library', 'media', 'browse', 'all'], shortcut: ['Ctrl', 'L'], action: () => onNavigate('/library') },
    { id: 'go-goonwall', title: 'Go to GoonWall', icon: Zap, category: 'navigation', keywords: ['goonwall', 'wall', 'grid', 'tiles'], shortcut: ['Ctrl', 'G'], action: () => onNavigate('/goonwall') },
    { id: 'go-playlists', title: 'Go to Playlists', icon: List, category: 'navigation', keywords: ['playlists', 'collections', 'lists'], action: () => onNavigate('/playlists') },
    { id: 'go-stats', title: 'Go to Statistics', icon: BarChart3, category: 'navigation', keywords: ['stats', 'analytics', 'insights', 'dashboard'], action: () => onNavigate('/stats') },
    { id: 'go-settings', title: 'Go to Settings', icon: Settings, category: 'navigation', keywords: ['settings', 'preferences', 'config', 'options'], shortcut: ['Ctrl', ','], action: () => onNavigate('/settings') },
    { id: 'go-downloads', title: 'Go to Downloads', icon: Download, category: 'navigation', keywords: ['downloads', 'url', 'yt-dlp'], action: () => onNavigate('/downloads') },
    { id: 'go-daylist', title: "Today's Daylist", icon: Calendar, category: 'navigation', keywords: ['daylist', 'today', 'daily', 'recommended'], action: () => onNavigate('/daylist') },

    // Media actions
    { id: 'play-random', title: 'Play Random Video', subtitle: 'Shuffle to a random video', icon: Shuffle, category: 'media', keywords: ['random', 'shuffle', 'surprise'], shortcut: ['R'], action: () => onPlayMedia?.() },
    { id: 'play-favorites', title: 'Play Favorites', subtitle: 'Random from favorites', icon: Heart, category: 'media', keywords: ['favorites', 'liked', 'hearts', 'play'], action: () => { onAction?.('play-favorites') } },
    { id: 'recent-viewed', title: 'Recently Viewed', subtitle: 'Continue where you left off', icon: Clock, category: 'media', keywords: ['recent', 'history', 'watched', 'continue'], action: () => onNavigate('/history') },
    { id: 'top-rated', title: 'Top Rated', subtitle: 'Your highest rated content', icon: Star, category: 'media', keywords: ['top', 'rated', 'best', 'stars'], action: () => { onAction?.('top-rated') } },

    // Playback (if media is playing)
    { id: 'toggle-fullscreen', title: 'Toggle Fullscreen', icon: Eye, category: 'playback', keywords: ['fullscreen', 'expand', 'theater', 'maximise'], shortcut: ['F'], action: () => { onAction?.('toggle-fullscreen') } },
    { id: 'picture-in-picture', title: 'Picture in Picture', icon: Tv, category: 'playback', keywords: ['pip', 'picture', 'float', 'mini'], action: () => { onAction?.('pip') } },
    { id: 'cast-to-tv', title: 'Cast to TV', subtitle: 'Stream to DLNA device', icon: Tv, category: 'playback', keywords: ['cast', 'dlna', 'chromecast', 'tv', 'stream'], action: () => { onAction?.('cast') } },

    // Library management
    { id: 'rescan-library', title: 'Rescan Library', subtitle: 'Check for new media', icon: RefreshCw, category: 'library', keywords: ['rescan', 'refresh', 'sync', 'update'], action: () => { onAction?.('rescan') } },
    { id: 'import-files', title: 'Import Files', subtitle: 'Add new media to library', icon: Upload, category: 'library', keywords: ['import', 'add', 'files', 'upload'], action: () => { onAction?.('import') } },
    { id: 'find-duplicates', title: 'Find Duplicates', subtitle: 'Detect duplicate files', icon: Eye, category: 'library', keywords: ['duplicates', 'duplicate', 'similar', 'cleanup'], action: () => onNavigate('/duplicates') },
    { id: 'auto-tag', title: 'Auto Tag Media', subtitle: 'AI-powered tagging', icon: Sparkles, category: 'library', keywords: ['auto', 'tag', 'ai', 'smart', 'analyze'], action: () => { onAction?.('auto-tag') } },

    // Tools
    { id: 'backup-now', title: 'Create Backup', subtitle: 'Backup your library data', icon: Shield, category: 'tools', keywords: ['backup', 'save', 'export', 'protect'], action: () => { onAction?.('backup') } },
    { id: 'restore-backup', title: 'Restore Backup', subtitle: 'Restore from backup file', icon: Download, category: 'tools', keywords: ['restore', 'recover', 'import', 'backup'], action: () => { onAction?.('restore') } },
    { id: 'open-folder', title: 'Open Library Folder', subtitle: 'Open in file explorer', icon: FolderOpen, category: 'tools', keywords: ['folder', 'explorer', 'files', 'open'], action: () => { onAction?.('open-folder') } },
    { id: 'pmv-editor', title: 'PMV Editor', subtitle: 'Create music video compilations', icon: Music, category: 'tools', keywords: ['pmv', 'editor', 'music', 'video', 'compilation'], action: () => onNavigate('/pmv') },
    { id: 'video-chapters', title: 'Video Chapters', subtitle: 'Manage chapters for current video', icon: BookOpen, category: 'tools', keywords: ['chapters', 'markers', 'navigation', 'scenes', 'timeline'], action: () => { onAction?.('video-chapters') } },
    { id: 'quick-note', title: 'Quick Note', subtitle: 'Add notes to current media', icon: StickyNote, category: 'tools', keywords: ['notes', 'note', 'annotate', 'comment', 'memo'], action: () => { onAction?.('quick-note') } },
    { id: 'related-media', title: 'Related Media', subtitle: 'Find similar content', icon: Link2, category: 'tools', keywords: ['related', 'similar', 'suggestions', 'recommendations'], action: () => { onAction?.('related-media') } },

    // Media Queue & Playlists
    { id: 'media-queue', title: 'Media Queue', subtitle: 'View and manage playback queue', icon: ListOrdered, category: 'media', keywords: ['queue', 'playlist', 'up next', 'order', 'list'], action: () => { onAction?.('media-queue') } },
    { id: 'auto-playlists', title: 'Auto Playlists', subtitle: 'AI-generated playlist suggestions', icon: Sparkles, category: 'media', keywords: ['auto', 'playlists', 'generated', 'smart', 'curated'], action: () => { onAction?.('auto-playlists') } },
    { id: 'media-timeline', title: 'Media Timeline', subtitle: 'Browse by date added', icon: Calendar, category: 'navigation', keywords: ['timeline', 'calendar', 'date', 'chronological', 'history'], action: () => { onAction?.('media-timeline') } },

    // Settings shortcuts
    { id: 'toggle-dark-mode', title: 'Toggle Dark Mode', icon: EyeOff, category: 'settings', keywords: ['dark', 'light', 'theme', 'mode'], action: () => { onAction?.('toggle-theme') } },
    { id: 'keyboard-shortcuts', title: 'Keyboard Shortcuts', subtitle: 'View all shortcuts', icon: Command, category: 'settings', keywords: ['keyboard', 'shortcuts', 'keys', 'hotkeys'], action: () => onNavigate('/settings/shortcuts') }
  ], [onNavigate, onPlayMedia, onAction])

  // Filter commands based on query
  const filteredCommands = useMemo(() => {
    if (!query.trim()) {
      return selectedCategory
        ? allCommands.filter(c => c.category === selectedCategory)
        : allCommands
    }

    const queryLower = query.toLowerCase().trim()
    const words = queryLower.split(/\s+/)

    return allCommands
      .filter(cmd => {
        if (selectedCategory && cmd.category !== selectedCategory) return false

        // Check title
        if (cmd.title.toLowerCase().includes(queryLower)) return true

        // Check subtitle
        if (cmd.subtitle?.toLowerCase().includes(queryLower)) return true

        // Check keywords (fuzzy match)
        return words.every(word =>
          cmd.keywords.some(kw => kw.includes(word) || word.includes(kw))
        )
      })
      .sort((a, b) => {
        // Prioritize exact title matches
        const aExact = a.title.toLowerCase().startsWith(queryLower) ? 0 : 1
        const bExact = b.title.toLowerCase().startsWith(queryLower) ? 0 : 1
        return aExact - bExact
      })
  }, [query, selectedCategory, allCommands])

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0)
  }, [query, selectedCategory])

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50)
      setQuery('')
      setSelectedCategory(null)
    }
  }, [isOpen])

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selectedItem = listRef.current.querySelector(`[data-index="${selectedIndex}"]`)
      selectedItem?.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex(prev => (prev + 1) % filteredCommands.length)
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex(prev => (prev - 1 + filteredCommands.length) % filteredCommands.length)
          break
        case 'Enter':
          e.preventDefault()
          if (filteredCommands[selectedIndex]) {
            filteredCommands[selectedIndex].action()
            onClose()
          }
          break
        case 'Escape':
          e.preventDefault()
          onClose()
          break
        case 'Tab':
          e.preventDefault()
          // Cycle through categories
          const categories = ['navigation', 'media', 'playback', 'library', 'tools', 'settings']
          if (selectedCategory) {
            const currentIdx = categories.indexOf(selectedCategory)
            const nextIdx = e.shiftKey
              ? (currentIdx - 1 + categories.length) % categories.length
              : (currentIdx + 1) % categories.length
            setSelectedCategory(categories[nextIdx])
          } else {
            setSelectedCategory(categories[0])
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, filteredCommands, selectedIndex, selectedCategory, onClose])

  if (!isOpen) return null

  const categoryIcons: Record<string, React.ElementType> = {
    navigation: ChevronRight,
    media: Play,
    playback: Film,
    library: FolderOpen,
    tools: Settings,
    settings: Settings
  }

  const categoryLabels: Record<string, string> = {
    navigation: 'Navigation',
    media: 'Media',
    playback: 'Playback',
    library: 'Library',
    tools: 'Tools',
    settings: 'Settings'
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[10vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Palette */}
      <div className="relative w-full max-w-xl bg-zinc-900 rounded-2xl border border-zinc-700 shadow-2xl overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800">
          <Search size={20} className="text-zinc-500" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Type a command or search..."
            className="flex-1 bg-transparent border-none outline-none text-white placeholder-zinc-500"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-[10px] text-zinc-400">
            ESC
          </kbd>
        </div>

        {/* Category filters */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-zinc-800 overflow-x-auto">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
              selectedCategory === null
                ? 'bg-[var(--primary)] text-white'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            All
          </button>
          {Object.entries(categoryLabels).map(([key, label]) => {
            const Icon = categoryIcons[key]
            return (
              <button
                key={key}
                onClick={() => setSelectedCategory(key)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                  selectedCategory === key
                    ? 'bg-[var(--primary)] text-white'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`}
              >
                <Icon size={12} />
                {label}
              </button>
            )
          })}
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto">
          {filteredCommands.length === 0 ? (
            <div className="py-8 text-center text-zinc-500">
              <Command size={32} className="mx-auto mb-2 opacity-50" />
              <p>No commands found</p>
            </div>
          ) : (
            <div className="py-2">
              {filteredCommands.map((cmd, idx) => {
                const Icon = cmd.icon
                return (
                  <button
                    key={cmd.id}
                    data-index={idx}
                    onClick={() => {
                      cmd.action()
                      onClose()
                    }}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition ${
                      idx === selectedIndex
                        ? 'bg-[var(--primary)]/20 text-white'
                        : 'text-zinc-300 hover:bg-zinc-800'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      idx === selectedIndex ? 'bg-[var(--primary)]' : 'bg-zinc-800'
                    }`}>
                      <Icon size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{cmd.title}</div>
                      {cmd.subtitle && (
                        <div className="text-xs text-zinc-500 truncate">{cmd.subtitle}</div>
                      )}
                    </div>
                    {cmd.shortcut && (
                      <div className="flex items-center gap-1">
                        {cmd.shortcut.map((key, i) => (
                          <kbd
                            key={i}
                            className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-[10px] text-zinc-400"
                          >
                            {key}
                          </kbd>
                        ))}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer hints */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-zinc-800 text-[10px] text-zinc-500">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <ArrowUp size={10} />
              <ArrowDown size={10} />
              Navigate
            </span>
            <span className="flex items-center gap-1">
              <CornerDownLeft size={10} />
              Select
            </span>
            <span className="flex items-center gap-1">
              Tab to filter
            </span>
          </div>
          <span>Ctrl+K to open</span>
        </div>
      </div>
    </div>
  )
}

// Hook to open command palette with keyboard shortcut
export function useCommandPalette() {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K or Cmd+K
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setIsOpen(prev => !prev)
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

export default CommandPalette
