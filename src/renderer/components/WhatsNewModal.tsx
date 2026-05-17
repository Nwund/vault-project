'use memo'
// File: src/renderer/components/WhatsNewModal.tsx
//
// One-time "What's new in v2.7" splash. Tracks the last-seen version
// in localStorage and shows on first launch after a version bump.
// Includes deep-link buttons that fire `navigate-tab` and `open-tools`
// custom events so the user can jump straight to new surfaces without
// hunting through menus.

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  Sparkles,
  X,
  Settings as SettingsIcon,
  Activity,
  Layers,
  Music,
  Camera,
  ScanLine,
  Eye,
  Share2,
  Cpu,
  ArrowRight,
} from 'lucide-react'
import { useEscapeClose } from '../hooks/useEscapeClose'
import { SPRINGS, FADE_SLIDE, SCALE_IN } from './network/motion-tokens'

const CURRENT_VERSION = '2.7.0'
const STORAGE_KEY = 'vault.lastSeenVersion'

interface Highlight {
  Icon: typeof Sparkles
  title: string
  body: string
  tone: string
  action?: { label: string; navigateTab?: string }
}

const HIGHLIGHTS: Highlight[] = [
  {
    Icon: Share2,
    title: 'Decentralized sharing · 12 services',
    body: 'Iroh blob tickets, Hyperswarm device mesh, Helia IPFS pinning, Veilid private routing, Tor onion services, WebTransport HTTP/3, Nostr remote-signer, Syncthing control, Bluesky labeler, UnifiedPush distributor, IMAP inbox watcher, Video Diffusion bridge.',
    tone: 'from-fuchsia-500 to-purple-600',
    action: { label: 'Open Settings → Services', navigateTab: 'settings' },
  },
  {
    Icon: Cpu,
    title: 'AI generation + audits',
    body: 'Vault ML sidecar (Florence-2, DINOv3, Demucs, CodeFormer, MusicGen, Depth-Anything v2). JoyTag + Real-ESRGAN tagger cards. Quality auditor + Clip similarity tools in AI Tools.',
    tone: 'from-blue-500 to-violet-600',
    action: { label: 'Open AI Tools', navigateTab: 'ai' },
  },
  {
    Icon: Layers,
    title: 'Library — 8 new tools',
    body: 'Stack Mode (TikTok-style swipe pager) · Quick Look (hold Q) · Color Palette filter chip · Duplicate Triage (A/B picker) · Animated sub-library facet picker · Sprite-sheet Chapter editor · Export Pipeline (smart-query → transcode → sidecar → rclone) · SidecarWatcher status badge.',
    tone: 'from-emerald-500 to-cyan-600',
    action: { label: 'Open Library', navigateTab: 'library' },
  },
  {
    Icon: Music,
    title: 'Player — 7 overlay layers',
    body: 'LUT grade (.cube + strength) · Subtitles (libass-wasm) · Vectorscope + RGB parade · Cock-Hero beat pulses · Body-part heatmap timeline · Quick Look flash · Capture moment (frame → WebP).',
    tone: 'from-pink-500 to-rose-600',
  },
  {
    Icon: Activity,
    title: 'Performance + glue',
    body: 'Scrub thumbs now go through a MessagePort fast-path (ffmpeg + disk cache). View Transitions API on every page swap. React 19 + React Compiler (annotation mode) on 21 v2.7 components. Right-click menu: Share via Iroh, Pin to IPFS, Auto-tease, Deny for…, Feature less.',
    tone: 'from-amber-500 to-orange-600',
  },
]

