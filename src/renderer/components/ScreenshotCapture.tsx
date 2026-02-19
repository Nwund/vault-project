// File: src/renderer/components/ScreenshotCapture.tsx
// Capture screenshots/frames from video with save and clipboard options

import React, { useState, useCallback, useRef } from 'react'
import {
  Camera,
  Download,
  Copy,
  Check,
  Image,
  Film,
  Crop,
  Settings,
  X,
  Clock,
  Folder
} from 'lucide-react'
import { formatDuration } from '../utils/formatters'

interface ScreenshotCaptureProps {
  videoRef: React.RefObject<HTMLVideoElement>
  mediaId: string
  filename: string
  onCapture?: (screenshot: CapturedScreenshot) => void
  className?: string
}

interface CapturedScreenshot {
  id: string
  dataUrl: string
  timestamp: number
  mediaId: string
  width: number
  height: number
  capturedAt: number
}

interface ScreenshotSettings {
  format: 'png' | 'jpeg' | 'webp'
  quality: number // 0-100 for jpeg/webp
  scale: number // 0.5, 1, 2
  autoCopy: boolean
  autoSave: boolean
  showPreview: boolean
}

const DEFAULT_SETTINGS: ScreenshotSettings = {
  format: 'png',
  quality: 90,
  scale: 1,
  autoCopy: false,
  autoSave: false,
  showPreview: true
}

