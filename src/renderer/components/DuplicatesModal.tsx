// File: src/renderer/components/DuplicatesModal.tsx
// Find and manage duplicate media files

import { useState, useEffect, useCallback } from 'react'
import { Copy, Trash2, Check, X, HardDrive, FileText, Hash, Loader2, ChevronDown, ChevronRight, FolderOpen, Eye } from 'lucide-react'
import { formatBytes } from '../utils/formatters'
import { useToast } from '../contexts'
import { useEscapeClose } from '../hooks/useEscapeClose'
import { useConfirm } from './ConfirmDialog'

interface DuplicateMedia {
  id: string
  filename: string
  path: string
  thumbPath?: string
  size: number
  addedAt: number
  rating?: number
  viewCount: number
}

interface DuplicateGroup {
  hash: string
  type: 'exact' | 'size' | 'name' | 'similar'
  mediaIds: string[]
  count: number
  totalSize: number
  savingsIfReduced: number
  /** Per-group confidence (1-100). Surfaced as a badge so the user can
   *  glance and tell exact byte matches (100) from cross-encoded
   *  fingerprint matches (~85) from same-name-different-content
   *  guesses (~60). Filled in by the renderer after a scan. */
  confidence?: number
  /** Which scan method produced this group. */
  method?: 'exact' | 'visual-mf' | 'audio-fp' | 'visual' | 'size+name' | 'name' | 'size'
}

interface DuplicateScanResult {
  groups: DuplicateGroup[]
  totalDuplicates: number
  potentialSavings: number
  scanTime: number
}

interface DuplicatesModalProps {
  isOpen: boolean
  onClose: () => void
  onViewMedia: (mediaId: string) => void
}

type ScanType = 'all' | 'exact' | 'size' | 'name' | 'visual' | 'visual-mf' | 'audio-fp'

// Confidence + method assignment for each scan type. Higher confidence
// = stronger signal that the matched items are actually duplicates.
// 'all' merges every method, dedupes by mediaId-set, and sorts by
// confidence descending — the user's requested behavior of "exact
// copies first, then progressively lower confidence".
const METHOD_CONFIDENCE: Record<NonNullable<DuplicateGroup['method']>, number> = {
  'exact': 100,
  'visual-mf': 92,
  'audio-fp': 88,
  'visual': 82,
  'size+name': 75,
  'name': 60,
  'size': 50,
}

