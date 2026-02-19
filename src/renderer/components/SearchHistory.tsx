// File: src/renderer/components/SearchHistory.tsx
// Search history with suggestions and recent searches

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Search,
  Clock,
  X,
  Trash2,
  TrendingUp,
  Star,
  Tag,
  Film,
  Image,
  Filter,
  ArrowRight
} from 'lucide-react'

interface SearchHistoryItem {
  id: string
  query: string
  type: 'text' | 'tag' | 'filter'
  timestamp: number
  resultCount?: number
}

interface SearchHistoryProps {
  onSearch: (query: string, type?: string) => void
  recentTags?: string[]
  className?: string
}

// Storage key
const STORAGE_KEY = 'vault-search-history'
const MAX_HISTORY = 20

// Load history from storage
function loadHistory(): SearchHistoryItem[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? JSON.parse(saved) : []
  } catch {
    return []
  }
}

// Save history to storage
function saveHistory(history: SearchHistoryItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)))
  } catch {}
}

// Add to history
export function addToSearchHistory(query: string, type: 'text' | 'tag' | 'filter' = 'text', resultCount?: number) {
  const history = loadHistory()

  // Remove existing same query
  const filtered = history.filter(h => h.query.toLowerCase() !== query.toLowerCase() || h.type !== type)

  // Add new entry at the beginning
  const newItem: SearchHistoryItem = {
    id: `search-${Date.now()}`,
    query,
    type,
    timestamp: Date.now(),
    resultCount
  }

  saveHistory([newItem, ...filtered])
}

// Clear history
export function clearSearchHistory() {
  localStorage.removeItem(STORAGE_KEY)
}

