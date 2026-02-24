// File: src/renderer/components/CommandPalette.tsx
// Command palette for quick actions with fuzzy search, recent actions, and typeahead

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
  Layers,
  Filter,
  FolderHeart,
  TrendingUp,
  FolderTree,
  History
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

// Local storage key for recent actions
const RECENT_ACTIONS_KEY = 'vault-cmd-recent'
const MAX_RECENT_ACTIONS = 8

// Helper to highlight matching characters in text
function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text

  const queryLower = query.toLowerCase()
  const textLower = text.toLowerCase()
  const index = textLower.indexOf(queryLower)

  if (index === -1) {
    // Try character-by-character matching
    let result: React.ReactNode[] = []
    let queryIdx = 0
    for (let i = 0; i < text.length; i++) {
      if (queryIdx < queryLower.length && textLower[i] === queryLower[queryIdx]) {
        result.push(<span key={i} className="cmd-highlight">{text[i]}</span>)
        queryIdx++
      } else {
        result.push(text[i])
      }
    }
    return result
  }

  return (
    <>
      {text.slice(0, index)}
      <span className="cmd-highlight">{text.slice(index, index + query.length)}</span>
      {text.slice(index + query.length)}
    </>
  )
}

// Get recent actions from localStorage
function getRecentActions(): string[] {
  try {
    const stored = localStorage.getItem(RECENT_ACTIONS_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

// Save recent action to localStorage
function saveRecentAction(actionId: string): void {
  try {
    const recent = getRecentActions().filter(id => id !== actionId)
    recent.unshift(actionId)
    localStorage.setItem(RECENT_ACTIONS_KEY, JSON.stringify(recent.slice(0, MAX_RECENT_ACTIONS)))
  } catch {
    // Ignore storage errors
  }
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
  const [recentActionIds, setRecentActionIds] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Load recent actions on mount
  useEffect(() => {
    setRecentActionIds(getRecentActions())
  }, [isOpen])

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
    { id: 'keyboard-shortcuts', title: 'Keyboard Shortcuts', subtitle: 'View all shortcuts', icon: Command, category: 'settings', keywords: ['keyboard', 'shortcuts', 'keys', 'hotkeys'], action: () => onNavigate('/settings/shortcuts') },

    // New v2.3.0 tools
    { id: 'custom-filters', title: 'Custom Filters', subtitle: 'Create and manage filter presets', icon: Filter, category: 'tools', keywords: ['filters', 'custom', 'presets', 'search', 'query'], action: () => { onAction?.('custom-filters') } },
    { id: 'favorite-folders', title: 'Favorite Folders', subtitle: 'Quick access to favorite directories', icon: FolderHeart, category: 'navigation', keywords: ['favorites', 'folders', 'quick', 'access', 'directories'], action: () => { onAction?.('favorite-folders') } },
    { id: 'rating-trends', title: 'Rating Trends', subtitle: 'Track rating changes over time', icon: TrendingUp, category: 'library', keywords: ['rating', 'trends', 'history', 'rising', 'falling'], action: () => { onAction?.('rating-trends') } },
    { id: 'tag-categories', title: 'Tag Categories', subtitle: 'Organize tags into categories', icon: FolderTree, category: 'library', keywords: ['tags', 'categories', 'organize', 'hierarchy'], action: () => { onAction?.('tag-categories') } }
  ], [onNavigate, onPlayMedia, onAction])

  // Create a map for quick command lookup
  const commandMap = useMemo(() => {
    const map = new Map<string, CommandAction>()
    allCommands.forEach(cmd => map.set(cmd.id, cmd))
    return map
  }, [allCommands])

  // Get recent commands
  const recentCommands = useMemo(() => {
    return recentActionIds
      .map(id => commandMap.get(id))
      .filter((cmd): cmd is CommandAction => cmd !== undefined)
      .slice(0, 5)
  }, [recentActionIds, commandMap])

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

  // Show recent actions when query is empty and no category selected
  const showRecent = !query.trim() && !selectedCategory && recentCommands.length > 0

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

  // Execute command and track in recent
  const executeCommand = useCallback((cmd: CommandAction) => {
    saveRecentAction(cmd.id)
    cmd.action()
    onClose()
  }, [onClose])

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return

    const totalItems = showRecent
      ? recentCommands.length + filteredCommands.length
      : filteredCommands.length

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex(prev => (prev + 1) % totalItems)
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex(prev => (prev - 1 + totalItems) % totalItems)
          break
        case 'Enter':
          e.preventDefault()
          if (showRecent) {
            if (selectedIndex < recentCommands.length) {
              executeCommand(recentCommands[selectedIndex])
            } else {
              const cmd = filteredCommands[selectedIndex - recentCommands.length]
              if (cmd) executeCommand(cmd)
            }
          } else {
            const cmd = filteredCommands[selectedIndex]
            if (cmd) executeCommand(cmd)
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
  }, [isOpen, filteredCommands, recentCommands, selectedIndex, selectedCategory, showRecent, onClose, executeCommand])

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

  const renderCommandItem = (cmd: CommandAction, idx: number, isRecent: boolean = false) => {
    const Icon = cmd.icon
    const actualIndex = isRecent ? idx : (showRecent ? recentCommands.length + idx : idx)

    return (
      <button
        key={`${isRecent ? 'recent-' : ''}${cmd.id}`}
        data-index={actualIndex}
        onClick={() => executeCommand(cmd)}
        onMouseEnter={() => setSelectedIndex(actualIndex)}
        className={`cmd-result-item w-full flex items-center gap-3 px-4 py-2.5 text-left transition ${
          actualIndex === selectedIndex
            ? 'bg-[var(--primary)]/20 text-white'
            : 'text-zinc-300 hover:bg-zinc-800'
        }`}
      >
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
          actualIndex === selectedIndex ? 'bg-[var(--primary)]' : 'bg-zinc-800'
        }`}>
          <Icon size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium">{highlightMatch(cmd.title, query)}</div>
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
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[10vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Palette */}
      <div className="relative w-full max-w-xl command-palette-bg rounded-2xl border border-zinc-700 shadow-2xl overflow-hidden">
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
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition btn-press ${
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
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition btn-press ${
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
          {filteredCommands.length === 0 && !showRecent ? (
            <div className="py-8 text-center text-zinc-500">
              <Command size={32} className="mx-auto mb-2 opacity-50" />
              <p>No commands found</p>
            </div>
          ) : (
            <div className="py-2">
              {/* Recent Actions Section */}
              {showRecent && (
                <div className="cmd-recent-section">
                  <div className="cmd-recent-label flex items-center gap-2">
                    <History size={10} />
                    Recent
                  </div>
                  {recentCommands.map((cmd, idx) => renderCommandItem(cmd, idx, true))}
                </div>
              )}

              {/* All Commands */}
              {showRecent && (
                <div className="cmd-recent-label">All Commands</div>
              )}
              {filteredCommands.map((cmd, idx) => renderCommandItem(cmd, idx))}
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