export function WhatsNewModal() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    try {
      const last = localStorage.getItem(STORAGE_KEY)
      if (last !== CURRENT_VERSION) setOpen(true)
    } catch {
      /* ignore */
    }
  }, [])

  // v2.7 — listen for a global "show v2.7 What's New" event so users
  // can re-open the splash from CommandPalette.
  useEffect(() => {
    const handler = () => setOpen(true)
    window.addEventListener('vault:openWhatsNew', handler)
    return () => window.removeEventListener('vault:openWhatsNew', handler)
  }, [])

  const onClose = useCallback(() => {
    try { localStorage.setItem(STORAGE_KEY, CURRENT_VERSION) } catch { /* ignore */ }
    setOpen(false)
  }, [])

  const onAction = useCallback((navigateTab: string | undefined) => {
    if (navigateTab) {
      window.dispatchEvent(new CustomEvent('navigate-tab', { detail: navigateTab }))
    }
    onClose()
  }, [onClose])

  // v2.7 — prefetch the lazy page chunk for buttons the user might click.
  const prefetchTab = useCallback((tab: string | undefined) => {
    if (!tab) return
    switch (tab) {
      case 'settings': void import('../pages/SettingsPage'); break
      case 'ai': void import('../pages/AiTaggerPage'); break
      case 'library': /* eager */ break
    }
  }, [])

  useEscapeClose(open, onClose)

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          {...FADE_SLIDE}
          className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            {...SCALE_IN}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl max-h-[90vh] bg-zinc-950/95 border border-[var(--border)] rounded-3xl shadow-2xl shadow-black/60 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="px-6 py-5 border-b border-white/5 bg-gradient-to-br from-fuchsia-500/20 via-pink-500/15 to-orange-500/10">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <motion.div
                    initial={{ rotate: -8, scale: 0.85 }}
                    animate={{ rotate: 0, scale: 1 }}
                    transition={SPRINGS.bouncy}
                    className="size-11 rounded-2xl bg-gradient-to-br from-fuchsia-500 via-pink-500 to-orange-500 grid place-items-center shadow-lg shadow-fuchsia-500/40"
                  >
                    <Sparkles size={22} className="text-white drop-shadow" />
                  </motion.div>
                  <div>
                    <h2 className="text-xl font-bold">Vault v2.7</h2>
                    <p className="text-xs text-white/70 mt-0.5">
                      The integration sweep — 32 new components, 23 Settings cards, 7 player overlays
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  aria-label="Close"
                  className="p-1.5 rounded-lg hover:bg-white/10 transition"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Highlights */}
            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {HIGHLIGHTS.map((h, i) => (
                <motion.div
                  key={h.title}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.06 * i, ...SPRINGS.standard }}
                  className="rounded-2xl bg-white/[0.03] border border-white/5 p-4 flex gap-3"
                >
                  <div
                    className={`size-9 rounded-xl bg-gradient-to-br ${h.tone} grid place-items-center flex-shrink-0 shadow-md shadow-black/40`}
                  >
                    <h.Icon size={16} className="text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">{h.title}</div>
                    <p className="text-[11px] text-white/60 mt-0.5 leading-relaxed">{h.body}</p>
                    {h.action && (
                      <button
                        onClick={() => onAction(h.action!.navigateTab)}
                        onMouseEnter={() => prefetchTab(h.action?.navigateTab)}
                        className="mt-2 text-[11px] flex items-center gap-1 text-fuchsia-300 hover:text-fuchsia-200 hover:underline"
                      >
                        {h.action.label} <ArrowRight size={10} />
                      </button>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-white/5 bg-black/30 flex items-center justify-between">
              <div className="flex items-center gap-3 text-[10px] text-white/50">
                <span className="flex items-center gap-1"><Eye size={10} /> Hold Q</span>
                <span className="flex items-center gap-1"><Camera size={10} /> Capture moment</span>
                <span className="flex items-center gap-1"><ScanLine size={10} /> Scopes</span>
              </div>
              <button
                onClick={onClose}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-gradient-to-br from-fuchsia-600 to-pink-600 hover:from-fuchsia-500 hover:to-pink-500 text-white text-sm font-medium transition shadow-md"
              >
                <SettingsIcon size={13} />
                Let's go
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
