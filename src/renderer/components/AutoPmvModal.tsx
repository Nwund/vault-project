// File: src/renderer/components/AutoPmvModal.tsx
//
// Modal that drives the Auto-PMV pipeline:
//   - User enters up to 3 tags
//   - Picks BPM (auto-EDM-128 default), target duration, beats-per-clip
//   - Toggles AI POV caption generation
//   - Hits Generate → calls window.api.pmv.autoGenerate → returns a project
//     that the parent loads into the editor.

import React, { useEffect, useState } from 'react'
import { Sparkles, X, Loader2, Tag, Zap, Music, Clock, Wand2 } from 'lucide-react'
import { ModalShell } from './ModalShell'

export interface AutoPmvResult {
  bpm: number
  beatsPerClip: number
  totalBeats: number
  totalDurationSec: number
  clips: Array<{
    mediaId: string
    filename: string
    path: string
    startSec: number
    endSec: number
    beatStart: number
    beatEnd: number
    reason: string
    caption: string | null
    score: number
  }>
  meta: {
    tags: string[]
    candidatesConsidered: number
    clipsGenerated: number
    captionsGenerated: number
    captionsRequested: number
    warnings: string[]
  }
}

export interface AutoPmvModalProps {
  open: boolean
  onClose: () => void
  /** Called with the generator result so the parent can load it into the editor. */
  onGenerated: (result: AutoPmvResult) => void
}

const BPM_PRESETS: Array<{ label: string; bpm: number; vibe: string }> = [
  { label: 'Slow EDM',   bpm: 100, vibe: 'longer holds' },
  { label: 'House',      bpm: 124, vibe: 'classic dance floor' },
  { label: 'EDM',        bpm: 128, vibe: 'default — punchy' },
  { label: 'Drum & Bass', bpm: 174, vibe: 'fast, frenetic' },
  { label: 'Hardstyle',  bpm: 150, vibe: 'aggressive cuts' },
  { label: 'Trap',       bpm: 140, vibe: 'modern hard' }
]

const DURATION_PRESETS = [60, 90, 120, 180, 240]

