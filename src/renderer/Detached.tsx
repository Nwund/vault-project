// File: src/renderer/Detached.tsx
import React, { useEffect, useMemo, useState } from 'react'

type MediaRow = {
  id: string
  path: string
  type: 'video' | 'image'
  filename: string
  durationSec?: number | null
  thumbPath?: string | null
}

export default function Detached(props: { mediaId: string }) {
  const [media, setMedia] = useState<MediaRow | null>(null)
  const [url, setUrl] = useState<string>('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      const d = await window.api.media.get(props.mediaId)
      if (!d?.media) return
      const u = await window.api.fs.toFileUrl(d.media.path)
      if (!alive) return
      setMedia(d.media)
      setUrl(u)
      document.title = `Vault • ${d.media.filename}`
    })()
    return () => {
      alive = false
    }
  }, [props.mediaId])

  const isVideo = useMemo(() => media?.type === 'video', [media?.type])

  if (!media) {
    return <div style={{ color: 'white', padding: 12, background: 'black', height: '100vh' }}>Loading…</div>
  }

  return (
    <div style={{ background: 'black', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={() => window.api.media.incO(media.id)} style={btnStyle}>+O</button>
        <button onClick={() => window.api.media.setRating(media.id, 5)} style={btnStyle}>★</button>
        <button onClick={() => window.api.fs.revealInFolder(media.path)} style={btnStyle}>Reveal</button>
        <div style={{ color: 'rgba(255,255,255,.7)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {media.filename}
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {isVideo ? (
          <video src={url} controls autoPlay style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        ) : (
          <img src={url} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        )}
      </div>
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,.08)',
  border: '1px solid rgba(255,255,255,.12)',
  color: 'white',
  padding: '6px 10px',
  borderRadius: 10,
  fontSize: 12,
  cursor: 'pointer'
}