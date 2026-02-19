// File: src/renderer/components/CollectionManager.tsx
// Collection organization and management component

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  FolderTree,
  Folder,
  FolderPlus,
  FolderOpen,
  Plus,
  X,
  Search,
  Edit3,
  Trash2,
  ChevronRight,
  ChevronDown,
  Film,
  Image,
  Star,
  Heart,
  GripVertical,
  Check,
  MoreHorizontal,
  Settings,
  Eye,
  EyeOff,
  Copy,
  Move
} from 'lucide-react'

interface Collection {
  id: string
  name: string
  description?: string
  icon?: string
  color?: string
  parentId?: string
  itemCount: number
  isExpanded?: boolean
  isHidden?: boolean
  children?: Collection[]
}

interface CollectionManagerProps {
  collections: Collection[]
  selectedCollectionId?: string
  onSelect: (id: string) => void
  onCreate: (name: string, parentId?: string) => Promise<Collection>
  onUpdate: (id: string, data: Partial<Collection>) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onMove: (id: string, newParentId?: string) => Promise<void>
  onDuplicate: (id: string) => Promise<Collection>
  className?: string
}

export function CollectionManager({
  collections,
  selectedCollectionId,
  onSelect,
  onCreate,
  onUpdate,
  onDelete,
  onMove,
  onDuplicate,
  className = ''
}: CollectionManagerProps) {
  const [search, setSearch] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [createParentId, setCreateParentId] = useState<string | undefined>()
  const [newName, setNewName] = useState('')
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null)

  // Build tree structure
  const collectionTree = useMemo(() => {
    const map = new Map<string, Collection>()
    const roots: Collection[] = []

    // Create lookup map
    collections.forEach(c => map.set(c.id, { ...c, children: [] }))

    // Build tree
    collections.forEach(c => {
      const node = map.get(c.id)!
      if (c.parentId && map.has(c.parentId)) {
        map.get(c.parentId)!.children!.push(node)
      } else {
        roots.push(node)
      }
    })

    return roots
  }, [collections])

  // Filter collections by search
  const filterTree = useCallback((nodes: Collection[], query: string): Collection[] => {
    if (!query) return nodes
    return nodes
      .map(node => ({
        ...node,
        children: filterTree(node.children || [], query)
      }))
      .filter(node =>
        node.name.toLowerCase().includes(query.toLowerCase()) ||
        (node.children && node.children.length > 0)
      )
  }, [])

  const filteredTree = useMemo(() =>
    filterTree(collectionTree, search),
    [collectionTree, search, filterTree]
  )

  // Toggle expand
  const toggleExpand = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  // Start editing
  const startEditing = useCallback((collection: Collection) => {
    setEditingId(collection.id)
    setEditingName(collection.name)
  }, [])

  // Save edit
  const saveEdit = useCallback(async () => {
    if (!editingId || !editingName.trim()) return
    await onUpdate(editingId, { name: editingName.trim() })
    setEditingId(null)
    setEditingName('')
  }, [editingId, editingName, onUpdate])

  // Create collection
  const handleCreate = useCallback(async () => {
    if (!newName.trim()) return
    await onCreate(newName.trim(), createParentId)
    setNewName('')
    setShowCreate(false)
    setCreateParentId(undefined)
  }, [newName, createParentId, onCreate])

  // Handle drag start
  const handleDragStart = useCallback((id: string) => {
    setDraggedId(id)
  }, [])

  // Handle drag over
  const handleDragOver = useCallback((id: string) => {
    if (draggedId && id !== draggedId) {
      setDropTargetId(id)
    }
  }, [draggedId])

  // Handle drop
  const handleDrop = useCallback(async () => {
    if (draggedId && dropTargetId) {
      await onMove(draggedId, dropTargetId)
    }
    setDraggedId(null)
    setDropTargetId(null)
  }, [draggedId, dropTargetId, onMove])

  // Close context menu on click outside
  useEffect(() => {
    const handleClick = () => setContextMenu(null)
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])

  // Render collection tree
  const renderTree = (nodes: Collection[], depth = 0) => {
    return nodes.map(node => {
      const isExpanded = expandedIds.has(node.id)
      const isSelected = node.id === selectedCollectionId
      const isEditing = node.id === editingId
      const isDragging = node.id === draggedId
      const isDropTarget = node.id === dropTargetId
      const hasChildren = node.children && node.children.length > 0

      return (
        <div key={node.id}>
          <div
            draggable
            onDragStart={() => handleDragStart(node.id)}
            onDragOver={(e) => { e.preventDefault(); handleDragOver(node.id) }}
            onDrop={handleDrop}
            onContextMenu={(e) => {
              e.preventDefault()
              setContextMenu({ id: node.id, x: e.clientX, y: e.clientY })
            }}
            className={`flex items-center gap-1 px-2 py-1.5 rounded-lg cursor-pointer transition ${
              isDragging ? 'opacity-50' : ''
            } ${isDropTarget ? 'ring-2 ring-[var(--primary)]' : ''} ${
              isSelected ? 'bg-[var(--primary)]/20 text-[var(--primary)]' : 'hover:bg-zinc-800'
            }`}
            style={{ paddingLeft: `${depth * 16 + 8}px` }}
            onClick={() => !isEditing && onSelect(node.id)}
          >
            {/* Expand toggle */}
            {hasChildren ? (
              <button
                onClick={(e) => { e.stopPropagation(); toggleExpand(node.id) }}
                className="p-0.5 rounded hover:bg-zinc-700"
              >
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            ) : (
              <span className="w-5" />
            )}

            {/* Drag handle */}
            <GripVertical size={12} className="text-zinc-600 cursor-grab" />

            {/* Icon */}
            <div
              className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: node.color ? `${node.color}20` : undefined }}
            >
              {node.icon || (
                isExpanded ? (
                  <FolderOpen size={14} style={{ color: node.color || 'inherit' }} />
                ) : (
                  <Folder size={14} style={{ color: node.color || 'inherit' }} />
                )
              )}
            </div>

            {/* Name or edit input */}
            {isEditing ? (
              <input
                type="text"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={saveEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveEdit()
                  if (e.key === 'Escape') setEditingId(null)
                }}
                className="flex-1 px-1 bg-zinc-800 border border-zinc-600 rounded text-sm outline-none"
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="flex-1 text-sm truncate">{node.name}</span>
            )}

            {/* Item count */}
            <span className="text-xs text-zinc-500">{node.itemCount}</span>

            {/* Hidden indicator */}
            {node.isHidden && <EyeOff size={12} className="text-zinc-600" />}
          </div>

          {/* Children */}
          {isExpanded && hasChildren && (
            <div>{renderTree(node.children!, depth + 1)}</div>
          )}
        </div>
      )
    })
  }

  return (
    <div className={`bg-zinc-900/95 backdrop-blur-xl rounded-2xl border border-zinc-700 shadow-2xl overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <FolderTree size={16} className="text-[var(--primary)]" />
          <span className="font-semibold text-sm">Collections</span>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="p-1.5 rounded-lg hover:bg-zinc-800 transition"
        >
          <Plus size={16} />
        </button>
      </div>

      {/* Search */}
      <div className="p-3 border-b border-zinc-800">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search collections..."
            className="w-full pl-9 pr-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm outline-none focus:border-[var(--primary)]"
          />
        </div>
      </div>

      {/* Tree */}
      <div className="max-h-[50vh] overflow-y-auto p-2">
        {filteredTree.length === 0 ? (
          <div className="py-8 text-center">
            <Folder size={32} className="mx-auto mb-2 text-zinc-600" />
            <p className="text-sm text-zinc-500">
              {search ? 'No matching collections' : 'No collections yet'}
            </p>
          </div>
        ) : (
          renderTree(filteredTree)
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-zinc-900 rounded-xl border border-zinc-700 w-full max-w-xs p-4">
            <h3 className="font-semibold mb-3">New Collection</h3>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Collection name"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm outline-none focus:border-[var(--primary)] mb-3"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setShowCreate(false); setNewName('') }}
                className="flex-1 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!newName.trim()}
                className="flex-1 py-2 rounded-lg bg-[var(--primary)] hover:bg-[var(--primary)]/80 transition text-sm disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 min-w-[160px] bg-zinc-900/95 backdrop-blur-xl rounded-xl border border-zinc-700 shadow-xl py-1 overflow-hidden"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => {
              const collection = collections.find(c => c.id === contextMenu.id)
              if (collection) startEditing(collection)
              setContextMenu(null)
            }}
            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-zinc-800 transition text-left text-sm"
          >
            <Edit3 size={14} />
            Rename
          </button>
          <button
            onClick={() => {
              setCreateParentId(contextMenu.id)
              setShowCreate(true)
              setContextMenu(null)
            }}
            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-zinc-800 transition text-left text-sm"
          >
            <FolderPlus size={14} />
            New Subcollection
          </button>
          <button
            onClick={async () => {
              await onDuplicate(contextMenu.id)
              setContextMenu(null)
            }}
            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-zinc-800 transition text-left text-sm"
          >
            <Copy size={14} />
            Duplicate
          </button>
          <div className="my-1 border-t border-zinc-800" />
          <button
            onClick={async () => {
              const collection = collections.find(c => c.id === contextMenu.id)
              if (collection) {
                await onUpdate(contextMenu.id, { isHidden: !collection.isHidden })
              }
              setContextMenu(null)
            }}
            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-zinc-800 transition text-left text-sm"
          >
            <EyeOff size={14} />
            Toggle Hidden
          </button>
          <button
            onClick={async () => {
              await onDelete(contextMenu.id)
              setContextMenu(null)
            }}
            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-red-500/20 text-red-400 transition text-left text-sm"
          >
            <Trash2 size={14} />
            Delete
          </button>
        </div>
      )}
    </div>
  )
}

// Compact collection selector
export function CollectionSelector({
  collections,
  selectedId,
  onSelect,
  className = ''
}: {
  collections: Collection[]
  selectedId?: string
  onSelect: (id: string) => void
  className?: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const selected = collections.find(c => c.id === selectedId)

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 bg-zinc-800 rounded-lg hover:bg-zinc-700 transition"
      >
        <Folder size={14} />
        <span className="text-sm">{selected?.name || 'Select collection'}</span>
        <ChevronDown size={14} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full mt-2 left-0 z-50 min-w-[200px] bg-zinc-900 rounded-xl border border-zinc-700 shadow-xl py-1 max-h-64 overflow-y-auto">
            {collections.map(collection => (
              <button
                key={collection.id}
                onClick={() => { onSelect(collection.id); setIsOpen(false) }}
                className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-zinc-800 transition text-left text-sm ${
                  collection.id === selectedId ? 'bg-zinc-800' : ''
                }`}
              >
                <Folder size={14} style={{ color: collection.color }} />
                {collection.name}
                {collection.id === selectedId && <Check size={12} className="ml-auto" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default CollectionManager
