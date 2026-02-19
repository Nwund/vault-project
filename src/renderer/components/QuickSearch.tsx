// File: src/renderer/components/QuickSearch.tsx
// Inline search with instant results and filtering

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Search,
  X,
  Clock,
  Tag,
  Star,
  Film,
  Image,
  ArrowRight,
  Filter,
  Command,
  ChevronRight,
  TrendingUp,
  Hash
} from 'lucide-react'
import { formatDuration } from '../utils/formatters'

interface SearchResult {
  id: string
  type: 'media' | 'tag' | 'playlist' | 'collection'
  title: string
  subtitle?: string
  thumbnail?: string
  mediaType?: 'video' | 'image'
  rating?: number
  isFavorite?: boolean
}

interface QuickSearchProps {
  onSearch: (query: string) => Promise<SearchResult[]>
  onSelect: (result: SearchResult) => void
  onAdvancedSearch?: () => void
  recentSearches?: string[]
  suggestedTags?: string[]
  placeholder?: string
  className?: string
}

export function QuickSearch({
  onSearch,
  onSelect,
  onAdvancedSearch,
  recentSearches = [],
  suggestedTags = [],
  placeholder = 'Search...',
  className = ''
}: QuickSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)

  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const searchTimeoutRef = useRef<NodeJS.Timeout>()

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    if (!query.trim()) {
      setResults([])
      return
    }

    setIsLoading(true)
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const searchResults = await onSearch(query)
        setResults(searchResults)
        setSelectedIndex(-1)
      } catch (e) {
        console.error('Search failed:', e)
        setResults([])
      } finally {
        setIsLoading(false)
      }
    }, 200)

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [query, onSearch])

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex(prev => Math.min(prev + 1, results.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex(prev => Math.max(prev - 1, -1))
        break
      case 'Enter':
        e.preventDefault()
        if (selectedIndex >= 0 && results[selectedIndex]) {
          onSelect(results[selectedIndex])
          setQuery('')
          setIsFocused(false)
        } else if (onAdvancedSearch && query.trim()) {
          onAdvancedSearch()
        }
        break
      case 'Escape':
        setQuery('')
        setIsFocused(false)
        inputRef.current?.blur()
        break
    }
  }, [results, selectedIndex, onSelect, onAdvancedSearch, query])

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsFocused(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Keyboard shortcut to focus
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        inputRef.current?.focus()
      }
      if (e.key === '/' && !isFocused) {
        const target = e.target as HTMLElement
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          e.preventDefault()
          inputRef.current?.focus()
        }
      }
    }
    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [isFocused])

  // Show dropdown content
  const showDropdown = isFocused && (query || recentSearches.length > 0 || suggestedTags.length > 0)

  // Get result icon
  const getResultIcon = (result: SearchResult) => {
    switch (result.type) {
      case 'tag': return Tag
      case 'playlist': return Film
      case 'collection': return Filter
      default: return result.mediaType === 'video' ? Film : Image
    }
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Search input */}
      <div className={`flex items-center gap-2 px-3 py-2 bg-zinc-800 rounded-xl border transition ${
        isFocused ? 'border-[var(--primary)]' : 'border-zinc-700'
      }`}>
        <Search size={16} className="text-zinc-500 flex-shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1 bg-transparent outline-none text-sm"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="p-1 rounded hover:bg-zinc-700 transition"
          >
            <X size={14} />
          </button>
        )}
        {isLoading && (
          <div className="w-4 h-4 border-2 border-zinc-600 border-t-[var(--primary)] rounded-full animate-spin" />
        )}
        <kbd className="hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 bg-zinc-700 rounded text-[10px] text-zinc-400">
          <Command size={10} />F
        </kbd>
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div className="absolute top-full mt-2 left-0 right-0 bg-zinc-900/95 backdrop-blur-xl rounded-xl border border-zinc-700 shadow-2xl overflow-hidden z-50">
          {/* Results */}
          {results.length > 0 ? (
            <div className="max-h-80 overflow-y-auto">
              {results.map((result, index) => {
                const Icon = getResultIcon(result)
                const isSelected = index === selectedIndex

                return (
                  <button
                    key={result.id}
                    onClick={() => {
                      onSelect(result)
                      setQuery('')
                      setIsFocused(false)
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left transition ${
                      isSelected ? 'bg-zinc-800' : 'hover:bg-zinc-800/50'
                    }`}
                  >
                    {/* Thumbnail or icon */}
                    <div className="w-10 h-10 rounded-lg bg-zinc-800 overflow-hidden flex-shrink-0 flex items-center justify-center">
                      {result.thumbnail ? (
                        <img src={result.thumbnail} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Icon size={18} className="text-zinc-500" />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate">{result.title}</div>
                      {result.subtitle && (
                        <div className="text-xs text-zinc-500 truncate">{result.subtitle}</div>
                      )}
                    </div>

                    {/* Rating */}
                    {result.rating && (
                      <div className="flex items-center gap-0.5">
                        <Star size={12} className="text-yellow-400 fill-yellow-400" />
                        <span className="text-xs text-zinc-500">{result.rating}</span>
                      </div>
                    )}

                    {/* Type badge */}
                    <span className="px-2 py-0.5 rounded bg-zinc-800 text-[10px] text-zinc-500 uppercase">
                      {result.type}
                    </span>

                    <ChevronRight size={14} className="text-zinc-600" />
                  </button>
                )
              })}
            </div>
          ) : query ? (
            <div className="py-8 text-center">
              <Search size={24} className="mx-auto mb-2 text-zinc-600" />
              <p className="text-sm text-zinc-500">No results for "{query}"</p>
              {onAdvancedSearch && (
                <button
                  onClick={onAdvancedSearch}
                  className="mt-2 text-xs text-[var(--primary)] hover:underline"
                >
                  Try advanced search →
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Recent searches */}
              {recentSearches.length > 0 && (
                <div className="border-b border-zinc-800">
                  <div className="px-4 py-2 text-xs text-zinc-500 flex items-center gap-1">
                    <Clock size={10} />
                    Recent
                  </div>
                  {recentSearches.slice(0, 5).map(search => (
                    <button
                      key={search}
                      onClick={() => setQuery(search)}
                      className="w-full flex items-center gap-2 px-4 py-2 hover:bg-zinc-800/50 transition text-left"
                    >
                      <Clock size={12} className="text-zinc-600" />
                      <span className="text-sm">{search}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Suggested tags */}
              {suggestedTags.length > 0 && (
                <div>
                  <div className="px-4 py-2 text-xs text-zinc-500 flex items-center gap-1">
                    <TrendingUp size={10} />
                    Popular Tags
                  </div>
                  <div className="px-4 pb-3 flex flex-wrap gap-1">
                    {suggestedTags.slice(0, 8).map(tag => (
                      <button
                        key={tag}
                        onClick={() => setQuery(`tag:${tag}`)}
                        className="flex items-center gap-1 px-2 py-1 rounded-full bg-zinc-800 hover:bg-zinc-700 text-xs transition"
                      >
                        <Hash size={10} className="text-zinc-500" />
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Footer */}
          {(results.length > 0 || query) && (
            <div className="flex items-center justify-between px-4 py-2 border-t border-zinc-800 bg-zinc-800/30">
              <div className="flex items-center gap-3 text-[10px] text-zinc-500">
                <span className="flex items-center gap-1">
                  <kbd className="px-1 py-0.5 bg-zinc-700 rounded">↑↓</kbd>
                  Navigate
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1 py-0.5 bg-zinc-700 rounded">↵</kbd>
                  Select
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1 py-0.5 bg-zinc-700 rounded">Esc</kbd>
                  Close
                </span>
              </div>
              {onAdvancedSearch && (
                <button
                  onClick={onAdvancedSearch}
                  className="flex items-center gap-1 text-xs text-zinc-500 hover:text-white transition"
                >
                  Advanced
                  <ArrowRight size={12} />
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Compact search input
export function SearchInput({
  value,
  onChange,
  onSubmit,
  placeholder = 'Search...',
  className = ''
}: {
  value: string
  onChange: (value: string) => void
  onSubmit?: () => void
  placeholder?: string
  className?: string
}) {
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 bg-zinc-800 rounded-lg ${className}`}>
      <Search size={14} className="text-zinc-500" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onSubmit?.()}
        placeholder={placeholder}
        className="flex-1 bg-transparent outline-none text-sm min-w-0"
      />
      {value && (
        <button onClick={() => onChange('')} className="p-0.5 rounded hover:bg-zinc-700">
          <X size={12} />
        </button>
      )}
    </div>
  )
}

// Filter chips
export function SearchFilters({
  filters,
  activeFilters,
  onToggle,
  className = ''
}: {
  filters: Array<{ id: string; label: string; icon?: React.ElementType }>
  activeFilters: string[]
  onToggle: (filterId: string) => void
  className?: string
}) {
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <Filter size={12} className="text-zinc-500 mr-1" />
      {filters.map(filter => {
        const Icon = filter.icon
        const isActive = activeFilters.includes(filter.id)

        return (
          <button
            key={filter.id}
            onClick={() => onToggle(filter.id)}
            className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs transition ${
              isActive
                ? 'bg-[var(--primary)] text-white'
                : 'bg-zinc-800 text-zinc-400 hover:text-white'
            }`}
          >
            {Icon && <Icon size={10} />}
            {filter.label}
          </button>
        )
      })}
    </div>
  )
}

export default QuickSearch