export function SearchHistory({
  onSearch,
  recentTags = [],
  className = ''
}: SearchHistoryProps) {
  const [history, setHistory] = useState<SearchHistoryItem[]>([])
  const [showAll, setShowAll] = useState(false)

  // Load history
  useEffect(() => {
    setHistory(loadHistory())
  }, [])

  // Group history
  const groupedHistory = useMemo(() => {
    const today = new Date().toDateString()
    const yesterday = new Date(Date.now() - 86400000).toDateString()

    const groups: Record<string, SearchHistoryItem[]> = {
      'Today': [],
      'Yesterday': [],
      'Earlier': []
    }

    for (const item of history) {
      const date = new Date(item.timestamp).toDateString()
      if (date === today) {
        groups['Today'].push(item)
      } else if (date === yesterday) {
        groups['Yesterday'].push(item)
      } else {
        groups['Earlier'].push(item)
      }
    }

    return groups
  }, [history])

  // Handle search
  const handleSearch = useCallback((item: SearchHistoryItem) => {
    onSearch(item.query, item.type)
  }, [onSearch])

  // Remove item
  const removeItem = useCallback((id: string) => {
    const newHistory = history.filter(h => h.id !== id)
    setHistory(newHistory)
    saveHistory(newHistory)
  }, [history])

  // Clear all
  const handleClear = useCallback(() => {
    setHistory([])
    clearSearchHistory()
  }, [])

  // Get icon for search type
  const getIcon = (type: string) => {
    switch (type) {
      case 'tag': return Tag
      case 'filter': return Filter
      default: return Search
    }
  }

  const displayedHistory = showAll ? history : history.slice(0, 10)

  return (
    <div className={`bg-zinc-900/95 backdrop-blur-xl rounded-2xl border border-zinc-700 shadow-2xl overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <Clock size={18} className="text-[var(--primary)]" />
          <span className="font-semibold">Search History</span>
        </div>
        {history.length > 0 && (
          <button
            onClick={handleClear}
            className="flex items-center gap-1 text-xs text-zinc-500 hover:text-red-400 transition"
          >
            <Trash2 size={12} />
            Clear all
          </button>
        )}
      </div>

      <div className="max-h-[50vh] overflow-y-auto">
        {/* Recent tags */}
        {recentTags.length > 0 && (
          <div className="px-5 py-3 border-b border-zinc-800">
            <div className="text-xs text-zinc-500 mb-2">Recent Tags</div>
            <div className="flex flex-wrap gap-1">
              {recentTags.slice(0, 8).map(tag => (
                <button
                  key={tag}
                  onClick={() => onSearch(tag, 'tag')}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs transition"
                >
                  <Tag size={10} className="text-zinc-500" />
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* History list */}
        {history.length === 0 ? (
          <div className="py-12 text-center text-zinc-500">
            <Search size={32} className="mx-auto mb-2 opacity-50" />
            <p>No search history</p>
            <p className="text-xs mt-1">Your recent searches will appear here</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/50">
            {displayedHistory.map(item => {
              const Icon = getIcon(item.type)
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-zinc-800/50 cursor-pointer group"
                  onClick={() => handleSearch(item)}
                >
                  <Icon size={14} className="text-zinc-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{item.query}</div>
                    <div className="text-[10px] text-zinc-600">
                      {item.resultCount !== undefined && (
                        <span>{item.resultCount} results • </span>
                      )}
                      {formatTimeAgo(item.timestamp)}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      removeItem(item.id)
                    }}
                    className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-zinc-700 transition"
                  >
                    <X size={12} className="text-zinc-500" />
                  </button>
                  <ArrowRight size={14} className="text-zinc-600 opacity-0 group-hover:opacity-100" />
                </div>
              )
            })}
          </div>
        )}

        {/* Show more */}
        {history.length > 10 && !showAll && (
          <button
            onClick={() => setShowAll(true)}
            className="w-full py-3 text-xs text-zinc-500 hover:text-white hover:bg-zinc-800 transition"
          >
            Show all ({history.length - 10} more)
          </button>
        )}
      </div>

      {/* Quick filters */}
      <div className="px-5 py-3 border-t border-zinc-800">
        <div className="text-xs text-zinc-500 mb-2">Quick Filters</div>
        <div className="flex gap-2">
          {[
            { label: 'Videos', icon: Film, filter: 'type:video' },
            { label: 'Images', icon: Image, filter: 'type:image' },
            { label: 'Rated', icon: Star, filter: 'rating:>0' },
            { label: 'Popular', icon: TrendingUp, filter: 'views:>5' }
          ].map(filter => {
            const Icon = filter.icon
            return (
              <button
                key={filter.label}
                onClick={() => onSearch(filter.filter, 'filter')}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs transition"
              >
                <Icon size={12} className="text-zinc-500" />
                {filter.label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// Format time ago
function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString()
}

// Search suggestions component
export function SearchSuggestions({
  query,
  suggestions,
  onSelect,
  className = ''
}: {
  query: string
  suggestions: Array<{ text: string; type: 'history' | 'tag' | 'suggestion' }>
  onSelect: (text: string) => void
  className?: string
}) {
  if (suggestions.length === 0 || !query) return null

  return (
    <div className={`bg-zinc-900 rounded-xl border border-zinc-700 shadow-xl overflow-hidden ${className}`}>
      {suggestions.map((suggestion, i) => (
        <button
          key={i}
          onClick={() => onSelect(suggestion.text)}
          className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-zinc-800 transition text-left"
        >
          {suggestion.type === 'history' && <Clock size={14} className="text-zinc-500" />}
          {suggestion.type === 'tag' && <Tag size={14} className="text-zinc-500" />}
          {suggestion.type === 'suggestion' && <Search size={14} className="text-zinc-500" />}
          <span className="text-sm">{suggestion.text}</span>
        </button>
      ))}
    </div>
  )
}

// Mini search history for toolbar
export function RecentSearches({
  onSearch,
  limit = 3,
  className = ''
}: {
  onSearch: (query: string) => void
  limit?: number
  className?: string
}) {
  const [history, setHistory] = useState<SearchHistoryItem[]>([])

  useEffect(() => {
    setHistory(loadHistory().slice(0, limit))
  }, [limit])

  if (history.length === 0) return null

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <Clock size={12} className="text-zinc-500" />
      {history.map(item => (
        <button
          key={item.id}
          onClick={() => onSearch(item.query)}
          className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-400 hover:text-white transition truncate max-w-[100px]"
        >
          {item.query}
        </button>
      ))}
    </div>
  )
}

export default SearchHistory
