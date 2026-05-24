// File: src/renderer/components/SubscriptionsBellButton.tsx
//
// #113 — Bell icon for the sidebar / nav that surfaces the
// subscriptions inbox without requiring the user to dig into a
// dedicated page. Shows a red dot when there are new (undismissed,
// unsaved) inbox items.
//
// Click → opens the SubscriptionsPanel as a popover anchored to the
// bell. Click outside to dismiss.
//
// The panel itself (SubscriptionsPanel.tsx) lists all subscriptions,
// lets the user create/edit/delete them, and surfaces per-subscription
// new-post thumbnails with Save / Dismiss actions.

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import { SubscriptionsPanel } from './SubscriptionsPanel'
import { useVisibilityInterval } from '../hooks/useVisibilityInterval'

// Subset of the Browse tab's source registry — only stable JSON-API
// sources are listed here, since subscriptions need to keep working
// reliably across re-runs. Source ids MUST match BooruSource in
// booru-client.ts (e.g. 'yande.re' with the dot, not 'yandere').
const AVAILABLE_SOURCES = [
  { id: 'rule34', label: 'rule34' },
  { id: 'e621', label: 'e621' },
  { id: 'e926', label: 'e926 (SFW e621)' },
  { id: 'gelbooru', label: 'gelbooru' },
  { id: 'realbooru', label: 'realbooru' },
  { id: 'danbooru', label: 'danbooru' },
  { id: 'aibooru', label: 'aibooru' },
  { id: 'safebooru', label: 'safebooru' },
  { id: 'yande.re', label: 'yande.re' },
  { id: 'konachan', label: 'konachan' },
  { id: 'tbib', label: 'tbib' },
  { id: 'xbooru', label: 'xbooru' },
  { id: 'hypnohub', label: 'hypnohub' },
  { id: 'civitai', label: 'civitai' },
  { id: 'pixiv', label: 'pixiv' },
  { id: 'bluesky', label: 'bluesky' },
  { id: 'pullpush', label: 'reddit (pullpush)' },
  { id: 'paheal', label: 'paheal' },
  { id: 'coomer', label: 'coomer' },
  { id: 'kemono', label: 'kemono' },
  { id: 'eporner', label: 'eporner' },
  { id: 'redtube', label: 'redtube' },
  { id: 'redgifs', label: 'redgifs' },
]

export function SubscriptionsBellButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const popoverRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const refreshCount = useCallback(async () => {
    const api: any = (window as any).api
    if (!api?.subscriptionsInbox) return
    try {
      const r = await api.subscriptionsInbox({ pendingOnly: true, limit: 100 })
      setUnread((r?.items ?? []).length)
    } catch { /* IPC missing */ }
  }, [])

  useEffect(() => {
    const api: any = (window as any).api
    const off = api?.events?.onVaultChanged?.(() => { void refreshCount() })
    return () => { try { off?.() } catch {} }
  }, [refreshCount])
  // 60s tick — the background poller may land items without firing
  // vault:changed when no DB writes occur. Paused while tab hidden.
  useVisibilityInterval(refreshCount, 60_000)

  // Click-outside to close.
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node
      if (popoverRef.current?.contains(target)) return
      if (triggerRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div className={`relative ${className ?? ''}`}>
      <button
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-lg hover:bg-white/5 transition text-white/70 hover:text-white"
        title={unread > 0 ? `${unread} new subscription post${unread === 1 ? '' : 's'}` : 'Subscriptions'}
      >
        <Bell size={16} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-[var(--primary)] text-white text-[9px] font-semibold flex items-center justify-center">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div
          ref={popoverRef}
          className="absolute right-0 top-full mt-1 w-[420px] z-[101]"
        >
          <SubscriptionsPanel
            availableSources={AVAILABLE_SOURCES}
            onSaveToLibrary={async (item) => {
              // Best-effort save-to-library: route through the existing
              // urlDownloader (yt-dlp under the hood) when available;
              // fall back to opening the source page so the user can
              // save it from the booru's lightbox.
              const api: any = (window as any).api
              const url = item.fullUrl ?? item.thumbUrl ?? null
              if (!url) return
              try {
                if (api?.urlDownloader?.addDownload) {
                  await api.urlDownloader.addDownload(url, {})
                } else {
                  try { await api?.shell?.openExternal?.(item.sourcePageUrl ?? url) } catch { /* noop */ }
                }
              } catch { /* swallow — markSaved still fires from the panel */ }
            }}
          />
        </div>
      )}
    </div>
  )
}