export function ScreenshotCapture({
  videoRef,
  mediaId,
  filename,
  onCapture,
  className = ''
}: ScreenshotCaptureProps) {
  const [settings, setSettings] = useState<ScreenshotSettings>(() => {
    try {
      const saved = localStorage.getItem('vault-screenshot-settings')
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS
    } catch {
      return DEFAULT_SETTINGS
    }
  })
  const [showSettings, setShowSettings] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [lastCapture, setLastCapture] = useState<CapturedScreenshot | null>(null)
  const [copied, setCopied] = useState(false)
  const [saved, setSaved] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Save settings
  const updateSettings = useCallback((updates: Partial<ScreenshotSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...updates }
      localStorage.setItem('vault-screenshot-settings', JSON.stringify(next))
      return next
    })
  }, [])

  // Capture screenshot
  const capture = useCallback(async () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return null

    setCapturing(true)

    try {
      const ctx = canvas.getContext('2d')
      if (!ctx) return null

      // Set canvas size based on scale
      const width = video.videoWidth * settings.scale
      const height = video.videoHeight * settings.scale
      canvas.width = width
      canvas.height = height

      // Draw video frame
      ctx.drawImage(video, 0, 0, width, height)

      // Get data URL
      const mimeType = `image/${settings.format}`
      const quality = settings.format === 'png' ? undefined : settings.quality / 100
      const dataUrl = canvas.toDataURL(mimeType, quality)

      const screenshot: CapturedScreenshot = {
        id: `screenshot-${Date.now()}`,
        dataUrl,
        timestamp: video.currentTime,
        mediaId,
        width,
        height,
        capturedAt: Date.now()
      }

      setLastCapture(screenshot)
      onCapture?.(screenshot)

      // Auto actions
      if (settings.autoCopy) {
        await copyToClipboard(screenshot)
      }
      if (settings.autoSave) {
        await saveToFile(screenshot)
      }

      return screenshot
    } catch (e) {
      console.error('Failed to capture screenshot:', e)
      return null
    } finally {
      setCapturing(false)
    }
  }, [videoRef, settings, mediaId, onCapture])

  // Copy to clipboard
  const copyToClipboard = useCallback(async (screenshot?: CapturedScreenshot) => {
    const ss = screenshot || lastCapture
    if (!ss) return

    try {
      const blob = await fetch(ss.dataUrl).then(r => r.blob())
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob })
      ])
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (e) {
      console.error('Failed to copy to clipboard:', e)
    }
  }, [lastCapture])

  // Save to file
  const saveToFile = useCallback(async (screenshot?: CapturedScreenshot) => {
    const ss = screenshot || lastCapture
    if (!ss) return

    try {
      const baseName = filename.replace(/\.[^/.]+$/, '')
      const timestamp = formatDuration(ss.timestamp).replace(/:/g, '-')
      const extension = settings.format
      const suggestedName = `${baseName}_${timestamp}.${extension}`

      // Create download link
      const link = document.createElement('a')
      link.href = ss.dataUrl
      link.download = suggestedName
      link.click()

      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      console.error('Failed to save screenshot:', e)
    }
  }, [lastCapture, filename, settings.format])

  return (
    <div className={`relative ${className}`}>
      {/* Hidden canvas */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Capture button */}
      <button
        onClick={capture}
        disabled={capturing}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg transition ${
          capturing
            ? 'bg-zinc-700 text-zinc-400'
            : 'bg-zinc-800 hover:bg-zinc-700 text-white'
        }`}
        title="Capture screenshot"
      >
        {capturing ? (
          <div className="w-4 h-4 border-2 border-zinc-600 border-t-white rounded-full animate-spin" />
        ) : (
          <Camera size={16} />
        )}
        <span className="text-sm">Screenshot</span>
      </button>

      {/* Settings button */}
      <button
        onClick={() => setShowSettings(prev => !prev)}
        className="absolute -right-2 -top-2 p-1 rounded-full bg-zinc-700 hover:bg-zinc-600 transition"
      >
        <Settings size={10} />
      </button>

      {/* Settings panel */}
      {showSettings && (
        <div className="absolute top-full mt-2 right-0 w-64 bg-zinc-900 rounded-xl border border-zinc-700 shadow-xl overflow-hidden z-50">
          <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
            <span className="text-sm font-medium">Screenshot Settings</span>
            <button onClick={() => setShowSettings(false)}>
              <X size={14} />
            </button>
          </div>

          <div className="p-3 space-y-3">
            {/* Format */}
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Format</label>
              <div className="flex gap-1">
                {(['png', 'jpeg', 'webp'] as const).map(fmt => (
                  <button
                    key={fmt}
                    onClick={() => updateSettings({ format: fmt })}
                    className={`flex-1 py-1.5 rounded text-xs uppercase transition ${
                      settings.format === fmt
                        ? 'bg-[var(--primary)] text-white'
                        : 'bg-zinc-800 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {fmt}
                  </button>
                ))}
              </div>
            </div>

            {/* Quality (for jpeg/webp) */}
            {settings.format !== 'png' && (
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-zinc-400">Quality</span>
                  <span className="text-zinc-500">{settings.quality}%</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={100}
                  value={settings.quality}
                  onChange={e => updateSettings({ quality: parseInt(e.target.value) })}
                  className="w-full accent-[var(--primary)]"
                />
              </div>
            )}

            {/* Scale */}
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Scale</label>
              <div className="flex gap-1">
                {[0.5, 1, 2].map(scale => (
                  <button
                    key={scale}
                    onClick={() => updateSettings({ scale })}
                    className={`flex-1 py-1.5 rounded text-xs transition ${
                      settings.scale === scale
                        ? 'bg-[var(--primary)] text-white'
                        : 'bg-zinc-800 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {scale}x
                  </button>
                ))}
              </div>
            </div>

            {/* Auto options */}
            <div className="space-y-2">
              <label className="flex items-center justify-between">
                <span className="text-xs text-zinc-400">Auto-copy to clipboard</span>
                <button
                  onClick={() => updateSettings({ autoCopy: !settings.autoCopy })}
                  className={`w-8 h-5 rounded-full transition ${
                    settings.autoCopy ? 'bg-[var(--primary)]' : 'bg-zinc-700'
                  }`}
                >
                  <div className={`w-3 h-3 rounded-full bg-white transform transition ${
                    settings.autoCopy ? 'translate-x-4' : 'translate-x-1'
                  }`} />
                </button>
              </label>
              <label className="flex items-center justify-between">
                <span className="text-xs text-zinc-400">Show preview</span>
                <button
                  onClick={() => updateSettings({ showPreview: !settings.showPreview })}
                  className={`w-8 h-5 rounded-full transition ${
                    settings.showPreview ? 'bg-[var(--primary)]' : 'bg-zinc-700'
                  }`}
                >
                  <div className={`w-3 h-3 rounded-full bg-white transform transition ${
                    settings.showPreview ? 'translate-x-4' : 'translate-x-1'
                  }`} />
                </button>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Preview popup */}
      {lastCapture && settings.showPreview && (
        <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-right">
          <div className="bg-zinc-900 rounded-xl border border-zinc-700 shadow-2xl overflow-hidden w-64">
            {/* Preview image */}
            <div className="relative aspect-video bg-zinc-800">
              <img
                src={lastCapture.dataUrl}
                alt="Screenshot"
                className="w-full h-full object-contain"
              />
              <button
                onClick={() => setLastCapture(null)}
                className="absolute top-2 right-2 p-1 rounded-full bg-black/50 hover:bg-black/70 transition"
              >
                <X size={12} />
              </button>
            </div>

            {/* Actions */}
            <div className="p-2 flex gap-2">
              <button
                onClick={() => copyToClipboard()}
                className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs transition ${
                  copied
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-zinc-800 hover:bg-zinc-700'
                }`}
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
              <button
                onClick={() => saveToFile()}
                className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs transition ${
                  saved
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-zinc-800 hover:bg-zinc-700'
                }`}
              >
                {saved ? <Check size={12} /> : <Download size={12} />}
                {saved ? 'Saved!' : 'Save'}
              </button>
            </div>

            {/* Info */}
            <div className="px-2 pb-2 text-[10px] text-zinc-500 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Clock size={8} />
                {formatDuration(lastCapture.timestamp)}
              </span>
              <span>{lastCapture.width}×{lastCapture.height}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Quick screenshot button for player controls
export function QuickScreenshotButton({
  videoRef,
  onCapture,
  className = ''
}: {
  videoRef: React.RefObject<HTMLVideoElement>
  onCapture?: (dataUrl: string) => void
  className?: string
}) {
  const [capturing, setCapturing] = useState(false)
  const [success, setSuccess] = useState(false)

  const capture = useCallback(() => {
    const video = videoRef.current
    if (!video) return

    setCapturing(true)

    try {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      ctx.drawImage(video, 0, 0)
      const dataUrl = canvas.toDataURL('image/png')

      // Copy to clipboard
      canvas.toBlob(async (blob) => {
        if (blob) {
          try {
            await navigator.clipboard.write([
              new ClipboardItem({ [blob.type]: blob })
            ])
            setSuccess(true)
            setTimeout(() => setSuccess(false), 1500)
          } catch {}
        }
      })

      onCapture?.(dataUrl)
    } catch (e) {
      console.error('Screenshot failed:', e)
    } finally {
      setCapturing(false)
    }
  }, [videoRef, onCapture])

  return (
    <button
      onClick={capture}
      disabled={capturing}
      className={`p-2 rounded-lg transition ${
        success
          ? 'bg-green-500/20 text-green-400'
          : capturing
          ? 'bg-zinc-700 text-zinc-400'
          : 'bg-zinc-800 hover:bg-zinc-700 text-white'
      } ${className}`}
      title={success ? 'Copied to clipboard!' : 'Screenshot (copies to clipboard)'}
    >
      {success ? <Check size={16} /> : <Camera size={16} />}
    </button>
  )
}

export default ScreenshotCapture
