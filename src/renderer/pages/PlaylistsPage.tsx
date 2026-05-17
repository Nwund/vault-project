// File: src/renderer/pages/PlaylistsPage.tsx
//
// Playlists CRUD + watcher. Lists user-curated playlists, opens one to
// edit its order, mood, and items. Extracted from App.tsx as part of #48.

import { useEffect, useMemo, useState } from 'react'
import {
  ArrowUp,
  ChevronDown,
  Clock,
  Download,
  Edit2,
  GripVertical,
  ListMusic,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Shuffle,
  Sparkles,
  Trash2,
  Tv,
  Wand2,
  X,
  Zap,
} from 'lucide-react'
import type { MediaRow, MediaType, PlaylistRow } from '../types'
import { useToast } from '../contexts'
import { formatDuration } from '../utils/formatters'
import { cn } from '../utils/cn'
import { extractItems } from '../utils/api'
import { Btn, TopBar } from '../components/ui'
import { SessionMediaThumb, PlaylistGridThumb } from '../components/PlaylistThumbs'
import { FloatingVideoPlayer } from '../components/FloatingVideoPlayer'

// ═══════════════════════════════════════════════════════════════════════════
// PLAYLISTS PAGE
// ═══════════════════════════════════════════════════════════════════════════

type PlaylistMood = 'chill' | 'intense' | 'sensual' | 'quick' | 'marathon' | null

const MOOD_CONFIG: Record<Exclude<PlaylistMood, null>, { name: string; icon: string; color: string }> = {
  chill: { name: 'Chill', icon: '🌙', color: '#60a5fa' },
  intense: { name: 'Intense', icon: '🔥', color: '#ef4444' },
  sensual: { name: 'Sensual', icon: '💜', color: '#a855f7' },
  quick: { name: 'Quick', icon: '⚡', color: '#fbbf24' },
  marathon: { name: 'Marathon', icon: '🏃', color: '#22c55e' }
}

type PlaylistSortBy = 'manual' | 'name' | 'duration' | 'added' | 'random'

