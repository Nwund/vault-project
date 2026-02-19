// File: src/renderer/components/TagAutocomplete.tsx
// Tag input with autocomplete, suggestions, and creation

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Tag,
  Plus,
  X,
  Search,
  Hash,
  Sparkles,
  TrendingUp,
  Clock
} from 'lucide-react'

interface TagInfo {
  id: string
  name: string
  count: number
  color?: string
}

interface TagAutocompleteProps {
  selectedTags: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
  maxTags?: number
  allowCreate?: boolean
  showPopular?: boolean
  className?: string
}

export function TagAutocomplete({
  selectedTags,
  onChange,
  placeholder = 'Add tags...',
  maxTags = 20,
  allowCreate = true,
  showPopular = true,
  className = ''
}: TagAutocompleteProps) {
  const [input, setInput] = useState('')
  const [allTags, setAllTags] = useState<TagInfo[]>([])
  const [suggestions, setSuggestions] = useState<TagInfo[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const [recentTags, setRecentTags] = useState<string[]>([])

  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Load all tags
  useEffect(() => {
    window.api.tags?.list?.()
      .then((tags: TagInfo[]) => {
        setAllTags(tags.sort((a, b) => b.count - a.count))
      })
      .catch(() => {})

    // Load recent tags
    try {
      const recent = localStorage.getItem('vault-recent-tags')
      if (recent) {
        setRecentTags(JSON.parse(recent).slice(0, 10))
      }
    } catch {}
  }, [])

  // Filter suggestions
  useEffect(() => {
    if (!input.trim()) {
      if (showPopular) {
        setSuggestions(allTags.filter(t => !selectedTags.includes(t.name)).slice(0, 8))
      } else {
        setSuggestions([])
      }
      return
    }

    const query = input.toLowerCase()
    const filtered = allTags
      .filter(t => !selectedTags.includes(t.name) && t.name.toLowerCase().includes(query))
      .slice(0, 10)

    setSuggestions(filtered)
    setFocusedIndex(-1)
  }, [input, allTags, selectedTags, showPopular])

  // Add tag
  const addTag = useCallback((tagName: string) => {
    const trimmed = tagName.trim().toLowerCase()
    if (!trimmed || selectedTags.includes(trimmed) || selectedTags.length >= maxTags) {
      return
    }

    onChange([...selectedTags, trimmed])
    setInput('')
    setShowSuggestions(false)

    // Update recent tags
    try {
      const recent = [trimmed, ...recentTags.filter(t => t !== trimmed)].slice(0, 10)
      setRecentTags(recent)
      localStorage.setItem('vault-recent-tags', JSON.stringify(recent))
    } catch {}
  }, [selectedTags, onChange, maxTags, recentTags])

  // Remove tag
  const removeTag = useCallback((tagName: string) => {
    onChange(selectedTags.filter(t => t !== tagName))
  }, [selectedTags, onChange])

  // Handle input keydown
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Enter':
        e.preventDefault()
        if (focusedIndex >= 0 && suggestions[focusedIndex]) {
          addTag(suggestions[focusedIndex].name)
        } else if (input.trim() && allowCreate) {
          addTag(input)
        }
        break
      case 'Tab':
        if (suggestions.length > 0) {
          e.preventDefault()
          addTag(suggestions[focusedIndex >= 0 ? focusedIndex : 0].name)
        }
        break
      case 'ArrowDown':
        e.preventDefault()
        setFocusedIndex(prev => Math.min(prev + 1, suggestions.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setFocusedIndex(prev => Math.max(prev - 1, -1))
        break
      case 'Escape':
        setShowSuggestions(false)
        setFocusedIndex(-1)
        break
      case 'Backspace':
        if (!input && selectedTags.length > 0) {
          removeTag(selectedTags[selectedTags.length - 1])
        }
        break
      case ',':
      case ' ':
        if (input.trim()) {
          e.preventDefault()
          addTag(input)
        }
        break
    }
  }, [input, suggestions, focusedIndex, allowCreate, selectedTags, addTag, removeTag])

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Popular tags (not selected)
  const popularTags = useMemo(() =>
    allTags.filter(t => !selectedTags.includes(t.name)).slice(0, 5),
    [allTags, selectedTags]
  )

  // Recent tags (not selected)
  const availableRecentTags = useMemo(() =>
    recentTags.filter(t => !selectedTags.includes(t)).slice(0, 5),
    [recentTags, selectedTags]
  )

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Tag input area */}
      <div
        className="flex flex-wrap gap-1.5 p-2 bg-zinc-800 border border-zinc-700 rounded-xl focus-within:border-[var(--primary)] transition min-h-[42px] cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {/* Selected tags */}
        {selectedTags.map(tag => (
          <span
            key={tag}
            className="flex items-center gap-1 px-2 py-0.5 bg-[var(--primary)]/20 text-[var(--primary)] rounded-md text-sm group"
          >
            {tag}
            <button
              onClick={(e) => {
                e.stopPropagation()
                removeTag(tag)
              }}
              className="opacity-50 hover:opacity-100 transition"
            >
              <X size={12} />
            </button>
          </span>
        ))}

        {/* Input */}
        {selectedTags.length < maxTags && (
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => setShowSuggestions(true)}
            onKeyDown={handleKeyDown}
            placeholder={selectedTags.length === 0 ? placeholder : ''}
            className="flex-1 min-w-[100px] bg-transparent outline-none text-sm"
          />
        )}
      </div>

      {/* Counter */}
      <div className="flex items-center justify-between mt-1 text-xs text-zinc-500">
        <span>Press Enter or comma to add</span>
        <span>{selectedTags.length}/{maxTags}</span>
      </div>

      {/* Suggestions dropdown */}
      {showSuggestions && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl overflow-hidden z-50 max-h-64 overflow-y-auto">
          {/* Recent tags */}
          {availableRecentTags.length > 0 && !input && (
            <div className="p-2 border-b border-zinc-800">
              <div className="flex items-center gap-1 text-xs text-zinc-500 mb-2">
                <Clock size={10} />
                Recent
              </div>
              <div className="flex flex-wrap gap-1">
                {availableRecentTags.map(tag => (
                  <button
                    key={tag}
                    onClick={() => addTag(tag)}
                    className="px-2 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-xs transition"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Suggestions list */}
          {suggestions.length > 0 ? (
            <div>
              {!input && (
                <div className="flex items-center gap-1 px-3 py-1.5 text-xs text-zinc-500">
                  <TrendingUp size={10} />
                  Popular
                </div>
              )}
              {suggestions.map((tag, index) => (
                <button
                  key={tag.id}
                  onClick={() => addTag(tag.name)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-left transition ${
                    index === focusedIndex ? 'bg-zinc-800' : 'hover:bg-zinc-800'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Tag size={12} className="text-zinc-500" />
                    <span className="text-sm">{tag.name}</span>
                  </div>
                  <span className="text-xs text-zinc-600">{tag.count}</span>
                </button>
              ))}
            </div>
          ) : input && allowCreate ? (
            <button
              onClick={() => addTag(input)}
              className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-zinc-800 transition"
            >
              <Plus size={12} className="text-[var(--primary)]" />
              <span className="text-sm">Create "{input}"</span>
            </button>
          ) : null}
        </div>
      )}
    </div>
  )
}

// Inline tag display with edit capability
export function TagDisplay({
  tags,
  onEdit,
  maxDisplay = 5,
  className = ''
}: {
  tags: string[]
  onEdit?: () => void
  maxDisplay?: number
  className?: string
}) {
  const displayTags = tags.slice(0, maxDisplay)
  const remaining = tags.length - maxDisplay

  return (
    <div
      className={`flex flex-wrap gap-1 ${onEdit ? 'cursor-pointer' : ''} ${className}`}
      onClick={onEdit}
    >
      {displayTags.map(tag => (
        <span
          key={tag}
          className="px-2 py-0.5 rounded-full bg-zinc-800 text-xs text-zinc-300"
        >
          {tag}
        </span>
      ))}
      {remaining > 0 && (
        <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-xs text-zinc-500">
          +{remaining}
        </span>
      )}
      {tags.length === 0 && onEdit && (
        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-800 text-xs text-zinc-500">
          <Plus size={10} />
          Add tags
        </span>
      )}
    </div>
  )
}

// Quick tag button for common tags
export function QuickTagButton({
  tag,
  isSelected,
  onToggle,
  className = ''
}: {
  tag: string
  isSelected: boolean
  onToggle: () => void
  className?: string
}) {
  return (
    <button
      onClick={onToggle}
      className={`px-2 py-1 rounded-md text-xs transition ${
        isSelected
          ? 'bg-[var(--primary)] text-white'
          : 'bg-zinc-800 text-zinc-400 hover:text-white'
      } ${className}`}
    >
      {tag}
    </button>
  )
}

export default TagAutocomplete
