// File: src/renderer/pages/PerformersPage.tsx
//
// Performers manager. Lists all SFace clusters Vault has built from
// face embeddings, lets the user name them, merge them, or delete.
//
// Workflow:
//   1. AI queue runs SFace on every face → embeddings cluster automatically
//   2. User opens this page → sees N unnamed clusters
//   3. Names a cluster ("Mia Khalifa") → backend applies
//      performer:mia khalifa tag to every media item in that cluster
//   4. Future media: queue's SFace step matches faces → auto-emits
//      performer:NAME at high confidence
//
// Cluster thumbnails: cropped from the representative media using the
// face bbox. Falls back to the full thumb if the bbox or media isn't
// resolvable.

import { useEffect, useState, useMemo, useCallback } from 'react'
import {
  Users, Loader2, Edit2, Trash2, Check, X, Search, GitMerge, User, Link2, Plus,
} from 'lucide-react'
import { useToast } from '../contexts'
import { useConfirm } from '../components/ConfirmDialog'
import { cn } from '../utils/cn'
import { toFileUrlCached } from '../hooks/usePerformance'
import { MultiAngleViewer } from '../components/MultiAngleViewer'

type Tab = 'faces' | 'bodies' | 'watchlist'

interface Cluster {
  id: string
  name: string | null
  sampleCount: number
  mediaCount: number
  representativeMediaId: string | null
  representativeBbox: string | null
  createdAt: number
  updatedAt: number
}

interface ClusterMedia {
  mediaId: string
  filename: string
  thumbPath: string | null
  bbox: { x: number; y: number; w: number; h: number } | null
}

