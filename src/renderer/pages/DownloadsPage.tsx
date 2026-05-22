// File: src/renderer/pages/DownloadsPage.tsx
//
// URL downloader page (yt-dlp wrapper). Extracted from App.tsx as part
// of #48 phase B. See docs/APP_TSX_SPLIT_PLAN.md.

import { useState, useEffect, useRef, useCallback } from 'react'
import { AlertCircle, CheckCircle2, Clipboard, Clock, Download, FolderOpen, FolderPlus, Link, Loader2, Trash2 } from 'lucide-react'
import { useToast } from '../contexts'

type VideoQualityOption = 'best' | '1080p' | '720p' | '480p' | 'audio'

interface DownloadItemType {
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

export function DownloadsPage() {
  const { showToast } = useToast()
  const [downloads, setDownloads] = useState<DownloadItemType[]>([])
  const [urlInput, setUrlInput] = useState('')
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null)
  const [ytdlpVersion, setYtdlpVersion] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [quality, setQuality] = useState<VideoQualityOption>('best')
  const [autoImport, setAutoImport] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const autoImportRef = useRef(autoImport)

  useEffect(() => { autoImportRef.current = autoImport }, [autoImport])

  const checkAvailability = useCallback(async () => {
    try {
      const result = await window.api.urlDownloader.checkAvailability()
      setIsAvailable(result.available)
      setYtdlpVersion(result.version || null)
    } catch {
      setIsAvailable(false)
    }
  }, [])

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

  useEffect(() => {
    checkAvailability()
    loadDownloads()
    inputRef.current?.focus()
  }, [checkAvailability, loadDownloads])

  useEffect(() => {
    const unsubs = [
      window.api.urlDownloader.onAdded((item: DownloadItemType) => {
        setDownloads(prev => [item, ...prev])
      }),
      window.api.urlDownloader.onStarted((item: DownloadItemType) => {
        setDownloads(prev => prev.map(d => d.id === item.id ? item : d))
      }),
      window.api.urlDownloader.onProgress((item: DownloadItemType) => {
        setDownloads(prev => prev.map(d => d.id === item.id ? item : d))
      }),
      window.api.urlDownloader.onCompleted(async (item: DownloadItemType) => {
        setDownloads(prev => prev.map(d => d.id === item.id ? item : d))
        if (autoImportRef.current) {
          try {
            const result = await window.api.urlDownloader.importToLibrary(item.id)
            if (result.success) {
              showToast('success', `Auto-imported: ${item.title}`)
            }
          } catch (e) {
            console.error('Auto-import failed:', e)
          }
        }
      }),
      window.api.urlDownloader.onError((item: DownloadItemType) => {
        setDownloads(prev => prev.map(d => d.id === item.id ? item : d))
      }),
      window.api.urlDownloader.onCancelled((item: DownloadItemType) => {
        setDownloads(prev => prev.map(d => d.id === item.id ? item : d))
      }),
    ]
    return () => unsubs.forEach(fn => fn())
  }, [showToast])

