// File: src/renderer/components/HotkeyEditorCard.tsx
//
// #204 — Settings card that lets the user rebind any of the
// commonly-used Vault keyboard shortcuts. Records the next chord
// the user presses, stores it via useHotkeyOverrides, warns on
// conflicts, and offers a one-click Reset to defaults.
//
// Default chord strings here MUST match what the keyboard handlers
// in App.tsx / FloatingVideoPlayer.tsx already check for, so that
// `getEffectiveChord(actionId, defaultChord)` returns a chord the
// handlers know how to interpret.

import React, { useMemo, useState, useCallback, useEffect } from 'react'
import { Keyboard, RotateCcw, AlertTriangle, X as XIcon } from 'lucide-react'
import { useConfirm } from './ConfirmDialog'
import {
  useHotkeyOverrides,
  chordFromEvent,
  prettyChord,
} from '../hooks/useHotkeyOverrides'

type Action = {
  id: string
  label: string
  defaultChord: string
  category: 'Playback' | 'Navigation' | 'View' | 'Actions'
}

// Curated set of actions worth letting the user remap. Pulled from
// HotkeyHelp.tsx's HOTKEY_CATEGORIES — kept narrow to avoid surfacing
// every single chord (the modal panel + tag-grid handlers don't all
// route through a central registry yet).
const ACTIONS: Action[] = [
  { id: 'playPause',       label: 'Play / Pause',                  defaultChord: 'Space',        category: 'Playback' },
  { id: 'mute',            label: 'Mute / Unmute',                 defaultChord: 'M',            category: 'Playback' },
  { id: 'seekBack10',      label: 'Rewind 10 seconds',             defaultChord: 'J',            category: 'Playback' },
  { id: 'seekFwd10',       label: 'Forward 10 seconds',            defaultChord: 'L',            category: 'Playback' },
  { id: 'frameBack',       label: 'Frame backward (paused)',       defaultChord: ',',            category: 'Playback' },
  { id: 'frameFwd',        label: 'Frame forward (paused)',        defaultChord: '.',            category: 'Playback' },
  { id: 'speedDown',       label: 'Decrease playback speed',       defaultChord: '<',            category: 'Playback' },
  { id: 'speedUp',         label: 'Increase playback speed',       defaultChord: '>',            category: 'Playback' },
  { id: 'prevItem',        label: 'Previous item',                 defaultChord: 'ArrowLeft',    category: 'Navigation' },
  { id: 'nextItem',        label: 'Next item',                     defaultChord: 'ArrowRight',   category: 'Navigation' },
  { id: 'firstItem',       label: 'Go to first item',              defaultChord: 'G',            category: 'Navigation' },
  { id: 'lastItem',        label: 'Go to last item',               defaultChord: 'Shift+G',      category: 'Navigation' },
  { id: 'closeBack',       label: 'Close / Go back',               defaultChord: 'Escape',       category: 'Navigation' },
  { id: 'toggleFav',       label: 'Toggle favorite',               defaultChord: 'F',            category: 'Actions' },
  { id: 'openTagEditor',   label: 'Open tag editor',               defaultChord: 'T',            category: 'Actions' },
  { id: 'queueAdd',        label: 'Add to queue',                  defaultChord: 'Q',            category: 'Actions' },
  { id: 'playlistAdd',     label: 'Add to playlist',               defaultChord: 'P',            category: 'Actions' },
  { id: 'showInfo',        label: 'Show media info',               defaultChord: 'I',            category: 'Actions' },
  { id: 'screenshot',      label: 'Take screenshot',               defaultChord: 'S',            category: 'Actions' },
  { id: 'toggleFullscreen',label: 'Toggle fullscreen',             defaultChord: 'F11',          category: 'View' },
  { id: 'focusSearch',     label: 'Focus search',                  defaultChord: 'Ctrl+F',       category: 'View' },
  { id: 'commandPalette',  label: 'Open command palette',          defaultChord: 'Ctrl+K',       category: 'View' },
  { id: 'openSettings',    label: 'Open settings',                 defaultChord: 'Ctrl+,',       category: 'View' },
  { id: 'theaterMode',     label: 'Toggle theater mode',           defaultChord: 'Ctrl+Shift+T', category: 'View' },
  { id: 'compareMode',     label: 'Toggle compare mode',           defaultChord: 'C',            category: 'View' },
]