export default function PerformersPage() {
  const { showToast } = useToast()
  const confirm = useConfirm()
  const [tab, setTab] = useState<Tab>('faces')
  const [clusters, setClusters] = useState<Cluster[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'named' | 'unnamed'>('all')
  const [search, setSearch] = useState('')
  const [minSamples, setMinSamples] = useState(2)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  // Cluster thumb URLs — resolved async via toFileUrlCached.
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({})
  // Cluster media browser — when user clicks a card to inspect it.
  const [browsingCluster, setBrowsingCluster] = useState<Cluster | null>(null)
  const [browsingMedia, setBrowsingMedia] = useState<ClusterMedia[]>([])
  const [browsingLoading, setBrowsingLoading] = useState(false)
  // Merge mode — when a cluster is being prepared to merge INTO another.
  const [mergeSourceId, setMergeSourceId] = useState<string | null>(null)
  // #211 — Multi-angle viewer session opened from the cluster modal.
  const [angleSession, setAngleSession] = useState<ClusterMedia[] | null>(null)
  // Resolved playable URLs per session media id. Resolved lazily once
  // the user opens MultiAngleViewer so we don't fan out the IPC for
  // every cluster the user merely browses.
  const [angleUrls, setAngleUrls] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!angleSession || angleSession.length === 0) return
    let cancelled = false
    void (async () => {
      const urlMap: Record<string, string> = {}
      for (const m of angleSession) {
        try {
          const u = await window.api.media.getPlayableUrl(m.mediaId)
          if (u) urlMap[m.mediaId] = u
        } catch { /* skip — angle will render with no source */ }
      }
      if (!cancelled) setAngleUrls(urlMap)
    })()
    return () => { cancelled = true }
  }, [angleSession])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const list = await window.api.ai.faceClustersList?.({ minSamples, limit: 500 })
      setClusters(Array.isArray(list) ? list : [])
    } catch (err: any) {
      showToast('error', err?.message ?? 'Failed to load clusters')
    } finally {
      setLoading(false)
    }
  }, [minSamples, showToast])

  useEffect(() => { refresh() }, [refresh])

  // Resolve representative thumbnails for visible clusters.
  useEffect(() => {
    let alive = true
    ;(async () => {
      const next: Record<string, string> = {}
      for (const c of clusters) {
        if (!c.representativeMediaId) continue
        // Use the existing thumb generator; we'll crop client-side via CSS.
        try {
          const thumb = await window.api.media.generateThumb(c.representativeMediaId)
          if (!alive) return
          if (thumb) {
            const url = await toFileUrlCached(thumb)
            if (alive) next[c.id] = url
          }
        } catch { /* skip */ }
      }
      if (alive) setThumbUrls((prev) => ({ ...prev, ...next }))
    })()
    return () => { alive = false }
  }, [clusters])

  // Filtered + searched view.
  const visibleClusters = useMemo(() => {
    let v = clusters
    if (filter === 'named') v = v.filter((c) => c.name !== null)
    else if (filter === 'unnamed') v = v.filter((c) => c.name === null)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      v = v.filter((c) => (c.name ?? '').toLowerCase().includes(q))
    }
    return v
  }, [clusters, filter, search])

  const namedCount = clusters.filter((c) => c.name !== null).length
  const unnamedCount = clusters.length - namedCount

  // Compute the CSS crop for a face bbox so the representative thumb
  // zooms in on the face. bbox is normalized 0-1.
  function bboxStyle(bboxJson: string | null): React.CSSProperties {
    if (!bboxJson) return {}
    try {
      const b = JSON.parse(bboxJson) as { x: number; y: number; w: number; h: number }
      const expand = 0.2  // pad bbox by 20% for context
      const x = Math.max(0, b.x - b.w * expand)
      const y = Math.max(0, b.y - b.h * expand)
      const w = Math.min(1 - x, b.w * (1 + expand * 2))
      const h = Math.min(1 - y, b.h * (1 + expand * 2))
      const scale = 1 / Math.max(w, h)
      return {
        objectFit: 'none' as const,
        objectPosition: `${-x * scale * 100}% ${-y * scale * 100}%`,
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
      }
    } catch { return {} }
  }

  const handleRename = async (clusterId: string, name: string) => {
    try {
      await window.api.ai.faceClusterRename?.(clusterId, name)
      showToast('success', name ? `Named cluster "${name}"` : 'Cleared cluster name')
      setEditingId(null)
      setEditValue('')
      await refresh()
    } catch (err: any) {
      showToast('error', err?.message ?? 'Rename failed')
    }
  }

  const handleDelete = async (clusterId: string) => {
    const ok = await confirm({
      title: 'Delete this performer cluster?',
      body: "All face embeddings in this cluster are removed. The underlying media files aren't affected.",
      confirmLabel: 'Delete cluster',
      danger: true,
    })
    if (!ok) return
    try {
      await window.api.ai.faceClusterDelete?.(clusterId)
      showToast('success', 'Cluster deleted')
      await refresh()
    } catch (err: any) {
      showToast('error', err?.message ?? 'Delete failed')
    }
  }

  const handleMergeStart = (clusterId: string) => {
    setMergeSourceId(clusterId)
    showToast('info', 'Now click the cluster to merge INTO')
  }

  const handleMergeTarget = async (targetId: string) => {
    if (!mergeSourceId) return
    if (mergeSourceId === targetId) {
      setMergeSourceId(null)
      return
    }
    try {
      await window.api.ai.faceClusterMerge?.(mergeSourceId, targetId)
      showToast('success', 'Clusters merged')
      setMergeSourceId(null)
      await refresh()
    } catch (err: any) {
      showToast('error', err?.message ?? 'Merge failed')
    }
  }

  const handleBrowse = async (cluster: Cluster) => {
    setBrowsingCluster(cluster)
    setBrowsingLoading(true)
    try {
      const media = await window.api.ai.faceClusterMedia?.(cluster.id)
      setBrowsingMedia(Array.isArray(media) ? media : [])
    } catch (err: any) {
      showToast('error', err?.message ?? 'Failed to load cluster media')
      setBrowsingMedia([])
    } finally {
      setBrowsingLoading(false)
    }
  }

  return (
    <div className="h-full flex flex-col bg-[var(--bg)]">
      {/* Header */}
      <div className="flex-none px-6 py-4 border-b border-[var(--border)]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <Users size={24} className="text-[var(--primary)]" />
            <div>
              <h1 className="text-xl font-semibold">Performers</h1>
              <p className="text-sm text-[var(--muted)]">
                {tab === 'faces' ? (
                  <>
                    {clusters.length} face cluster{clusters.length === 1 ? '' : 's'}
                    {' · '}
                    <span className="text-green-300">{namedCount} named</span>
                    {' · '}
                    <span className="text-amber-300">{unnamedCount} unnamed</span>
                  </>
                ) : (
                  <>Body identity bridge — ReID-clustered bodies linked to face performers</>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {tab === 'faces' && mergeSourceId && (
              <button
                onClick={() => setMergeSourceId(null)}
                className="text-xs px-3 py-1.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 transition"
              >
                Cancel merge
              </button>
            )}
            {tab === 'faces' && (
              <button
                onClick={refresh}
                className="text-xs px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 text-[var(--primary)] transition"
              >
                Refresh
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-3 bg-black/20 rounded-md p-0.5 border border-[var(--border)] w-fit">
          <button
            onClick={() => setTab('faces')}
            className={cn(
              'px-3 py-1 rounded text-xs font-medium transition inline-flex items-center gap-1.5',
              tab === 'faces' ? 'bg-[var(--primary)] text-white' : 'text-[var(--muted)] hover:text-white'
            )}
          >
            <Users size={12} /> Faces
          </button>
          <button
            onClick={() => setTab('bodies')}
            className={cn(
              'px-3 py-1 rounded text-xs font-medium transition inline-flex items-center gap-1.5',
              tab === 'bodies' ? 'bg-[var(--primary)] text-white' : 'text-[var(--muted)] hover:text-white'
            )}
          >
            <User size={12} /> Bodies
          </button>
          <button
            onClick={() => setTab('watchlist')}
            className={cn(
              'px-3 py-1 rounded text-xs font-medium transition inline-flex items-center gap-1.5',
              tab === 'watchlist' ? 'bg-[var(--primary)] text-white' : 'text-[var(--muted)] hover:text-white'
            )}
          >
            <Link2 size={12} /> Watchlist
          </button>
        </div>

        {/* Filter + search (faces tab only) */}
        {tab === 'faces' && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-black/20 rounded-md p-0.5 border border-[var(--border)]">
            {([
              { id: 'all', label: `All (${clusters.length})` },
              { id: 'named', label: `Named (${namedCount})` },
              { id: 'unnamed', label: `Unnamed (${unnamedCount})` },
            ] as const).map((opt) => (
              <button
                key={opt.id}
                onClick={() => setFilter(opt.id)}
                className={cn(
                  'px-2.5 py-1 rounded text-[11px] font-medium transition',
                  filter === opt.id
                    ? 'bg-[var(--primary)] text-white'
                    : 'text-[var(--muted)] hover:text-white'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <label className="text-[11px] text-[var(--muted)]">Min samples:</label>
            <input
              type="number"
              value={minSamples}
              onChange={(e) => setMinSamples(Math.max(1, Number(e.target.value) || 1))}
              className="w-14 px-2 py-1 text-xs rounded bg-white/5 border border-[var(--border)] focus:border-[var(--primary)] focus:outline-none tabular-nums"
            />
          </div>
          <div className="relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by name…"
              className="pl-7 pr-2 py-1 text-xs rounded bg-white/5 border border-[var(--border)] focus:border-[var(--primary)] focus:outline-none w-48"
            />
          </div>
        </div>
        )}

        {tab === 'faces' && mergeSourceId && (
          <div className="mt-3 px-3 py-2 rounded bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200">
            <strong>Merge mode:</strong> click any cluster to merge "{clusters.find((c) => c.id === mergeSourceId)?.name ?? 'unnamed'}" INTO it.
          </div>
        )}
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'bodies' && <BodiesTab showToast={showToast} clusters={clusters} />}
        {tab === 'watchlist' && <WatchlistTab showToast={showToast} />}
        {tab === 'faces' && loading && (
          <div className="text-center text-[var(--muted)] py-20">
            <Loader2 size={32} className="mx-auto mb-2 animate-spin" />
            Loading clusters…
          </div>
        )}
        {tab === 'faces' && !loading && visibleClusters.length === 0 && (
          <div className="text-center text-[var(--muted)] py-20 max-w-md mx-auto">
            <Users size={48} className="mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium text-white/70 mb-2">No face clusters yet</p>
            <p className="text-xs mb-4 opacity-70">
              Run AI tagging on your media — SFace will start building clusters automatically as faces are detected.
            </p>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('navigate-tab', { detail: 'ai' }))}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--primary)] hover:bg-[var(--primary)]/80 text-white text-sm font-medium transition"
            >
              Open AI Tools
            </button>
          </div>
        )}
        {tab === 'faces' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {visibleClusters.map((c) => {
            const isMergeSource = mergeSourceId === c.id
            const inMergeMode = !!mergeSourceId
            return (
              <div
                key={c.id}
                className={cn(
                  'rounded-lg overflow-hidden border bg-[var(--panel)] transition group relative',
                  isMergeSource
                    ? 'border-amber-500/60 ring-2 ring-amber-500/30'
                    : inMergeMode
                      ? 'border-white/10 hover:border-[var(--primary)] cursor-pointer'
                      : 'border-white/10 hover:border-white/30'
                )}
                onClick={() => inMergeMode && handleMergeTarget(c.id)}
              >
                {/* Face thumbnail (cropped via CSS to the bbox) */}
                <div className="aspect-square bg-black overflow-hidden relative">
                  {thumbUrls[c.id] ? (
                    <div className="absolute inset-0 overflow-hidden">
                      <img
                        src={thumbUrls[c.id]}
                        alt={c.name ?? `Cluster ${c.id.slice(0, 6)}`}
                        className="w-full h-full"
                        style={bboxStyle(c.representativeBbox)}
                      />
                    </div>
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-[var(--muted)]/40">
                      <Users size={32} />
                    </div>
                  )}
                  {/* Sample count badge */}
                  <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/70 text-[10px] tabular-nums font-medium text-white">
                    {c.mediaCount}× / {c.sampleCount}
                  </span>
                  {c.name && (
                    <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-green-500/80 text-[9px] uppercase tracking-wider font-medium text-white">
                      named
                    </span>
                  )}
                </div>

                {/* Name editor + actions */}
                <div className="p-2 space-y-1.5">
                  {editingId === c.id ? (
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        value={editValue}
                        autoFocus
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRename(c.id, editValue)
                          else if (e.key === 'Escape') { setEditingId(null); setEditValue('') }
                        }}
                        placeholder="Performer name"
                        className="flex-1 min-w-0 px-2 py-1 text-xs rounded bg-white/5 border border-[var(--primary)] focus:outline-none"
                      />
                      <button
                        onClick={() => handleRename(c.id, editValue)}
                        className="p-1 rounded bg-green-500/20 hover:bg-green-500/30 text-green-300"
                        title="Save"
                      >
                        <Check size={12} />
                      </button>
                      <button
                        onClick={() => { setEditingId(null); setEditValue('') }}
                        className="p-1 rounded bg-white/5 hover:bg-white/10 text-[var(--muted)]"
                        title="Cancel"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div
                        className="text-xs font-medium truncate"
                        title={c.name ?? `Cluster ${c.id.slice(0, 6)}`}
                      >
                        {c.name ?? (
                          <span className="text-[var(--muted)] italic">unnamed</span>
                        )}
                      </div>
                      {!inMergeMode && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setEditingId(c.id)
                              setEditValue(c.name ?? '')
                            }}
                            className="flex-1 px-1 py-0.5 rounded text-[10px] bg-[var(--primary)]/15 hover:bg-[var(--primary)]/25 text-[var(--primary)] inline-flex items-center justify-center gap-1"
                            title="Name this cluster"
                          >
                            <Edit2 size={9} />
                            Name
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleBrowse(c) }}
                            className="px-1.5 py-0.5 rounded text-[10px] bg-white/5 hover:bg-white/10 text-[var(--muted)]"
                            title="View media"
                          >
                            View
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleMergeStart(c.id) }}
                            className="px-1.5 py-0.5 rounded text-[10px] bg-white/5 hover:bg-white/10 text-[var(--muted)]"
                            title="Merge into another cluster"
                          >
                            <GitMerge size={9} />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(c.id) }}
                            className="px-1.5 py-0.5 rounded text-[10px] bg-red-500/10 hover:bg-red-500/20 text-red-300"
                            title="Delete cluster"
                          >
                            <Trash2 size={9} />
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        )}
      </div>

      {/* #211 — Multi-angle synchronized viewer launched from cluster modal.
          Each pane is one media item from the cluster; one pane drives the
          master clock + audio, the others stay muted + drift-corrected. */}
      {angleSession && Object.keys(angleUrls).length >= 2 && (
        <MultiAngleViewer
          angles={angleSession
            .filter((m) => !!angleUrls[m.mediaId])
            .map((m) => ({ id: m.mediaId, url: angleUrls[m.mediaId], label: m.filename ?? m.mediaId }))}
          onClose={() => { setAngleSession(null); setAngleUrls({}) }}
        />
      )}

      {/* Cluster browse modal */}
      {browsingCluster && (
        <div
          className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={() => setBrowsingCluster(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="max-w-5xl max-h-[85vh] w-full bg-[var(--panel)] rounded-xl border border-[var(--border)] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex-none px-4 py-3 border-b border-[var(--border)] flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-semibold truncate">
                  {browsingCluster.name ?? `Cluster ${browsingCluster.id.slice(0, 8)}`}
                </h3>
                <p className="text-xs text-[var(--muted)]">
                  {browsingCluster.mediaCount} media items · {browsingCluster.sampleCount} face samples
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {/* #211 — launch MultiAngleViewer with up to 4 cluster videos */}
                {browsingMedia.length >= 2 && (
                  <button
                    onClick={() => {
                      const candidates = browsingMedia
                        .filter((m: any) => (m.type ?? 'video') === 'video')
                        .slice(0, 4)
                      if (candidates.length < 2) {
                        showToast('info', 'Need at least 2 video clips for multi-angle viewer')
                        return
                      }
                      setAngleSession(candidates)
                    }}
                    className="px-2 py-1 rounded text-xs bg-[var(--primary)]/20 hover:bg-[var(--primary)]/30 text-[var(--primary)] border border-[var(--primary)]/30"
                    title="Play up to 4 clips in lockstep with a master audio clock"
                  >
                    Play as angles
                  </button>
                )}
                <button
                  onClick={() => setBrowsingCluster(null)}
                  className="p-1.5 rounded bg-white/5 hover:bg-white/10"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {browsingLoading ? (
                <div className="text-center text-[var(--muted)] py-20">
                  <Loader2 size={24} className="mx-auto mb-2 animate-spin" />
                </div>
              ) : browsingMedia.length === 0 ? (
                <div className="text-center text-[var(--muted)] py-20">
                  No media — embeddings exist but the media records are missing.
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                  {browsingMedia.map((m) => (
                    <ClusterMediaCard key={m.mediaId} media={m} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Bodies tab — shows the Person ReID body-embedding bridge to face
 * clusters. Three blocks:
 *   1. Stats header (total / linked / unlinked).
 *   2. Per-cluster body coverage (which named faces have body data).
 *   3. Unlinked-body clustering on demand — runs cosine clustering
 *      across face_cluster_id IS NULL rows; user can name a group to
 *      promote it to a body-only "performer" cluster.
 */
function BodiesTab({
  showToast,
  clusters,
}: {
  showToast: (kind: 'success' | 'error' | 'info', msg: string) => void
  clusters: Cluster[]
}) {
  type BodyStats = {
    totalBodies: number; linkedBodies: number; unlinkedBodies: number
    distinctVideos: number; distinctLinkedVideos: number; distinctUnlinkedVideos: number
  }
  type Coverage = {
    clusterId: string; name: string | null; faceSampleCount: number
    bodyCount: number; bodyMediaCount: number
  }
  type UnlinkedGroup = {
    groupId: string
    size: number
    members: Array<{
      embId: string
      mediaId: string
      frameIdx: number
      bbox: { x: number; y: number; w: number; h: number } | null
      score: number
      filename: string
      thumbPath: string | null
    }>
  }

  const [stats, setStats] = useState<BodyStats | null>(null)
  const [coverage, setCoverage] = useState<Coverage[]>([])
  const [loadingStats, setLoadingStats] = useState(true)
  const [clusteringInProgress, setClusteringInProgress] = useState(false)
  const [unlinkedGroups, setUnlinkedGroups] = useState<UnlinkedGroup[]>([])
  const [clusterMeta, setClusterMeta] = useState<{ threshold: number; total: number; grouped: number; singletons: number } | null>(null)
  const [threshold, setThreshold] = useState(0.55)
  // Per-group: target cluster id ('' = create new) and pending name.
  const [assignTarget, setAssignTarget] = useState<Record<string, string>>({})
  const [assignName, setAssignName] = useState<Record<string, string>>({})

  const refresh = useCallback(async () => {
    setLoadingStats(true)
    try {
      const [s, cov] = await Promise.all([
        window.api.ai.bodyStats?.(),
        window.api.ai.bodyClusterCoverage?.(),
      ])
      setStats(s as BodyStats ?? null)
      setCoverage((cov as Coverage[]) ?? [])
    } catch (err: any) {
      showToast('error', err?.message ?? 'Failed to load body stats')
    } finally {
      setLoadingStats(false)
    }
  }, [showToast])

  useEffect(() => { refresh() }, [refresh])

  const handleCluster = async () => {
    setClusteringInProgress(true)
    setUnlinkedGroups([])
    setClusterMeta(null)
    try {
      const result = await window.api.ai.bodyClusterUnlinked?.({ threshold, maxBodies: 1000 })
      if (result) {
        setUnlinkedGroups(result.groups as UnlinkedGroup[])
        setClusterMeta({
          threshold: result.threshold,
          total: result.totalBodies,
          grouped: result.groupedBodies,
          singletons: result.singletonCount,
        })
        showToast('success', `Found ${result.groups.length} body group${result.groups.length === 1 ? '' : 's'} from ${result.totalBodies} unlinked bodies`)
      }
    } catch (err: any) {
      showToast('error', err?.message ?? 'Clustering failed')
    } finally {
      setClusteringInProgress(false)
    }
  }

  const handleAssign = async (group: UnlinkedGroup) => {
    const target = assignTarget[group.groupId] ?? ''
    const name = assignName[group.groupId] ?? ''
    if (!target && !name.trim()) {
      showToast('error', 'Pick a target cluster or enter a new name')
      return
    }
    try {
      const result = await window.api.ai.bodyLinkToCluster?.({
        embeddingIds: group.members.map((m) => m.embId),
        targetClusterId: target || null,
        newClusterName: target ? null : name.trim(),
      })
      if (result?.ok) {
        showToast('success', `Linked ${result.linked} bodies → ${target ? clusters.find((c) => c.id === target)?.name ?? 'cluster' : `new "${name}"`}`)
        // Remove this group from view and refresh stats.
        setUnlinkedGroups((g) => g.filter((x) => x.groupId !== group.groupId))
        refresh()
      } else {
        showToast('error', result?.error ?? 'Link failed')
      }
    } catch (err: any) {
      showToast('error', err?.message ?? 'Link failed')
    }
  }

  if (loadingStats) {
    return (
      <div className="text-center text-[var(--muted)] py-20">
        <Loader2 size={32} className="mx-auto mb-2 animate-spin" />
        Loading body stats…
      </div>
    )
  }

  if (!stats || stats.totalBodies === 0) {
    return (
      <div className="text-center text-[var(--muted)] py-20">
        <User size={48} className="mx-auto mb-3 opacity-30" />
        <p>No body embeddings yet.</p>
        <p className="text-xs mt-2 opacity-70 max-w-md mx-auto">
          Install Person ReID at <code className="text-[10px]">userData/models/person-reid.onnx</code> and run AI tagging.
          The queue's pose detection step will extract body features and link them to face clusters automatically.
        </p>
      </div>
    )
  }

  const linkedPct = stats.totalBodies > 0 ? Math.round((stats.linkedBodies / stats.totalBodies) * 100) : 0

  return (
    <div className="space-y-6">
      {/* Stats header */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-[var(--panel)] border border-white/10 p-4">
          <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Total bodies</div>
          <div className="text-2xl font-semibold tabular-nums mt-1">{stats.totalBodies.toLocaleString()}</div>
          <div className="text-xs text-[var(--muted)] mt-1">{stats.distinctVideos.toLocaleString()} videos</div>
        </div>
        <div className="rounded-lg bg-green-500/5 border border-green-500/20 p-4">
          <div className="text-[10px] uppercase tracking-wider text-green-300">Linked to face</div>
          <div className="text-2xl font-semibold tabular-nums mt-1 text-green-300">{stats.linkedBodies.toLocaleString()}</div>
          <div className="text-xs text-[var(--muted)] mt-1">{linkedPct}% coverage · {stats.distinctLinkedVideos.toLocaleString()} videos</div>
        </div>
        <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-4">
          <div className="text-[10px] uppercase tracking-wider text-amber-300">Unlinked (face occluded)</div>
          <div className="text-2xl font-semibold tabular-nums mt-1 text-amber-300">{stats.unlinkedBodies.toLocaleString()}</div>
          <div className="text-xs text-[var(--muted)] mt-1">{stats.distinctUnlinkedVideos.toLocaleString()} videos</div>
        </div>
      </div>

      {/* Per-cluster body coverage */}
      {coverage.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Link2 size={14} /> Body coverage per face cluster
          </h2>
          <div className="rounded-lg bg-[var(--panel)] border border-white/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-wider text-[var(--muted)] bg-black/20">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Cluster</th>
                  <th className="text-right px-3 py-2 font-medium">Face samples</th>
                  <th className="text-right px-3 py-2 font-medium">Bodies</th>
                  <th className="text-right px-3 py-2 font-medium">Videos</th>
                </tr>
              </thead>
              <tbody>
                {coverage.slice(0, 50).map((c) => (
                  <tr key={c.clusterId} className="border-t border-white/5 hover:bg-white/[0.02]">
                    <td className="px-3 py-2">
                      {c.name ? (
                        <span className="font-medium">{c.name}</span>
                      ) : (
                        <span className="text-[var(--muted)] italic text-xs">cluster {c.clusterId.slice(0, 6)}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-xs text-[var(--muted)]">{c.faceSampleCount}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{c.bodyCount}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-xs text-[var(--muted)]">{c.bodyMediaCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Unlinked clustering */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <User size={14} /> Cluster unlinked bodies
          </h2>
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-[var(--muted)]">Similarity ≥</label>
            <input
              type="number"
              step={0.05}
              min={0.3}
              max={0.9}
              value={threshold}
              onChange={(e) => setThreshold(Math.max(0.3, Math.min(0.9, Number(e.target.value) || 0.55)))}
              className="w-16 px-2 py-1 text-xs rounded bg-white/5 border border-[var(--border)] focus:border-[var(--primary)] focus:outline-none tabular-nums"
            />
            <button
              onClick={handleCluster}
              disabled={clusteringInProgress || stats.unlinkedBodies === 0}
              className="text-xs px-3 py-1.5 rounded bg-[var(--primary)] text-white hover:opacity-90 disabled:opacity-40 inline-flex items-center gap-1.5"
            >
              {clusteringInProgress ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
              {clusteringInProgress ? 'Clustering…' : 'Cluster now'}
            </button>
            <button
              onClick={async () => {
                setClusteringInProgress(true)
                try {
                  const r = await window.api.ai.bodyClusterAutoPersist?.({
                    threshold,
                    minSize: 5,
                    minMeanSim: 0.7,
                    maxBodies: 2000,
                  })
                  if (r?.ok) {
                    showToast(
                      'success',
                      `Auto-persisted ${r.createdClusters} cluster${r.createdClusters === 1 ? '' : 's'} (${r.linkedBodies} bodies linked)`
                    )
                    refresh()
                  } else {
                    showToast('error', r?.error ?? 'Auto-persist failed')
                  }
                } catch (err: any) {
                  showToast('error', err?.message ?? 'Auto-persist failed')
                } finally {
                  setClusteringInProgress(false)
                }
              }}
              disabled={clusteringInProgress || stats.unlinkedBodies === 0}
              title="Run clustering + auto-create body-only performer clusters for groups ≥5 bodies with tight similarity. Lower-confidence groups stay in the manual review list."
              className="text-xs px-3 py-1.5 rounded bg-emerald-600/80 text-white hover:bg-emerald-600 disabled:opacity-40 inline-flex items-center gap-1.5"
            >
              <Link2 size={12} />
              Auto-persist tight groups
            </button>
          </div>
        </div>
        {clusterMeta && (
          <p className="text-xs text-[var(--muted)] mb-3">
            {clusterMeta.total} bodies analyzed → {unlinkedGroups.length} meaningful groups · {clusterMeta.grouped} grouped · {clusterMeta.singletons} singletons dropped (threshold {clusterMeta.threshold.toFixed(2)})
          </p>
        )}
        {unlinkedGroups.length === 0 && !clusteringInProgress && (
          <p className="text-xs text-[var(--muted)] italic">
            Run clustering to surface recurring bodies that no face match has been found for.
            Adjust threshold up for tighter groups, down to merge more aggressively (default 0.55).
          </p>
        )}
        <div className="space-y-3">
          {unlinkedGroups.map((g) => (
            <BodyGroupCard
              key={g.groupId}
              group={g}
              namedClusters={clusters.filter((c) => c.name)}
              targetClusterId={assignTarget[g.groupId] ?? ''}
              newName={assignName[g.groupId] ?? ''}
              onTargetChange={(v) => setAssignTarget((s) => ({ ...s, [g.groupId]: v }))}
              onNameChange={(v) => setAssignName((s) => ({ ...s, [g.groupId]: v }))}
              onAssign={() => handleAssign(g)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function BodyGroupCard({
  group, namedClusters,
  targetClusterId, newName,
  onTargetChange, onNameChange, onAssign,
}: {
  group: { groupId: string; size: number; members: Array<{ embId: string; mediaId: string; frameIdx: number; bbox: { x: number; y: number; w: number; h: number } | null; score: number; filename: string; thumbPath: string | null }> }
  namedClusters: Cluster[]
  targetClusterId: string
  newName: string
  onTargetChange: (v: string) => void
  onNameChange: (v: string) => void
  onAssign: () => void
}) {
  return (
    <div className="rounded-lg bg-[var(--panel)] border border-white/10 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-xs">
          <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 font-medium">
            {group.size} bodies
          </span>
          <span className="text-[var(--muted)]">
            {new Set(group.members.map((m) => m.mediaId)).size} distinct videos
          </span>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={targetClusterId}
            onChange={(e) => onTargetChange(e.target.value)}
            className="text-xs rounded bg-white/5 border border-[var(--border)] px-2 py-1 focus:border-[var(--primary)] focus:outline-none max-w-[180px]"
          >
            <option value="">+ New body-only cluster</option>
            {namedClusters.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {!targetClusterId && (
            <input
              type="text"
              value={newName}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Performer name"
              className="text-xs rounded bg-white/5 border border-[var(--border)] px-2 py-1 w-36 focus:border-[var(--primary)] focus:outline-none"
            />
          )}
          <button
            onClick={onAssign}
            className="text-xs px-2.5 py-1 rounded bg-green-500/15 hover:bg-green-500/25 text-green-300 inline-flex items-center gap-1"
          >
            <Link2 size={11} /> Link
          </button>
        </div>
      </div>
      <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-1.5">
        {group.members.slice(0, 24).map((m) => (
          <BodyThumb key={m.embId} mediaId={m.mediaId} thumbPath={m.thumbPath} filename={m.filename} bbox={m.bbox} />
        ))}
        {group.members.length > 24 && (
          <div className="aspect-square flex items-center justify-center bg-black/30 rounded text-[10px] text-[var(--muted)]">
            +{group.members.length - 24}
          </div>
        )}
      </div>
    </div>
  )
}

function BodyThumb({
  mediaId, thumbPath, filename, bbox,
}: {
  mediaId: string
  thumbPath: string | null
  filename: string
  bbox: { x: number; y: number; w: number; h: number } | null
}) {
  const [thumbUrl, setThumbUrl] = useState('')
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const p = thumbPath ?? await window.api.media.generateThumb(mediaId)
        if (alive && p) {
          const url = await toFileUrlCached(p)
          if (alive) setThumbUrl(url)
        }
      } catch { /* ignore */ }
    })()
    return () => { alive = false }
  }, [mediaId, thumbPath])

  // Compute CSS crop for the body bbox so the thumbnail zooms in on the
  // body rather than showing the whole frame — same approach as the face
  // cluster cards use.
  const cropStyle: React.CSSProperties = (() => {
    if (!bbox) return {}
    const expand = 0.1
    const x = Math.max(0, bbox.x - bbox.w * expand)
    const y = Math.max(0, bbox.y - bbox.h * expand)
    const w = Math.min(1 - x, bbox.w * (1 + expand * 2))
    const h = Math.min(1 - y, bbox.h * (1 + expand * 2))
    const scale = 1 / Math.max(w, h)
    return {
      objectFit: 'none' as const,
      objectPosition: `${-x * scale * 100}% ${-y * scale * 100}%`,
      transform: `scale(${scale})`,
      transformOrigin: 'top left',
    }
  })()

  return (
    <div className="aspect-square overflow-hidden rounded bg-black/40 border border-white/5 relative" title={filename}>
      {thumbUrl ? (
        <img
          src={thumbUrl}
          alt={filename}
          className="w-full h-full"
          style={cropStyle}
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full bg-black/30" />
      )}
    </div>
  )
}

function ClusterMediaCard({ media }: { media: ClusterMedia }) {
  const [thumbUrl, setThumbUrl] = useState('')
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const path = media.thumbPath ?? await window.api.media.generateThumb(media.mediaId)
        if (alive && path) {
          const url = await toFileUrlCached(path)
          if (alive) setThumbUrl(url)
        }
      } catch { /* ignore */ }
    })()
    return () => { alive = false }
  }, [media])
  return (
    <div className="rounded overflow-hidden bg-black/40 border border-white/10">
      <div className="aspect-square overflow-hidden">
        {thumbUrl ? (
          <img src={thumbUrl} alt={media.filename} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full bg-black/30" />
        )}
      </div>
      <div className="p-1 text-[9px] truncate text-[var(--muted)]" title={media.filename}>
        {media.filename}
      </div>
    </div>
  )
}

// ─── Watchlist tab ────────────────────────────────────────────────
//
// Whisparr-style performer watchlist UI. Lists watched performers,
// surfaces pending hits from the poll cycle, gives the user one-click
// approve / dismiss / queue actions.

interface WatchlistEntry {
  performerName: string
  faceClusterId: string | null
  sources: string[]
  enabled: boolean
  lastPolledAt: number | null
  nextPollAt: number | null
  pollIntervalHours: number
  addedAt: number
  notes: string | null
}

interface WatchlistHit {
  id: string
  performerName: string
  sourceName: string
  sourceId: string | null
  url: string
  title: string | null
  thumbUrl: string | null
  releasedAt: number | null
  discoveredAt: number
  status: 'pending' | 'queued' | 'dismissed' | 'downloaded'
  notes: string | null
}

const ALL_SOURCES = ['tpdb', 'reddit', 'bluesky', 'redgifs', 'e621', 'danbooru', 'gelbooru'] as const

function WatchlistTab({ showToast }: { showToast: (type: 'success' | 'error' | 'info' | 'warning', m: string) => void }) {
  const [entries, setEntries] = useState<WatchlistEntry[]>([])
  const [hits, setHits] = useState<WatchlistHit[]>([])
  const [loading, setLoading] = useState(true)
  const [polling, setPolling] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [addName, setAddName] = useState('')
  const [addSources, setAddSources] = useState<string[]>(['tpdb', 'reddit', 'bluesky'])
  const [filter, setFilter] = useState<'all' | 'pending'>('pending')

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [e, h] = await Promise.all([
        window.api.watchlistList?.({}),
        window.api.watchlistHits?.(filter === 'pending' ? { status: 'pending', limit: 200 } : { limit: 200 }),
      ])
      setEntries(Array.isArray(e) ? e as WatchlistEntry[] : [])
      setHits(Array.isArray(h) ? h as WatchlistHit[] : [])
    } catch (err: any) {
      showToast('error', err?.message ?? 'Failed to load watchlist')
    } finally {
      setLoading(false)
    }
  }, [filter, showToast])

  useEffect(() => { refresh() }, [refresh])

  const handleAdd = useCallback(async () => {
    const name = addName.trim()
    if (!name) return
    try {
      const r = await window.api.watchlistAdd?.({
        performerName: name,
        sources: addSources,
        pollIntervalHours: 24,
      })
      if (r?.ok) {
        showToast('success', `Watching "${name}" across ${addSources.length} source${addSources.length === 1 ? '' : 's'}`)
        setAddOpen(false)
        setAddName('')
        refresh()
      } else {
        showToast('error', r?.error ?? 'Failed to add')
      }
    } catch (err: any) {
      showToast('error', err?.message ?? 'Failed to add')
    }
  }, [addName, addSources, showToast, refresh])

  const handlePoll = useCallback(async () => {
    setPolling(true)
    try {
      const stats = await window.api.watchlistPollNow?.({ maxPerformers: 5 })
      if (stats) {
        showToast(
          stats.hitsRecorded > 0 ? 'success' : 'info',
          `Polled ${stats.performersPolled} performers · ${stats.hitsRecorded} new hits (${stats.hitsAlreadyKnown} already known, ${stats.sourceErrors} errors)`
        )
        refresh()
      }
    } catch (err: any) {
      showToast('error', err?.message ?? 'Poll failed')
    } finally {
      setPolling(false)
    }
  }, [refresh, showToast])

  const handleSetHitStatus = useCallback(async (hitId: string, status: WatchlistHit['status']) => {
    try {
      await window.api.watchlistHitStatus?.({ hitId, status })
      setHits((prev) => prev.filter((h) => h.id !== hitId))
    } catch (err: any) {
      showToast('error', err?.message ?? 'Update failed')
    }
  }, [showToast])

  const handleRemove = useCallback(async (performerName: string) => {
    try {
      await window.api.watchlistRemove?.(performerName)
      showToast('success', `Removed "${performerName}" from watchlist`)
      refresh()
    } catch (err: any) {
      showToast('error', err?.message ?? 'Remove failed')
    }
  }, [refresh, showToast])

  return (
    <div className="space-y-6">
      {/* Header + actions */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setAddOpen(true)}
            className="text-xs px-3 py-1.5 rounded bg-[var(--primary)] text-white hover:opacity-90 inline-flex items-center gap-1.5"
          >
            <Plus size={12} /> Watch performer
          </button>
          <button
            onClick={handlePoll}
            disabled={polling || entries.length === 0}
            className="text-xs px-3 py-1.5 rounded bg-emerald-600/80 text-white hover:bg-emerald-600 disabled:opacity-40 inline-flex items-center gap-1.5"
            title="Poll all enabled performers across configured sources right now."
          >
            {polling ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />}
            {polling ? 'Polling…' : 'Poll now'}
          </button>
        </div>
        <div className="flex items-center gap-1 bg-black/20 rounded-md p-0.5 border border-[var(--border)]">
          {(['pending', 'all'] as const).map((opt) => (
            <button
              key={opt}
              onClick={() => setFilter(opt)}
              className={cn(
                'px-2.5 py-1 rounded text-[11px] font-medium transition',
                filter === opt ? 'bg-[var(--primary)] text-white' : 'text-[var(--muted)] hover:text-white'
              )}
            >
              {opt === 'pending' ? 'Pending hits' : 'All hits'}
            </button>
          ))}
        </div>
      </div>

      {/* Add modal */}
      {addOpen && (
        <div className="rounded-lg bg-[var(--panel)] border border-white/10 p-4 space-y-3">
          <div className="font-medium text-sm">Add performer to watchlist</div>
          <input
            autoFocus
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            placeholder="performer name (lowercase, matches performer:NAME tag)"
            className="w-full px-3 py-2 text-sm rounded bg-white/5 border border-[var(--border)] focus:border-[var(--primary)] focus:outline-none"
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setAddOpen(false) }}
          />
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] mb-1.5">Sources</div>
            <div className="flex flex-wrap gap-1.5">
              {ALL_SOURCES.map((s) => (
                <button
                  key={s}
                  onClick={() => setAddSources((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s])}
                  className={cn(
                    'px-2 py-1 rounded text-[11px] transition',
                    addSources.includes(s)
                      ? 'bg-[var(--primary)]/30 border border-[var(--primary)] text-white'
                      : 'bg-black/20 border border-[var(--border)] text-[var(--muted)] hover:text-white'
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={() => { setAddOpen(false); setAddName('') }}
              className="text-xs px-3 py-1.5 rounded bg-white/5 hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={!addName.trim() || addSources.length === 0}
              className="text-xs px-3 py-1.5 rounded bg-[var(--primary)] text-white hover:opacity-90 disabled:opacity-40"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {/* Watched performers */}
      <div>
        <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <Users size={14} /> Watched performers ({entries.length})
        </h2>
        {loading ? (
          <div className="text-center text-[var(--muted)] py-8">
            <Loader2 size={24} className="mx-auto mb-2 animate-spin" />
            Loading…
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center text-[var(--muted)] py-8 text-sm">
            No performers watched yet. Click "Watch performer" above.
          </div>
        ) : (
          <div className="rounded-lg bg-[var(--panel)] border border-white/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-wider text-[var(--muted)] bg-black/20">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Performer</th>
                  <th className="text-left px-3 py-2 font-medium">Sources</th>
                  <th className="text-right px-3 py-2 font-medium">Last poll</th>
                  <th className="text-right px-3 py-2 font-medium">Every</th>
                  <th className="text-right px-3 py-2 font-medium w-12"></th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.performerName} className="border-t border-white/5 hover:bg-white/[0.02]">
                    <td className="px-3 py-2 font-medium">{e.performerName}</td>
                    <td className="px-3 py-2 text-xs text-[var(--muted)]">{e.sources.join(', ')}</td>
                    <td className="px-3 py-2 text-right text-xs text-[var(--muted)] tabular-nums">
                      {e.lastPolledAt ? new Date(e.lastPolledAt * 1000).toLocaleString() : 'never'}
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-[var(--muted)] tabular-nums">
                      {e.pollIntervalHours}h
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => handleRemove(e.performerName)}
                        className="p-1 rounded hover:bg-red-500/20 text-red-300"
                        title="Remove from watchlist"
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Hits */}
      <div>
        <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <Search size={14} /> {filter === 'pending' ? 'Pending hits' : 'All hits'} ({hits.length})
        </h2>
        {hits.length === 0 ? (
          <div className="text-center text-[var(--muted)] py-8 text-sm">
            {filter === 'pending'
              ? 'No pending hits. Click "Poll now" to check for new uploads.'
              : 'No hits yet.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {hits.map((h) => (
              <div key={h.id} className="rounded-lg bg-[var(--panel)] border border-white/10 overflow-hidden flex flex-col">
                {h.thumbUrl ? (
                  <a href={h.url} target="_blank" rel="noreferrer" className="block aspect-video bg-black/30 overflow-hidden">
                    <img src={h.thumbUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                  </a>
                ) : (
                  <a href={h.url} target="_blank" rel="noreferrer" className="block aspect-video bg-black/30" />
                )}
                <div className="p-3 flex-1 flex flex-col gap-2">
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-[var(--muted)]">
                    <span>{h.sourceName}</span>
                    <span>{h.releasedAt ? new Date(h.releasedAt * 1000).toLocaleDateString() : ''}</span>
                  </div>
                  <div className="text-xs font-medium line-clamp-2" title={h.title ?? ''}>
                    {h.title ?? '(no title)'}
                  </div>
                  <div className="text-[11px] text-[var(--muted)]">
                    <span className="font-semibold">{h.performerName}</span>
                    {h.notes ? <span className="ml-2 opacity-70">{h.notes}</span> : null}
                  </div>
                  <div className="mt-auto flex items-center gap-1 pt-1">
                    <a
                      href={h.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 text-center text-xs px-2 py-1 rounded bg-[var(--primary)]/20 hover:bg-[var(--primary)]/30 text-white"
                    >
                      Open
                    </a>
                    <button
                      onClick={() => handleSetHitStatus(h.id, 'queued')}
                      className="text-xs px-2 py-1 rounded bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-100"
                      title="Mark as queued (won't show in pending anymore)"
                    >
                      <Check size={12} />
                    </button>
                    <button
                      onClick={() => handleSetHitStatus(h.id, 'dismissed')}
                      className="text-xs px-2 py-1 rounded bg-red-500/20 hover:bg-red-500/40 text-red-200"
                      title="Dismiss"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
