// File: src/renderer/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import Detached from './Detached'
import { ToastProvider, ToastContainer } from './contexts'
import { ConfirmProvider } from './components/ConfirmDialog'
import './index.css'

// @fontsource bundles each Google Font as woff2 we can serve locally — works
// offline, avoids any CSP / network issues that would block fonts.googleapis.com.
// Each import pulls in @font-face declarations matching the font's canonical name,
// so the fontFamily strings in App.tsx caption presets resolve to real glyphs.
import '@fontsource/anton'
import '@fontsource/audiowide'
import '@fontsource/bangers'
import '@fontsource/bebas-neue'
import '@fontsource/black-ops-one'
import '@fontsource/bowlby-one'
import '@fontsource/bowlby-one-sc'
import '@fontsource/bubblegum-sans'
import '@fontsource/bungee'
import '@fontsource/bungee-spice'
import '@fontsource/cinzel'
import '@fontsource/creepster'
import '@fontsource/faster-one'
import '@fontsource/fredoka'
import '@fontsource/inter'
import '@fontsource/major-mono-display'
import '@fontsource/manrope'
import '@fontsource/monoton'
import '@fontsource/nosifer'
import '@fontsource/pacifico'
import '@fontsource/playfair-display'
import '@fontsource/roboto-slab'
import '@fontsource/sacramento'
import '@fontsource/vt323'
import '@fontsource/wallpoet'

function getDetachId(): string | null {
  const h = window.location.hash || ''
  if (!h.startsWith('#detach=')) return null
  return decodeURIComponent(h.slice('#detach='.length))
}

const detachId = getDetachId()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ToastProvider>
      <ConfirmProvider>
        {detachId ? <Detached mediaId={detachId} /> : <App />}
        {/* Renders toasts emitted via useToast() imported from '../contexts'.
            App.tsx has its own local ToastContext + container for App-tree
            components that import the local useToast(). Two containers
            coexist; each shows only its own toasts. */}
        <ToastContainer />
      </ConfirmProvider>
    </ToastProvider>
  </React.StrictMode>
)
