// File: src/renderer/components/MediaExporter.tsx
// Export media with format conversion and quality options

import React, { useState, useCallback } from 'react'
import { Download, Film, Image as ImageIcon, Settings, Loader2, Check, FolderOpen, FileVideo, FileImage, Maximize, Compress, Zap } from 'lucide-react'

type VideoFormat = 'mp4' | 'webm' | 'mkv' | 'gif'
type ImageFormat = 'jpg' | 'png' | 'webp' | 'gif'
type Quality = 'low' | 'medium' | 'high' | 'original'
interface ExportSettings { format: VideoFormat | ImageFormat; quality: Quality; resolution?: string; fps?: number; startTime?: number; endTime?: number; removeAudio?: boolean }
interface MediaExporterProps { mediaType: 'video' | 'image'; mediaPath: string; duration?: number; onExport: (settings: ExportSettings, outputPath: string) => Promise<void>; className?: string }

export function MediaExporter({ mediaType, mediaPath, duration, onExport, className = '' }: MediaExporterProps) {
  const [settings, setSettings] = useState<ExportSettings>({ format: mediaType === 'video' ? 'mp4' : 'jpg', quality: 'high' })
  const [outputPath, setOutputPath] = useState('')
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [done, setDone] = useState(false)

  const videoFormats: VideoFormat[] = ['mp4', 'webm', 'mkv', 'gif']
  const imageFormats: ImageFormat[] = ['jpg', 'png', 'webp', 'gif']
  const formats = mediaType === 'video' ? videoFormats : imageFormats
  const qualities: Array<{ id: Quality; label: string; desc: string }> = [
    { id: 'original', label: 'Original', desc: 'No conversion' },
    { id: 'high', label: 'High', desc: '1080p / 90%' },
    { id: 'medium', label: 'Medium', desc: '720p / 75%' },
    { id: 'low', label: 'Low', desc: '480p / 60%' }
  ]
  const resolutions = ['original', '3840x2160', '1920x1080', '1280x720', '854x480', '640x360']
  const fpsOptions = [60, 30, 24, 15]

  const handleExport = useCallback(async () => {
    if (!outputPath) return
    setExporting(true); setProgress(0); setDone(false)
    const interval = setInterval(() => setProgress(p => Math.min(p + 10, 90)), 500)
    try {
      await onExport(settings, outputPath)
      setProgress(100); setDone(true)
    } catch (e) { console.error('Export failed:', e) }
    finally { clearInterval(interval); setExporting(false) }
  }, [settings, outputPath, onExport])

  const selectOutput = useCallback(async () => {
    const filters = mediaType === 'video'
      ? [{ name: 'Video Files', extensions: [settings.format] }]
      : [{ name: 'Image Files', extensions: [settings.format] }]

    const selected = await window.api.fs.saveFile({
      title: 'Save Exported Media',
      defaultPath: `export.${settings.format}`,
      filters
    })
    if (selected) {
      setOutputPath(selected)
    }
  }, [settings.format, mediaType])

  return (
    <div className={`bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2"><Download size={16} className="text-[var(--primary)]" /><span className="font-semibold text-sm">Export Media</span></div>
        {mediaType === 'video' ? <FileVideo size={16} className="text-zinc-500" /> : <FileImage size={16} className="text-zinc-500" />}
      </div>
      <div className="p-4 space-y-4">
        {/* Format */}
        <div><label className="text-xs text-zinc-500">Format</label>
          <div className="flex gap-2 mt-2">{formats.map(f => <button key={f} onClick={() => setSettings(s => ({ ...s, format: f }))} className={`px-3 py-2 rounded text-sm uppercase ${settings.format === f ? 'bg-[var(--primary)]' : 'bg-zinc-800'}`}>{f}</button>)}</div>
        </div>
        {/* Quality */}
        <div><label className="text-xs text-zinc-500">Quality</label>
          <div className="grid grid-cols-4 gap-2 mt-2">{qualities.map(q => <button key={q.id} onClick={() => setSettings(s => ({ ...s, quality: q.id }))} className={`py-2 rounded text-center ${settings.quality === q.id ? 'bg-[var(--primary)]' : 'bg-zinc-800'}`}><div className="text-sm">{q.label}</div><div className="text-[10px] opacity-60">{q.desc}</div></button>)}</div>
        </div>
        {/* Video options */}
        {mediaType === 'video' && settings.quality !== 'original' && <div className="grid grid-cols-2 gap-4">
          <div><label className="text-xs text-zinc-500">Resolution</label><select value={settings.resolution || 'original'} onChange={e => setSettings(s => ({ ...s, resolution: e.target.value }))} className="w-full mt-1 px-3 py-2 bg-zinc-800 rounded text-sm">{resolutions.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
          <div><label className="text-xs text-zinc-500">FPS</label><select value={settings.fps || 30} onChange={e => setSettings(s => ({ ...s, fps: parseInt(e.target.value) }))} className="w-full mt-1 px-3 py-2 bg-zinc-800 rounded text-sm">{fpsOptions.map(f => <option key={f} value={f}>{f} fps</option>)}</select></div>
        </div>}
        {/* Trim (video) */}
        {mediaType === 'video' && duration && <div><label className="text-xs text-zinc-500">Trim (optional)</label>
          <div className="flex items-center gap-2 mt-2">
            <input type="number" min={0} max={duration} step={0.1} placeholder="Start" value={settings.startTime || ''} onChange={e => setSettings(s => ({ ...s, startTime: parseFloat(e.target.value) || undefined }))} className="flex-1 px-3 py-2 bg-zinc-800 rounded text-sm" />
            <span className="text-zinc-500">to</span>
            <input type="number" min={0} max={duration} step={0.1} placeholder="End" value={settings.endTime || ''} onChange={e => setSettings(s => ({ ...s, endTime: parseFloat(e.target.value) || undefined }))} className="flex-1 px-3 py-2 bg-zinc-800 rounded text-sm" />
          </div>
        </div>}
        {/* Options */}
        {mediaType === 'video' && <label className="flex items-center gap-2"><input type="checkbox" checked={settings.removeAudio} onChange={e => setSettings(s => ({ ...s, removeAudio: e.target.checked }))} className="accent-[var(--primary)]" /><span className="text-sm">Remove audio</span></label>}
        {/* Output path */}
        <div><label className="text-xs text-zinc-500">Output</label>
          <div className="flex gap-2 mt-1"><input value={outputPath} onChange={e => setOutputPath(e.target.value)} placeholder="Select output location..." className="flex-1 px-3 py-2 bg-zinc-800 rounded text-sm" /><button onClick={selectOutput} className="px-3 py-2 bg-zinc-800 rounded"><FolderOpen size={14} /></button></div>
        </div>
        {/* Progress */}
        {exporting && <div><div className="flex items-center justify-between text-xs mb-1"><span className="text-zinc-500">Exporting...</span><span>{progress}%</span></div><div className="h-2 bg-zinc-800 rounded-full overflow-hidden"><div className="h-full bg-[var(--primary)] transition-all" style={{ width: `${progress}%` }} /></div></div>}
        {/* Export button */}
        <button onClick={handleExport} disabled={!outputPath || exporting} className="w-full flex items-center justify-center gap-2 py-3 rounded bg-[var(--primary)] text-sm disabled:opacity-50">
          {exporting ? <Loader2 size={16} className="animate-spin" /> : done ? <Check size={16} /> : <Download size={16} />}
          {exporting ? 'Exporting...' : done ? 'Done!' : 'Export'}
        </button>
      </div>
    </div>
  )
}
export default MediaExporter
