// File: src/renderer/hooks/useKeyboardNavigation.ts
// Keyboard navigation for media grids and lists

import { useState, useCallback, useEffect, useRef } from 'react'

export interface KeyboardNavigationOptions {
  items: Array<{ id: string }>
  columns?: number
  enabled?: boolean
  loop?: boolean
  onSelect?: (id: string) => void
  onOpen?: (id: string) => void
  onFavorite?: (id: string) => void
  onDelete?: (id: string) => void
  onEscape?: () => void
}

export interface KeyboardNavigationState {
  focusedIndex: number
  focusedId: string | null
  isNavigating: boolean
}

export function useKeyboardNavigation(options: KeyboardNavigationOptions) {
  const {
    items,
    columns = 4,
    enabled = true,
    loop = true,
    onSelect,
    onOpen,
    onFavorite,
    onDelete,
    onEscape
  } = options

  const [focusedIndex, setFocusedIndex] = useState(-1)
  const [isNavigating, setIsNavigating] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const lastKeyPressRef = useRef<number>(0)

  const focusedId = focusedIndex >= 0 && focusedIndex < items.length
    ? items[focusedIndex].id
    : null

  // Scroll focused item into view
  useEffect(() => {
    if (!isNavigating || focusedIndex < 0) return

    const container = containerRef.current
    if (!container) return

    const focusedElement = container.querySelector(`[data-nav-index="${focusedIndex}"]`)
    if (focusedElement) {
      focusedElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [focusedIndex, isNavigating])

  // Reset when items change
  useEffect(() => {
    if (focusedIndex >= items.length) {
      setFocusedIndex(Math.max(0, items.length - 1))
    }
  }, [items.length, focusedIndex])

  // Movement functions
  const moveUp = useCallback(() => {
    if (!items.length) return
    setIsNavigating(true)
    setFocusedIndex(prev => {
      if (prev < 0) return 0
      const newIndex = prev - columns
      if (newIndex < 0) {
        return loop ? items.length - 1 : prev
      }
      return newIndex
    })
  }, [columns, items.length, loop])

  const moveDown = useCallback(() => {
    if (!items.length) return
    setIsNavigating(true)
    setFocusedIndex(prev => {
      if (prev < 0) return 0
      const newIndex = prev + columns
      if (newIndex >= items.length) {
        return loop ? 0 : prev
      }
      return newIndex
    })
  }, [columns, items.length, loop])

  const moveLeft = useCallback(() => {
    if (!items.length) return
    setIsNavigating(true)
    setFocusedIndex(prev => {
      if (prev < 0) return 0
      if (prev === 0) {
        return loop ? items.length - 1 : prev
      }
      return prev - 1
    })
  }, [items.length, loop])

  const moveRight = useCallback(() => {
    if (!items.length) return
    setIsNavigating(true)
    setFocusedIndex(prev => {
      if (prev < 0) return 0
      if (prev >= items.length - 1) {
        return loop ? 0 : prev
      }
      return prev + 1
    })
  }, [items.length, loop])

  const moveToStart = useCallback(() => {
    if (!items.length) return
    setIsNavigating(true)
    setFocusedIndex(0)
  }, [items.length])

  const moveToEnd = useCallback(() => {
    if (!items.length) return
    setIsNavigating(true)
    setFocusedIndex(items.length - 1)
  }, [items.length])

  const select = useCallback(() => {
    if (focusedId) {
      onSelect?.(focusedId)
    }
  }, [focusedId, onSelect])

  const open = useCallback(() => {
    if (focusedId) {
      onOpen?.(focusedId)
    }
  }, [focusedId, onOpen])

  const favorite = useCallback(() => {
    if (focusedId) {
      onFavorite?.(focusedId)
    }
  }, [focusedId, onFavorite])

  const deleteFocused = useCallback(() => {
    if (focusedId) {
      onDelete?.(focusedId)
    }
  }, [focusedId, onDelete])

  const escape = useCallback(() => {
    if (isNavigating) {
      setIsNavigating(false)
      setFocusedIndex(-1)
    }
    onEscape?.()
  }, [isNavigating, onEscape])

  // Focus a specific item
  const focusItem = useCallback((index: number) => {
    if (index >= 0 && index < items.length) {
      setIsNavigating(true)
      setFocusedIndex(index)
    }
  }, [items.length])

  const focusById = useCallback((id: string) => {
    const index = items.findIndex(item => item.id === id)
    if (index >= 0) {
      focusItem(index)
    }
  }, [items, focusItem])

  // Handle keyboard events
  useEffect(() => {
    if (!enabled) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if in an input field
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return
      }

      // Debounce rapid key presses
      const now = Date.now()
      if (now - lastKeyPressRef.current < 50) return
      lastKeyPressRef.current = now

      let handled = false

      // Vim-style navigation
      switch (e.key.toLowerCase()) {
        case 'h':
        case 'arrowleft':
          if (!e.ctrlKey && !e.metaKey) {
            moveLeft()
            handled = true
          }
          break
        case 'j':
        case 'arrowdown':
          if (!e.ctrlKey && !e.metaKey) {
            moveDown()
            handled = true
          }
          break
        case 'k':
        case 'arrowup':
          if (!e.ctrlKey && !e.metaKey) {
            moveUp()
            handled = true
          }
          break
        case 'l':
        case 'arrowright':
          if (!e.ctrlKey && !e.metaKey) {
            moveRight()
            handled = true
          }
          break
        case 'g':
          if (e.shiftKey) {
            // G = go to end
            moveToEnd()
            handled = true
          } else if (!e.ctrlKey && !e.metaKey) {
            // gg = go to start (simplified: just 'g')
            moveToStart()
            handled = true
          }
          break
        case 'home':
          moveToStart()
          handled = true
          break
        case 'end':
          moveToEnd()
          handled = true
          break
        case 'enter':
        case ' ':
          if (isNavigating && focusedId) {
            if (e.shiftKey) {
              select()
            } else {
              open()
            }
            handled = true
          }
          break
        case 'f':
          if (isNavigating && !e.ctrlKey && !e.metaKey) {
            favorite()
            handled = true
          }
          break
        case 'x':
        case 'delete':
          if (isNavigating && !e.ctrlKey && !e.metaKey) {
            deleteFocused()
            handled = true
          }
          break
        case 'escape':
          escape()
          handled = true
          break
      }

      if (handled) {
        e.preventDefault()
        e.stopPropagation()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    enabled,
    isNavigating,
    focusedId,
    moveUp,
    moveDown,
    moveLeft,
    moveRight,
    moveToStart,
    moveToEnd,
    select,
    open,
    favorite,
    deleteFocused,
    escape
  ])

  return {
    // State
    focusedIndex,
    focusedId,
    isNavigating,
    containerRef,

    // Actions
    moveUp,
    moveDown,
    moveLeft,
    moveRight,
    moveToStart,
    moveToEnd,
    select,
    open,
    favorite,
    deleteFocused,
    escape,
    focusItem,
    focusById,

    // Helpers
    isFocused: (id: string) => isNavigating && focusedId === id,
    getNavProps: (index: number) => ({
      'data-nav-index': index,
      'data-nav-focused': isNavigating && focusedIndex === index ? 'true' : undefined,
      onClick: () => {
        setIsNavigating(true)
        setFocusedIndex(index)
      }
    })
  }
}

export default useKeyboardNavigation