  // Pick up a pending URL handed off via sessionStorage from elsewhere
  // in the app (Rule34Page's "save tube embed" route). The dispatcher
  // navigates here separately; we just drain the key on mount.
  useEffect(() => {
    try {
      const pending = sessionStorage.getItem('vault.pendingDownloadUrl')
      if (!pending) return
      sessionStorage.removeItem('vault.pendingDownloadUrl')
      const trimmed = pending.trim()
      if (!trimmed) return
      try { new URL(trimmed) } catch { return }
      setUrlInput(trimmed)
      void (window.api.urlDownloader.addDownload(trimmed, {
        quality: quality === 'audio' ? 'best' : quality,
        audioOnly: quality === 'audio',
      }) as Promise<{ success: boolean; error?: string }>).then((result) => {
        if (result.success) {
          setUrlInput('')
          showToast('success', 'Download added to queue')
        } else {
          showToast('error', `Failed: ${result.error}`)
        }
      })
    } catch { /* ignore */ }
    // Only on mount — we intentionally don't depend on quality so a
    // later quality change doesn't re-fire an already-queued URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleAddDownload = async () => {
    const url = urlInput.trim()
    if (!url) return
    try { new URL(url) } catch { showToast('error', 'Please enter a valid URL'); return }

    setAdding(true)
    try {
      const result = await window.api.urlDownloader.addDownload(url, {
        quality: quality === 'audio' ? 'best' : quality,
        audioOnly: quality === 'audio',
      })
      if (result.success) {
        setUrlInput('')
        showToast('success', 'Download added to queue')
      } else {
        showToast('error', `Failed: ${result.error}`)
      }
    } catch (e: unknown) {
      showToast('error', (e as Error).message || 'Failed to add download')
    } finally {
      setAdding(false)
    }
  }

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) { setUrlInput(text.trim()); inputRef.current?.focus(); showToast('info', 'Pasted from clipboard') }
    } catch { showToast('error', 'Clipboard access denied') }
  }

  const handleRemove = async (id: string) => {
    await window.api.urlDownloader.removeDownload(id)
    setDownloads(prev => prev.filter(d => d.id !== id))
  }

  const handleCancel = async (id: string) => {
    await window.api.urlDownloader.cancelDownload(id)
  }

  const handleOpenFolder = async (id: string) => {
    await window.api.urlDownloader.openDownload(id)
  }

  const handleImport = async (id: string) => {
    const result = await window.api.urlDownloader.importToLibrary(id)
    if (result.success) { showToast('success', 'Imported to library') }
    else { showToast('error', `Import failed: ${result.error}`) }
  }

  const handleClearCompleted = async () => {
    await window.api.urlDownloader.clearCompleted()
    loadDownloads()
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'queued': return <Clock className="w-5 h-5 text-zinc-400" />
      case 'downloading':
      case 'processing': return <Loader2 className="w-5 h-5 text-[var(--primary)] animate-spin" />
      case 'completed': return <CheckCircle2 className="w-5 h-5 text-emerald-400" />
      case 'error': return <AlertCircle className="w-5 h-5 text-red-400" />
      default: return <Download className="w-5 h-5 text-zinc-400" />
    }
  }

  return (
    <div className="h-full w-full flex flex-col overflow-x-hidden">
      {/* Header */}
      <div className="p-6 border-b border-[var(--border)]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Download className="w-8 h-8 text-[var(--primary)]" />
            <div>
              <h1 className="text-2xl font-bold">Downloads</h1>
              <p className="text-sm text-[var(--muted)]">Download videos from URLs using yt-dlp</p>
            </div>
          </div>
          {ytdlpVersion && (
            <span className="text-xs text-[var(--muted)] bg-[var(--surface)] px-3 py-1 rounded-full">
              yt-dlp {ytdlpVersion}
            </span>
          )}
        </div>

        {isAvailable === false && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4" />
            <span>yt-dlp not found. Please install it or check the bundled version.</span>
          </div>
        )}

        {/* URL Input */}
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Link className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--muted)]" />
            <input
              ref={inputRef}
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddDownload()}
              placeholder="Paste video URL here..."
              className="w-full pl-12 pr-4 py-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl text-[var(--text)] placeholder-[var(--muted)] focus:outline-none focus:border-[var(--primary)]"
              disabled={!isAvailable}
            />
          </div>
          <select
            value={quality}
            onChange={(e) => setQuality(e.target.value as VideoQualityOption)}
            className="px-4 py-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl text-[var(--text)] focus:outline-none focus:border-[var(--primary)] cursor-pointer"
          >
            <option value="best">Best Quality</option>
            <option value="1080p">1080p</option>
            <option value="720p">720p</option>
            <option value="480p">480p</option>
            <option value="audio">Audio Only</option>
          </select>
          <button
            onClick={handlePaste}
            className="px-4 py-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--primary)] transition-colors"
            title="Paste from clipboard"
          >
            <Clipboard className="w-5 h-5" />
          </button>
          <button
            onClick={handleAddDownload}
            disabled={!urlInput.trim() || adding || !isAvailable}
            className="px-6 py-3 bg-[var(--primary)] hover:bg-[var(--primary)]/80 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-white font-medium transition-colors flex items-center gap-2"
          >
            {adding ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
            <span>Download</span>
          </button>
        </div>

        {/* Options */}
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="text-[var(--muted)]">Supports 1000+ sites including Twitter/X, YouTube, and more</span>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoImport}
              onChange={(e) => setAutoImport(e.target.checked)}
              className="w-4 h-4 rounded border-[var(--border)] bg-[var(--surface)] text-[var(--primary)] focus:ring-[var(--primary)]"
            />
            <span className="text-[var(--muted)]">Auto-import to library</span>
          </label>
        </div>
      </div>

      {/* Downloads List */}
      <div className="flex-1 overflow-y-auto p-6 pb-safe">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-8 h-8 text-[var(--muted)] animate-spin" />
          </div>
        ) : downloads.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-[var(--muted)]">
            <Download className="w-16 h-16 mb-4 opacity-30" />
            <p className="text-lg">No downloads yet</p>
            <p className="text-sm">Paste a URL above to start downloading</p>
          </div>
        ) : (
          <div className="space-y-3">
            {downloads.map((item) => (
              <div key={item.id} className="p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl hover:border-[var(--primary)]/30 transition-colors">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-24 h-16 bg-black/30 rounded-lg overflow-hidden flex items-center justify-center">
                    {item.thumbnailUrl ? (
                      <img src={item.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      getStatusIcon(item.status)
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-[var(--text)] truncate" title={item.title}>
                        {item.title}
                      </h3>
                      {item.source === 'mobile' && (
                        <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 text-[10px] rounded-full">Mobile</span>
                      )}
                    </div>

                    {(item.status === 'downloading' || item.status === 'processing') && (
                      <div className="mt-2">
                        <div className="flex items-center justify-between text-xs text-[var(--muted)] mb-1">
                          <span>{item.progress.toFixed(1)}%</span>
                          <span>{item.speed && `${item.speed}`} {item.eta && `• ETA ${item.eta}`}</span>
                        </div>
                        <div className="h-2 bg-black/30 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[var(--primary)] transition-all duration-300"
                            style={{ width: `${item.progress}%` }}
                          />
                        </div>
                      </div>
                    )}

                    <div className="mt-1 flex items-center gap-4 text-xs text-[var(--muted)]">
                      {item.fileSize && <span>{item.fileSize}</span>}
                      {item.duration && <span>{item.duration}</span>}
                      {item.status === 'error' && <span className="text-red-400">{item.error || 'Download failed'}</span>}
                      {item.status === 'completed' && <span className="text-green-400">Completed</span>}
                      {item.status === 'queued' && <span>Queued</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {item.status === 'completed' && (
                      <>
                        <button
                          onClick={() => handleOpenFolder(item.id)}
                          className="px-3 py-1.5 bg-[var(--surface)] hover:bg-[var(--border)] border border-[var(--border)] rounded-lg text-sm flex items-center gap-1.5"
                        >
                          <FolderOpen className="w-4 h-4" />
                          Open
                        </button>
                        <button
                          onClick={() => handleImport(item.id)}
                          className="px-3 py-1.5 bg-[var(--primary)]/20 hover:bg-[var(--primary)]/30 border border-[var(--primary)]/30 rounded-lg text-sm text-[var(--primary)] flex items-center gap-1.5"
                        >
                          <FolderPlus className="w-4 h-4" />
                          Import
                        </button>
                      </>
                    )}
                    {(item.status === 'downloading' || item.status === 'queued') && (
                      <button
                        onClick={() => handleCancel(item.id)}
                        className="px-3 py-1.5 bg-[var(--surface)] hover:bg-red-500/20 border border-[var(--border)] hover:border-red-500/30 rounded-lg text-sm text-[var(--muted)] hover:text-red-400"
                      >
                        Cancel
                      </button>
                    )}
                    <button
                      onClick={() => handleRemove(item.id)}
                      className="p-2 hover:bg-red-500/20 rounded-lg text-[var(--muted)] hover:text-red-400"
                      title="Remove"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {downloads.some(d => d.status === 'completed' || d.status === 'error') && (
        <div className="p-4 border-t border-[var(--border)]">
          <button
            onClick={handleClearCompleted}
            className="w-full py-2 bg-[var(--surface)] hover:bg-[var(--border)] border border-[var(--border)] rounded-xl text-sm text-[var(--muted)] hover:text-[var(--text)] transition-colors"
          >
            Clear Completed
          </button>
        </div>
      )}
    </div>
  )
}
