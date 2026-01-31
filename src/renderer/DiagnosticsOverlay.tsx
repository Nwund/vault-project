// File: src/renderer/diagnostics/DiagnosticsOverlay.tsx
import React, { useEffect, useMemo, useState } from 'react'

type DiagnosticLevel = 'info' | 'warn' | 'error'
type DiagnosticEvent = {
  ts: number
  level: DiagnosticLevel
  source: 'main' | 'renderer'
  message: string
  meta?: Record<string, unknown>
}

function formatTime(ts: number) {
  const d = new Date(ts)
  return d.toLocaleTimeString([], { hour12: false })
}

function toLine(ev: DiagnosticEvent) {
  const meta = ev.meta ? ` ${JSON.stringify(ev.meta)}` : ''
  return `[${formatTime(ev.ts)}] ${ev.source.toUpperCase()} ${ev.level.toUpperCase()} ${ev.message}${meta}`
}

export function DiagnosticsOverlay() {
  const [open, setOpen] = useState(false)
  const [events, setEvents] = useState<DiagnosticEvent[]>([])
  const [snapshot, setSnapshot] = useState<any>(null)
  const [q, setQ] = useState('')

  useEffect(() => {
    let unsubEvent: undefined | (() => void)
    let unsubToggle: undefined | (() => void)

    ;(async () => {
      const data = await window.vaultDiagnostics.getSnapshot()
      setSnapshot((data as any).snapshot)
      setEvents(((data as any).buffer ?? []) as DiagnosticEvent[])
    })().catch(() => {
      // ignore
    })

    unsubEvent = window.vaultDiagnostics.onEvent((ev: any) => {
      setEvents((prev) => {
        const next = [...prev, ev]
        return next.length > 500 ? next.slice(next.length - 500) : next
      })
    })

    unsubToggle = window.vaultDiagnostics.onToggle(() => setOpen((v) => !v))

    return () => {
      unsubEvent?.()
      unsubToggle?.()
    }
  }, [])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return events
    return events.filter((e) => toLine(e).toLowerCase().includes(needle))
  }, [events, q])

  const copyAll = async () => {
    const header = snapshot ? JSON.stringify(snapshot, null, 2) : 'No snapshot'
    const body = filtered.map(toLine).join('\n')
    await navigator.clipboard.writeText(`${header}\n\n${body}`)
    window.vaultDiagnostics.log('info', 'Copied diagnostics to clipboard', { count: filtered.length })
  }

  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        justifyContent: 'flex-end',
        padding: 16,
        pointerEvents: 'none'
      }}
    >
      <div
        style={{
          width: 520,
          maxWidth: 'calc(100vw - 32px)',
          height: 'calc(100vh - 32px)',
          borderRadius: 20,
          background: 'rgba(20,20,22,0.72)',
          backdropFilter: 'blur(18px)',
          WebkitBackdropFilter: 'blur(18px)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.55)',
          border: '1px solid rgba(255,255,255,0.08)',
          overflow: 'hidden',
          pointerEvents: 'auto'
        }}
      >
        <div
          style={{
            padding: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            borderBottom: '1px solid rgba(255,255,255,0.07)'
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: 0.2, opacity: 0.92 }}>Diagnostics</div>

          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter…"
            style={{
              marginLeft: 'auto',
              width: 240,
              maxWidth: '50%',
              height: 30,
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.10)',
              background: 'rgba(255,255,255,0.06)',
              color: 'rgba(255,255,255,0.92)',
              padding: '0 10px',
              outline: 'none',
              fontSize: 12
            }}
          />

          <button
            onClick={copyAll}
            style={{
              height: 30,
              padding: '0 10px',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.10)',
              background: 'rgba(255,255,255,0.06)',
              color: 'rgba(255,255,255,0.92)',
              fontSize: 12,
              cursor: 'pointer'
            }}
          >
            Copy
          </button>

          <button
            onClick={() => setOpen(false)}
            style={{
              height: 30,
              padding: '0 10px',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.10)',
              background: 'rgba(255,255,255,0.06)',
              color: 'rgba(255,255,255,0.92)',
              fontSize: 12,
              cursor: 'pointer'
            }}
          >
            Close
          </button>
        </div>

        <div style={{ padding: 14, display: 'grid', gap: 10 }}>
          <div
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              fontSize: 11,
              opacity: 0.88,
              maxHeight: 120,
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              lineHeight: 1.35
            }}
          >
            {snapshot ? JSON.stringify(snapshot, null, 2) : 'Loading snapshot…'}
          </div>

          <div
            style={{
              height: 'calc(100vh - 240px)',
              overflow: 'auto',
              borderRadius: 14,
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(0,0,0,0.18)'
            }}
          >
            <div
              style={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                fontSize: 11,
                lineHeight: 1.45,
                padding: 12,
                whiteSpace: 'pre-wrap'
              }}
            >
              {filtered.length ? filtered.map((ev, idx) => <div key={idx}>{toLine(ev)}</div>) : 'No events.'}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
