// File: src/renderer/components/TopByAestheticCard.tsx
//
// Top-N by aesthetic score (#278). Reads the new media_stats.
// aestheticScore column populated by the aesthetic-predictor wired
// into the AI processing queue. Hidden until at least one item has
// been scored — keeps the Stats page from looking broken when the
// LAION weights aren't installed yet.

import React, { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'

interface AestheticItem {
  id: string
  filename: string
  thumbPath: string | null
  type: string
  aestheticScore: number
}

export function TopByAestheticCard(): React.JSX.Element | null {
  const [items, setItems] = useState<AestheticItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const r = await (window.api.media as any).topByAesthetic?.(20)
        if (!cancelled && r?.ok) setItems(r.items as AestheticItem[])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  if (loading) return null
  if (items.length === 0) return null

  return (
    <div className="mb-6 p-4 bg-gradient-to-br from-amber-500/10 to-pink-500/10 rounded-2xl border border-amber-500/20">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles size={16} className="text-amber-300" />
        <span className="text-sm font-semibold text-amber-200">Best looking · top {items.length}</span>
        <span className="text-[10px] text-[var(--muted)]">by LAION aesthetic predictor</span>
      </div>
      <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-10 gap-2">
        {items.map((m) => (
          <button
            key={m.id}
            onClick={() => {
              // Hand off to Library with this id pre-selected.
              try { sessionStorage.setItem('vault_pending_media', m.id) } catch { /* ignore */ }
              window.dispatchEvent(new CustomEvent('navigate-tab', { detail: 'library' }))
              setTimeout(() => window.dispatchEvent(new Event('vault_pending_media_check')), 150)
            }}
            className="aspect-square rounded-lg overflow-hidden bg-black/40 border border-white/5 hover:border-amber-400/50 transition-all hover:scale-[1.05] relative group"
            title={`${m.filename} · ${m.aestheticScore.toFixed(1)}/10`}
          >
            {m.thumbPath ? (
              <img src={`vault://${m.thumbPath}`} alt="" className="w-full h-full object-cover" loading="lazy" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[var(--muted)] text-[10px]">no thumb</div>
            )}
            <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-amber-500/85 text-white text-[10px] font-semibold tabular-nums shadow">
              {m.aestheticScore.toFixed(1)}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
