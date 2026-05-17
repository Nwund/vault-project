// File: src/renderer/components/PlayerOverlayRail.tsx
//
// v2.7 player overlay rail — a side button strip that plugs the existing
// renderer utilities (lut-loader, ass-subtitle-overlay, vectorscope,
// useQuickLook, useStackMode) into the FloatingVideoPlayer without
// rewriting the player itself.
//
// Each overlay is fully self-contained: click a button to enable, click
// again to disable. State persists per-player-instance in localStorage
// so toggles survive minor reloads.
//
// Mount inside FloatingVideoPlayer's render tree, alongside the <video>:
//   <div className="relative">
//     <video ref={videoRef} ... />
//     <PlayerOverlayRail videoRef={videoRef} />
//   </div>
//
// The rail positions itself absolutely on the right edge.

import React, { useState, useEffect, useRef, useCallback, RefObject } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  Layers,
  Subtitles,
  ScanLine,
  Paintbrush,
  RotateCcw,
  X,
  Loader2,
  Sparkles,
} from 'lucide-react'
import { parseCube, attachLutCanvas, type CubeLut, type LutCanvasHandle } from '../utils/lut-loader'
import { attachOverlay, type AssOverlayHandle } from '../utils/ass-subtitle-overlay'
import { startScopes, type ScopeHandle } from '../utils/vectorscope'
import type { CockHeroBeatmap } from '../utils/cock-hero'
import { Music, Camera, Check, Activity } from 'lucide-react'
import { SPRINGS, FADE_SLIDE, SCALE_IN } from './network/motion-tokens'

// v2.7 — Beat overlay + body-part heatmap strip are lazy. The bpm-detector,
// mediapipe pieces, etc. only ship to the renderer when the user toggles
// those overlays on. Saves the player rail's initial parse time.
const CockHeroOverlay = React.lazy(() => import('./CockHeroOverlay').then((m) => ({ default: m.CockHeroOverlay })))
const HeatmapStrip = React.lazy(() => import('./HeatmapStrip').then((m) => ({ default: m.HeatmapStrip })))

interface PlayerOverlayRailProps {
  videoRef: RefObject<HTMLVideoElement | null>
  /** Optional persistence key. Defaults to a shared key — pass a unique
   *  string when multiple FloatingVideoPlayer instances coexist. */
  storageKey?: string
  /** Required for the heatmap overlay — needs a mediaId + duration to
   *  call window.api.tags.heatmap.build(). */
  mediaId?: string
  duration?: number
}

type OverlayId = 'lut' | 'subs' | 'scopes' | 'quicklook' | 'beats' | 'moment' | 'heatmap'