export function DuplicatesModal({ isOpen, onClose, onViewMedia }: DuplicatesModalProps) {
  const { showToast } = useToast()
  const confirm = useConfirm()
  const [scanType, setScanType] = useState<ScanType>('all')
  const [isScanning, setIsScanning] = useState(false)
  const [scanResult, setScanResult] = useState<DuplicateScanResult | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [groupDetails, setGroupDetails] = useState<Map<string, DuplicateMedia[]>>(new Map())
  const [selectedForDeletion, setSelectedForDeletion] = useState<Set<string>>(new Set())
  const [keepSelected, setKeepSelected] = useState<Map<string, string>>(new Map()) // groupHash -> mediaId to keep
  const [stats, setStats] = useState<any>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  // Per-group ratio slider position for the "show matching frame" view
  // and the resulting per-media frame URLs. Both are keyed by groupHash
  // so different groups can be on different timestamps simultaneously.
  const [frameRatioByGroup, setFrameRatioByGroup] = useState<Map<string, number>>(new Map())
  const [frameUrlByMedia, setFrameUrlByMedia] = useState<Map<string, string>>(new Map())
  const [frameLoading, setFrameLoading] = useState<Set<string>>(new Set())

  const loadMatchedFrames = useCallback(async (group: DuplicateGroup, ratio: number, details: DuplicateMedia[]) => {
    // Only meaningful for videos; skip images (their thumbnail IS the
    // content already so the regular thumbPath is a fine comparison).
    const targets = details.filter((d) => /\.(mp4|mkv|webm|mov|avi|flv|wmv|m4v)$/i.test(d.filename))
    if (targets.length === 0) return
    setFrameLoading((prev) => {
      const n = new Set(prev)
      for (const t of targets) n.add(t.id)
      return n
    })
    try {
      const results = await Promise.all(targets.map(async (t) => {
        try {
          const r: any = await (window.api.media as any).extractFrameAt({ mediaId: t.id, ratio, width: 320 })
          return { id: t.id, path: r?.ok ? r.path : null }
        } catch { return { id: t.id, path: null } }
      }))
      setFrameUrlByMedia((prev) => {
        const next = new Map(prev)
        for (const r of results) {
          if (r.path) next.set(r.id, r.path)
        }
        return next
      })
    } finally {
      setFrameLoading((prev) => {
        const n = new Set(prev)
        for (const t of targets) n.delete(t.id)
        return n
      })
    }
  }, [])

  useEscapeClose(isOpen, onClose)

  // Del / Backspace fires the bulk-delete with the standard confirm
  // prompt. Power-user shortcut for the 400-dupes-at-once workflow.
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedForDeletion.size > 0) {
        e.preventDefault()
        void handleDeleteSelected()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, selectedForDeletion.size])

  const loadStats = useCallback(async () => {
    try {
      const s = await window.api.invoke('duplicates:getStats')
      setStats(s)
    } catch (e) {
      console.error('Failed to load stats:', e)
    }
  }, [])

  useEffect(() => {
    if (isOpen) {
      loadStats()
    }
  }, [isOpen, loadStats])

  const handleScan = async () => {
    setIsScanning(true)
    setScanResult(null)
    setExpandedGroups(new Set())
    setGroupDetails(new Map())
    setSelectedForDeletion(new Set())
    setKeepSelected(new Map())

    try {
      let result: DuplicateScanResult
      switch (scanType) {
        case 'all': {
          // Run every detection method, tag each group with its method +
          // confidence, then merge by mediaId-set so a group that's both
          // an exact match AND a name match doesn't show up twice. Higher-
          // confidence method wins. Sort final result confidence desc.
          const t0 = Date.now()
          type Tagged = DuplicateGroup
          const collected: Tagged[] = []
          const runs = await Promise.allSettled([
            window.api.invoke('duplicates:findExact').then((r: DuplicateScanResult) => r.groups.map((g): Tagged => ({ ...g, method: 'exact', confidence: METHOD_CONFIDENCE.exact }))),
            (async () => {
              try {
                const coverage: any = await (window as any).api?.similar?.mfCoverage?.()
                if (coverage && coverage.hashed < coverage.total) {
                  await (window as any).api?.similar?.mfComputeAll?.({ onlyUnhashed: true })
                }
                const mf: any = await (window as any).api?.similar?.mfFindGroups?.({ maxDistance: 5, minMatches: 3 })
                return ((mf?.groups ?? []) as any[]).map((g): Tagged => ({
                  hash: `mfphash-${g.representativeId}`,
                  type: 'similar', method: 'visual-mf',
                  confidence: METHOD_CONFIDENCE['visual-mf'],
                  count: g.members.length, totalSize: 0, savingsIfReduced: 0,
                  mediaIds: g.members.map((m: any) => m.mediaId),
                }))
              } catch { return [] }
            })(),
            (async () => {
              try {
                const coverage: any = await (window as any).api?.similar?.cpCoverage?.()
                if (coverage && coverage.hashed < coverage.total) {
                  await (window as any).api?.similar?.cpComputeAll?.({ onlyUnhashed: true })
                }
                const cp: any = await (window as any).api?.similar?.cpFindGroups?.({ threshold: 0.85 })
                return ((cp?.groups ?? []) as any[]).map((g): Tagged => ({
                  hash: `cphash-${g.representativeId}`,
                  type: 'similar', method: 'audio-fp',
                  confidence: METHOD_CONFIDENCE['audio-fp'],
                  count: g.members.length, totalSize: 0, savingsIfReduced: 0,
                  mediaIds: g.members.map((m: any) => m.mediaId),
                }))
              } catch { return [] }
            })(),
            window.api.invoke('duplicates:findByName').then((r: DuplicateScanResult) => r.groups.map((g): Tagged => ({ ...g, method: 'name', confidence: METHOD_CONFIDENCE.name }))),
          ])
          for (const r of runs) {
            if (r.status === 'fulfilled') collected.push(...r.value)
          }
          // Merge: groups overlap if they share any mediaId. Keep the
          // highest-confidence method as the survivor; union member sets.
          const merged: Tagged[] = []
          const seenIds = new Map<string, number>()  // mediaId → merged-index
          for (const g of collected) {
            // Find any existing merged group that already contains one of these ids
            let target = -1
            for (const id of g.mediaIds) {
              if (seenIds.has(id)) { target = seenIds.get(id)!; break }
            }
            if (target === -1) {
              const idx = merged.length
              merged.push({ ...g, mediaIds: [...new Set(g.mediaIds)] })
              for (const id of merged[idx].mediaIds) seenIds.set(id, idx)
            } else {
              const t = merged[target]
              // Union mediaIds
              const setIds = new Set([...t.mediaIds, ...g.mediaIds])
              t.mediaIds = [...setIds]
              t.count = t.mediaIds.length
              for (const id of t.mediaIds) seenIds.set(id, target)
              // Prefer the higher-confidence method label
              if ((g.confidence ?? 0) > (t.confidence ?? 0)) {
                t.method = g.method
                t.confidence = g.confidence
                t.type = g.type
              }
            }
          }
          // Drop groups with only one member (single id, no actual dupe pair)
          const filtered = merged.filter((g) => g.mediaIds.length >= 2)
          filtered.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
          result = {
            groups: filtered,
            totalDuplicates: filtered.reduce((s, g) => s + g.mediaIds.length, 0),
            potentialSavings: filtered.reduce((s, g) => s + (g.savingsIfReduced || 0), 0),
            scanTime: Date.now() - t0,
          } as DuplicateScanResult
          break
        }
        case 'exact':
          result = await window.api.invoke('duplicates:findExact')
          result.groups = result.groups.map((g) => ({ ...g, method: 'exact', confidence: METHOD_CONFIDENCE.exact }))
          break
        case 'size':
          result = await window.api.invoke('duplicates:findBySize')
          result.groups = result.groups.map((g) => ({ ...g, method: 'size', confidence: METHOD_CONFIDENCE.size }))
          break
        case 'name':
          result = await window.api.invoke('duplicates:findByName')
          result.groups = result.groups.map((g) => ({ ...g, method: 'name', confidence: METHOD_CONFIDENCE.name }))
          break
        case 'visual': {
          // Visual (perceptual) duplicates — content_analyzer-style aHash on
          // thumbnails. If the library hasn't been hashed yet, do it now;
          // it's idempotent and skips already-hashed rows.
          const coverage = await (window as any).api?.similar?.hashCoverage?.()
          if (coverage && coverage.hashed < coverage.total) {
            await (window as any).api?.similar?.computeAllHashes?.({ onlyUnhashed: true })
          }
          const visual = await (window as any).api?.similar?.findVisualGroups?.({ maxDistance: 5 })
          // Normalize to the DuplicateScanResult shape the existing UI expects.
          const groups = (visual?.groups ?? []).map((g: any): DuplicateGroup => ({
            hash: `phash-${g.representativeId}`,
            type: 'similar' as const,
            count: g.members.length,
            totalSize: 0,
            savingsIfReduced: 0,
            method: 'visual',
            confidence: METHOD_CONFIDENCE['visual'],
            mediaIds: g.members.map((m: any) => m.mediaId)
          }))
          result = {
            type: 'similar',
            groups,
            totalGroups: groups.length,
            totalDuplicates: groups.reduce((s: number, g: any) => s + g.count, 0),
            potentialSavings: 0,  // unknown without per-file size; not the point of visual dedupe
            scanTime: 0
          } as DuplicateScanResult
          break
        }
        case 'visual-mf': {
          // Multi-frame video fingerprint — catches re-encodes where the
          // single keyframe phash above misses (dominant frame shifted).
          // 5 evenly-spaced pHashes per video, best-of-N match.
          const coverage = await (window as any).api?.similar?.mfCoverage?.()
          if (coverage && coverage.hashed < coverage.total) {
            await (window as any).api?.similar?.mfComputeAll?.({ onlyUnhashed: true })
          }
          const mf = await (window as any).api?.similar?.mfFindGroups?.({ maxDistance: 5, minMatches: 3 })
          const groups = (mf?.groups ?? []).map((g: any): DuplicateGroup => ({
            hash: `mfphash-${g.representativeId}`,
            type: 'similar' as const,
            count: g.members.length,
            totalSize: 0,
            savingsIfReduced: 0,
            method: 'visual-mf',
            confidence: METHOD_CONFIDENCE['visual-mf'],
            mediaIds: g.members.map((m: any) => m.mediaId)
          }))
          result = {
            type: 'similar',
            groups,
            totalGroups: groups.length,
            totalDuplicates: groups.reduce((s: number, g: any) => s + g.count, 0),
            potentialSavings: 0,
            scanTime: 0
          } as DuplicateScanResult
          break
        }
        case 'audio-fp': {
          // Chromaprint audio fingerprint — catches re-encodes that share
          // an audio track but differ visually (different aspect crop /
          // watermark / transcoded codec). Requires fpcalc.
          const coverage = await (window as any).api?.similar?.cpCoverage?.()
          if (coverage && coverage.hashed < coverage.total) {
            await (window as any).api?.similar?.cpComputeAll?.({ onlyUnhashed: true })
          }
          const cp = await (window as any).api?.similar?.cpFindGroups?.({ threshold: 0.85 })
          const groups = (cp?.groups ?? []).map((g: any): DuplicateGroup => ({
            hash: `cphash-${g.representativeId}`,
            type: 'similar' as const,
            count: g.members.length,
            totalSize: 0,
            savingsIfReduced: 0,
            method: 'audio-fp',
            confidence: METHOD_CONFIDENCE['audio-fp'],
            mediaIds: g.members.map((m: any) => m.mediaId)
          }))
          result = {
            type: 'similar',
            groups,
            totalGroups: groups.length,
            totalDuplicates: groups.reduce((s: number, g: any) => s + g.count, 0),
            potentialSavings: 0,
            scanTime: 0
          } as DuplicateScanResult
          break
        }
        default:
          result = await window.api.invoke('duplicates:findBySize')
      }
      setScanResult(result)

      // Auto-load details and suggest keeps for all groups (so thumbnails are visible)
      const keeps = new Map<string, string>()
      const details = new Map<string, DuplicateMedia[]>()
      for (const group of result.groups) {
        const [suggestion, groupDetails] = await Promise.all([
          window.api.invoke('duplicates:suggestKeep', group.mediaIds),
          window.api.invoke('duplicates:getGroupDetails', group.mediaIds)
        ])
        keeps.set(group.hash, suggestion.keepId)
        details.set(group.hash, groupDetails as DuplicateMedia[])
      }
      setKeepSelected(keeps)
      setGroupDetails(details)
      // Auto-expand first group for immediate visibility
      if (result.groups.length > 0) {
        setExpandedGroups(new Set([result.groups[0].hash]))
      }
    } catch (e) {
      console.error('Failed to scan for duplicates:', e)
    } finally {
      setIsScanning(false)
    }
  }

  const toggleGroup = async (group: DuplicateGroup) => {
    const newExpanded = new Set(expandedGroups)
    if (newExpanded.has(group.hash)) {
      newExpanded.delete(group.hash)
    } else {
      newExpanded.add(group.hash)
      // Load details if not already loaded
      let details = groupDetails.get(group.hash)
      if (!details) {
        try {
          details = await window.api.invoke('duplicates:getGroupDetails', group.mediaIds) as DuplicateMedia[]
          setGroupDetails(new Map(groupDetails).set(group.hash, details))
        } catch (e) {
          console.error('Failed to load group details:', e)
        }
      }
      // Kick off matched-frame extraction at the default ratio so the
      // first thing the user sees is the same point in both videos.
      if (details && details.length > 0) {
        const ratio = frameRatioByGroup.get(group.hash) ?? 0.5
        void loadMatchedFrames(group, ratio, details)
      }
    }
    setExpandedGroups(newExpanded)
  }

  const toggleSelection = (mediaId: string, groupHash: string) => {
    const keep = keepSelected.get(groupHash)
    if (mediaId === keep) return // Can't select the one we're keeping

    const newSelected = new Set(selectedForDeletion)
    if (newSelected.has(mediaId)) {
      newSelected.delete(mediaId)
    } else {
      newSelected.add(mediaId)
    }
    setSelectedForDeletion(newSelected)
  }

  const selectAllDuplicates = (group: DuplicateGroup) => {
    const keep = keepSelected.get(group.hash)
    const newSelected = new Set(selectedForDeletion)
    for (const id of group.mediaIds) {
      if (id !== keep) {
        newSelected.add(id)
      }
    }
    setSelectedForDeletion(newSelected)
  }

  // Global "select every duplicate across every group" — for the 400+
  // dupe case the user hit. We pick a keeper per group via the
  // suggestKeep IPC (highest-rated / most-viewed / oldest), then mark
  // every other member of every group as to-delete.
  const selectAllGroupsDupes = async () => {
    if (!scanResult) return
    const newKeeps = new Map(keepSelected)
    const newSelected = new Set(selectedForDeletion)
    // Resolve keepers in parallel for speed on big result sets.
    const suggestions = await Promise.all(scanResult.groups.map(async (g) => {
      const existing = keepSelected.get(g.hash)
      if (existing) return { hash: g.hash, keepId: existing }
      try {
        const s: any = await window.api.invoke('duplicates:suggestKeep', g.mediaIds)
        return { hash: g.hash, keepId: s?.keepId ?? g.mediaIds[0] }
      } catch {
        return { hash: g.hash, keepId: g.mediaIds[0] }
      }
    }))
    const byHash = new Map(suggestions.map(s => [s.hash, s.keepId]))
    for (const g of scanResult.groups) {
      const keepId = byHash.get(g.hash) ?? g.mediaIds[0]
      newKeeps.set(g.hash, keepId)
      for (const id of g.mediaIds) {
        if (id !== keepId) newSelected.add(id)
      }
    }
    setKeepSelected(newKeeps)
    setSelectedForDeletion(newSelected)
  }

  const clearAllSelection = () => {
    setSelectedForDeletion(new Set())
    setKeepSelected(new Map())
  }

  const setKeep = (groupHash: string, mediaId: string) => {
    const newKeeps = new Map(keepSelected)
    newKeeps.set(groupHash, mediaId)
    setKeepSelected(newKeeps)

    // Remove from selection if it was selected for deletion
    const newSelected = new Set(selectedForDeletion)
    newSelected.delete(mediaId)
    setSelectedForDeletion(newSelected)
  }

  const handleDeleteSelected = async () => {
    if (selectedForDeletion.size === 0) return
    const ok = await confirm({
      title: `Delete ${selectedForDeletion.size} duplicate file${selectedForDeletion.size === 1 ? '' : 's'}?`,
      body: 'This permanently deletes the selected duplicates from disk. The action cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return

    setIsDeleting(true)
    try {
      const resolution = {
        keep: '', // Not used when removing specific items
        remove: Array.from(selectedForDeletion),
        action: 'delete' as const
      }
      const result = await window.api.invoke('duplicates:resolve', resolution)
      if (result.success) {
        setSelectedForDeletion(new Set())
        handleScan() // Rescan
        loadStats()
        showToast('success', 'Duplicates removed')
      } else {
        showToast('error', `Error: ${result.error}`)
      }
    } catch (e) {
      console.error('Failed to delete duplicates:', e)
    } finally {
      setIsDeleting(false)
    }
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[var(--panel)] rounded-3xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col border border-[var(--border)]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-3">
            <Copy className="w-5 h-5 text-orange-400" />
            <h2 className="text-lg font-semibold text-white">Duplicate Finder</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-zinc-700 rounded" title="Close">
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        {/* Stats Bar */}
        {stats && (
          <div className="flex items-center gap-6 px-4 py-2 bg-zinc-800/50 text-xs text-zinc-400 border-b border-zinc-800">
            <span>Total Media: {stats.totalMedia.toLocaleString()}</span>
            <span>Exact Duplicates: {stats.exactDuplicates}</span>
            <span>Same Size: {stats.sizeDuplicates}</span>
            <span>Same Name: {stats.nameDuplicates}</span>
            <span>Est. Savings: {formatBytes(stats.estimatedSavings)}</span>
          </div>
        )}

        {/* Scan Options */}
        <div className="flex items-center gap-4 p-4 border-b border-zinc-800 flex-wrap">
          <span className="text-sm text-zinc-400">Scan by:</span>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setScanType('all')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm ${
                scanType === 'all' ? 'bg-gradient-to-r from-orange-500 to-fuchsia-600' : 'bg-zinc-700 hover:bg-zinc-600'
              }`}
              title="Run every method (exact + visual-mf + audio-fp + name) and rank groups by confidence — exact byte-identical first, cross-encoded last."
            >
              <Hash className="w-4 h-4" />
              All methods
            </button>
            <button
              onClick={() => setScanType('size')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm ${
                scanType === 'size' ? 'bg-blue-600' : 'bg-zinc-700 hover:bg-zinc-600'
              }`}
            >
              <HardDrive className="w-4 h-4" />
              File Size
            </button>
            <button
              onClick={() => setScanType('name')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm ${
                scanType === 'name' ? 'bg-blue-600' : 'bg-zinc-700 hover:bg-zinc-600'
              }`}
            >
              <FileText className="w-4 h-4" />
              Filename
            </button>
            <button
              onClick={() => setScanType('exact')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm ${
                scanType === 'exact' ? 'bg-blue-600' : 'bg-zinc-700 hover:bg-zinc-600'
              }`}
            >
              <Hash className="w-4 h-4" />
              Exact Hash
            </button>
            {/* Visual (perceptual) similarity — finds re-encodes / crops the
                byte-hash misses. Uses 8x8 aHash on existing thumbnails. */}
            <button
              onClick={() => setScanType('visual')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm ${
                scanType === 'visual' ? 'bg-fuchsia-600' : 'bg-zinc-700 hover:bg-zinc-600'
              }`}
              title="Find visually-similar duplicates (re-encodes, crops, watermarks)"
            >
              <Copy className="w-4 h-4" />
              Visual (AI)
            </button>
            {/* Multi-frame fingerprint — videos only. Catches re-encodes the
                single-keyframe phash above misses. 5-frame pHash + best-of-N. */}
            <button
              onClick={() => setScanType('visual-mf')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm ${
                scanType === 'visual-mf' ? 'bg-fuchsia-600' : 'bg-zinc-700 hover:bg-zinc-600'
              }`}
              title="Multi-frame video fingerprint (catches re-encodes the keyframe phash misses)"
            >
              <Copy className="w-4 h-4" />
              Visual (Video MF)
            </button>
            {/* Chromaprint audio fingerprint — catches videos with the
                same audio track but different visual encoding. Requires
                fpcalc.exe at resources/bin/. */}
            <button
              onClick={() => setScanType('audio-fp')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm ${
                scanType === 'audio-fp' ? 'bg-fuchsia-600' : 'bg-zinc-700 hover:bg-zinc-600'
              }`}
              title="Chromaprint audio fingerprint — catches re-encodes that share an audio track"
            >
              <Copy className="w-4 h-4" />
              Audio Fingerprint
            </button>
          </div>
          <div className="flex-1" />
          <button
            onClick={handleScan}
            disabled={isScanning}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 rounded-lg text-sm font-medium"
          >
            {isScanning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Scan for Duplicates
              </>
            )}
          </button>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto p-4">
          {!scanResult && !isScanning && (
            <div className="flex flex-col items-center justify-center h-48 text-zinc-500">
              <Copy className="w-16 h-16 mb-4 opacity-30" />
              <p className="text-lg">Select a scan type and click "Scan for Duplicates"</p>
              <p className="text-sm mt-2">
                {scanType === 'exact' && 'Exact hash scanning checks file content (slow but accurate)'}
                {scanType === 'size' && 'File size scanning is fast but may include false positives'}
                {scanType === 'visual' && 'Visual (perceptual) hash on thumbnails — catches re-encodes / crops / watermarks. First run hashes any unhashed media (~1-2s per 100 items).'}
                {scanType === 'visual-mf' && 'Multi-frame video fingerprint — 5 evenly-spaced frames per video, best-of-N match. Catches re-encodes the keyframe phash misses. Videos only. First run is ~2-3s per video.'}
                {scanType === 'audio-fp' && 'Chromaprint audio fingerprint — catches videos with identical audio but different visual encoding (different aspect crop / watermark / codec re-encode). Videos only. Requires fpcalc.exe. First run is ~1s per video.'}
                {scanType === 'name' && 'Filename scanning finds files with identical names'}
              </p>
            </div>
          )}

          {scanResult && scanResult.groups.length === 0 && (
            <div className="flex flex-col items-center justify-center h-48 text-zinc-500">
              <Check className="w-16 h-16 mb-4 text-green-500 opacity-50" />
              <p className="text-lg">No duplicates found!</p>
              <p className="text-sm mt-2">Scan completed in {scanResult.scanTime}ms</p>
            </div>
          )}

          {scanResult && scanResult.groups.length > 0 && (
            <div className="space-y-2">
              {/* Summary */}
              <div className="flex items-center justify-between mb-4 p-3 bg-zinc-800 rounded-lg">
                <div className="text-sm">
                  Found <span className="text-orange-400 font-bold">{scanResult.totalDuplicates}</span> duplicates in{' '}
                  <span className="font-bold">{scanResult.groups.length}</span> groups
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-sm">
                    Potential savings: <span className="text-green-400 font-bold">{formatBytes(scanResult.potentialSavings)}</span>
                  </div>
                  <button
                    onClick={selectAllGroupsDupes}
                    className="px-3 py-1.5 text-xs bg-red-900/50 hover:bg-red-900 text-red-200 border border-red-700/40 rounded-lg font-medium"
                    title="Mark every duplicate across every group for deletion, keeping the best-rated / most-viewed / oldest copy in each"
                  >
                    Select all duplicates
                  </button>
                </div>
              </div>

              {/* Groups */}
              {scanResult.groups.map((group) => {
                const isExpanded = expandedGroups.has(group.hash)
                const details = groupDetails.get(group.hash) || []
                const keepId = keepSelected.get(group.hash)

                return (
                  <div key={group.hash} className="border border-[var(--border)] rounded-lg overflow-hidden">
                    {/* Group Header */}
                    <button
                      onClick={() => toggleGroup(group)}
                      className="w-full flex items-center gap-3 p-3 hover:bg-zinc-800 text-left"
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-zinc-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-zinc-400" />
                      )}
                      <span className="flex-1 text-sm font-medium">
                        {group.count} files • {formatBytes(group.totalSize)}
                      </span>
                      {typeof group.confidence === 'number' && (
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded font-semibold tabular-nums ${
                            group.confidence >= 95 ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                            group.confidence >= 80 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                            'bg-zinc-700 text-zinc-300 border border-zinc-600'
                          }`}
                          title={`${group.confidence}% confidence — ${group.method ?? group.type}`}
                        >
                          {group.confidence}%
                        </span>
                      )}
                      <span className="text-xs text-zinc-500 px-2 py-0.5 bg-zinc-700 rounded">
                        {group.method ?? group.type}
                      </span>
                      <span className="text-xs text-green-400">
                        Save {formatBytes(group.savingsIfReduced)}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); selectAllDuplicates(group) }}
                        className="px-2 py-1 text-xs bg-red-900/50 hover:bg-red-900 text-red-300 rounded"
                      >
                        Select All Dupes
                      </button>
                    </button>

                    {/* Group Details */}
                    {isExpanded && details.length > 0 && (
                      <div className="border-t border-[var(--border)] p-2 space-y-1 bg-zinc-800/30">
                        {/* Matching-frame slider — picks the same proportional
                            timestamp from every video in the group so the
                            user can eyeball them side-by-side. Off for
                            image-only groups. */}
                        {details.some((d) => /\.(mp4|mkv|webm|mov|avi|flv|wmv|m4v)$/i.test(d.filename)) && (
                          <div className="flex items-center gap-2 px-2 py-1 mb-1 rounded bg-zinc-900/50">
                            <span className="text-[10px] text-zinc-400 whitespace-nowrap">Match frame:</span>
                            <input
                              type="range"
                              min={5}
                              max={95}
                              step={5}
                              value={Math.round((frameRatioByGroup.get(group.hash) ?? 0.5) * 100)}
                              onChange={(e) => {
                                const ratio = Number(e.target.value) / 100
                                setFrameRatioByGroup((prev) => new Map(prev).set(group.hash, ratio))
                              }}
                              onMouseUp={() => {
                                const ratio = frameRatioByGroup.get(group.hash) ?? 0.5
                                void loadMatchedFrames(group, ratio, details)
                              }}
                              onTouchEnd={() => {
                                const ratio = frameRatioByGroup.get(group.hash) ?? 0.5
                                void loadMatchedFrames(group, ratio, details)
                              }}
                              className="flex-1 h-1 accent-orange-400 cursor-pointer"
                            />
                            <span className="text-[10px] text-zinc-400 tabular-nums w-9">{Math.round((frameRatioByGroup.get(group.hash) ?? 0.5) * 100)}%</span>
                          </div>
                        )}
                        {details.map((media) => {
                          const isKeep = media.id === keepId
                          const isSelected = selectedForDeletion.has(media.id)
                          const matchedFramePath = frameUrlByMedia.get(media.id)
                          const isFrameLoading = frameLoading.has(media.id)

                          return (
                            <div
                              key={media.id}
                              className={`flex items-center gap-3 p-2 rounded-lg ${
                                isKeep ? 'bg-green-900/30 border border-green-700' :
                                isSelected ? 'bg-red-900/30 border border-red-700' :
                                'hover:bg-zinc-700'
                              }`}
                            >
                              {/* Checkbox */}
                              <button
                                onClick={() => toggleSelection(media.id, group.hash)}
                                className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                                  isKeep ? 'border-green-500 bg-green-500 cursor-not-allowed' :
                                  isSelected ? 'border-red-500 bg-red-500' :
                                  'border-zinc-500 hover:border-zinc-400'
                                }`}
                                disabled={isKeep}
                                title={isKeep ? 'Keep this file' : isSelected ? 'Deselect for deletion' : 'Select for deletion'}
                              >
                                {(isKeep || isSelected) && <Check className="w-3 h-3" />}
                              </button>

                              {/* Thumbnail — show the matched-frame
                                  capture when we have one (so the user
                                  can see the SAME moment from both
                                  videos); fall back to the stored thumb
                                  while the frame is being extracted. */}
                              <div className="w-20 h-14 bg-zinc-700 rounded overflow-hidden flex-shrink-0 relative">
                                {matchedFramePath ? (
                                  <img
                                    src={`vault://${matchedFramePath}`}
                                    alt=""
                                    className="w-full h-full object-cover"
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                                  />
                                ) : media.thumbPath ? (
                                  <img
                                    src={`vault://${media.thumbPath}`}
                                    alt=""
                                    className="w-full h-full object-cover"
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-zinc-500">
                                    <FileText className="w-5 h-5" />
                                  </div>
                                )}
                                {isFrameLoading && (
                                  <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                                    <Loader2 className="w-4 h-4 animate-spin text-zinc-300" />
                                  </div>
                                )}
                              </div>

                              {/* Info */}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm truncate">{media.filename}</p>
                                <p className="text-xs text-zinc-500 truncate">{media.path}</p>
                              </div>

                              {/* Stats */}
                              <div className="text-right text-xs text-zinc-400 flex-shrink-0">
                                <div>{formatBytes(media.size)}</div>
                                <div>{formatDate(media.addedAt)}</div>
                              </div>

                              {/* Rating/Views */}
                              <div className="text-right text-xs flex-shrink-0 w-16">
                                {media.rating && <div className="text-yellow-400">★ {media.rating}</div>}
                                <div className="text-zinc-500">{media.viewCount} views</div>
                              </div>

                              {/* Actions */}
                              <div className="flex items-center gap-1">
                                {isKeep ? (
                                  <span className="px-2 py-1 text-xs bg-green-700 text-green-100 rounded">KEEP</span>
                                ) : (
                                  <button
                                    onClick={() => setKeep(group.hash, media.id)}
                                    className="px-2 py-1 text-xs bg-zinc-700 hover:bg-green-700 rounded"
                                  >
                                    Keep
                                  </button>
                                )}
                                <button
                                  onClick={() => onViewMedia(media.id)}
                                  className="p-1 hover:bg-zinc-600 rounded"
                                  title="View"
                                >
                                  <Eye className="w-4 h-4 text-zinc-400" />
                                </button>
                                <button
                                  onClick={async () => {
                                    try {
                                      await window.api.invoke('shell:showItemInFolder', media.path)
                                    } catch (e) {
                                      console.error('Failed to show in folder:', e)
                                    }
                                  }}
                                  className="p-1 hover:bg-zinc-600 rounded"
                                  title="Show in folder"
                                >
                                  <FolderOpen className="w-4 h-4 text-zinc-400" />
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {scanResult && scanResult.groups.length > 0 && (
          <div className="flex items-center justify-between p-4 border-t border-[var(--border)] bg-zinc-800/50">
            <div className="text-sm text-zinc-400">
              {selectedForDeletion.size} files selected for deletion
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={clearAllSelection}
                disabled={selectedForDeletion.size === 0 && keepSelected.size === 0}
                className="px-4 py-2 text-zinc-400 hover:bg-zinc-700 disabled:opacity-50 rounded-lg text-sm"
              >
                Clear Selection
              </button>
              <button
                onClick={handleDeleteSelected}
                disabled={selectedForDeletion.size === 0 || isDeleting}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 rounded-lg text-sm font-medium"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Delete Selected
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default DuplicatesModal
