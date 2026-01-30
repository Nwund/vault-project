// File: src/renderer/components/TagSelector.tsx
// Searchable dropdown tag selector per specification

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { X, Plus, Search, Tag, ChevronDown } from 'lucide-react'

interface TagOption {
  id: string
  name: string
  count?: number
}

interface TagSelectorProps {
  tags: TagOption[]
  selectedTags: string[]
  onTagsChange: (tags: string[]) => void
  onCreateTag?: (name: string) => Promise<void>
  onOpenChange?: (isOpen: boolean) => void
  placeholder?: string
  maxResults?: number
  className?: string
}

export const TagSelector: React.FC<TagSelectorProps> = ({
  tags,
  selectedTags,
  onTagsChange,
  onCreateTag,
  onOpenChange,
  placeholder = 'Search or add tags...',
  maxResults = 20,
  className = ''
}) => {
  const [isOpen, setIsOpenInternal] = useState(false)

  // Wrapper to notify parent of open state changes
  const setIsOpen = useCallback((open: boolean | ((prev: boolean) => boolean)) => {
    setIsOpenInternal(prev => {
      const newValue = typeof open === 'function' ? open(prev) : open
      if (newValue !== prev) {
        onOpenChange?.(newValue)
      }
      return newValue
    })
  }, [onOpenChange])
  const [search, setSearch] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Filter tags based on search, excluding already selected
  const filteredTags = tags
    .filter(tag => !selectedTags.includes(tag.name))
    .filter(tag => tag.name.toLowerCase().includes(search.toLowerCase()))
    .slice(0, maxResults)

  // Check if search matches any tag exactly
  const exactMatch = tags.some(t => t.name.toLowerCase() === search.toLowerCase())
  const showCreateOption = search.trim() && !exactMatch && onCreateTag

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Reset highlight when search changes
  useEffect(() => {
    setHighlightIndex(0)
  }, [search])

  const addTag = useCallback((tagName: string) => {
    if (!selectedTags.includes(tagName)) {
      onTagsChange([...selectedTags, tagName])
    }
    setSearch('')
    setIsOpen(false)
  }, [selectedTags, onTagsChange])

  const removeTag = useCallback((tagName: string) => {
    onTagsChange(selectedTags.filter(t => t !== tagName))
  }, [selectedTags, onTagsChange])

  const handleCreateTag = async () => {
    if (!search.trim() || !onCreateTag) return
    try {
      await onCreateTag(search.trim())
      addTag(search.trim())
    } catch (e) {
      console.error('Failed to create tag:', e)
    }
  }

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const totalOptions = filteredTags.length + (showCreateOption ? 1 : 0)

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightIndex(i => Math.min(i + 1, totalOptions - 1))
        setIsOpen(true)
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightIndex(i => Math.max(i - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (!isOpen) {
          setIsOpen(true)
          return
        }
        if (showCreateOption && highlightIndex === filteredTags.length) {
          handleCreateTag()
        } else if (filteredTags[highlightIndex]) {
          addTag(filteredTags[highlightIndex].name)
        } else if (search.trim() && showCreateOption) {
          handleCreateTag()
        }
        break
      case 'Backspace':
        if (!search && selectedTags.length > 0) {
          e.preventDefault()
          removeTag(selectedTags[selectedTags.length - 1])
        }
        break
      case 'Escape':
        setIsOpen(false)
        setSearch('')
        break
    }
  }

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      {/* Selected Tags + Input Container */}
      <div
        className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-xl bg-black/20 border border-[var(--border)] focus-within:border-[var(--primary)]/50 cursor-text min-h-[44px]"
        onClick={() => inputRef.current?.focus()}
      >
        {/* Selected tag chips */}
        {selectedTags.map(tag => (
          <span
            key={tag}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--primary)]/20 text-[var(--primary)] text-xs font-medium"
          >
            <Tag size={10} />
            {tag}
            <button
              onClick={(e) => {
                e.stopPropagation()
                removeTag(tag)
              }}
              className="ml-0.5 hover:bg-[var(--primary)]/30 rounded p-0.5 transition"
            >
              <X size={10} />
            </button>
          </span>
        ))}

        {/* Search Input */}
        <div className="flex-1 min-w-[120px] relative">
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setIsOpen(true)
            }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={selectedTags.length === 0 ? placeholder : ''}
            className="w-full bg-transparent outline-none text-sm"
          />
        </div>

        {/* Dropdown indicator */}
        <ChevronDown
          size={14}
          className={`text-[var(--muted)] transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </div>

      {/* Dropdown */}
      {isOpen && (filteredTags.length > 0 || showCreateOption) && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 py-1 bg-[var(--panel)] border border-[var(--border)] rounded-xl shadow-lg max-h-60 overflow-auto">
          {/* Filtered tag options */}
          {filteredTags.map((tag, idx) => (
            <button
              key={tag.id}
              onClick={() => addTag(tag.name)}
              onMouseEnter={() => setHighlightIndex(idx)}
              className={`w-full px-4 py-2.5 text-left text-sm flex items-center justify-between transition ${
                highlightIndex === idx
                  ? 'bg-[var(--primary)]/20 text-[var(--primary)]'
                  : 'hover:bg-white/5'
              }`}
            >
              <span className="flex items-center gap-2">
                <Tag size={12} />
                {tag.name}
              </span>
              {tag.count !== undefined && (
                <span className="text-xs text-[var(--muted)]">{tag.count}</span>
              )}
            </button>
          ))}

          {/* Create new tag option */}
          {showCreateOption && (
            <button
              onClick={handleCreateTag}
              onMouseEnter={() => setHighlightIndex(filteredTags.length)}
              className={`w-full px-4 py-2.5 text-left text-sm flex items-center gap-2 transition ${
                highlightIndex === filteredTags.length
                  ? 'bg-[var(--primary)]/20 text-[var(--primary)]'
                  : 'hover:bg-white/5'
              }`}
            >
              <Plus size={12} />
              Create tag "{search}"
            </button>
          )}

          {/* No results message */}
          {filteredTags.length === 0 && !showCreateOption && search && (
            <div className="px-4 py-3 text-sm text-[var(--muted)] text-center">
              No tags found
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default TagSelector