export function PlayerOverlayRail({ videoRef, storageKey = 'vault.player.overlays', mediaId, duration }: PlayerOverlayRailProps) {
  const [activeOverlay, setActiveOverlay] = useState<OverlayId | null>(null)

  // LUT state ----------------------------------------------------------------
  const [lutEnabled, setLutEnabled] = useState(false)
  const [lutName, setLutName] = useState<string | null>(null)
  const [lutStrength, setLutStrength] = useState(1)
  const [lutLoading, setLutLoading] = useState(false)
  const lutCanvasRef = useRef<HTMLCanvasElement>(null)
  const lutHandleRef = useRef<LutCanvasHandle | null>(null)

  // ASS subs state -----------------------------------------------------------
  const [subsEnabled, setSubsEnabled] = useState(false)
  const [subsName, setSubsName] = useState<string | null>(null)
  const subsHandleRef = useRef<AssOverlayHandle | null>(null)

  // Vectorscope state --------------------------------------------------------
  const [scopesEnabled, setScopesEnabled] = useState(false)
  const vectorscopeRef = useRef<HTMLCanvasElement>(null)
  const paradeRef = useRef<HTMLCanvasElement>(null)
  const scopesHandleRef = useRef<ScopeHandle | null>(null)

  // QuickLook state ----------------------------------------------------------
  const [quickLook, setQuickLook] = useState(false)

  // Cock-Hero state ----------------------------------------------------------
  const [beatsEnabled, setBeatsEnabled] = useState(false)
  const [beatmap, setBeatmap] = useState<CockHeroBeatmap | null>(null)
  const [beatsLoading, setBeatsLoading] = useState(false)

  // Moment capture state -----------------------------------------------------
  const [momentFlash, setMomentFlash] = useState(false)

  // Heatmap state ------------------------------------------------------------
  const [heatmapEnabled, setHeatmapEnabled] = useState(false)

  const onCaptureMoment = useCallback(async () => {
    const v = videoRef.current
    if (!v) return
    try {
      // Draw current frame to an offscreen canvas + encode as WebP
      const canvas = document.createElement('canvas')
      canvas.width = v.videoWidth || 1280
      canvas.height = v.videoHeight || 720
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.85))
      if (!blob) return
      const arr = new Uint8Array(await blob.arrayBuffer())
      const ts = new Date().toISOString().replace(/[:.]/g, '-')
      const filename = `moment-${ts}-${Math.floor(v.currentTime)}s.webp`
      await window.api.tags.moments.save({ filename, data: Array.from(arr) })
      setMomentFlash(true)
      setTimeout(() => setMomentFlash(false), 700)
    } catch (e) {
      console.warn('[overlay-rail] capture moment failed:', e)
    }
  }, [videoRef])

  const onGenerateBeats = useCallback(async () => {
    if (!videoRef.current?.src) return
    setBeatsLoading(true)
    try {
      // v2.7 — dynamic-import the BPM-detector pipeline only when the
      // user actually requests a beatmap. Keeps the player rail's initial
      // chunk lean for users who never use this overlay.
      const { generateCockHeroBeatmap } = await import('../utils/cock-hero')
      const m = await generateCockHeroBeatmap(videoRef.current.src, { maxAnalyzeSec: 180 })
      setBeatmap(m)
      if (m) setBeatsEnabled(true)
    } catch (e) {
      console.warn('[overlay-rail] beat gen failed:', e)
    } finally {
      setBeatsLoading(false)
    }
  }, [videoRef])

  const onBeatsOff = useCallback(() => {
    setBeatsEnabled(false)
  }, [])

  // ─── LUT loader ──────────────────────────────────────────────────────────
  const onPickLut = useCallback(async () => {
    setLutLoading(true)
    try {
      const filePath = await window.api.dialogOpenFile({
        title: 'Pick .cube LUT file',
        filters: [{ name: 'Cube LUT', extensions: ['cube'] }],
      })
      if (!filePath) return
      const text = await window.api.fs?.readFile?.(filePath, 'utf8')
                  ?? await fetch(`vault://file/${encodeURIComponent(filePath)}`).then(r => r.text())
      const lut = parseCube(text)
      if (!videoRef.current || !lutCanvasRef.current) return
      // Initialize the canvas to match video dims
      const v = videoRef.current
      lutCanvasRef.current.width = v.videoWidth || 1280
      lutCanvasRef.current.height = v.videoHeight || 720
      // Tear down previous handle if any
      try { lutHandleRef.current?.destroy() } catch { /* ignore */ }
      lutHandleRef.current = attachLutCanvas(v, lutCanvasRef.current, lut, lutStrength)
      setLutName(filePath.split(/[/\\]/).pop() ?? 'LUT')
      setLutEnabled(true)
    } catch (e) {
      console.error('[overlay-rail] LUT load failed:', e)
    } finally {
      setLutLoading(false)
    }
  }, [videoRef, lutStrength])

  const onLutStrength = useCallback((s: number) => {
    setLutStrength(s)
    lutHandleRef.current?.setStrength(s)
  }, [])

  const onLutOff = useCallback(() => {
    try { lutHandleRef.current?.destroy() } catch { /* ignore */ }
    lutHandleRef.current = null
    setLutEnabled(false)
    setLutName(null)
  }, [])

  // ─── ASS subtitle loader ─────────────────────────────────────────────────
  const onPickSubs = useCallback(async () => {
    try {
      const filePath = await window.api.dialogOpenFile({
        title: 'Pick .ass / .srt / .vtt subtitle file',
        filters: [{ name: 'Subtitles', extensions: ['ass', 'ssa', 'srt', 'vtt'] }],
      })
      if (!filePath || !videoRef.current) return
      try { subsHandleRef.current?.destroy() } catch { /* ignore */ }
      const subUrl = `vault://file/${encodeURIComponent(filePath)}`
      subsHandleRef.current = attachOverlay(videoRef.current, { subUrl })
      setSubsName(filePath.split(/[/\\]/).pop() ?? 'subs')
      setSubsEnabled(true)
    } catch (e) {
      console.error('[overlay-rail] subs load failed:', e)
    }
  }, [videoRef])

  const onSubsOff = useCallback(() => {
    try { subsHandleRef.current?.destroy() } catch { /* ignore */ }
    subsHandleRef.current = null
    setSubsEnabled(false)
    setSubsName(null)
  }, [])

  // ─── Vectorscope + parade ───────────────────────────────────────────────
  const onScopesOn = useCallback(() => {
    if (!videoRef.current || !vectorscopeRef.current || !paradeRef.current) return
    try { scopesHandleRef.current?.stop() } catch { /* ignore */ }
    scopesHandleRef.current = startScopes(videoRef.current, {
      vectorscopeCanvas: vectorscopeRef.current,
      paradeCanvas: paradeRef.current,
      analysisSize: 256,
    })
    setScopesEnabled(true)
  }, [videoRef])

  const onScopesOff = useCallback(() => {
    try { scopesHandleRef.current?.stop() } catch { /* ignore */ }
    scopesHandleRef.current = null
    setScopesEnabled(false)
  }, [])

  // ─── Quick Look (hold-Space briefly) ─────────────────────────────────────
  useEffect(() => {
    if (!quickLook) return
    const t = setTimeout(() => setQuickLook(false), 1800)
    return () => clearTimeout(t)
  }, [quickLook])

  // ─── Cleanup on unmount ─────────────────────────────────────────────────
  useEffect(() => () => {
    try { lutHandleRef.current?.destroy() } catch { /* ignore */ }
    try { subsHandleRef.current?.destroy() } catch { /* ignore */ }
    try { scopesHandleRef.current?.stop() } catch { /* ignore */ }
  }, [])

  // Persist enabled toggles across reloads (which utility was on)
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '{}')
      if (saved.scopes) onScopesOn()
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ scopes: scopesEnabled }))
    } catch { /* ignore */ }
  }, [storageKey, scopesEnabled])

  const buttons: Array<{ id: OverlayId; Icon: typeof Layers; label: string; active: boolean; tone: string }> = [
    { id: 'lut', Icon: Layers, label: 'LUT grade', active: lutEnabled, tone: 'from-amber-400 to-orange-500' },
    { id: 'subs', Icon: Subtitles, label: 'Subtitles', active: subsEnabled, tone: 'from-emerald-400 to-teal-500' },
    { id: 'scopes', Icon: ScanLine, label: 'Scopes', active: scopesEnabled, tone: 'from-cyan-400 to-blue-500' },
    { id: 'beats', Icon: Music, label: 'Beats (Cock-Hero)', active: beatsEnabled, tone: 'from-pink-400 to-rose-500' },
    { id: 'heatmap', Icon: Activity, label: 'Body-part heatmap', active: heatmapEnabled, tone: 'from-rose-400 to-red-500' },
    { id: 'quicklook', Icon: Sparkles, label: 'Quick Look', active: quickLook, tone: 'from-fuchsia-400 to-pink-500' },
    { id: 'moment', Icon: Camera, label: 'Capture moment', active: momentFlash, tone: 'from-lime-400 to-green-500' },
  ]

  return (
    <>
      {/* LUT canvas — always mounted, only painted when LUT active.
          Positioned absolutely so it sits on top of the video. */}
      <canvas
        ref={lutCanvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ display: lutEnabled ? 'block' : 'none' }}
      />

      {/* Scopes — two small canvases pinned to bottom-left when active */}
      <AnimatePresence>
        {scopesEnabled && (
          <motion.div
            {...SCALE_IN}
            className="absolute bottom-3 left-3 z-30 flex gap-2 pointer-events-none"
          >
            <div className="rounded-xl bg-black/60 backdrop-blur-md border border-white/10 p-1">
              <div className="text-[8px] uppercase tracking-wider text-cyan-300 px-1 pb-0.5">Vectorscope</div>
              <canvas ref={vectorscopeRef} width={120} height={120} className="rounded" />
            </div>
            <div className="rounded-xl bg-black/60 backdrop-blur-md border border-white/10 p-1">
              <div className="text-[8px] uppercase tracking-wider text-cyan-300 px-1 pb-0.5">RGB Parade</div>
              <canvas ref={paradeRef} width={180} height={120} className="rounded" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cock-Hero beat overlay — pulse rings synced to detected beats.
          Lazy-mounted only when there's actually a beatmap. */}
      <React.Suspense fallback={null}>
        {beatmap && beatsEnabled && (
          <CockHeroOverlay videoRef={videoRef} beatmap={beatmap} active={beatsEnabled} />
        )}

        {/* Body-part heatmap strip — pulled from tags.heatmap.build */}
        {mediaId && duration && duration > 0 && heatmapEnabled && (
          <HeatmapStrip
            mediaId={mediaId}
            duration={duration}
            videoRef={videoRef}
            active={heatmapEnabled}
          />
        )}
      </React.Suspense>

      {/* Moment capture flash — briefly shows a check icon center-screen */}
      <AnimatePresence>
        {momentFlash && (
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.4, opacity: 0 }}
            transition={SPRINGS.bouncy}
            className="absolute inset-0 grid place-items-center z-40 pointer-events-none"
          >
            <div className="size-24 rounded-full bg-lime-500/30 backdrop-blur-md border-2 border-lime-300 grid place-items-center shadow-xl shadow-lime-500/40">
              <Check size={48} className="text-lime-100" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quick Look flash — briefly enlarges visual focus */}
      <AnimatePresence>
        {quickLook && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            transition={SPRINGS.bouncy}
            className="absolute inset-0 pointer-events-none ring-4 ring-fuchsia-400/40 rounded-2xl"
            style={{ boxShadow: '0 0 80px rgba(232, 121, 249, 0.35) inset' }}
          />
        )}
      </AnimatePresence>

      {/* Right-edge button strip */}
      <div className="absolute right-2 top-1/2 -translate-y-1/2 z-40 flex flex-col gap-1.5">
        {buttons.map(({ id, Icon, label, active, tone }) => (
          <motion.button
            key={id}
            whileHover={{ scale: 1.08, x: -2 }}
            whileTap={{ scale: 0.94 }}
            onMouseEnter={() => {
              // v2.7 — prefetch the lazy chunks for hovered toggles so the
              // first click is instant.
              if (id === 'beats') {
                void import('./CockHeroOverlay')
                void import('../utils/cock-hero')
              } else if (id === 'heatmap') {
                void import('./HeatmapStrip')
              }
            }}
            onClick={() => {
              if (id === 'quicklook') {
                setQuickLook(true)
                return
              }
              if (id === 'moment') {
                onCaptureMoment()
                return
              }
              if (id === 'heatmap') {
                setHeatmapEnabled((v) => !v)
                return
              }
              setActiveOverlay((prev) => (prev === id ? null : id))
            }}
            title={label}
            aria-label={label}
            aria-pressed={active}
            className={`size-9 rounded-2xl grid place-items-center shadow-lg shadow-black/40 backdrop-blur-md transition-colors ${
              active
                ? `bg-gradient-to-br ${tone} text-white ring-2 ring-white/30`
                : 'bg-black/50 hover:bg-black/70 text-white/70 hover:text-white ring-1 ring-white/10'
            }`}
          >
            <Icon size={15} strokeWidth={active ? 2.4 : 2} />
          </motion.button>
        ))}
      </div>

      {/* Active overlay's configuration popover */}
      <AnimatePresence>
        {activeOverlay && activeOverlay !== 'quicklook' && (
          <motion.div
            {...FADE_SLIDE}
            className="absolute right-14 top-1/2 -translate-y-1/2 z-40 w-64 rounded-2xl bg-black/80 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/60 p-3 space-y-2"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold capitalize">
                {activeOverlay === 'lut' ? 'LUT grade' : activeOverlay === 'subs' ? 'Subtitles' : 'Scopes'}
              </span>
              <button
                onClick={() => setActiveOverlay(null)}
                aria-label="Close"
                className="p-0.5 rounded text-white/60 hover:text-white hover:bg-white/10"
              >
                <X size={12} />
              </button>
            </div>

            {activeOverlay === 'lut' && (
              <div className="space-y-2">
                <button
                  onClick={onPickLut}
                  disabled={lutLoading}
                  className="w-full px-2 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-100 text-[11px] font-medium flex items-center justify-center gap-1.5 transition disabled:opacity-50"
                >
                  {lutLoading ? <Loader2 size={11} className="animate-spin" /> : <Paintbrush size={11} />}
                  {lutName ? `Replace · ${lutName}` : 'Pick .cube file'}
                </button>
                {lutEnabled && (
                  <>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[10px] text-white/60">
                        <span>Strength</span>
                        <span className="tabular-nums">{Math.round(lutStrength * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={lutStrength * 100}
                        onChange={(e) => onLutStrength(Number(e.target.value) / 100)}
                        className="w-full accent-amber-400"
                      />
                    </div>
                    <button
                      onClick={onLutOff}
                      className="w-full text-[10px] text-white/60 hover:text-red-300 py-1 flex items-center justify-center gap-1"
                    >
                      <RotateCcw size={10} /> Disable LUT
                    </button>
                  </>
                )}
                <p className="text-[10px] text-white/40 leading-relaxed">
                  Adobe Cube LUTs only. Drag from anywhere — Vault parses the cube and applies it in real-time via WebGL2.
                </p>
              </div>
            )}

            {activeOverlay === 'subs' && (
              <div className="space-y-2">
                <button
                  onClick={onPickSubs}
                  className="w-full px-2 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-100 text-[11px] font-medium flex items-center justify-center gap-1.5 transition"
                >
                  <Subtitles size={11} />
                  {subsName ? `Replace · ${subsName}` : 'Pick subtitle file'}
                </button>
                {subsEnabled && (
                  <button
                    onClick={onSubsOff}
                    className="w-full text-[10px] text-white/60 hover:text-red-300 py-1 flex items-center justify-center gap-1"
                  >
                    <RotateCcw size={10} /> Disable subs
                  </button>
                )}
                <p className="text-[10px] text-white/40 leading-relaxed">
                  Karaoke-styled ASS/SSA via libass-wasm. SRT and VTT files load too.
                </p>
              </div>
            )}

            {activeOverlay === 'scopes' && (
              <div className="space-y-2">
                <button
                  onClick={scopesEnabled ? onScopesOff : onScopesOn}
                  className={`w-full px-2 py-1.5 rounded-lg text-[11px] font-medium flex items-center justify-center gap-1.5 transition ${
                    scopesEnabled
                      ? 'bg-red-500/20 hover:bg-red-500/30 text-red-100'
                      : 'bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-100'
                  }`}
                >
                  {scopesEnabled ? <><RotateCcw size={11} /> Disable scopes</> : <><ScanLine size={11} /> Enable scopes</>}
                </button>
                <p className="text-[10px] text-white/40 leading-relaxed">
                  Vectorscope (chroma cast) + RGB Parade (per-channel exposure). 30 fps via Canvas2D.
                </p>
              </div>
            )}

            {activeOverlay === 'beats' && (
              <div className="space-y-2">
                {!beatmap ? (
                  <button
                    onClick={onGenerateBeats}
                    disabled={beatsLoading}
                    className="w-full px-2 py-1.5 rounded-lg bg-pink-500/20 hover:bg-pink-500/30 text-pink-100 text-[11px] font-medium flex items-center justify-center gap-1.5 transition disabled:opacity-50"
                  >
                    {beatsLoading ? <Loader2 size={11} className="animate-spin" /> : <Music size={11} />}
                    {beatsLoading ? 'Analyzing audio…' : 'Generate beatmap'}
                  </button>
                ) : (
                  <>
                    <div className="rounded-lg bg-pink-500/10 border border-pink-500/20 p-2 text-[10px]">
                      <div className="flex items-center gap-2">
                        <span className="text-pink-300 font-bold tabular-nums">{beatmap.bpm}</span>
                        <span className="text-white/40">BPM</span>
                        <span className="text-white/30">·</span>
                        <span className="text-cyan-300 tabular-nums">{beatmap.beats.length}</span>
                        <span className="text-white/40">beats</span>
                      </div>
                      <div className="text-white/40 mt-0.5">
                        {beatmap.patternSummary.accentCount} accents · {beatmap.patternSummary.intensityArc} arc · conf {Math.round(beatmap.confidence * 100)}%
                      </div>
                    </div>
                    <button
                      onClick={() => setBeatsEnabled((v) => !v)}
                      className={`w-full px-2 py-1.5 rounded-lg text-[11px] font-medium flex items-center justify-center gap-1.5 transition ${
                        beatsEnabled
                          ? 'bg-red-500/20 hover:bg-red-500/30 text-red-100'
                          : 'bg-pink-500/20 hover:bg-pink-500/30 text-pink-100'
                      }`}
                    >
                      {beatsEnabled ? <><RotateCcw size={11} /> Disable overlay</> : <><Music size={11} /> Enable overlay</>}
                    </button>
                    <button
                      onClick={() => { setBeatmap(null); setBeatsEnabled(false) }}
                      className="w-full text-[10px] text-white/40 hover:text-white/70 py-0.5"
                    >
                      Regenerate
                    </button>
                  </>
                )}
                <p className="text-[10px] text-white/40 leading-relaxed">
                  BPM-detect from the audio track. Pulse rings flash on every beat;
                  accents are larger + hotter. Analyzes first 180s.
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
