// File: src/renderer/components/ScoreHistogramsCard.tsx
//
// Distribution histograms for the three media_stats score columns
// the AI processing queue now populates (aestheticScore, deepfakeProb,
// aiImageProb). Renders three 10-bucket sparkbars so the user can see
// at a glance how their library skews. Hidden when no rows have been
// scored at all.

import React, { useEffect, useState } from 'react'
import { BarChart3 } from 'lucide-react'

interface Histograms {
  aesthetic: number[] | null
  deepfake: number[] | null
  aiImage: number[] | null
}

function Sparkbar({ data, label, color, suffix }: { data: number[]; label: string; color: string; suffix?: string }) {
  const max = Math.max(1, ...data)
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-[var(--text)]">{label}</span>
        <span className="text-[10px] text-[var(--muted)] tabular-nums">{data.reduce((a, b) => a + b, 0).toLocaleString()} scored</span>
      </div>
      <div className="flex items-end gap-0.5 h-12">
        {data.map((n, i) => (
          <div
            key={i}
            className={`flex-1 rounded-t transition-all ${color}`}
            style={{ height: `${Math.max(2, (n / max) * 100)}%`, opacity: n === 0 ? 0.15 : 1 }}
            title={`Bin ${i}: ${n.toLocaleString()}`}
          />
        ))}
      </div>
      <div className="flex justify-between text-[9px] text-[var(--muted)] mt-0.5 tabular-nums">
        <span>0{suffix ?? ''}</span>
        <span>{suffix === '/10' ? '5' : '0.5'}</span>
        <span>{suffix === '/10' ? '10' : '1.0'}</span>
      </div>
    </div>
  )
}

export function ScoreHistogramsCard(): React.JSX.Element | null {
  const [data, setData] = useState<Histograms | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const r = await (window.api.media as any).scoreHistograms?.()
        if (!cancelled && r?.ok) setData({ aesthetic: r.aesthetic, deepfake: r.deepfake, aiImage: r.aiImage })
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  if (loading) return null
  if (!data || (!data.aesthetic && !data.deepfake && !data.aiImage)) return null

  return (
    <div className="mb-6 p-4 bg-gradient-to-br from-cyan-500/10 to-teal-600/10 rounded-2xl border border-cyan-500/20">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 size={16} className="text-cyan-300" />
        <span className="text-sm font-semibold text-cyan-200">Score distributions</span>
        <span className="text-[10px] text-[var(--muted)]">across the AI-processed library</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {data.aesthetic && <Sparkbar data={data.aesthetic} label="Aesthetic 0–10" color="bg-amber-500" suffix="/10" />}
        {data.aiImage && <Sparkbar data={data.aiImage} label="AI-image P(ai)" color="bg-fuchsia-500" />}
        {data.deepfake && <Sparkbar data={data.deepfake} label="Deepfake P(fake)" color="bg-red-500" />}
      </div>
    </div>
  )
}
