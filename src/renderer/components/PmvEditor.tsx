// File: src/renderer/components/PmvEditor.tsx
// PMV/HMV Editor - Phase 1: Video import, music import with waveform, BPM detection

import React, { useState, useCallback, useRef, useEffect } from 'react'
import {
  Plus,
  Music,
  Film,
  Trash2,
  Play,
  Pause,
  Upload,
  GripVertical,
  FolderOpen,
  X,
  RefreshCw,
  ChevronDown,
  Volume2,
  Loader2,
  AlertCircle,
  Library
} from 'lucide-react'
import { useWaveform } from '../hooks/useWaveform'
import { formatDuration } from '../utils/formatters'
import { toFileUrlCached } from '../hooks/usePerformance'
import { detectBpmFromBuffer, roundToCommonBpm } from '../utils/bpm-detector'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface PmvVideo {
  id: string
  path: string
  filename: string
  duration: number
  width: number
  height: number
  thumbnail: string | null
}

interface PmvMusic {
  path: string
  filename: string
  duration: number
}

interface PmvProject {
  videos: PmvVideo[]
  music: PmvMusic | null
  bpm: number
  bpmManualOverride: boolean
  bpmConfidence: number
}

const MAX_VIDEOS = 15

// ─────────────────────────────────────────────────────────────────────────────
// Helper Components
// ─────────────────────────────────────────────────────────────────────────────

function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ')
}

