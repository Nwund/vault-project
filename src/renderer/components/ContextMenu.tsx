// File: src/renderer/components/ContextMenu.tsx
// Right-click context menu for media items

import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  Play,
  Heart,
  Star,
  Tag,
  ListPlus,
  FolderOpen,
  Copy,
  Trash2,
  Eye,
  EyeOff,
  Share2,
  Download,
  Info,
  Edit3,
  Clock,
  Maximize,
  MoreHorizontal,
  ChevronRight,
  Check,
  Image,
  Film
} from 'lucide-react'

interface MenuItem {
  id: string
  label: string
  icon: React.ElementType
  shortcut?: string
  danger?: boolean
  disabled?: boolean
  checked?: boolean
  submenu?: MenuItem[]
  onClick?: () => void
}

interface ContextMenuProps {
  x: number
  y: number
  mediaId: string
  mediaType: 'video' | 'image'
  isFavorite?: boolean
  rating?: number
  isHidden?: boolean
  onClose: () => void
  onAction: (action: string, data?: any) => void
}

export function ContextMenu({
  x,
  y,
  mediaId,
  mediaType,
  isFavorite = false,
  rating = 0,
  isHidden = false,
  onClose,
  onAction
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ x, y })
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null)
  const [submenuPosition, setSubmenuPosition] = useState({ x: 0, y: 0 })

  // Adjust position to keep menu in viewport
  useEffect(() => {
    if (!menuRef.current) return

    const menu = menuRef.current
    const rect = menu.getBoundingClientRect()
    const padding = 10

    let newX = x
    let newY = y

    if (x + rect.width > window.innerWidth - padding) {
      newX = window.innerWidth - rect.width - padding
    }
    if (y + rect.height > window.innerHeight - padding) {
      newY = window.innerHeight - rect.height - padding
    }

    setPosition({ x: newX, y: newY })
  }, [x, y])

  // Close on click outside
  useEffect(() => {
    const handleClick = () => onClose()
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    document.addEventListener('click', handleClick)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('click', handleClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  // Handle menu item click
  const handleItemClick = useCallback((item: MenuItem) => {
    if (item.disabled || item.submenu) return
    if (item.onClick) {
      item.onClick()
    } else {
      onAction(item.id)
    }
    onClose()
  }, [onAction, onClose])

  // Handle submenu hover
  const handleSubmenuHover = useCallback((itemId: string, element: HTMLElement) => {
    setActiveSubmenu(itemId)
    const rect = element.getBoundingClientRect()
    setSubmenuPosition({
      x: rect.right,
      y: rect.top
    })
  }, [])

  // Menu items
  const menuItems: MenuItem[] = [
    {
      id: 'play',
      label: mediaType === 'video' ? 'Play' : 'View',
      icon: mediaType === 'video' ? Play : Eye,
      shortcut: 'Enter'
    },
    {
      id: 'open-fullscreen',
      label: 'Open Fullscreen',
      icon: Maximize,
      shortcut: 'F'
    },
    { id: 'divider-1', label: '', icon: MoreHorizontal },
    {
      id: 'favorite',
      label: isFavorite ? 'Remove from Favorites' : 'Add to Favorites',
      icon: Heart,
      shortcut: 'F',
      checked: isFavorite
    },
    {
      id: 'rate',
      label: 'Rate',
      icon: Star,
      submenu: [
        { id: 'rate-0', label: 'No Rating', icon: Star, checked: rating === 0, onClick: () => onAction('rate', 0) },
        { id: 'rate-1', label: '1 Star', icon: Star, checked: rating === 1, onClick: () => onAction('rate', 1) },
        { id: 'rate-2', label: '2 Stars', icon: Star, checked: rating === 2, onClick: () => onAction('rate', 2) },
        { id: 'rate-3', label: '3 Stars', icon: Star, checked: rating === 3, onClick: () => onAction('rate', 3) },
        { id: 'rate-4', label: '4 Stars', icon: Star, checked: rating === 4, onClick: () => onAction('rate', 4) },
        { id: 'rate-5', label: '5 Stars', icon: Star, checked: rating === 5, onClick: () => onAction('rate', 5) }
      ]
    },
    {
      id: 'tags',
      label: 'Edit Tags',
      icon: Tag,
      shortcut: 'T'
    },
    {
      id: 'add-to-playlist',
      label: 'Add to Playlist',
      icon: ListPlus,
      shortcut: 'P'
    },
    { id: 'divider-2', label: '', icon: MoreHorizontal },
    {
      id: 'add-to-queue',
      label: 'Add to Queue',
      icon: Clock,
      shortcut: 'Q'
    },
    {
      id: 'show-in-folder',
      label: 'Show in Folder',
      icon: FolderOpen
    },
    {
      id: 'copy-path',
      label: 'Copy Path',
      icon: Copy
    },
    {
      id: 'media-info',
      label: 'Media Info',
      icon: Info,
      shortcut: 'I'
    },
    { id: 'divider-3', label: '', icon: MoreHorizontal },
    {
      id: 'rename',
      label: 'Rename',
      icon: Edit3,
      shortcut: 'F2'
    },
    {
      id: 'hide',
      label: isHidden ? 'Unhide' : 'Hide',
      icon: isHidden ? Eye : EyeOff
    },
    {
      id: 'delete',
      label: 'Delete',
      icon: Trash2,
      shortcut: 'Del',
      danger: true
    }
  ]

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] min-w-[200px] bg-zinc-900/95 backdrop-blur-xl rounded-xl border border-zinc-700 shadow-2xl overflow-hidden py-1"
      style={{ left: position.x, top: position.y }}
      onClick={(e) => e.stopPropagation()}
    >
      {menuItems.map((item, index) => {
        if (item.id.startsWith('divider')) {
          return <div key={item.id} className="my-1 border-t border-zinc-800" />
        }

        return (
          <div
            key={item.id}
            className={`relative ${item.submenu ? 'group' : ''}`}
            onMouseEnter={(e) => item.submenu && handleSubmenuHover(item.id, e.currentTarget)}
            onMouseLeave={() => !item.submenu && setActiveSubmenu(null)}
          >
            <button
              onClick={() => handleItemClick(item)}
              disabled={item.disabled}
              className={`w-full flex items-center gap-3 px-3 py-2 text-left transition ${
                item.disabled
                  ? 'text-zinc-600 cursor-not-allowed'
                  : item.danger
                  ? 'hover:bg-red-500/20 text-red-400'
                  : 'hover:bg-zinc-800'
              }`}
            >
              <item.icon size={14} className={item.danger ? 'text-red-400' : 'text-zinc-500'} />
              <span className="flex-1 text-sm">{item.label}</span>
              {item.checked && <Check size={14} className="text-[var(--primary)]" />}
              {item.shortcut && !item.submenu && (
                <span className="text-[10px] text-zinc-600 ml-2">{item.shortcut}</span>
              )}
              {item.submenu && <ChevronRight size={12} className="text-zinc-500" />}
            </button>

            {/* Submenu */}
            {item.submenu && activeSubmenu === item.id && (
              <div
                className="fixed min-w-[160px] bg-zinc-900/95 backdrop-blur-xl rounded-xl border border-zinc-700 shadow-2xl overflow-hidden py-1"
                style={{ left: submenuPosition.x, top: submenuPosition.y }}
              >
                {item.submenu.map((subItem) => (
                  <button
                    key={subItem.id}
                    onClick={() => handleItemClick(subItem)}
                    className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-zinc-800 transition"
                  >
                    <subItem.icon size={14} className="text-zinc-500" />
                    <span className="flex-1 text-sm">{subItem.label}</span>
                    {subItem.checked && <Check size={14} className="text-[var(--primary)]" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// Hook for context menu
export function useContextMenu() {
  const [menu, setMenu] = useState<{
    x: number
    y: number
    mediaId: string
    mediaType: 'video' | 'image'
    isFavorite?: boolean
    rating?: number
    isHidden?: boolean
  } | null>(null)

  const show = useCallback((
    e: React.MouseEvent,
    mediaId: string,
    mediaType: 'video' | 'image',
    options?: { isFavorite?: boolean; rating?: number; isHidden?: boolean }
  ) => {
    e.preventDefault()
    setMenu({
      x: e.clientX,
      y: e.clientY,
      mediaId,
      mediaType,
      ...options
    })
  }, [])

  const hide = useCallback(() => {
    setMenu(null)
  }, [])

  return { menu, show, hide }
}

// Selection context menu for multiple items
export function SelectionContextMenu({
  x,
  y,
  count,
  onClose,
  onAction
}: {
  x: number
  y: number
  count: number
  onClose: () => void
  onAction: (action: string) => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = () => onClose()
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [onClose])

  const items = [
    { id: 'play-all', label: `Play All (${count})`, icon: Play },
    { id: 'add-to-queue', label: 'Add to Queue', icon: Clock },
    { id: 'add-to-playlist', label: 'Add to Playlist', icon: ListPlus },
    { id: 'divider-1', label: '', icon: MoreHorizontal },
    { id: 'favorite-all', label: 'Favorite All', icon: Heart },
    { id: 'tag-all', label: 'Tag All', icon: Tag },
    { id: 'divider-2', label: '', icon: MoreHorizontal },
    { id: 'hide-all', label: 'Hide All', icon: EyeOff },
    { id: 'delete-all', label: 'Delete All', icon: Trash2, danger: true }
  ]

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] min-w-[180px] bg-zinc-900/95 backdrop-blur-xl rounded-xl border border-zinc-700 shadow-2xl overflow-hidden py-1"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-3 py-2 text-xs text-zinc-500 border-b border-zinc-800">
        {count} items selected
      </div>
      {items.map((item) => {
        if (item.id.startsWith('divider')) {
          return <div key={item.id} className="my-1 border-t border-zinc-800" />
        }
        return (
          <button
            key={item.id}
            onClick={() => { onAction(item.id); onClose() }}
            className={`w-full flex items-center gap-3 px-3 py-2 text-left transition ${
              item.danger ? 'hover:bg-red-500/20 text-red-400' : 'hover:bg-zinc-800'
            }`}
          >
            <item.icon size={14} className={item.danger ? 'text-red-400' : 'text-zinc-500'} />
            <span className="text-sm">{item.label}</span>
          </button>
        )
      })}
    </div>
  )
}

export default ContextMenu