const AutoPmvModal: React.FC<AutoPmvModalProps> = ({ open, onClose, onGenerated }) => {
  const [tag1, setTag1] = useState('')
  const [tag2, setTag2] = useState('')
  const [tag3, setTag3] = useState('')
  const [bpm, setBpm] = useState(128)
  const [beatsPerClip, setBeatsPerClip] = useState(2)
  const [targetDuration, setTargetDuration] = useState(90)
  const [generateCaptions, setGenerateCaptions] = useState(true)
  const [activeWindow, setActiveWindow] = useState(0.6)
  const [generating, setGenerating] = useState(false)
  const [warnings, setWarnings] = useState<string[]>([])
  const [allTags, setAllTags] = useState<Array<{ id: number; name: string; videoCount?: number }>>([])

  // Load tag list once on open so we can show suggestions.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      try {
        const list = await (window as any).api?.tags?.list?.()
        if (!cancelled && Array.isArray(list)) setAllTags(list)
      } catch {}
    })()
    return () => { cancelled = true }
  }, [open])

  const tags = [tag1, tag2, tag3].map((t) => t.trim()).filter(Boolean)

  const handleGenerate = async () => {
    if (tags.length === 0) {
      setWarnings(['Enter at least one tag.'])
      return
    }
    setGenerating(true)
    setWarnings([])
    try {
      const result = await (window as any).api?.pmv?.autoGenerate?.({
        tags,
        targetDurationSec: targetDuration,
        bpm,
        beatsPerClip,
        generateCaptions,
        videoActiveWindow: activeWindow
      }) as AutoPmvResult | null

      if (!result) {
        setWarnings(['Generation returned no result. Check logs.'])
        return
      }
      if (result.clips.length === 0) {
        setWarnings(result.meta?.warnings?.length ? result.meta.warnings : ['No videos matched these tags.'])
        return
      }
      if (result.meta?.warnings?.length) setWarnings(result.meta.warnings)
      onGenerated(result)
      onClose()
    } catch (err: any) {
      setWarnings([err?.message ?? 'Generation failed'])
    } finally {
      setGenerating(false)
    }
  }

  return (
    <ModalShell open={open} onClose={onClose} maxWidth="3xl" maxHeight="max-h-[92vh]" cardClassName="overflow-y-auto">
      <div>
        {/* Header */}
        <div className="sticky top-0 bg-[var(--panel)] z-10 px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wand2 size={20} className="text-fuchsia-400" />
            <h2 className="text-lg font-semibold">Auto PMV</h2>
            <span className="text-xs text-[var(--muted)]">— pick tags, AI does the rest</span>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 transition" title="Close (Esc)">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Tags */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Tag size={14} className="text-fuchsia-400" />
              <h3 className="text-sm font-medium">Three tags</h3>
              <span className="text-xs text-[var(--muted)]">— at least one is required</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <input
                value={tag1} onChange={(e) => setTag1(e.target.value)}
                placeholder="e.g. anal" list="all-tags"
                className="px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-sm focus:outline-none focus:border-fuchsia-500"
              />
              <input
                value={tag2} onChange={(e) => setTag2(e.target.value)}
                placeholder="e.g. milf" list="all-tags"
                className="px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-sm focus:outline-none focus:border-fuchsia-500"
              />
              <input
                value={tag3} onChange={(e) => setTag3(e.target.value)}
                placeholder="e.g. pov" list="all-tags"
                className="px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-sm focus:outline-none focus:border-fuchsia-500"
              />
            </div>
            <datalist id="all-tags">
              {allTags.slice(0, 200).map((t) => (
                <option key={t.id} value={t.name} />
              ))}
            </datalist>
          </div>

          {/* BPM presets */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Music size={14} className="text-fuchsia-400" />
              <h3 className="text-sm font-medium">BPM</h3>
              <span className="text-xs text-[var(--muted)]">— current: {bpm}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {BPM_PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => setBpm(p.bpm)}
                  className={`px-3 py-1.5 rounded-lg border text-xs transition ${
                    bpm === p.bpm
                      ? 'bg-fuchsia-500/30 border-fuchsia-500/50 text-fuchsia-100'
                      : 'bg-white/5 border-[var(--border)] hover:border-fuchsia-500/40'
                  }`}
                  title={p.vibe}
                >
                  <div>{p.label}</div>
                  <div className="text-[10px] text-[var(--muted)]">{p.bpm} BPM</div>
                </button>
              ))}
              <input
                type="number" min={60} max={220} value={bpm}
                onChange={(e) => setBpm(Math.max(60, Math.min(220, Number(e.target.value) || 128)))}
                className="px-3 py-1.5 rounded-lg bg-[var(--background)] border border-[var(--border)] text-xs w-20 text-center"
                title="Custom BPM (60-220)"
              />
            </div>
          </div>

          {/* Beats per clip */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Zap size={14} className="text-fuchsia-400" />
              <h3 className="text-sm font-medium">Beats per clip</h3>
              <span className="text-xs text-[var(--muted)]">
                — current: {beatsPerClip} ({(beatsPerClip * 60 / bpm).toFixed(2)}s each)
              </span>
            </div>
            <div className="flex gap-1.5">
              {[1, 2, 4, 8, 16].map((n) => (
                <button
                  key={n}
                  onClick={() => setBeatsPerClip(n)}
                  className={`flex-1 py-1.5 rounded-lg border text-xs transition ${
                    beatsPerClip === n
                      ? 'bg-fuchsia-500/30 border-fuchsia-500/50 text-fuchsia-100'
                      : 'bg-white/5 border-[var(--border)] hover:border-fuchsia-500/40'
                  }`}
                >
                  {n} {n === 1 ? 'beat' : 'beats'}
                </button>
              ))}
            </div>
          </div>

          {/* Total duration */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Clock size={14} className="text-fuchsia-400" />
              <h3 className="text-sm font-medium">Length</h3>
              <span className="text-xs text-[var(--muted)]">
                — {targetDuration}s = {Math.floor(targetDuration / (beatsPerClip * 60 / bpm))} clips
              </span>
            </div>
            <div className="flex gap-1.5">
              {DURATION_PRESETS.map((d) => (
                <button
                  key={d}
                  onClick={() => setTargetDuration(d)}
                  className={`flex-1 py-1.5 rounded-lg border text-xs transition ${
                    targetDuration === d
                      ? 'bg-fuchsia-500/30 border-fuchsia-500/50 text-fuchsia-100'
                      : 'bg-white/5 border-[var(--border)] hover:border-fuchsia-500/40'
                  }`}
                >
                  {d < 60 ? `${d}s` : `${(d / 60).toFixed(0)}m`}
                </button>
              ))}
            </div>
          </div>

          {/* Active window slider — how much of each video to draw from */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium">Use middle <span className="tabular-nums">{Math.round(activeWindow * 100)}%</span> of each video</h3>
              <span className="text-xs text-[var(--muted)]">— skip intros / outros</span>
            </div>
            <input
              type="range"
              min={0.3} max={1} step={0.05}
              value={activeWindow}
              onChange={(e) => setActiveWindow(parseFloat(e.target.value))}
              className="w-full h-2 rounded-full bg-white/10 appearance-none cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-fuchsia-500"
            />
          </div>

          {/* Captions toggle */}
          <div className="flex items-center justify-between rounded-lg bg-white/5 border border-[var(--border)] p-3">
            <div>
              <div className="text-sm font-medium flex items-center gap-1.5">
                <Sparkles size={14} className="text-fuchsia-400" />
                AI POV captions
              </div>
              <div className="text-xs text-[var(--muted)] mt-0.5">
                "you like when..." / "your gf has been..." style scenarios from Tier 2 vision.
              </div>
            </div>
            <button
              onClick={() => setGenerateCaptions(!generateCaptions)}
              className={`relative w-11 h-6 rounded-full transition ${generateCaptions ? 'bg-fuchsia-500' : 'bg-white/15'}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${generateCaptions ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          </div>

          {warnings.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200 space-y-1">
              {warnings.map((w, i) => <p key={i}>· {w}</p>)}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-[var(--panel)] border-t border-[var(--border)] px-6 py-4 flex justify-between items-center">
          <p className="text-xs text-[var(--muted)]">
            Generates a starter project — edit clips, swap captions, tweak effects after.
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition text-sm"
              disabled={generating}
            >
              Cancel
            </button>
            <button
              onClick={handleGenerate}
              disabled={generating || tags.length === 0}
              className="px-5 py-2 rounded-lg bg-gradient-to-r from-fuchsia-500 to-purple-500 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm flex items-center gap-2"
            >
              {generating ? (<><Loader2 size={14} className="animate-spin" />Generating…</>) : (<><Wand2 size={14} />Generate</>)}
            </button>
          </div>
        </div>
      </div>
    </ModalShell>
  )
}

export default AutoPmvModal
