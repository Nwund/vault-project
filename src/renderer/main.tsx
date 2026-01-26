// File: src/renderer/main.tsx
import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import Detached from './Detached'
import SplashScreen from './components/SplashScreen'
import './index.css'

function getDetachId(): string | null {
  const h = window.location.hash || ''
  if (!h.startsWith('#detach=')) return null
  return decodeURIComponent(h.slice('#detach='.length))
}

// Root component that handles splash screen
const Root: React.FC = () => {
  const [showSplash, setShowSplash] = useState(true)
  const [appReady, setAppReady] = useState(false)

  useEffect(() => {
    // Pre-load settings and other initial data while splash shows
    const preload = async () => {
      try {
        // Preload critical data
        await window.api?.settings?.get?.()
      } catch (e) {
        // Ignore errors during preload
      }
      setAppReady(true)
    }
    preload()
  }, [])

  const handleSplashComplete = () => {
    // Only hide splash when both animation is done AND app is ready
    if (appReady) {
      setShowSplash(false)
    } else {
      // Wait for app to be ready
      const check = setInterval(() => {
        if (appReady) {
          clearInterval(check)
          setShowSplash(false)
        }
      }, 100)
    }
  }

  return (
    <>
      {showSplash && (
        <SplashScreen
          onComplete={handleSplashComplete}
          minDuration={2800}
        />
      )}
      <div style={{ opacity: showSplash ? 0 : 1, transition: 'opacity 0.3s ease-in' }}>
        <App />
      </div>
    </>
  )
}

const detachId = getDetachId()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {detachId ? <Detached mediaId={detachId} /> : <Root />}
  </React.StrictMode>
)
