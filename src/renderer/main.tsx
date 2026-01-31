// File: src/renderer/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import Detached from './Detached'
import './index.css'

function getDetachId(): string | null {
  const h = window.location.hash || ''
  if (!h.startsWith('#detach=')) return null
  return decodeURIComponent(h.slice('#detach='.length))
}

const detachId = getDetachId()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {detachId ? <Detached mediaId={detachId} /> : <App />}
  </React.StrictMode>
)