// Video thumbnail card in the left panel
const VideoCard = React.memo(function VideoCard({
  video,
  index,
  isSelected,
  onSelect,
  onRemove,
  onDragStart,
  onDragOver,
  onDrop
}: {
  video: PmvVideo
  index: number
  isSelected: boolean
  onSelect: () => void
  onRemove: () => void
  onDragStart: (e: React.DragEvent, index: number) => void
  onDragOver: (e: React.DragEvent, index: number) => void
  onDrop: (e: React.DragEvent, index: number) => void
}) {
  const [thumbUrl, setThumbUrl] = useState<string>('')

  useEffect(() => {
    if (video.thumbnail) {
      toFileUrlCached(video.thumbnail).then(url => {
        if (url) setThumbUrl(url)
      })
    }
  }, [video.thumbnail])

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={(e) => onDrop(e, index)}
      onClick={onSelect}
      className={cn(
        'group relative flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all',
        'hover:bg-zinc-800/60',
        isSelected ? 'bg-purple-500/20 ring-1 ring-purple-500/50' : 'bg-zinc-900/50'
      )}
    >
      {/* Drag handle */}
      <div className="cursor-grab active:cursor-grabbing text-zinc-500 hover:text-zinc-300">
        <GripVertical size={14} />
      </div>

      {/* Thumbnail */}
      <div className="relative w-16 h-10 rounded overflow-hidden bg-zinc-800 flex-shrink-0">
        {thumbUrl ? (
          <img src={thumbUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-600">
            <Film size={16} />
          </div>
        )}
        {/* Duration badge */}
        <div className="absolute bottom-0.5 right-0.5 px-1 py-0.5 text-[9px] font-medium bg-black/80 rounded">
          {formatDuration(video.duration)}
        </div>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium truncate">{video.filename}</div>
        <div className="text-[10px] text-zinc-500">
          {video.width}x{video.height}
        </div>
      </div>

      {/* Remove button */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/20 text-zinc-500 hover:text-red-400 transition"
      >
        <X size={14} />
      </button>
    </div>
  )
})

// Empty state for video panel
function EmptyVideoState({ onAddVideos }: { onAddVideos: () => void }) {
  return (
    <div
      onClick={onAddVideos}
      className="flex-1 flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-zinc-700 rounded-xl cursor-pointer hover:border-purple-500/50 hover:bg-zinc-800/30 transition"
    >
      <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center mb-3">
        <Upload size={20} className="text-zinc-500" />
      </div>
      <div className="text-sm font-medium text-zinc-300">Drop videos here</div>
      <div className="text-xs text-zinc-500 mt-1">or click to browse</div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function PmvEditorPage() {
  // Project state
  const [project, setProject] = useState<PmvProject>({
    videos: [],
    music: null,
    bpm: 120,
    bpmManualOverride: false,
    bpmConfidence: 0
  })

  const [selectedVideoIndex, setSelectedVideoIndex] = useState<number | null>(null)
  const [isLoadingVideos, setIsLoadingVideos] = useState(false)
  const [isLoadingMusic, setIsLoadingMusic] = useState(false)
  const [isDetectingBpm, setIsDetectingBpm] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const dropZoneRef = useRef<HTMLDivElement>(null)

  // Waveform hook for music visualization
  const waveform = useWaveform(project.music?.path || null, {
    barColor: '#52525b',
    playedColor: '#a855f7',
    backgroundColor: '#18181b'
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // Video Management
  // ─────────────────────────────────────────────────────────────────────────────

  const addVideosFromPaths = useCallback(async (paths: string[]) => {
    if (paths.length === 0) return

    const currentCount = project.videos.length
    const availableSlots = MAX_VIDEOS - currentCount
    const pathsToAdd = paths.slice(0, availableSlots)

    setIsLoadingVideos(true)

    const newVideos: PmvVideo[] = []

    for (const filePath of pathsToAdd) {
      try {
        // Get video info
        const info = await window.api.pmv.getVideoInfo(filePath)

        // Generate thumbnail
        const thumbnail = await window.api.pmv.getVideoThumb(filePath)

        // Extract filename
        const filename = filePath.split(/[/\\]/).pop() || filePath

        newVideos.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          path: filePath,
          filename,
          duration: info.duration,
          width: info.width,
          height: info.height,
          thumbnail
        })
      } catch (err) {
        console.error('[PmvEditor] Failed to load video:', filePath, err)
      }
    }

    if (newVideos.length > 0) {
      setProject(prev => ({
        ...prev,
        videos: [...prev.videos, ...newVideos]
      }))
    }

    setIsLoadingVideos(false)
  }, [project.videos.length])

  const handleSelectVideos = useCallback(async () => {
    const paths = await window.api.pmv.selectVideos()
    if (paths && paths.length > 0) {
      await addVideosFromPaths(paths)
    }
  }, [addVideosFromPaths])

  const handleRemoveVideo = useCallback((index: number) => {
    setProject(prev => ({
      ...prev,
      videos: prev.videos.filter((_, i) => i !== index)
    }))

    if (selectedVideoIndex === index) {
      setSelectedVideoIndex(null)
      setPreviewUrl(null)
    } else if (selectedVideoIndex !== null && selectedVideoIndex > index) {
      setSelectedVideoIndex(selectedVideoIndex - 1)
    }
  }, [selectedVideoIndex])

  const handleSelectVideo = useCallback(async (index: number) => {
    setSelectedVideoIndex(index)
    const video = project.videos[index]
    if (video) {
      const url = await toFileUrlCached(video.path)
      setPreviewUrl(url)
    }
  }, [project.videos])

  // Drag and drop reordering
  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    e.dataTransfer.setData('text/plain', index.toString())
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIndex(index)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent, dropIndex: number) => {
    e.preventDefault()
    const dragIndex = parseInt(e.dataTransfer.getData('text/plain'), 10)

    if (dragIndex !== dropIndex && !isNaN(dragIndex)) {
      setProject(prev => {
        const newVideos = [...prev.videos]
        const [dragged] = newVideos.splice(dragIndex, 1)
        newVideos.splice(dropIndex, 0, dragged)
        return { ...prev, videos: newVideos }
      })

      // Update selected index if needed
      if (selectedVideoIndex === dragIndex) {
        setSelectedVideoIndex(dropIndex)
      } else if (selectedVideoIndex !== null) {
        if (dragIndex < selectedVideoIndex && dropIndex >= selectedVideoIndex) {
          setSelectedVideoIndex(selectedVideoIndex - 1)
        } else if (dragIndex > selectedVideoIndex && dropIndex <= selectedVideoIndex) {
          setSelectedVideoIndex(selectedVideoIndex + 1)
        }
      }
    }

    setDragOverIndex(null)
  }, [selectedVideoIndex])

  // File drop handler
  const handleFileDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const files = Array.from(e.dataTransfer.files)
    const videoPaths = files
      .filter(f => /\.(mp4|mkv|avi|mov|webm|wmv|flv|m4v)$/i.test(f.name))
      .map(f => f.path)

    if (videoPaths.length > 0) {
      await addVideosFromPaths(videoPaths)
    }
  }, [addVideosFromPaths])

  // ─────────────────────────────────────────────────────────────────────────────
  // Music Management
  // ─────────────────────────────────────────────────────────────────────────────

  const handleSelectMusic = useCallback(async () => {
    const path = await window.api.pmv.selectMusic()
    if (!path) return

    setIsLoadingMusic(true)

    try {
      const info = await window.api.pmv.getAudioInfo(path)
      const filename = path.split(/[/\\]/).pop() || path

      setProject(prev => ({
        ...prev,
        music: {
          path,
          filename,
          duration: info.duration
        },
        bpmManualOverride: false
      }))

      // Auto-detect BPM after loading
      detectBpm(path)
    } catch (err) {
      console.error('[PmvEditor] Failed to load music:', err)
    }

    setIsLoadingMusic(false)
  }, [])

  const handleRemoveMusic = useCallback(() => {
    setProject(prev => ({
      ...prev,
      music: null,
      bpm: 120,
      bpmManualOverride: false,
      bpmConfidence: 0
    }))
  }, [])

  // BPM detection
  const detectBpm = useCallback(async (audioPath: string) => {
    setIsDetectingBpm(true)

    try {
      // Use Web Audio API in renderer for BPM detection
      const fileUrl = await window.api.fs.toFileUrl(audioPath)
      if (!fileUrl) {
        throw new Error('Failed to get file URL')
      }

      const audioContext = new AudioContext()
      const response = await fetch(fileUrl as string)
      const arrayBuffer = await response.arrayBuffer()
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)

      // Get channel data and detect BPM
      const channelData = audioBuffer.getChannelData(0)
      const result = detectBpmFromBuffer(channelData, audioBuffer.sampleRate)

      // Round to common BPM if close
      const roundedBpm = roundToCommonBpm(result.bpm)

      setProject(prev => ({
        ...prev,
        bpm: roundedBpm,
        bpmConfidence: result.confidence
      }))

      audioContext.close()
    } catch (err) {
      console.error('[PmvEditor] BPM detection failed:', err)
      // Keep default BPM
    }

    setIsDetectingBpm(false)
  }, [])

  const handleBpmChange = useCallback((value: number) => {
    setProject(prev => ({
      ...prev,
      bpm: Math.max(30, Math.min(300, value)),
      bpmManualOverride: true
    }))
  }, [])

  const handleRedetectBpm = useCallback(() => {
    if (project.music) {
      setProject(prev => ({ ...prev, bpmManualOverride: false }))
      detectBpm(project.music.path)
    }
  }, [project.music, detectBpm])

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  const selectedVideo = selectedVideoIndex !== null ? project.videos[selectedVideoIndex] : null

  return (
    <div className="h-full flex flex-col bg-[var(--background)]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
            <Film size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">PMV Editor</h1>
            <p className="text-xs text-zinc-500">Create music video compilations with beat sync</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            disabled
            className="px-4 py-2 text-sm font-medium rounded-lg bg-zinc-800 text-zinc-500 flex items-center gap-2 cursor-not-allowed"
          >
            <ChevronDown size={14} />
            Export
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex min-h-0 p-4 gap-4">
        {/* Left panel - Video sources */}
        <div className="w-72 flex flex-col bg-zinc-900/50 rounded-xl border border-zinc-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Film size={14} className="text-zinc-500" />
              <span className="text-sm font-medium">Source Videos</span>
              <span className="text-xs text-zinc-500">({project.videos.length}/{MAX_VIDEOS})</span>
            </div>
          </div>

          <div
            ref={dropZoneRef}
            onDragOver={(e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'copy'
            }}
            onDrop={handleFileDrop}
            className="flex-1 p-2 overflow-y-auto space-y-1"
          >
            {project.videos.length === 0 ? (
              <EmptyVideoState onAddVideos={handleSelectVideos} />
            ) : (
              <>
                {project.videos.map((video, index) => (
                  <VideoCard
                    key={video.id}
                    video={video}
                    index={index}
                    isSelected={selectedVideoIndex === index}
                    onSelect={() => handleSelectVideo(index)}
                    onRemove={() => handleRemoveVideo(index)}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                  />
                ))}
              </>
            )}
          </div>

          {/* Add buttons */}
          <div className="p-2 border-t border-zinc-800 space-y-1">
            <button
              onClick={handleSelectVideos}
              disabled={project.videos.length >= MAX_VIDEOS || isLoadingVideos}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {isLoadingVideos ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Plus size={14} />
              )}
              Add Videos
            </button>
            <button
              onClick={handleSelectVideos}
              disabled={project.videos.length >= MAX_VIDEOS}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-lg text-zinc-400 hover:bg-zinc-800/50 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              <Library size={14} />
              From Library
            </button>
          </div>
        </div>

        {/* Right panel - Preview and waveform */}
        <div className="flex-1 flex flex-col gap-4 min-w-0">
          {/* Preview window */}
          <div className="flex-1 bg-zinc-900/50 rounded-xl border border-zinc-800 overflow-hidden flex flex-col">
            <div className="px-4 py-2 border-b border-zinc-800 flex items-center gap-2">
              <Play size={14} className="text-zinc-500" />
              <span className="text-sm font-medium">Preview</span>
              {selectedVideo && (
                <span className="text-xs text-zinc-500 ml-auto">
                  {selectedVideo.filename}
                </span>
              )}
            </div>

            <div className="flex-1 relative bg-black flex items-center justify-center">
              {previewUrl && selectedVideo ? (
                <video
                  ref={videoRef}
                  src={previewUrl}
                  className="max-w-full max-h-full"
                  controls
                />
              ) : (
                <div className="text-center text-zinc-500">
                  <Film size={48} className="mx-auto mb-3 opacity-30" />
                  <div className="text-sm">Select a video to preview</div>
                </div>
              )}
            </div>
          </div>

          {/* Waveform panel */}
          <div className="h-40 bg-zinc-900/50 rounded-xl border border-zinc-800 overflow-hidden flex flex-col">
            <div className="px-4 py-2 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Music size={14} className="text-zinc-500" />
                <span className="text-sm font-medium">Music Track</span>
              </div>

              {/* BPM display */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-zinc-500">BPM:</span>
                  <input
                    type="number"
                    value={project.bpm}
                    onChange={(e) => handleBpmChange(parseInt(e.target.value, 10) || 120)}
                    className="w-16 px-2 py-1 text-center bg-zinc-800 rounded border border-zinc-700 focus:border-purple-500 focus:outline-none text-sm"
                  />
                  {!project.bpmManualOverride && project.music && (
                    <span className="text-xs text-purple-400">
                      {isDetectingBpm ? 'detecting...' : `(auto${project.bpmConfidence > 0.5 ? '' : ' ~'})`}
                    </span>
                  )}
                  {project.bpmManualOverride && project.music && (
                    <button
                      onClick={handleRedetectBpm}
                      className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition"
                      title="Re-detect BPM"
                    >
                      <RefreshCw size={12} />
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="flex-1 p-3 flex flex-col">
              {project.music ? (
                <>
                  {/* Music info bar */}
                  <div className="flex items-center gap-3 mb-2">
                    <button
                      onClick={waveform.togglePlayPause}
                      className="w-8 h-8 rounded-full bg-purple-500 hover:bg-purple-400 flex items-center justify-center transition"
                    >
                      {waveform.isPlaying ? (
                        <Pause size={14} className="text-white" />
                      ) : (
                        <Play size={14} className="text-white ml-0.5" />
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{project.music.filename}</div>
                      <div className="text-xs text-zinc-500">
                        {formatDuration(waveform.currentTime)} / {formatDuration(waveform.duration)}
                      </div>
                    </div>
                    <button
                      onClick={handleRemoveMusic}
                      className="p-1.5 rounded hover:bg-red-500/20 text-zinc-500 hover:text-red-400 transition"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {/* Waveform canvas */}
                  <div className="flex-1 relative">
                    {waveform.isLoading ? (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Loader2 size={24} className="animate-spin text-purple-500" />
                      </div>
                    ) : waveform.error ? (
                      <div className="absolute inset-0 flex items-center justify-center text-red-400">
                        <AlertCircle size={16} className="mr-2" />
                        <span className="text-sm">{waveform.error}</span>
                      </div>
                    ) : (
                      <canvas
                        ref={waveform.canvasRef}
                        onClick={waveform.handleCanvasClick}
                        className="w-full h-full rounded cursor-pointer"
                        style={{ imageRendering: 'pixelated' }}
                      />
                    )}
                  </div>
                </>
              ) : (
                <div
                  onClick={handleSelectMusic}
                  className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-zinc-700 rounded-lg cursor-pointer hover:border-purple-500/50 hover:bg-zinc-800/30 transition"
                >
                  {isLoadingMusic ? (
                    <Loader2 size={24} className="animate-spin text-purple-500" />
                  ) : (
                    <>
                      <Music size={24} className="text-zinc-500 mb-2" />
                      <div className="text-sm font-medium text-zinc-300">Add Music Track</div>
                      <div className="text-xs text-zinc-500">MP3, WAV, FLAC, M4A, OGG, AAC</div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PmvEditorPage