const CATEGORIES: Array<Action['category']> = ['Playback', 'Navigation', 'View', 'Actions']

export function HotkeyEditorCard(): React.JSX.Element {
  const confirm = useConfirm()
  const { map, set, clear, resetAll } = useHotkeyOverrides()
  const [recordingId, setRecordingId] = useState<string | null>(null)
  const [recentlySaved, setRecentlySaved] = useState<string | null>(null)

  const effective = useCallback(
    (a: Action) => map[a.id] ?? a.defaultChord,
    [map],
  )

  // Map chord → list of action labels using it. Used to warn the user
  // when a binding collides with another.
  const conflicts = useMemo(() => {
    const byChord: Record<string, string[]> = {}
    for (const a of ACTIONS) {
      const chord = effective(a)
      byChord[chord] = byChord[chord] ?? []
      byChord[chord].push(a.label)
    }
    return byChord
  }, [effective])

  // Keypress capture while a row is in record mode.
  useEffect(() => {
    if (!recordingId) return
    const onKey = (e: KeyboardEvent) => {
      // Esc cancels recording without saving.
      if (e.key === 'Escape') {
        e.preventDefault()
        setRecordingId(null)
        return
      }
      const chord = chordFromEvent(e)
      if (!chord) return
      e.preventDefault()
      e.stopPropagation()
      set(recordingId, chord)
      setRecentlySaved(recordingId)
      setRecordingId(null)
      setTimeout(() => setRecentlySaved((cur) => (cur === recordingId ? null : cur)), 1200)
    }
    // Capture-phase so we beat the rest of the app's keyboard handlers
    // (they'd otherwise eat Space/M/F/etc. while the user is rebinding).
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [recordingId, set])

  return (
    <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5 mt-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Keyboard size={16} className="text-[var(--primary)]" />
          <div className="text-sm font-semibold">Keyboard shortcuts</div>
        </div>
        <button
          onClick={async () => {
            const ok = await confirm({
              title: 'Reset all keyboard shortcuts?',
              body: 'All custom keybindings will revert to defaults.',
              confirmLabel: 'Reset',
              danger: true,
            })
            if (ok) resetAll()
          }}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition text-zinc-300"
        >
          <RotateCcw size={12} />
          Reset all
        </button>
      </div>

      <div className="text-xs text-[var(--muted)] mb-4">
        Click any shortcut and press the new key combination. Press <kbd className="px-1 py-0.5 bg-zinc-800 border border-[var(--border)] rounded text-[10px]">Esc</kbd> to cancel.
      </div>

      <div className="space-y-5">
        {CATEGORIES.map((cat) => {
          const rows = ACTIONS.filter((a) => a.category === cat)
          return (
            <div key={cat}>
              <div className="text-[11px] uppercase tracking-wide text-zinc-500 mb-2">{cat}</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {rows.map((a) => {
                  const chord = effective(a)
                  const isRecording = recordingId === a.id
                  const isOverride = map[a.id] !== undefined
                  const collisions = (conflicts[chord] ?? []).filter((l) => l !== a.label)
                  const justSaved = recentlySaved === a.id
                  return (
                    <div
                      key={a.id}
                      className={`flex items-center justify-between gap-2 p-2.5 rounded-lg border transition ${
                        isRecording
                          ? 'bg-[var(--primary)]/20 border-[var(--primary)]'
                          : justSaved
                            ? 'bg-emerald-500/10 border-emerald-500/40'
                            : 'bg-zinc-900/50 border-zinc-800 hover:border-[var(--border)]'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm truncate">{a.label}</div>
                        {collisions.length > 0 && (
                          <div className="mt-0.5 flex items-center gap-1 text-[10px] text-amber-400">
                            <AlertTriangle size={10} />
                            also bound to {collisions.join(', ')}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setRecordingId(isRecording ? null : a.id)}
                          className="px-2 py-1 rounded-md bg-zinc-800 border border-[var(--border)] hover:bg-zinc-700 transition text-xs font-mono min-w-[5.5rem] text-center"
                        >
                          {isRecording ? 'Press any key…' : prettyChord(chord)}
                        </button>
                        {isOverride && !isRecording && (
                          <button
                            onClick={() => clear(a.id)}
                            title="Reset to default"
                            className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition"
                          >
                            <XIcon size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