export function PlaylistsPage() {
  const { showToast } = useToast()
  const [playlists, setPlaylists] = useState<PlaylistRow[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [items, setItems] = useState<any[]>([])
  const [newName, setNewName] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renamingValue, setRenamingValue] = useState('')
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null) // Visual feedback for drop target
  const [draggedMediaId, setDraggedMediaId] = useState<string | null>(null) // For dragging between playlists
  const [dropTargetPlaylistId, setDropTargetPlaylistId] = useState<string | null>(null) // Visual feedback for playlist drop target
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openMediaId, setOpenMediaId] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<PlaylistSortBy>('manual')
  const [typeFilter, setTypeFilter] = useState<'all' | 'video' | 'image' | 'gif'>('all')
  const [showAddMedia, setShowAddMedia] = useState(false)
  const [allMedia, setAllMedia] = useState<MediaRow[]>([])
  const [mediaSearch, setMediaSearch] = useState('')
  const [addingMedia, setAddingMedia] = useState(false)
  // AI Playlist Generation
  const [showAiGenerator, setShowAiGenerator] = useState(false)
  // Venice "Suggest from collection" — bypasses the manual generator
  // form and just asks Venice for 5 themed playlist concepts based on
  // the user's tag distribution. Each suggestion materializes into a
  // real playlist via the existing playlists.create + addItems path.
  const [aiSuggestions, setAiSuggestions] = useState<Array<{ name: string; description: string; tagFilters: string[] }>>([])
  const [loadingAiSuggestions, setLoadingAiSuggestions] = useState(false)
  const [materializingIdx, setMaterializingIdx] = useState<number | null>(null)
  // Daily mix — Spotify-style time-of-day playlist (#47). Label is null
  // until first generation; after that it shows the most-recent mix's
  // mood label so the user remembers what they got.
  const [generatingDailyMix, setGeneratingDailyMix] = useState(false)
  const [dailyMixLabel, setDailyMixLabel] = useState<string | null>(null)
  const [aiTags, setAiTags] = useState<string[]>([])
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiDuration, setAiDuration] = useState(30) // minutes
  const [aiIntensity, setAiIntensity] = useState<'chill' | 'medium' | 'intense'>('medium')
  const [aiGenerating, setAiGenerating] = useState(false)
  const [availableTags, setAvailableTags] = useState<Array<{ name: string; count: number }>>([])
  const [aiContentFilter, setAiContentFilter] = useState<'all' | 'video' | 'image' | 'gif'>('video')

  // Smart Playlist Creation
  const [showSmartPlaylistModal, setShowSmartPlaylistModal] = useState(false)
  const [smartName, setSmartName] = useState('')
  const [smartIncludeTags, setSmartIncludeTags] = useState<string[]>([])
  const [smartExcludeTags, setSmartExcludeTags] = useState<string[]>([])
  const [smartType, setSmartType] = useState<'video' | 'image' | 'gif' | ''>('')
  const [smartMinRating, setSmartMinRating] = useState(0)
  const [smartLimit, setSmartLimit] = useState(100)
  const [smartSortBy, setSmartSortBy] = useState<'addedAt' | 'rating' | 'views' | 'random'>('addedAt')
  const [smartSortDir, setSmartSortDir] = useState<'asc' | 'desc'>('desc')
  const [smartCreating, setSmartCreating] = useState(false)

  // Playlist statistics cache (item count, duration, thumbnail)
  const [playlistStats, setPlaylistStats] = useState<Map<string, { count: number; durationSec: number; thumbPath?: string }>>(new Map())

  // Session Templates
  const [showTemplates, setShowTemplates] = useState(false)
  const SESSION_TEMPLATES = [
    { id: 'quick', name: 'Quick Session', icon: '⚡', duration: 10, intensity: 'medium' as const, description: '10 min warm-up' },
    { id: 'chill', name: 'Chill Mode', icon: '🌙', duration: 30, intensity: 'chill' as const, description: 'Relaxed 30 min' },
    { id: 'intense', name: 'Intense', icon: '🔥', duration: 45, intensity: 'intense' as const, description: 'High energy 45 min' },
    { id: 'marathon', name: 'Marathon', icon: '🏃', duration: 90, intensity: 'medium' as const, description: 'Extended 90 min' },
    { id: 'edging', name: 'Edge Session', icon: '💜', duration: 60, intensity: 'intense' as const, description: '60 min edging focus' },
  ]

  const refresh = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const pls = await window.api.playlists.list()
      setPlaylists(pls)
    } catch (err: any) {
      console.error('[PlaylistsPage] Failed to load playlists:', err)
      setError(err?.message ?? 'Failed to load playlists')
    } finally {
      setIsLoading(false)
    }
  }

  const loadItems = async (id: string) => {
    try {
      const its = await window.api.playlists.getItems(id)
      setItems(its)
    } catch (err: any) {
      console.error('[PlaylistsPage] Failed to load items:', err)
      setError(err?.message ?? 'Failed to load playlist items')
    }
  }

  // Load statistics for all playlists (count, duration, thumbnail)
  const loadPlaylistStats = async (playlistList: PlaylistRow[]) => {
    const stats = new Map<string, { count: number; durationSec: number; thumbPath?: string }>()
    await Promise.all(playlistList.map(async (pl) => {
      try {
        const its = await window.api.playlists.getItems(pl.id)
        const count = its.length
        const durationSec = its.reduce((sum: number, item: any) => {
          return sum + (item.media?.durationSec ?? item.durationSec ?? 0)
        }, 0)
        const firstItem = its[0]
        const thumbPath = firstItem?.media?.thumbPath ?? firstItem?.thumbPath
        stats.set(pl.id, { count, durationSec, thumbPath })
      } catch {
        stats.set(pl.id, { count: 0, durationSec: 0 })
      }
    }))
    setPlaylistStats(stats)
  }

  // Create playlist from template
  const createFromTemplate = async (template: typeof SESSION_TEMPLATES[0]) => {
    try {
      setAiDuration(template.duration)
      setAiIntensity(template.intensity)
      setShowTemplates(false)
      setShowAiGenerator(true)
    } catch (err: any) {
      showToast('error', err?.message ?? 'Failed to create from template')
    }
  }

  useEffect(() => {
    void refresh()
    // Load available tags for AI generator
    window.api.tags.listWithCounts().then((tags: any) => {
      setAvailableTags(tags?.filter?.((t: any) => t.videoCount > 0) || [])
    })
    const unsub = window.api.events?.onVaultChanged?.(() => {
      void refresh()
      if (selectedId) void loadItems(selectedId)
    })
    return () => unsub?.()
  }, [])

  // Load playlist stats when playlists change
  useEffect(() => {
    if (playlists.length > 0) {
      void loadPlaylistStats(playlists)
    }
  }, [playlists])

  useEffect(() => {
    if (selectedId) void loadItems(selectedId)
    else setItems([])
  }, [selectedId])

  // Keyboard shortcuts for playlist navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle shortcuts when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      if (e.key === 'n' && !e.ctrlKey && !e.metaKey) {
        // 'n' for new playlist - focus the input
        const input = document.querySelector('input[placeholder="New playlist..."]') as HTMLInputElement
        if (input) {
          e.preventDefault()
          input.focus()
        }
      } else if (e.key === 'a' && !e.ctrlKey && !e.metaKey && selectedId) {
        // 'a' to add videos to selected playlist
        e.preventDefault()
        openAddMedia()
      } else if (e.key === 'g' && !e.ctrlKey && !e.metaKey) {
        // 'g' for AI generate
        e.preventDefault()
        setShowAiGenerator(true)
      } else if (e.key === 'ArrowUp' && playlists.length > 0) {
        // Arrow up to select previous playlist
        e.preventDefault()
        const currentIdx = playlists.findIndex(p => p.id === selectedId)
        const prevIdx = currentIdx <= 0 ? playlists.length - 1 : currentIdx - 1
        setSelectedId(playlists[prevIdx].id)
      } else if (e.key === 'ArrowDown' && playlists.length > 0) {
        // Arrow down to select next playlist
        e.preventDefault()
        const currentIdx = playlists.findIndex(p => p.id === selectedId)
        const nextIdx = currentIdx < 0 || currentIdx >= playlists.length - 1 ? 0 : currentIdx + 1
        setSelectedId(playlists[nextIdx].id)
      } else if (e.key === 'Delete' && selectedId && !e.ctrlKey && !e.metaKey) {
        // Delete to remove selected playlist (with confirmation)
        e.preventDefault()
        const playlist = playlists.find(p => p.id === selectedId)
        if (confirm(`Delete playlist "${playlist?.name}"?`)) {
          deletePlaylist(selectedId)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [playlists, selectedId])

  const createPlaylist = async () => {
    if (!newName.trim()) return
    try {
      const created = await window.api.playlists.create(newName.trim())
      setNewName('')
      await refresh()
      if (created?.id) setSelectedId(created.id)
      // Update daily challenge progress for creating playlists
      window.api.challenges?.updateProgress?.('create_playlist', 1)
    } catch (err: any) {
      console.error('[PlaylistsPage] Failed to create playlist:', err)
      setError(err?.message ?? 'Failed to create playlist')
    }
  }

  const deletePlaylist = async (id: string) => {
    try {
      await window.api.playlists.delete(id)
      if (selectedId === id) setSelectedId(null)
      await refresh()
      showToast('success', 'Playlist deleted')
    } catch (err: any) {
      console.error('[PlaylistsPage] Failed to delete playlist:', err)
      showToast('error', err?.message ?? 'Failed to delete playlist')
    }
  }

  const renamePlaylist = async (id: string) => {
    if (!renamingValue.trim()) return
    try {
      await window.api.playlists.rename(id, renamingValue.trim())
      setRenaming(null)
      await refresh()
      showToast('success', 'Playlist renamed')
    } catch (err: any) {
      console.error('[PlaylistsPage] Failed to rename playlist:', err)
      showToast('error', err?.message ?? 'Failed to rename playlist')
    }
  }

  const duplicatePlaylist = async (id: string) => {
    try {
      await window.api.playlists.duplicate(id)
      await refresh()
      showToast('success', 'Playlist duplicated')
    } catch (err: any) {
      console.error('[PlaylistsPage] Failed to duplicate playlist:', err)
      showToast('error', err?.message ?? 'Failed to duplicate playlist')
    }
  }

  const exportM3U = async (id: string) => {
    try {
      const path = await window.api.playlists.exportM3U(id)
      if (path) {
        window.api.shell?.showItemInFolder?.(path)
        showToast('success', 'Playlist exported as M3U')
      }
    } catch (err: any) {
      console.error('[PlaylistsPage] Failed to export M3U:', err)
      showToast('error', err?.message ?? 'Failed to export playlist')
    }
  }

  const exportJSON = async (id: string) => {
    try {
      const result = await window.api.playlists.exportJSON?.(id)
      if (result?.success && result.path) {
        window.api.shell?.showItemInFolder?.(result.path)
        showToast('success', 'Playlist exported as JSON')
      }
    } catch (err: any) {
      console.error('[PlaylistsPage] Failed to export JSON:', err)
      showToast('error', err?.message ?? 'Failed to export playlist')
    }
  }

  const importPlaylist = async () => {
    const result = await window.api.playlists.importJSON?.()
    if (result?.success) {
      await refresh()
      if (result.playlist?.id) {
        setSelectedId(result.playlist.id)
      }
      showToast('success', `Imported playlist — matched ${result.matched} of ${result.total} items`)
    } else if (result?.error) {
      showToast('error', `Import failed: ${result.error}`)
    }
  }

  // Smart Playlist functions
  const createSmartPlaylist = async () => {
    if (!smartName.trim()) {
      showToast('error', 'Please enter a name for the smart playlist')
      return
    }
    if (smartIncludeTags.length === 0 && smartMinRating === 0 && !smartType) {
      showToast('error', 'Please add at least one rule (tags, rating, or type)')
      return
    }

    setSmartCreating(true)
    try {
      const rules = {
        includeTags: smartIncludeTags.length > 0 ? smartIncludeTags : undefined,
        excludeTags: smartExcludeTags.length > 0 ? smartExcludeTags : undefined,
        type: smartType || undefined,
        minRating: smartMinRating > 0 ? smartMinRating : undefined,
        limit: smartLimit,
        sortBy: smartSortBy,
        sortDir: smartSortDir
      }

      const playlist = await window.api.smartPlaylists?.create?.(smartName.trim(), rules)
      if (playlist?.id) {
        showToast('success', `Created smart playlist with ${playlist.itemCount || 0} items!`)
        setShowSmartPlaylistModal(false)
        setSmartName('')
        setSmartIncludeTags([])
        setSmartExcludeTags([])
        setSmartType('')
        setSmartMinRating(0)
        setSmartLimit(100)
        setSmartSortBy('addedAt')
        setSmartSortDir('desc')
        await refresh()
        setSelectedId(playlist.id)
      }
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to create smart playlist')
    } finally {
      setSmartCreating(false)
    }
  }

  const refreshSmartPlaylist = async (playlistId: string) => {
    try {
      const result = await window.api.smartPlaylists?.refresh?.(playlistId)
      if (result) {
        showToast('success', `Refreshed! Now has ${result.updated} items`)
        await loadItems(playlistId)
      }
    } catch (err: any) {
      showToast('error', 'Failed to refresh smart playlist')
    }
  }

  const removeItem = async (playlistItemId: string) => {
    if (!selectedId) return
    await window.api.playlists.removeItem(selectedId, playlistItemId)
    await loadItems(selectedId)
  }

  const openAddMedia = async () => {
    try {
      const res: any = await window.api.media.list({ limit: 500 })
      // media:list returns { items, total } shape; older callsites expected
      // a flat array. Tolerate both so this works regardless.
      const items: MediaRow[] = Array.isArray(res)
        ? res
        : Array.isArray(res?.items)
          ? res.items
          : []
      setAllMedia(items)
      setShowAddMedia(true)
      setMediaSearch('')
    } catch (err: any) {
      console.error('[PlaylistsPage] Failed to load media:', err)
    }
  }

  const addMediaToPlaylist = async (mediaId: string) => {
    if (!selectedId || addingMedia) return
    setAddingMedia(true)
    try {
      await window.api.playlists.addItems(selectedId, [mediaId])
      // Update daily challenge progress for adding to playlist
      window.api.challenges?.updateProgress?.('add_to_playlist', 1)
      await loadItems(selectedId)
    } catch (err: any) {
      console.error('[PlaylistsPage] Failed to add media:', err)
    } finally {
      setAddingMedia(false)
    }
  }

  // AI Playlist Generation - creates playlist based on tags/prompt
  const generateDailyMix = async () => {
    if (generatingDailyMix) return
    setGeneratingDailyMix(true)
    try {
      const mix = await window.api.ai.dailyMix?.()
      if (!mix || !Array.isArray(mix.items) || mix.items.length === 0) {
        showToast?.('info', 'Not enough tagged media for a daily mix yet — analyze a batch first.')
        return
      }
      const label = `${mix.label} · ${mix.items.length} videos`
      const created = await window.api.playlists.create(label)
      if (!created?.id) throw new Error('playlists.create returned no id')
      await window.api.playlists.addItems(created.id, mix.items.map((m: any) => m.id))
      await refresh()
      setSelectedId(created.id)
      setDailyMixLabel(`${mix.label} — ${mix.vibe}`)
      showToast?.('success', `Generated "${mix.label}" with ${mix.items.length} videos`)
    } catch (err: any) {
      console.error('[Sessions] dailyMix failed:', err)
      showToast?.('error', err?.message ?? 'Daily mix generation failed')
    } finally {
      setGeneratingDailyMix(false)
    }
  }

  const loadAiSuggestions = async () => {
    if (loadingAiSuggestions) return
    setLoadingAiSuggestions(true)
    try {
      const list = await window.api.ai.suggestPlaylists?.({ count: 5 }) ?? []
      setAiSuggestions(list)
      if (list.length === 0) showToast('info', 'No suggestions returned — make sure videos are tagged.')
    } catch (err: any) {
      console.error('[PlaylistsPage] suggestPlaylists failed:', err)
      showToast('error', err?.message ?? 'Failed to fetch suggestions')
    } finally {
      setLoadingAiSuggestions(false)
    }
  }

  const materializeSuggestion = async (sugg: { name: string; description: string; tagFilters: string[] }, idx: number) => {
    setMaterializingIdx(idx)
    try {
      const created = await window.api.playlists.create(sugg.name)
      if (!created?.id) throw new Error('playlists.create returned no id')
      // Pull a healthy batch of media matching the suggested tags. AND-style
      // intersection isn't supported by the IPC, so we get a random sample
      // for any-of-tag matches and trust Venice's filter list.
      const result = await window.api.media.randomByTags(sugg.tagFilters, { limit: 60 })
      const media = (Array.isArray(result) ? result : []) as MediaRow[]
      if (media.length > 0) {
        await window.api.playlists.addItems(created.id, media.map(m => m.id))
      }
      await refresh()
      setSelectedId(created.id)
      // Pop the suggestion off the list so the user can see what's left.
      setAiSuggestions(prev => prev.filter((_, i) => i !== idx))
      showToast('success', `Created "${sugg.name}" with ${media.length} videos`)
    } catch (err: any) {
      console.error('[PlaylistsPage] materializeSuggestion failed:', err)
      showToast('error', err?.message ?? 'Failed to create playlist')
    } finally {
      setMaterializingIdx(null)
    }
  }

  const generateAiPlaylist = async () => {
    if (aiGenerating) return
    setAiGenerating(true)
    try {
      // Calculate approximate video count based on duration
      // Assuming average video is ~3 minutes
      const targetCount = Math.ceil((aiDuration * 60) / 180)

      // Generate playlist name based on settings
      const intensityEmoji = aiIntensity === 'chill' ? '🌙' : aiIntensity === 'intense' ? '🔥' : '💜'
      const playlistName = aiPrompt?.trim()
        ? `${intensityEmoji} ${aiPrompt.trim().slice(0, 30)}`
        : aiTags.length > 0
          ? `${intensityEmoji} ${aiTags.slice(0, 2).join(' & ')} Mix`
          : `${intensityEmoji} ${aiDuration}min ${aiIntensity} session`

      // Create the playlist
      const created = await window.api.playlists.create(playlistName)
      if (!created?.id) throw new Error('Failed to create playlist')

      // Fetch media matching criteria
      let media: MediaRow[] = []
      if (aiTags.length > 0) {
        // Get media by tags
        const result = await window.api.media.randomByTags(aiTags, { limit: targetCount * 2 })
        media = (Array.isArray(result) ? result : [])
          .filter((m: any) => aiContentFilter === 'all' || m.type === aiContentFilter)
          .slice(0, targetCount)
      } else {
        // Random selection
        const result = await window.api.media.list({ limit: targetCount * 2, sortBy: 'random' })
        const items = extractItems<MediaRow>(result)
        media = items
          .filter((m: any) => aiContentFilter === 'all' || m.type === aiContentFilter)
          .slice(0, targetCount)
      }

      // Sort by intensity if specified
      if (aiIntensity === 'chill' && media.length > 1) {
        // Shorter videos first for chill
        media.sort((a, b) => (a.durationSec ?? 0) - (b.durationSec ?? 0))
      } else if (aiIntensity === 'intense' && media.length > 1) {
        // Longer videos for intense
        media.sort((a, b) => (b.durationSec ?? 0) - (a.durationSec ?? 0))
      }

      // Add media to playlist
      if (media.length > 0) {
        await window.api.playlists.addItems(created.id, media.map(m => m.id))
        // Update daily challenge progress for creating playlist and adding items
        window.api.challenges?.updateProgress?.('create_playlist', 1)
        window.api.challenges?.updateProgress?.('add_to_playlist', media.length)
      }

      // Refresh and select new playlist
      await refresh()
      setSelectedId(created.id)
      setShowAiGenerator(false)

      // Reset form
      setAiTags([])
      setAiPrompt('')
    } catch (err: any) {
      console.error('[PlaylistsPage] AI generation failed:', err)
      setError(err?.message ?? 'Failed to generate playlist')
    } finally {
      setAiGenerating(false)
    }
  }

  const toggleAiTag = (tagName: string) => {
    setAiTags(prev => prev.includes(tagName) ? prev.filter(t => t !== tagName) : [...prev, tagName])
  }

  const handleDragStart = (idx: number, mediaId: string) => {
    setDragIdx(idx)
    setDraggedMediaId(mediaId)
  }

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault()
    if (dragIdx === null || dragIdx === idx) return
    setDragOverIdx(idx)
  }

  const handleDragLeave = () => {
    setDragOverIdx(null)
  }

  const handleDragEnd = () => {
    setDragIdx(null)
    setDragOverIdx(null)
    setDraggedMediaId(null)
    setDropTargetPlaylistId(null)
  }

  // Handlers for dragging items to other playlists
  const handlePlaylistDragOver = (e: React.DragEvent, playlistId: string) => {
    e.preventDefault()
    if (!draggedMediaId || playlistId === selectedId) return
    setDropTargetPlaylistId(playlistId)
  }

  const handlePlaylistDragLeave = () => {
    setDropTargetPlaylistId(null)
  }

  const handlePlaylistDrop = async (e: React.DragEvent, targetPlaylistId: string) => {
    e.preventDefault()
    setDropTargetPlaylistId(null)
    if (!draggedMediaId || targetPlaylistId === selectedId) {
      setDraggedMediaId(null)
      setDragIdx(null)
      return
    }
    // Add the dragged media to the target playlist
    try {
      await window.api.playlists.addItems(targetPlaylistId, [draggedMediaId])
      // Update daily challenge progress for adding to playlist
      window.api.challenges?.updateProgress?.('add_to_playlist', 1)
      // Show feedback - find playlist name
      const targetPlaylist = playlists.find(p => p.id === targetPlaylistId)
      if (targetPlaylist) {
        showToast('success', `Added to "${targetPlaylist.name}"`)
      }
    } catch (err) {
      console.error('[Playlists] Failed to add to playlist:', err)
      showToast('error', 'Failed to add to playlist')
    }
    setDraggedMediaId(null)
    setDragIdx(null)
  }

  const handleDrop = async (e: React.DragEvent, targetIdx: number) => {
    e.preventDefault()
    setDragOverIdx(null)
    if (dragIdx === null || dragIdx === targetIdx || !selectedId) {
      setDragIdx(null)
      return
    }

    const newOrder = [...items]
    const [moved] = newOrder.splice(dragIdx, 1)
    newOrder.splice(targetIdx, 0, moved)

    const itemIds = newOrder.map((i: any) => i.playlistItemId)
    await window.api.playlists.reorder(selectedId, itemIds)
    await loadItems(selectedId)
    setDragIdx(null)
  }

  const selectedPlaylist = playlists.find(p => p.id === selectedId)

  // Sort items based on sortBy
  const sortedItems = useMemo(() => {
    // Apply type filter first
    let filtered = items
    if (typeFilter !== 'all') {
      filtered = items.filter((item: any) => {
        const t = (item.media?.type ?? item.type ?? '').toLowerCase()
        return t === typeFilter
      })
    }
    if (sortBy === 'manual') return filtered
    const sorted = [...filtered]
    switch (sortBy) {
      case 'name':
        sorted.sort((a: any, b: any) => {
          const nameA = (a.media?.filename ?? a.filename ?? '').toLowerCase()
          const nameB = (b.media?.filename ?? b.filename ?? '').toLowerCase()
          return nameA.localeCompare(nameB)
        })
        break
      case 'duration':
        sorted.sort((a: any, b: any) => {
          const durA = a.media?.durationSec ?? a.durationSec ?? 0
          const durB = b.media?.durationSec ?? b.durationSec ?? 0
          return durB - durA
        })
        break
      case 'added':
        sorted.sort((a: any, b: any) => {
          const addedA = a.addedAt ?? 0
          const addedB = b.addedAt ?? 0
          return addedB - addedA
        })
        break
      case 'random': {
        for (let i = sorted.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[sorted[i], sorted[j]] = [sorted[j], sorted[i]]
        }
        break
      }
    }
    return sorted
  }, [items, sortBy, typeFilter])

  // Build media list for the FloatingVideoPlayer from playlist items
  const playlistMediaList: MediaRow[] = sortedItems
    .filter((item: any) => item.media || item.path)
    .map((item: any) => ({
      id: item.media?.id ?? item.mediaId ?? item.id,
      path: item.media?.path ?? item.path ?? '',
      type: (item.media?.type ?? item.type ?? 'video') as MediaType,
      filename: item.media?.filename ?? item.filename,
      ext: item.media?.ext ?? item.ext,
      size: item.media?.size ?? item.size,
      durationSec: item.media?.durationSec ?? item.durationSec,
      thumbPath: item.media?.thumbPath ?? item.thumbPath,
      width: item.media?.width ?? item.width,
      height: item.media?.height ?? item.height,
    }))
  const currentMedia = playlistMediaList.find(m => m.id === openMediaId)

  if (isLoading && playlists.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <RefreshCw size={24} className="animate-spin text-[var(--muted)]" />
      </div>
    )
  }

  if (error && playlists.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <div className="text-sm text-red-400">{error}</div>
        <Btn onClick={() => void refresh()}>Retry</Btn>
      </div>
    )
  }

  return (
    <>
      <TopBar
        title="Sessions"
        right={
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap justify-end">
            <Btn onClick={importPlaylist} title="Import playlist">
              <ArrowUp size={14} />
              <span className="hidden sm:inline">Import</span>
            </Btn>
            {selectedId && (
              <>
                <Btn onClick={() => duplicatePlaylist(selectedId)} title="Duplicate playlist">
                  <span className="hidden sm:inline">Duplicate</span>
                  <span className="sm:hidden">Copy</span>
                </Btn>
                <Btn onClick={() => exportJSON(selectedId)} title="Export as JSON">
                  <Download size={14} />
                  <span className="hidden sm:inline">Export</span>
                </Btn>
                <Btn onClick={() => exportM3U(selectedId)} title="Export as M3U">M3U</Btn>
                <Btn
                  onClick={async () => {
                    // Get video items from current playlist
                    const videoItems = items
                      .filter((item: any) => (item.media?.type || item.type) === 'video')
                      .map((item: any) => ({
                        mediaId: item.media?.id || item.mediaId || item.id,
                        path: item.media?.path || item.path,
                        title: item.media?.filename || item.filename || 'Vault Video',
                        duration: item.media?.durationSec || item.durationSec
                      }))
                    if (videoItems.length === 0) {
                      showToast('info', 'No videos in this playlist')
                      return
                    }
                    await window.api.dlna?.setQueue?.(videoItems)
                    showToast('success', `Added ${videoItems.length} videos to TV queue`)
                    // Open TV Remote panel if available
                    window.dispatchEvent(new CustomEvent('vault-open-tv-remote'))
                  }}
                  title="Cast playlist to TV"
                >
                  <Tv size={14} />
                  <span className="hidden sm:inline">Cast</span>
                </Btn>
                <Btn tone="danger" onClick={() => deletePlaylist(selectedId)} title="Delete playlist">
                  <Trash2 size={14} className="sm:hidden" />
                  <span className="hidden sm:inline">Delete</span>
                </Btn>
              </>
            )}
          </div>
        }
      />

      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Playlist sidebar - responsive width */}
        <div className="w-[220px] sm:w-[260px] md:w-[280px] shrink-0 border-r border-[var(--border)] bg-[var(--panel2)] overflow-auto">
          <div className="p-4">
            {/* Create new */}
            <div className="flex gap-2 mb-3">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createPlaylist()}
                placeholder="New playlist..."
                className="flex-1 px-3 py-2 rounded-xl bg-black/20 border border-[var(--border)] outline-none focus:border-white/15 text-sm"
              />
              <Btn tone="primary" onClick={createPlaylist}>+</Btn>
            </div>

            {/* Today's Mix — Spotify-style time-of-day daylist (#47).
                Auto-generated from current hour + tag distribution.
                One-click materializes as a real playlist + selects it,
                so the user immediately has a queue ready to play. */}
            <button
              onClick={generateDailyMix}
              disabled={generatingDailyMix}
              className="w-full mb-3 px-4 py-3 rounded-xl bg-gradient-to-r from-indigo-500/20 via-fuchsia-500/20 to-orange-500/20 border border-fuchsia-400/30 hover:border-fuchsia-400/50 transition-all group disabled:opacity-60"
              title="Build a session for the current hour from your tag distribution"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 via-fuchsia-500 to-orange-400 flex items-center justify-center">
                  {generatingDailyMix ? <Loader2 size={16} className="text-white animate-spin" /> : <Clock size={16} className="text-white" />}
                </div>
                <div className="text-left flex-1">
                  <div className="text-sm font-medium text-white group-hover:text-fuchsia-200 transition">Today's Mix</div>
                  <div className="text-xs text-white/60">{dailyMixLabel ?? 'Auto-generate based on the current hour'}</div>
                </div>
              </div>
            </button>

            {/* AI Generate and Smart Playlist Buttons */}
            <div className="space-y-2 mb-4">
              <button
                onClick={() => setShowAiGenerator(true)}
                className="w-full px-4 py-3 rounded-xl bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30 hover:border-purple-500/50 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                    <Sparkles size={16} className="text-white" />
                  </div>
                  <div className="text-left flex-1">
                    <div className="text-sm font-medium text-white group-hover:text-purple-200 transition">AI Generate</div>
                    <div className="text-xs text-white/50">Create playlist from tags</div>
                  </div>
                </div>
              </button>

              <button
                onClick={() => setShowSmartPlaylistModal(true)}
                className="w-full px-4 py-3 rounded-xl bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 hover:border-cyan-500/50 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center">
                    <Zap size={16} className="text-white" />
                  </div>
                  <div className="text-left flex-1">
                    <div className="text-sm font-medium text-white group-hover:text-cyan-200 transition">Smart Playlist</div>
                    <div className="text-xs text-white/50">Auto-updates based on rules</div>
                  </div>
                </div>
              </button>

              {/* Venice-curated suggestions from your tag distribution.
                  One click → 5 named playlists with descriptions; pick any
                  to materialize via the existing addItems pipeline. */}
              <button
                onClick={loadAiSuggestions}
                disabled={loadingAiSuggestions}
                className="w-full px-4 py-3 rounded-xl bg-gradient-to-r from-amber-500/20 to-rose-500/20 border border-amber-500/30 hover:border-amber-500/50 transition-all group disabled:opacity-60"
                title="Ask Venice to suggest playlists based on your tag distribution"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-rose-500 flex items-center justify-center">
                    {loadingAiSuggestions ? <Loader2 size={16} className="text-white animate-spin" /> : <Wand2 size={16} className="text-white" />}
                  </div>
                  <div className="text-left flex-1">
                    <div className="text-sm font-medium text-white group-hover:text-amber-200 transition">Suggest from collection</div>
                    <div className="text-xs text-white/50">Venice picks 5 themes from your tags</div>
                  </div>
                </div>
              </button>

              {aiSuggestions.length > 0 && (
                <div className="space-y-1.5 p-2 rounded-xl bg-black/30 border border-white/5">
                  <div className="flex items-center justify-between text-[10px] text-white/40 uppercase tracking-wider px-1">
                    <span>AI suggestions</span>
                    <button onClick={() => setAiSuggestions([])} className="hover:text-white/70 transition">clear</button>
                  </div>
                  {aiSuggestions.map((s, i) => (
                    <div key={`${s.name}-${i}`} className="rounded-lg bg-white/5 hover:bg-white/10 transition p-2 group/sugg">
                      <div className="text-xs font-medium text-white">{s.name}</div>
                      {s.description && <div className="text-[10px] text-white/50 mt-0.5">{s.description}</div>}
                      <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                        {s.tagFilters.map(t => (
                          <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-200">{t}</span>
                        ))}
                      </div>
                      <button
                        onClick={() => materializeSuggestion(s, i)}
                        disabled={materializingIdx === i}
                        className="mt-2 w-full px-2 py-1 rounded bg-amber-500/30 hover:bg-amber-500/50 text-amber-100 text-[10px] font-medium transition disabled:opacity-60 flex items-center justify-center gap-1"
                      >
                        {materializingIdx === i ? <><Loader2 size={10} className="animate-spin" /> Creating…</> : <>Create playlist</>}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Session Templates */}
            <div className="mb-4">
              <button
                onClick={() => setShowTemplates(!showTemplates)}
                className="w-full px-3 py-2 rounded-lg bg-black/20 border border-[var(--border)] hover:border-white/20 transition flex items-center justify-between"
              >
                <span className="text-xs text-[var(--muted)]">Quick Start Templates</span>
                <ChevronDown size={12} className={cn('text-[var(--muted)] transition-transform', showTemplates && 'rotate-180')} />
              </button>
              {showTemplates && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {SESSION_TEMPLATES.map(t => (
                    <button
                      key={t.id}
                      onClick={() => createFromTemplate(t)}
                      className="p-2 rounded-lg bg-black/30 border border-[var(--border)] hover:border-white/20 transition text-left"
                    >
                      <div className="text-lg mb-1">{t.icon}</div>
                      <div className="text-xs font-medium">{t.name}</div>
                      <div className="text-[10px] text-[var(--muted)]">{t.description}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Playlist list */}
            <div className="space-y-1.5">
              {playlists.map((p) => {
                const stats = playlistStats.get(p.id)
                const duration = stats?.durationSec ?? 0
                const durationStr = duration > 0 ? formatDuration(duration) : ''
                return (
                <div
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  onDragOver={(e) => handlePlaylistDragOver(e, p.id)}
                  onDragLeave={handlePlaylistDragLeave}
                  onDrop={(e) => handlePlaylistDrop(e, p.id)}
                  className={cn(
                    'px-3 py-2.5 rounded-xl cursor-pointer transition border group',
                    selectedId === p.id
                      ? 'bg-white/10 border-white/15'
                      : 'border-transparent hover:bg-white/5',
                    dropTargetPlaylistId === p.id && p.id !== selectedId && 'ring-2 ring-green-500 bg-green-500/10 border-green-500/30'
                  )}
                >
                  {renaming === p.id ? (
                    <input
                      autoFocus
                      value={renamingValue}
                      onChange={(e) => setRenamingValue(e.target.value)}
                      onBlur={() => renamePlaylist(p.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') renamePlaylist(p.id)
                        if (e.key === 'Escape') setRenaming(null)
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full px-2 py-1 rounded bg-black/30 border border-white/20 text-sm outline-none"
                    />
                  ) : (
                    <div className="flex items-center gap-3">
                      {/* Thumbnail preview */}
                      <div className="w-10 h-10 rounded-lg bg-black/40 overflow-hidden shrink-0 flex items-center justify-center">
                        {stats?.thumbPath ? (
                          <img
                            src={`vault://${stats.thumbPath}`}
                            alt=""
                            className="w-full h-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                          />
                        ) : (
                          <ListMusic size={16} className="text-[var(--muted)]" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          {p.isSmart === 1 && (
                            <span title="Smart Playlist"><Zap size={10} className="text-cyan-400 shrink-0" /></span>
                          )}
                          <span className="text-sm font-medium truncate">{p.name}</span>
                        </div>
                        <div className="text-[10px] text-[var(--muted)] flex items-center gap-2">
                          <span>{stats?.count ?? 0} items</span>
                          {durationStr && <span>• {durationStr}</span>}
                        </div>
                      </div>
                      {dropTargetPlaylistId === p.id && p.id !== selectedId && (
                        <span className="text-xs text-green-400 flex items-center gap-1">
                          <Plus size={12} /> Add
                        </span>
                      )}
                      {p.isSmart === 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            refreshSmartPlaylist(p.id)
                          }}
                          className="text-xs text-cyan-400 hover:text-cyan-200 p-1 opacity-0 group-hover:opacity-100"
                          title="Refresh smart playlist"
                        >
                          <RefreshCw size={12} />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setRenaming(p.id)
                          setRenamingValue(p.name)
                        }}
                        className="text-xs text-[var(--muted)] hover:text-white opacity-0 group-hover:opacity-100 p-1"
                        title="Rename"
                      >
                        <Edit2 size={12} />
                      </button>
                    </div>
                  )}
                </div>
              )})}
              {playlists.length === 0 && (
                <div className="text-center py-8">
                  <ListMusic size={32} className="mx-auto mb-3 text-[var(--muted)] opacity-50" />
                  <div className="text-sm text-[var(--muted)] mb-2">No sessions yet</div>
                  <div className="text-xs text-white/30 mb-3">Create your first playlist or use a template</div>
                  <div className="flex justify-center gap-2">
                    <kbd className="px-2 py-1 rounded bg-white/10 text-[10px] font-mono">N</kbd>
                    <span className="text-xs text-white/30">New playlist</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Playlist content */}
        <div className="flex-1 overflow-auto">
          {selectedPlaylist ? (
            <div className="p-6">
              {/* Header */}
              <div className="mb-4 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2 truncate">
                      {selectedPlaylist.isSmart === 1 && <Zap size={20} className="text-cyan-400 shrink-0" />}
                      <span className="truncate">{selectedPlaylist.name}</span>
                    </h2>
                    <div className="text-sm text-[var(--muted)] mt-1 flex items-center gap-3 flex-wrap">
                      <span>{items.length} {items.length === 1 ? 'item' : 'items'}</span>
                      {(() => {
                        const totalDuration = items.reduce((sum: number, item: any) => {
                          return sum + (item.media?.durationSec ?? item.durationSec ?? 0)
                        }, 0)
                        return totalDuration > 0 ? <span>• {formatDuration(totalDuration)} total</span> : null
                      })()}
                      {selectedPlaylist.isSmart === 1 && <span className="text-cyan-400 text-xs">Smart Playlist</span>}
                    </div>
                  </div>
                </div>
                {/* Filters and actions row - wraps on narrow screens */}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Type filter buttons */}
                  <div className="flex gap-1 shrink-0">
                    {(['all', 'video', 'image', 'gif'] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setTypeFilter(t)}
                        className={cn(
                          'px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-lg text-[10px] sm:text-xs border transition',
                          typeFilter === t
                            ? 'bg-white/10 border-white/20 text-white font-medium'
                            : 'border-[var(--border)] text-[var(--muted)] hover:border-white/15 hover:text-white'
                        )}
                      >
                        {t === 'all' ? 'All' : t === 'video' ? 'Videos' : t === 'image' ? 'Images' : 'GIFs'}
                      </button>
                    ))}
                  </div>
                  <div className="w-px h-4 bg-[var(--border)] hidden sm:block" />
                  {/* Sort buttons */}
                  <div className="flex gap-1 shrink-0">
                    {(['manual', 'name', 'duration', 'added', 'random'] as PlaylistSortBy[]).map((s) => (
                      <button
                        key={s}
                        onClick={() => setSortBy(s)}
                        className={cn(
                          'px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-lg text-[10px] sm:text-xs border transition',
                          sortBy === s
                            ? 'bg-white/10 border-white/20 text-white font-medium'
                            : 'border-[var(--border)] text-[var(--muted)] hover:border-white/15 hover:text-white'
                        )}
                      >
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </button>
                    ))}
                  </div>
                  <div className="flex-1" />
                  {sortedItems.length > 0 && (
                    <>
                      <Btn
                        onClick={() => {
                          // Play the first video in the filtered/sorted list
                          const firstItem = sortedItems[0]
                          const mediaId = firstItem?.media?.id ?? firstItem?.mediaId
                          if (mediaId) setOpenMediaId(mediaId)
                        }}
                        className="flex items-center gap-1.5"
                        title="Play all videos in order"
                      >
                        <Play size={14} />
                        Play
                      </Btn>
                      <Btn
                        onClick={() => {
                          // Shuffle and play a random video
                          const randomIdx = Math.floor(Math.random() * sortedItems.length)
                          const randomItem = sortedItems[randomIdx]
                          const mediaId = randomItem?.media?.id ?? randomItem?.mediaId
                          if (mediaId) {
                            setSortBy('random') // Switch to random sort
                            setOpenMediaId(mediaId)
                          }
                        }}
                        className="flex items-center gap-1.5"
                        title="Shuffle and play"
                      >
                        <Shuffle size={14} />
                        Shuffle
                      </Btn>
                    </>
                  )}
                  <Btn tone="primary" onClick={openAddMedia} className="flex items-center gap-1.5">
                    <Plus size={14} />
                    Add Videos
                  </Btn>
                </div>
              </div>

              {/* Mosaic grid - responsive columns for narrow windows */}
              <div
                className="grid"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(200px, 100%), 1fr))', gap: '12px' }}
              >
                {sortedItems.map((item: any, idx: number) => {
                  const mediaId = item.media?.id ?? item.mediaId
                  const isPlaying = openMediaId === mediaId
                  return (
                    <div
                      key={item.playlistItemId}
                      draggable={true}
                      onDragStart={() => handleDragStart(idx, mediaId)}
                      onDragOver={sortBy === 'manual' ? (e) => { e.preventDefault(); handleDragOver(e, idx) } : undefined}
                      onDragLeave={sortBy === 'manual' ? handleDragLeave : undefined}
                      onDragEnd={sortBy === 'manual' ? handleDragEnd : undefined}
                      onDrop={sortBy === 'manual' ? (e) => handleDrop(e, idx) : undefined}
                      onClick={() => { if (mediaId) setOpenMediaId(mediaId) }}
                      className={cn(
                        'relative rounded-xl border bg-black/20 overflow-hidden group cursor-pointer transition-all duration-200',
                        'hover:scale-[1.02] hover:z-10 hover:shadow-xl hover:shadow-black/40',
                        dragIdx === idx && 'opacity-50 scale-95 ring-2 ring-[var(--primary)]',
                        dragOverIdx === idx && dragIdx !== idx && 'ring-2 ring-green-500 ring-offset-2 ring-offset-black scale-[1.03]',
                        isPlaying
                          ? 'border-[var(--primary)]/50 shadow-[0_0_20px_rgba(var(--primary-rgb),0.3)]'
                          : 'border-[var(--border)] hover:border-[var(--primary)]/30'
                      )}
                    >
                      {/* Thumbnail */}
                      <PlaylistGridThumb item={item} />

                      {/* Position badge */}
                      <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-sm text-[10px] text-white/70">
                        {idx + 1}
                      </div>

                      {/* Drag handle (manual sort only) */}
                      {sortBy === 'manual' && (
                        <div className="absolute top-1.5 left-1.5 p-1 rounded bg-black/60 backdrop-blur-sm text-white/50 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition hover:text-white/80">
                          <GripVertical size={14} />
                        </div>
                      )}

                      {/* Remove button (hover) */}
                      <button
                        onClick={(e) => { e.stopPropagation(); removeItem(item.playlistItemId) }}
                        className="absolute top-1.5 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition px-2 py-1 rounded bg-red-500/80 backdrop-blur-sm text-[10px] text-white hover:bg-red-500"
                      >
                        <Trash2 size={12} />
                      </button>

                      {/* Now playing indicator */}
                      {isPlaying && (
                        <div className="absolute bottom-12 left-1.5">
                          <div className="px-2 py-1 rounded text-[10px] backdrop-blur-sm flex items-center gap-1 bg-green-500 text-white shadow-[0_0_15px_rgba(34,197,94,0.6)] animate-pulse">
                            <span className="w-1.5 h-1.5 bg-white rounded-full animate-ping" />
                            Playing
                          </div>
                        </div>
                      )}

                      {/* Info bar */}
                      <div className="px-3 py-2">
                        <div className="text-xs font-medium truncate">{item.media?.filename ?? item.filename ?? 'Unknown'}</div>
                        <div className="text-[10px] text-[var(--muted)] flex items-center gap-2 mt-0.5">
                          <span>{(item.media?.type ?? item.type ?? '').toUpperCase()}</span>
                          {(item.media?.durationSec ?? item.durationSec) ? (
                            <span>{formatDuration(item.media?.durationSec ?? item.durationSec)}</span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {items.length === 0 && (
                <div className="text-center py-12">
                    <div className="text-4xl mb-3 opacity-30">📋</div>
                  <div className="text-sm text-[var(--muted)]">This playlist is empty</div>
                  <Btn tone="primary" onClick={openAddMedia} className="mt-4 flex items-center gap-1.5 mx-auto">
                    <Plus size={14} />
                    Add Videos
                  </Btn>
                </div>
              )}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-6">
              <div className="text-6xl mb-4 opacity-30">🎬</div>
              <div className="text-lg font-medium text-[var(--muted)]">Select a session</div>
              <div className="text-sm text-[var(--text-subtle)] mt-2 max-w-xs">
                Choose a playlist from the sidebar or use a quick-start template
              </div>
              <div className="flex gap-4 mt-6 text-xs text-white/30">
                <div className="flex items-center gap-1.5">
                  <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-[10px]">↑↓</kbd>
                  <span>Navigate</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-[10px]">N</kbd>
                  <span>New</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-[10px]">G</kbd>
                  <span>Generate</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Videos Modal */}
      {showAddMedia && selectedId && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="w-full max-w-[700px] max-h-[80vh] rounded-3xl border border-white/10 bg-[var(--panel)] overflow-hidden shadow-2xl flex flex-col">
            <div className="px-4 sm:px-6 py-4 border-b border-[var(--border)] flex items-center justify-between gap-3 shrink-0 flex-wrap">
              <div className="text-sm font-semibold">Add Videos to Playlist</div>
              <div className="flex items-center gap-2 sm:gap-3 flex-1 sm:flex-none justify-end">
                <input
                  value={mediaSearch}
                  onChange={(e) => setMediaSearch(e.target.value)}
                  placeholder="Search..."
                  className="px-3 py-1.5 rounded-xl bg-black/20 border border-[var(--border)] outline-none focus:border-white/15 text-xs w-32 sm:w-48"
                />
                <Btn onClick={() => setShowAddMedia(false)}>Done</Btn>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-3 sm:p-4 pb-safe">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
                {allMedia
                  .filter((m) => {
                    if (!mediaSearch.trim()) return true
                    return (m.filename ?? '').toLowerCase().includes(mediaSearch.toLowerCase())
                  })
                  .map((m) => {
                    const alreadyAdded = items.some((item: any) => (item.media?.id ?? item.mediaId) === m.id)
                    return (
                      <div
                        key={m.id}
                        onClick={() => !alreadyAdded && addMediaToPlaylist(m.id)}
                        className={cn(
                          'rounded-xl border overflow-hidden cursor-pointer transition group',
                          alreadyAdded
                            ? 'border-green-500/30 opacity-60 cursor-default'
                            : 'border-[var(--border)] hover:border-white/20'
                        )}
                      >
                        <SessionMediaThumb media={m} />
                        <div className="px-3 py-2 flex items-center justify-between">
                          <span className="text-xs truncate flex-1">{m.filename ?? 'Unknown'}</span>
                          {alreadyAdded ? (
                            <span className="text-green-400 text-xs ml-2 shrink-0">Added</span>
                          ) : (
                            <Plus size={14} className="text-[var(--muted)] group-hover:text-white ml-2 shrink-0" />
                          )}
                        </div>
                      </div>
                    )
                  })}
              </div>
              {allMedia.length === 0 && (
                <div className="text-center py-12 text-sm text-[var(--muted)]">No media found in library</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Floating Video Player for playlist playback */}
      {openMediaId && currentMedia && (
        <FloatingVideoPlayer
          media={currentMedia}
          mediaList={playlistMediaList}
          onClose={() => setOpenMediaId(null)}
          onMediaChange={(newId) => setOpenMediaId(newId)}
        />
      )}

      {/* AI Playlist Generator Modal */}
      {showAiGenerator && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="w-full max-w-[600px] max-h-[85vh] rounded-3xl border border-purple-500/30 bg-[var(--panel)] overflow-hidden shadow-2xl flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-[var(--border)] bg-gradient-to-r from-purple-500/10 to-pink-500/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                    <Sparkles size={20} className="text-white" />
                  </div>
                  <div>
                    <div className="font-semibold">AI Playlist Generator</div>
                    <div className="text-xs text-[var(--muted)]">Create a playlist based on your preferences</div>
                  </div>
                </div>
                <button
                  onClick={() => setShowAiGenerator(false)}
                  className="p-2 rounded-lg hover:bg-white/10 transition"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6 space-y-6 pb-safe">
              {/* Session Duration */}
              <div>
                <label className="text-sm font-medium mb-2 block">Session Duration</label>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min={10}
                    max={120}
                    step={5}
                    value={aiDuration}
                    onChange={(e) => setAiDuration(Number(e.target.value))}
                    className="flex-1 h-2 accent-purple-500 cursor-pointer"
                  />
                  <span className="text-sm font-medium w-20 text-right">{aiDuration} min</span>
                </div>
                <div className="flex justify-between mt-1 text-xs text-[var(--muted)]">
                  <span>Quick</span>
                  <span>Marathon</span>
                </div>
              </div>

              {/* Intensity */}
              <div>
                <label className="text-sm font-medium mb-2 block">Intensity</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['chill', 'medium', 'intense'] as const).map(intensity => (
                    <button
                      key={intensity}
                      onClick={() => setAiIntensity(intensity)}
                      className={cn(
                        'py-3 rounded-xl border transition-all',
                        aiIntensity === intensity
                          ? intensity === 'chill' ? 'bg-blue-500/20 border-blue-500/50 text-blue-300'
                            : intensity === 'intense' ? 'bg-red-500/20 border-red-500/50 text-red-300'
                            : 'bg-purple-500/20 border-purple-500/50 text-purple-300'
                          : 'border-[var(--border)] hover:border-white/20'
                      )}
                    >
                      <div className="text-lg mb-1">
                        {intensity === 'chill' ? '🌙' : intensity === 'intense' ? '🔥' : '💜'}
                      </div>
                      <div className="text-xs font-medium capitalize">{intensity}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Content Type */}
              <div>
                <label className="text-sm font-medium mb-2 block">Content Type</label>
                <div className="flex gap-2">
                  {(['video', 'image', 'gif', 'all'] as const).map(type => (
                    <button
                      key={type}
                      onClick={() => setAiContentFilter(type)}
                      className={cn(
                        'px-4 py-2 rounded-lg border text-sm transition',
                        aiContentFilter === type
                          ? 'bg-white/10 border-white/20 text-white'
                          : 'border-[var(--border)] text-[var(--muted)] hover:border-white/15'
                      )}
                    >
                      {type === 'all' ? 'All' : type === 'video' ? 'Videos' : type === 'image' ? 'Images' : 'GIFs'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tags Selection */}
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Tags (Optional)
                  {aiTags.length > 0 && <span className="text-[var(--muted)] ml-2">({aiTags.length} selected)</span>}
                </label>
                <div className="max-h-40 overflow-auto rounded-xl border border-[var(--border)] bg-black/20 p-3">
                  <div className="flex flex-wrap gap-2">
                    {availableTags.slice(0, 50).map(tag => (
                      <button
                        key={tag.name}
                        onClick={() => toggleAiTag(tag.name)}
                        className={cn(
                          'px-3 py-1.5 rounded-lg text-xs transition',
                          aiTags.includes(tag.name)
                            ? 'bg-purple-500 text-white'
                            : 'bg-white/5 text-[var(--muted)] hover:bg-white/10'
                        )}
                      >
                        {tag.name}
                        <span className="ml-1 opacity-50">({tag.count})</span>
                      </button>
                    ))}
                    {availableTags.length === 0 && (
                      <div className="text-xs text-[var(--muted)] py-2">No tags available - add tags to your media first</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Custom Prompt (Optional) */}
              <div>
                <label className="text-sm font-medium mb-2 block">Custom Name (Optional)</label>
                <input
                  type="text"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="e.g., Late Night Vibes, Sunday Funday..."
                  className="w-full px-4 py-3 rounded-xl bg-black/30 border border-[var(--border)] text-sm focus:outline-none focus:border-purple-500/50"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-[var(--border)] flex items-center justify-between">
              <button
                onClick={() => {
                  setAiTags([])
                  setAiPrompt('')
                  setAiDuration(30)
                  setAiIntensity('medium')
                }}
                className="text-sm text-[var(--muted)] hover:text-white transition"
              >
                Reset
              </button>
              <div className="flex gap-3">
                <Btn onClick={() => setShowAiGenerator(false)}>Cancel</Btn>
                <button
                  onClick={generateAiPlaylist}
                  disabled={aiGenerating}
                  className={cn(
                    'px-6 py-2.5 rounded-xl font-medium text-sm transition-all',
                    'bg-gradient-to-r from-purple-500 to-pink-500 text-white',
                    'hover:from-purple-400 hover:to-pink-400',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    'flex items-center gap-2'
                  )}
                >
                  {aiGenerating ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} />
                      Generate Playlist
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Smart Playlist Creation Modal */}
      {showSmartPlaylistModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="w-full max-w-[550px] max-h-[85vh] rounded-3xl border border-cyan-500/30 bg-[var(--panel)] overflow-hidden shadow-2xl flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-[var(--border)] bg-gradient-to-r from-cyan-500/10 to-blue-500/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center">
                    <Zap size={20} className="text-white" />
                  </div>
                  <div>
                    <div className="font-semibold">Smart Playlist</div>
                    <div className="text-xs text-[var(--muted)]">Auto-updates when library changes</div>
                  </div>
                </div>
                <button
                  onClick={() => setShowSmartPlaylistModal(false)}
                  className="p-2 rounded-lg hover:bg-white/10 transition"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6 space-y-5 pb-safe">
              {/* Name */}
              <div>
                <label className="text-sm font-medium mb-2 block">Playlist Name</label>
                <input
                  value={smartName}
                  onChange={(e) => setSmartName(e.target.value)}
                  placeholder="My Smart Playlist"
                  className="w-full px-4 py-2.5 rounded-xl bg-black/20 border border-[var(--border)] outline-none focus:border-cyan-500/50 text-sm"
                />
              </div>

              {/* Include Tags */}
              <div>
                <label className="text-sm font-medium mb-2 block">Include Tags (any of these)</label>
                <div className="flex flex-wrap gap-2 mb-2 min-h-[32px] p-2 rounded-xl bg-black/20 border border-[var(--border)]">
                  {smartIncludeTags.map(tag => (
                    <span key={tag} className="px-2 py-1 rounded bg-cyan-500/20 text-cyan-300 text-xs flex items-center gap-1">
                      {tag}
                      <button onClick={() => setSmartIncludeTags(t => t.filter(x => x !== tag))} className="hover:text-white">
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                  {smartIncludeTags.length === 0 && <span className="text-xs text-[var(--muted)]">No tags selected</span>}
                </div>
                <div className="flex flex-wrap gap-1 max-h-32 overflow-auto">
                  {availableTags.filter(t => !smartIncludeTags.includes(t.name)).slice(0, 30).map(t => (
                    <button
                      key={t.name}
                      onClick={() => setSmartIncludeTags(prev => [...prev, t.name])}
                      className="px-2 py-1 rounded bg-black/30 text-xs hover:bg-white/10 transition"
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Exclude Tags */}
              <div>
                <label className="text-sm font-medium mb-2 block">Exclude Tags (none of these)</label>
                <div className="flex flex-wrap gap-2 mb-2 min-h-[32px] p-2 rounded-xl bg-black/20 border border-[var(--border)]">
                  {smartExcludeTags.map(tag => (
                    <span key={tag} className="px-2 py-1 rounded bg-red-500/20 text-red-300 text-xs flex items-center gap-1">
                      {tag}
                      <button onClick={() => setSmartExcludeTags(t => t.filter(x => x !== tag))} className="hover:text-white">
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                  {smartExcludeTags.length === 0 && <span className="text-xs text-[var(--muted)]">No exclusions</span>}
                </div>
                <div className="flex flex-wrap gap-1 max-h-24 overflow-auto">
                  {availableTags.filter(t => !smartExcludeTags.includes(t.name) && !smartIncludeTags.includes(t.name)).slice(0, 20).map(t => (
                    <button
                      key={t.name}
                      onClick={() => setSmartExcludeTags(prev => [...prev, t.name])}
                      className="px-2 py-1 rounded bg-black/30 text-xs hover:bg-red-500/20 transition"
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Type Filter */}
              <div>
                <label className="text-sm font-medium mb-2 block">Media Type</label>
                <div className="flex gap-2">
                  {[{ value: '', label: 'All' }, { value: 'video', label: 'Videos' }, { value: 'image', label: 'Images' }, { value: 'gif', label: 'GIFs' }].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setSmartType(opt.value as '' | 'video' | 'image' | 'gif')}
                      className={cn(
                        'px-4 py-2 rounded-lg border text-sm transition',
                        smartType === opt.value
                          ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
                          : 'border-[var(--border)] text-[var(--muted)] hover:border-white/15'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Min Rating */}
              <div>
                <label className="text-sm font-medium mb-2 block">Minimum Rating</label>
                <div className="flex items-center gap-3">
                  {[0, 1, 2, 3, 4, 5].map(r => (
                    <button
                      key={r}
                      onClick={() => setSmartMinRating(r)}
                      className={cn(
                        'px-3 py-1.5 rounded-lg border text-sm transition',
                        smartMinRating === r
                          ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-300'
                          : 'border-[var(--border)] text-[var(--muted)] hover:border-white/15'
                      )}
                    >
                      {r === 0 ? 'Any' : `${r}+`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sort & Limit */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Sort By</label>
                  <select
                    value={smartSortBy}
                    onChange={(e) => setSmartSortBy(e.target.value as 'addedAt' | 'rating' | 'views' | 'random')}
                    className="w-full px-3 py-2 rounded-xl bg-black/30 border border-[var(--border)] text-sm"
                  >
                    <option value="addedAt">Date Added</option>
                    <option value="rating">Rating</option>
                    <option value="views">Views</option>
                    <option value="random">Random</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Max Items</label>
                  <select
                    value={smartLimit}
                    onChange={(e) => setSmartLimit(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-black/30 border border-[var(--border)] text-sm"
                  >
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={200}>200</option>
                    <option value={500}>500</option>
                    <option value={1000}>1000</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-[var(--border)] bg-black/20">
              <button
                onClick={createSmartPlaylist}
                disabled={smartCreating}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {smartCreating ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Zap size={16} />
                    Create Smart Playlist
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
