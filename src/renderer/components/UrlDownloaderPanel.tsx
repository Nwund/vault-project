// File: src/renderer/components/UrlDownloaderPanel.tsx
// URL video downloader panel with progress tracking

import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  Download,
  X,
  Link,
  Play,
  Trash2,
  FolderOpen,
  Plus,
  AlertCircle,
  CheckCircle,
  Loader2,
  Clock,
  Smartphone,
  Monitor,
  Import
} from 'lucide-react'
import { formatDuration } from '../utils/formatters'

interface DownloadItem {
  id: string
  url: string
  title: string
  status: 'queued' | 'downloading' | 'processing' | 'completed' | 'error'
  progress: number
  speed: string
  eta: string
  outputPath: string | null
  error: string | null
  thumbnailUrl: string | null
  fileSize: string | null
  duration: string | null
  createdAt: number
  source: 'desktop' | 'mobile'
}

interface UrlDownloaderPanelProps {
  isOpen: boolean
  onClose: () => void
}

export function UrlDownloaderPanel({ isOpen, onClose }: UrlDownloaderPanelProps) {
  const [downloads, setDownloads] = useState<DownloadItem[]>([])
  const [urlInput, setUrlInput] = useState('')
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null)
  const [ytdlpVersion, setYtdlpVersion] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Check yt-dlp availability
  const checkAvailability = useCallback(async () => {
    try {
      const result = await window.api.urlDownloader.checkAvailability()
      setIsAvailable(result.available)
      setYtdlpVersion(result.version || null)
    } catch (e) {
      setIsAvailable(false)
    }
  }, [])

  // Load downloads
  const loadDownloads = useCallback(async () => {
    try {
      const items = await window.api.urlDownloader.getDownloads()
      setDownloads(items)
    } catch (e) {
      console.error('Failed to load downloads:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  // Initialize
  useEffect(() => {
    if (isOpen) {
      checkAvailability()
      loadDownloads()
    }
  }, [isOpen, checkAvailability, loadDownloads])

  // Subscribe to events
  useEffect(() => {
    const unsubs = [
      window.api.urlDownloader.onAdded((item: DownloadItem) => {
        setDownloads(prev => [item, ...prev])
      }),
      window.api.urlDownloader.onStarted((item: DownloadItem) => {
        setDownloads(prev => prev.map(d => d.id === item.id ? item : d))
      }),
      window.api.urlDownloader.onProgress((item: DownloadItem) => {
        setDownloads(prev => prev.map(d => d.id === item.id ? item : d))
      }),
      window.api.urlDownloader.onCompleted((item: DownloadItem) => {
        setDownloads(prev => prev.map(d => d.id === item.id ? item : d))
      }),
      window.api.urlDownloader.onError((item: DownloadItem) => {
        setDownloads(prev => prev.map(d => d.id === item.id ? item : d))
      }),
      window.api.urlDownloader.onCancelled((item: DownloadItem) => {
        setDownloads(prev => prev.map(d => d.id === item.id ? item : d))
      }),
    ]

    return () => unsubs.forEach(fn => fn())
  }, [])

  // Add download
  const handleAddDownload = async () => {
    const url = urlInput.trim()
    if (!url) return

    // Basic URL validation
    try {
      new URL(url)
    } catch {
      alert('Please enter a valid URL')
      return
    }

    setAdding(true)
    try {
      const result = await window.api.urlDownloader.addDownload(url)
      if (result.success) {
        setUrlInput('')
      } else {
        alert(`Failed to add download: ${result.error}`)
      }
    } catch (e: any) {
      alert(`Error: ${e.message}`)
    } finally {
      setAdding(false)
    }
  }

  // Handle paste
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        setUrlInput(text.trim())
        inputRef.current?.focus()
      }
    } catch {
      // Clipboard access denied
    }
  }

  // Remove download
  const handleRemove = async (id: string) => {
    await window.api.urlDownloader.removeDownload(id)
    setDownloads(prev => prev.filter(d => d.id !== id))
  }

  // Cancel download
  const handleCancel = async (id: string) => {
    await window.api.urlDownloader.cancelDownload(id)
  }

  // Open in folder
  const handleOpenFolder = async (id: string) => {
    await window.api.urlDownloader.openDownload(id)
  }

  // Import to library
  const handleImport = async (id: string) => {
    const result = await window.api.urlDownloader.importToLibrary(id)
    if (result.success) {
      alert('Imported to library successfully!')
    } else {
      alert(`Import failed: ${result.error}`)
    }
  }

  // Clear completed
  const handleClearCompleted = async () => {
    await window.api.urlDownloader.clearCompleted()
    loadDownloads()
  }

  // Get status icon
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'queued':
        return <Clock className="w-4 h-4 text-gray-400" />
      case 'downloading':
      case 'processing':
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />
      default:
        return <Download className="w-4 h-4 text-gray-400" />
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-zinc-900 border-l border-zinc-800 shadow-2xl z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Download className="w-5 h-5 text-blue-500" />
          <h2 className="font-semibold text-white">URL Downloader</h2>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-zinc-800 rounded-lg transition-colors"
        >
          <X className="w-5 h-5 text-gray-400" />
        </button>
      </div>

      {/* Status */}
      {isAvailable === false && (
        <div className="mx-4 mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
          <div className="flex items-center gap-2 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4" />
            <span>yt-dlp not found. Please install it or check the bundled version.</span>
          </div>
        </div>
      )}

      {ytdlpVersion && (
        <div className="px-4 pt-2 text-xs text-gray-500">
          yt-dlp {ytdlpVersion}
        </div>
      )}

      {/* URL Input */}
      <div className="p-4 border-b border-zinc-800">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              ref={inputRef}
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddDownload()}
              placeholder="Paste video URL..."
              className="w-full pl-10 pr-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              disabled={!isAvailable}
            />
          </div>
          <button
            onClick={handlePaste}
            className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-gray-400 hover:text-white transition-colors"
            title="Paste from clipboard"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={handleAddDownload}
            disabled={!urlInput.trim() || adding || !isAvailable}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white font-medium transition-colors flex items-center gap-2"
          >
            {adding ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Supports 1000+ sites including Twitter/X, PH, xv, xh, and more
        </p>
      </div>

      {/* Downloads List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
          </div>
        ) : downloads.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-500">
            <Download className="w-12 h-12 mb-3 opacity-50" />
            <p>No downloads yet</p>
            <p className="text-sm">Paste a URL above to start</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800">
            {downloads.map((item) => (
              <div key={item.id} className="p-4 hover:bg-zinc-800/50 transition-colors">
                {/* Title & Source */}
                <div className="flex items-start gap-3">
                  {/* Thumbnail or status icon */}
                  <div className="flex-shrink-0 w-16 h-10 bg-zinc-800 rounded overflow-hidden flex items-center justify-center">
                    {item.thumbnailUrl ? (
                      <img
                        src={item.thumbnailUrl}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      getStatusIcon(item.status)
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium text-white truncate" title={item.title}>
                        {item.title}
                      </h3>
                      {item.source === 'mobile' && (
                        <span title="From mobile">
                          <Smartphone className="w-3 h-3 text-purple-400 flex-shrink-0" />
                        </span>
                      )}
                      {item.source === 'desktop' && (
                        <span title="From desktop">
                          <Monitor className="w-3 h-3 text-blue-400 flex-shrink-0" />
                        </span>
                      )}
                    </div>

                    {/* Progress */}
                    {(item.status === 'downloading' || item.status === 'processing') && (
                      <div className="mt-2">
                        <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                          <span>{item.progress.toFixed(1)}%</span>
                          <span>
                            {item.speed && `${item.speed} • `}
                            {item.eta && `ETA ${item.eta}`}
                          </span>
                        </div>
                        <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 transition-all duration-300"
                            style={{ width: `${item.progress}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Info */}
                    <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                      {item.fileSize && <span>{item.fileSize}</span>}
                      {item.duration && <span>{item.duration}</span>}
                      {item.status === 'error' && (
                        <span className="text-red-400" title={item.error || undefined}>
                          {item.error || 'Download failed'}
                        </span>
                      )}
                      {item.status === 'completed' && (
                        <span className="text-green-400">Completed</span>
                      )}
                      {item.status === 'queued' && (
                        <span className="text-gray-400">Queued</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-3 flex items-center gap-2">
                  {item.status === 'completed' && (
                    <>
                      <button
                        onClick={() => handleOpenFolder(item.id)}
                        className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-xs text-gray-400 hover:text-white flex items-center gap-1.5"
                      >
                        <FolderOpen className="w-3 h-3" />
                        Open
                      </button>
                      <button
                        onClick={() => handleImport(item.id)}
                        className="px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600/30 rounded text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1.5"
                      >
                        <Import className="w-3 h-3" />
                        Import
                      </button>
                    </>
                  )}
                  {(item.status === 'downloading' || item.status === 'queued') && (
                    <button
                      onClick={() => handleCancel(item.id)}
                      className="px-2.5 py-1 bg-zinc-800 hover:bg-red-600/20 rounded text-xs text-gray-400 hover:text-red-400"
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    onClick={() => handleRemove(item.id)}
                    className="p-1 hover:bg-zinc-700 rounded text-gray-500 hover:text-red-400 ml-auto"
                    title="Remove"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {downloads.some(d => d.status === 'completed' || d.status === 'error') && (
        <div className="p-4 border-t border-zinc-800">
          <button
            onClick={handleClearCompleted}
            className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm text-gray-400 hover:text-white transition-colors"
          >
            Clear Completed
          </button>
        </div>
      )}
    </div>
  )
}
