// File: src/renderer/components/PmvEditor.tsx
// PMV/HMV Editor - Phase 1 & 2: Video import, music, BPM detection, auto-cutting engine

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import {
  Plus,
  Music,
  Film,
  Trash2,
  Play,
  Pause,
  Upload,
  GripVertical,
  X,
  RefreshCw,
  ChevronDown,
  Loader2,
  AlertCircle,
  Library,
  Sparkles,
  Zap,
  LayoutTemplate,
  Shuffle,
  Clock,
  Scissors,
  SkipForward,
  SkipBack,
  // Phase 4 icons
  Wand2,
  Palette,
  Layers,
  Settings2,
  Monitor,
  SunMedium,
  // Phase 5 icons
  Volume2,
  VolumeX,
  AudioLines,
  ArrowRightLeft,
  // Phase 6 icons
  Download,
  FolderPlus,
  ListPlus,
  FileVideo,
  Check,
  AlertTriangle,
  // Audio Burner
  Flame
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

// Phase 2: Clip segment for the timeline
interface PmvClip {
  id: string
  videoId: string        // Which source video
  videoIndex: number     // Index in videos array
  startTime: number      // Start time in source video
  endTime: number        // End time in source video
  duration: number       // Clip duration
  beatStart: number      // Which beat this clip starts at
  beatEnd: number        // Which beat this clip ends at
  timelineStart: number  // Start position in final timeline (seconds)
  timelineEnd: number    // End position in final timeline
}

// Cut template presets
type BuiltInTemplate = 'classic' | 'slowBuild' | 'chorusDrop' | 'hypno' | 'romantic' | 'hardcore'
type CutTemplate = BuiltInTemplate | string // string for custom template IDs

// Custom template definition
interface CustomTemplate {
  id: string
  name: string
  description: string
  beatsPerClip: number
  crossfade: number
  avoidConsecutive: boolean
  preferAction: boolean
  createdAt: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 4: Effects & Overlays Types
// ─────────────────────────────────────────────────────────────────────────────

// Transition types between clips
type TransitionType = 'cut' | 'crossfade' | 'flash' | 'glitch' | 'zoom' | 'slide' | 'dissolve' | 'wipeLeft' | 'wipeRight' | 'wipeUp' | 'wipeDown' | 'spin' | 'blur' | 'vhs' | 'bounce' | 'pixelate'

// Video effect types
type VideoEffectType = 'none' | 'saturate' | 'contrast' | 'vignette' | 'filmGrain' | 'slowMo' | 'bw' | 'sepia' | 'invert' | 'chromatic' | 'shake' | 'strobe' | 'thermal' | 'dream' | 'emboss'

// Overlay effect types
type OverlayEffectType = 'none' | 'beatFlash' | 'crt' | 'scanlines' | 'vhs'

// Color grading presets
type ColorGradePreset = 'none' | 'warm' | 'cool' | 'vintage' | 'neon' | 'cinematic' | 'pastel'

// Global effects settings
interface EffectsSettings {
  // Transitions
  transitionType: TransitionType
  transitionDuration: number // ms (0-500)

  // Video effects
  videoEffect: VideoEffectType
  effectIntensity: number // 0-1

  // Color grading
  colorGrade: ColorGradePreset

  // Overlays
  overlayEffect: OverlayEffectType
  beatFlashIntensity: number // 0-1
  beatFlashOnEvery: number // every N beats (1, 2, 4)

  // Beat-synced text overlays
  textOverlays: BeatTextOverlay[]

  // Per-clip settings (future: allow per-clip overrides)
  useGlobalEffects: boolean
}

interface CutSettings {
  template: CutTemplate
  beatsPerClip: number       // How many beats per clip (1, 2, 4, 8)
  randomizeSeed: number      // Seed for reproducible randomization
  avoidConsecutive: boolean  // Avoid same video twice in a row
  preferAction: boolean      // Prefer middle sections of videos
  crossfadeDuration: number  // Overlap duration in seconds (0 = hard cut)
}

interface PmvProject {
  videos: PmvVideo[]
  music: PmvMusic | null
  bpm: number
  bpmManualOverride: boolean
  bpmConfidence: number
  // Phase 2 additions
  clips: PmvClip[]
  cutSettings: CutSettings
  isGenerated: boolean
  // Phase 4 additions
  effectsSettings: EffectsSettings
  // Phase 5 additions
  audioSettings: AudioSettings
}

const MAX_VIDEOS = 15

// ─────────────────────────────────────────────────────────────────────────────
// Cut Template Definitions
// ─────────────────────────────────────────────────────────────────────────────

const BUILT_IN_TEMPLATES: Record<BuiltInTemplate, { name: string; description: string; beatsPerClip: number; crossfade: number }> = {
  classic: { name: 'Classic PMV', description: 'Cuts on every beat', beatsPerClip: 1, crossfade: 0 },
  slowBuild: { name: 'Slow Build', description: 'Longer clips that speed up', beatsPerClip: 4, crossfade: 0.1 },
  chorusDrop: { name: 'Chorus Drop', description: 'Calm verses, intense chorus', beatsPerClip: 2, crossfade: 0.05 },
  hypno: { name: 'Hypno', description: 'Rapid cuts with subliminal flashing', beatsPerClip: 0.5, crossfade: 0 },
  romantic: { name: 'Romantic', description: 'Longer clips with crossfades', beatsPerClip: 8, crossfade: 0.3 },
  hardcore: { name: 'Hardcore', description: 'Half-beat rapid fire cuts', beatsPerClip: 0.5, crossfade: 0 }
}

// Storage key for custom templates
const CUSTOM_TEMPLATES_KEY = 'vault-pmv-custom-templates'

// Load custom templates from localStorage
function loadCustomTemplates(): CustomTemplate[] {
  try {
    const stored = localStorage.getItem(CUSTOM_TEMPLATES_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

// Save custom templates to localStorage
function saveCustomTemplates(templates: CustomTemplate[]): void {
  try {
    localStorage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(templates))
  } catch (err) {
    console.error('[PmvEditor] Failed to save custom templates:', err)
  }
}

// Check if a template ID is built-in
function isBuiltInTemplate(id: string): id is BuiltInTemplate {
  return id in BUILT_IN_TEMPLATES
}

const DEFAULT_CUT_SETTINGS: CutSettings = {
  template: 'classic',
  beatsPerClip: 1,
  randomizeSeed: Date.now(),
  avoidConsecutive: true,
  preferAction: true,
  crossfadeDuration: 0
}

// Phase 4: Default effects settings
const DEFAULT_EFFECTS_SETTINGS: EffectsSettings = {
  transitionType: 'cut',
  transitionDuration: 100,
  videoEffect: 'none',
  effectIntensity: 0.5,
  colorGrade: 'none',
  overlayEffect: 'none',
  beatFlashIntensity: 0.3,
  beatFlashOnEvery: 2,
  textOverlays: [],
  useGlobalEffects: true
}

// Phase 5: Default audio settings
const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  musicVolume: 1.0,
  keepOriginalAudio: false,
  originalAudioVolume: 0.3,
  mixMode: 'music',
  fadeInDuration: 500,
  fadeOutDuration: 1000,
  clipFadeEnabled: false,
  clipFadeDuration: 50,
  normalizeVolume: true
}

// Phase 6: Export format definitions
const EXPORT_FORMATS: Record<ExportFormat, { name: string; ext: string; description: string }> = {
  mp4: { name: 'MP4', ext: '.mp4', description: 'H.264 - Most compatible' },
  webm: { name: 'WebM', ext: '.webm', description: 'VP9 - Smaller file size' },
  gif: { name: 'GIF', ext: '.gif', description: 'No audio - For previews' }
}

const EXPORT_QUALITIES: Record<ExportQuality, { name: string; resolution: string; bitrate: string }> = {
  draft: { name: 'Draft', resolution: '720p', bitrate: '2 Mbps' },
  standard: { name: 'Standard', resolution: '1080p', bitrate: '5 Mbps' },
  high: { name: 'High Quality', resolution: '1080p', bitrate: '10 Mbps' },
  '4k': { name: '4K', resolution: '2160p', bitrate: '20 Mbps' }
}

const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  format: 'mp4',
  quality: 'standard',
  destination: 'file',
  filename: 'My PMV'
}

// Phase 4: Effect definitions for UI
const TRANSITION_TYPES: Record<TransitionType, { name: string; icon: string }> = {
  cut: { name: 'Hard Cut', icon: '✂️' },
  crossfade: { name: 'Crossfade', icon: '🔀' },
  flash: { name: 'Flash', icon: '⚡' },
  glitch: { name: 'Glitch', icon: '📺' },
  zoom: { name: 'Zoom', icon: '🔍' },
  slide: { name: 'Slide', icon: '➡️' },
  dissolve: { name: 'Dissolve', icon: '✨' },
  wipeLeft: { name: 'Wipe Left', icon: '◀️' },
  wipeRight: { name: 'Wipe Right', icon: '▶️' },
  wipeUp: { name: 'Wipe Up', icon: '🔼' },
  wipeDown: { name: 'Wipe Down', icon: '🔽' },
  spin: { name: 'Spin', icon: '🔄' },
  blur: { name: 'Blur', icon: '💨' },
  vhs: { name: 'VHS', icon: '📼' },
  bounce: { name: 'Bounce', icon: '🏀' },
  pixelate: { name: 'Pixelate', icon: '🎮' }
}

const VIDEO_EFFECTS: Record<VideoEffectType, { name: string; filter: string }> = {
  none: { name: 'None', filter: '' },
  saturate: { name: 'Saturate', filter: 'saturate(1.5)' },
  contrast: { name: 'High Contrast', filter: 'contrast(1.3)' },
  vignette: { name: 'Vignette', filter: '' }, // Applied via CSS
  filmGrain: { name: 'Film Grain', filter: '' }, // Applied via overlay
  slowMo: { name: 'Slow Motion', filter: '' }, // Applied via playback rate
  bw: { name: 'Black & White', filter: 'grayscale(1)' },
  sepia: { name: 'Sepia', filter: 'sepia(0.8)' },
  invert: { name: 'Invert', filter: 'invert(1)' },
  chromatic: { name: 'Chromatic', filter: '' }, // Applied via multi-layer
  shake: { name: 'Shake', filter: '' }, // Applied via animation
  strobe: { name: 'Strobe', filter: '' }, // Applied via animation
  thermal: { name: 'Thermal', filter: 'hue-rotate(180deg) saturate(2) contrast(1.3)' },
  dream: { name: 'Dreamy', filter: 'blur(1px) saturate(1.5) brightness(1.1)' },
  emboss: { name: 'Emboss', filter: 'contrast(1.5) brightness(1.2) grayscale(0.5)' }
}

const COLOR_GRADES: Record<ColorGradePreset, { name: string; filter: string }> = {
  none: { name: 'None', filter: '' },
  warm: { name: 'Warm', filter: 'sepia(0.2) saturate(1.2)' },
  cool: { name: 'Cool', filter: 'hue-rotate(20deg) saturate(0.9)' },
  vintage: { name: 'Vintage', filter: 'sepia(0.3) contrast(1.1) brightness(0.95)' },
  neon: { name: 'Neon', filter: 'saturate(2) contrast(1.2) brightness(1.1)' },
  cinematic: { name: 'Cinematic', filter: 'contrast(1.15) saturate(0.85) brightness(0.95)' },
  pastel: { name: 'Pastel', filter: 'saturate(0.7) brightness(1.1) contrast(0.9)' }
}

const OVERLAY_EFFECTS: Record<OverlayEffectType, { name: string; description: string }> = {
  none: { name: 'None', description: 'No overlay' },
  beatFlash: { name: 'Beat Flash', description: 'Flash on beat' },
  crt: { name: 'CRT', description: 'CRT screen effect' },
  scanlines: { name: 'Scanlines', description: 'Horizontal scanlines' },
  vhs: { name: 'VHS', description: 'VHS tape effect' }
}

// Beat-synced text overlay types
type TextOverlayStyle = 'pulse' | 'bounce' | 'flash' | 'shake' | 'zoom' | 'glitch'
type TextOverlayPosition = 'center' | 'top' | 'bottom' | 'random'

interface BeatTextOverlay {
  id: string
  text: string
  style: TextOverlayStyle
  position: TextOverlayPosition
  color: string
  fontSize: number
  fontFamily: string
  showOnBeat: number // Show every N beats (1, 2, 4, 8)
  duration: number // How long to show (in beats: 0.25, 0.5, 1)
  enabled: boolean
}

const TEXT_OVERLAY_STYLES: Record<TextOverlayStyle, { name: string; animation: string }> = {
  pulse: { name: 'Pulse', animation: 'scale(1.2) -> scale(1)' },
  bounce: { name: 'Bounce', animation: 'translateY bounce' },
  flash: { name: 'Flash', animation: 'opacity flash' },
  shake: { name: 'Shake', animation: 'horizontal shake' },
  zoom: { name: 'Zoom', animation: 'scale(0) -> scale(1)' },
  glitch: { name: 'Glitch', animation: 'chromatic + shake' }
}

const DEFAULT_TEXT_OVERLAYS: BeatTextOverlay[] = []

// ─────────────────────────────────────────────────────────────────────────────
// Phase 5: Audio Settings Types
// ─────────────────────────────────────────────────────────────────────────────

interface AudioSettings {
  // Music volume
  musicVolume: number // 0-1

  // Original video audio
  keepOriginalAudio: boolean
  originalAudioVolume: number // 0-1
  mixMode: 'music' | 'video' | 'mix' // Which audio to use

  // Fade effects
  fadeInDuration: number // ms (0-2000)
  fadeOutDuration: number // ms (0-2000)
  clipFadeEnabled: boolean // Fade between clips
  clipFadeDuration: number // ms (0-500)

  // Normalization
  normalizeVolume: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 6: Export Settings Types
// ─────────────────────────────────────────────────────────────────────────────

type ExportFormat = 'mp4' | 'webm' | 'gif'
type ExportQuality = 'draft' | 'standard' | 'high' | '4k'
type ExportDestination = 'file' | 'library' | 'playlist'

interface ExportSettings {
  format: ExportFormat
  quality: ExportQuality
  destination: ExportDestination
  playlistId?: string // For 'playlist' destination
  filename: string
}

interface ExportProgress {
  status: 'idle' | 'preparing' | 'encoding' | 'finalizing' | 'complete' | 'error'
  progress: number // 0-100
  eta?: string
  currentStep?: string
  error?: string
  outputPath?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Beat Calculation & Auto-Cut Generation
// ─────────────────────────────────────────────────────────────────────────────

// Calculate beat times from BPM and duration
function calculateBeatTimes(bpm: number, duration: number): number[] {
  const beatInterval = 60 / bpm // seconds per beat
  const beats: number[] = []
  let time = 0
  while (time < duration) {
    beats.push(time)
    time += beatInterval
  }
  return beats
}

// Seeded random number generator for reproducible randomization
function seededRandom(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}

// Generate clips from videos based on beat pattern
function generateClips(
  videos: PmvVideo[],
  music: PmvMusic,
  bpm: number,
  settings: CutSettings
): PmvClip[] {
  if (videos.length === 0) return []

  const beats = calculateBeatTimes(bpm, music.duration)
  const clips: PmvClip[] = []
  const random = seededRandom(settings.randomizeSeed)
  const beatInterval = 60 / bpm
  const clipDuration = beatInterval * settings.beatsPerClip

  let timelinePos = 0
  let lastVideoIndex = -1
  let beatIndex = 0

  while (timelinePos < music.duration) {
    // Calculate how many beats this clip spans
    const beatsInClip = settings.beatsPerClip
    const actualClipDuration = Math.min(clipDuration, music.duration - timelinePos)

    // Select a video (avoiding consecutive if enabled)
    let videoIndex: number
    if (settings.avoidConsecutive && videos.length > 1) {
      // Pick random video that isn't the last one used
      const availableIndices = videos
        .map((_, i) => i)
        .filter(i => i !== lastVideoIndex)
      videoIndex = availableIndices[Math.floor(random() * availableIndices.length)]
    } else {
      videoIndex = Math.floor(random() * videos.length)
    }

    const video = videos[videoIndex]
    lastVideoIndex = videoIndex

    // Calculate clip start time in source video
    let sourceStart: number
    if (settings.preferAction && video.duration > actualClipDuration * 2) {
      // Prefer middle 70% of video (avoid intros/outros)
      const safeStart = video.duration * 0.15
      const safeEnd = video.duration * 0.85 - actualClipDuration
      sourceStart = safeStart + random() * Math.max(0, safeEnd - safeStart)
    } else {
      // Random position ensuring we don't overflow
      const maxStart = Math.max(0, video.duration - actualClipDuration)
      sourceStart = random() * maxStart
    }

    const clip: PmvClip = {
      id: `clip-${clips.length}-${Date.now()}`,
      videoId: video.id,
      videoIndex,
      startTime: sourceStart,
      endTime: sourceStart + actualClipDuration,
      duration: actualClipDuration,
      beatStart: beatIndex,
      beatEnd: beatIndex + beatsInClip,
      timelineStart: timelinePos,
      timelineEnd: timelinePos + actualClipDuration
    }

    clips.push(clip)
    timelinePos += actualClipDuration - settings.crossfadeDuration
    beatIndex += beatsInClip
  }

  return clips
}

// ─────────────────────────────────────────────────────────────────────────────
// Timeline Component
// ─────────────────────────────────────────────────────────────────────────────

const TimelineClip = React.memo(function TimelineClip({
  clip,
  video,
  totalDuration,
  isPlaying,
  currentTime,
  onClick
}: {
  clip: PmvClip
  video: PmvVideo | undefined
  totalDuration: number
  isPlaying: boolean
  currentTime: number
  onClick: () => void
}) {
  const [thumbUrl, setThumbUrl] = useState<string>('')
  const leftPercent = (clip.timelineStart / totalDuration) * 100
  const widthPercent = (clip.duration / totalDuration) * 100
  const isActive = currentTime >= clip.timelineStart && currentTime < clip.timelineEnd

  useEffect(() => {
    if (video?.thumbnail) {
      toFileUrlCached(video.thumbnail).then(url => {
        if (url) setThumbUrl(url)
      })
    }
  }, [video?.thumbnail])

  // Color based on video index (cycle through colors)
  const colors = [
    'from-purple-500 to-purple-600',
    'from-pink-500 to-pink-600',
    'from-blue-500 to-blue-600',
    'from-green-500 to-green-600',
    'from-yellow-500 to-yellow-600',
    'from-red-500 to-red-600',
    'from-cyan-500 to-cyan-600',
    'from-orange-500 to-orange-600'
  ]
  const colorClass = colors[clip.videoIndex % colors.length]

  return (
    <div
      onClick={onClick}
      className={cn(
        'absolute top-0 h-full rounded overflow-hidden cursor-pointer transition-all',
        'bg-gradient-to-r border',
        colorClass,
        isActive ? 'ring-2 ring-white border-white' : 'border-white/20 hover:border-white/50'
      )}
      style={{
        left: `${leftPercent}%`,
        width: `${Math.max(widthPercent, 0.5)}%`
      }}
      title={`${video?.filename || 'Video'} (${clip.startTime.toFixed(1)}s - ${clip.endTime.toFixed(1)}s)`}
    >
      {/* Thumbnail background */}
      {thumbUrl && widthPercent > 2 && (
        <img
          src={thumbUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-50"
        />
      )}
      {/* Clip info overlay */}
      {widthPercent > 5 && (
        <div className="absolute inset-0 flex items-center justify-center p-1">
          <span className="text-[9px] font-medium text-white truncate drop-shadow">
            {video?.filename?.slice(0, 15) || 'Video'}
          </span>
        </div>
      )}
    </div>
  )
})

// Beat markers overlay for timeline
function BeatMarkers({ bpm, duration }: { bpm: number; duration: number }) {
  const beats = useMemo(() => calculateBeatTimes(bpm, duration), [bpm, duration])

  return (
    <div className="absolute inset-0 pointer-events-none">
      {beats.map((time, i) => {
        const leftPercent = (time / duration) * 100
        // Every 4th beat (measure) is more prominent
        const isMeasure = i % 4 === 0
        return (
          <div
            key={i}
            className={cn(
              'absolute top-0 h-full',
              isMeasure ? 'bg-white/30 w-[2px]' : 'bg-white/10 w-px'
            )}
            style={{ left: `${leftPercent}%` }}
          />
        )
      })}
    </div>
  )
}

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
    bpmConfidence: 0,
    // Phase 2 additions
    clips: [],
    cutSettings: DEFAULT_CUT_SETTINGS,
    isGenerated: false,
    // Phase 4 additions
    effectsSettings: DEFAULT_EFFECTS_SETTINGS,
    // Phase 5 additions
    audioSettings: DEFAULT_AUDIO_SETTINGS
  })

  const [selectedVideoIndex, setSelectedVideoIndex] = useState<number | null>(null)
  const [selectedClipIndex, setSelectedClipIndex] = useState<number | null>(null)
  const [isLoadingVideos, setIsLoadingVideos] = useState(false)
  const [isLoadingMusic, setIsLoadingMusic] = useState(false)
  const [isDetectingBpm, setIsDetectingBpm] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isExtractingAudio, setIsExtractingAudio] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [showTemplateMenu, setShowTemplateMenu] = useState(false)
  const [timelineCurrentTime, setTimelineCurrentTime] = useState(0)

  // Phase 3: Custom templates state
  const [customTemplates, setCustomTemplates] = useState<CustomTemplate[]>(() => loadCustomTemplates())
  const [showTemplateEditor, setShowTemplateEditor] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<CustomTemplate | null>(null)
  const [templateForm, setTemplateForm] = useState({
    name: '',
    description: '',
    beatsPerClip: 1,
    crossfade: 0,
    avoidConsecutive: true,
    preferAction: true
  })

  // Phase 4: Effects panel state
  const [showEffectsPanel, setShowEffectsPanel] = useState(false)
  const [activeEffectTab, setActiveEffectTab] = useState<'transitions' | 'effects' | 'overlays'>('transitions')

  // Phase 5: Audio panel state
  const [showAudioPanel, setShowAudioPanel] = useState(false)

  // Audio Burner modal state
  const [showAudioBurnerModal, setShowAudioBurnerModal] = useState(false)
  const [audioBurnerUrl, setAudioBurnerUrl] = useState('')
  const [audioBurnerDownloading, setAudioBurnerDownloading] = useState(false)
  const [audioBurnerDownloads, setAudioBurnerDownloads] = useState<Array<{ id: string; filename: string; path: string; status: string }>>([])
  const [audioBurnerCollectionVideos, setAudioBurnerCollectionVideos] = useState<Array<{ id: string; filename: string; path: string }>>([])

  // Phase 6: Export state
  const [showExportModal, setShowExportModal] = useState(false)
  const [exportSettings, setExportSettings] = useState<ExportSettings>(DEFAULT_EXPORT_SETTINGS)
  const [exportProgress, setExportProgress] = useState<ExportProgress>({ status: 'idle', progress: 0 })

  const videoRef = useRef<HTMLVideoElement>(null)
  const dropZoneRef = useRef<HTMLDivElement>(null)
  const timelineRef = useRef<HTMLDivElement>(null)

  // Waveform hook for music visualization
  const waveform = useWaveform(project.music?.path || null, {
    barColor: '#52525b',
    playedColor: '#a855f7',
    backgroundColor: '#18181b'
  })

  // Sync timeline current time with waveform
  useEffect(() => {
    setTimelineCurrentTime(waveform.currentTime)
  }, [waveform.currentTime])

  // Calculate derived values
  const totalClipsDuration = useMemo(() => {
    return project.clips.reduce((sum, clip) => sum + clip.duration, 0)
  }, [project.clips])

  const beatCount = useMemo(() => {
    if (!project.music) return 0
    return Math.floor(project.music.duration / (60 / project.bpm))
  }, [project.music, project.bpm])

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

  // Audio Burner - open modal to choose source
  const handleAudioBurner = useCallback(async () => {
    // Load completed downloads
    try {
      const downloads = await window.api.invoke('urlDownloader:getDownloads') as Array<{ id: string; filename: string; outputPath: string; status: string }>
      const completed = downloads.filter(d => d.status === 'complete' && d.outputPath)
      setAudioBurnerDownloads(completed.map(d => ({ id: d.id, filename: d.filename, path: d.outputPath, status: d.status })))
    } catch (err) {
      console.error('[PmvEditor] Failed to load downloads:', err)
    }

    // Load collection videos
    try {
      const result = await window.api.media.list({ type: 'video', limit: 100, sortBy: 'newest' }) as any
      const videos = result?.items || result || []
      setAudioBurnerCollectionVideos(videos.map((v: any) => ({ id: v.id, filename: v.filename, path: v.path })))
    } catch (err) {
      console.error('[PmvEditor] Failed to load collection videos:', err)
    }

    setShowAudioBurnerModal(true)
  }, [])

  // Audio Burner - extract from local file
  const handleAudioBurnerFromFile = useCallback(async () => {
    const videoPath = await window.api.pmv.selectVideoForAudio()
    if (!videoPath) return

    setShowAudioBurnerModal(false)
    setIsExtractingAudio(true)

    try {
      const result = await window.api.pmv.extractAudio(videoPath)

      if (!result.success || !result.path) {
        console.error('[PmvEditor] Audio extraction failed:', result.error)
        alert(`Audio extraction failed: ${result.error || 'Unknown error'}`)
        setIsExtractingAudio(false)
        return
      }

      const filename = result.path.split(/[/\\]/).pop() || 'extracted_audio.mp3'

      setProject(prev => ({
        ...prev,
        music: {
          path: result.path!,
          filename,
          duration: result.duration || 0
        },
        bpmManualOverride: false
      }))

      detectBpm(result.path)
    } catch (err) {
      console.error('[PmvEditor] Audio burner failed:', err)
      alert('Failed to extract audio from video')
    }

    setIsExtractingAudio(false)
  }, [detectBpm])

  // Audio Burner - extract from URL download
  const handleAudioBurnerFromUrl = useCallback(async () => {
    if (!audioBurnerUrl.trim()) return

    setAudioBurnerDownloading(true)

    try {
      // Start download
      const downloadResult = await window.api.invoke('urlDownloader:addDownload', audioBurnerUrl) as { id: string; success: boolean; error?: string }

      if (!downloadResult.success) {
        alert(`Download failed: ${downloadResult.error || 'Unknown error'}`)
        setAudioBurnerDownloading(false)
        return
      }

      // Poll for completion
      const pollForCompletion = async (): Promise<string | null> => {
        for (let i = 0; i < 600; i++) { // 10 minute max
          await new Promise(resolve => setTimeout(resolve, 1000))
          const downloads = await window.api.invoke('urlDownloader:getDownloads') as Array<{ id: string; status: string; outputPath: string }>
          const download = downloads.find(d => d.id === downloadResult.id)
          if (download?.status === 'complete' && download.outputPath) {
            return download.outputPath
          }
          if (download?.status === 'error' || download?.status === 'cancelled') {
            return null
          }
        }
        return null
      }

      const downloadedPath = await pollForCompletion()

      if (!downloadedPath) {
        alert('Download failed or timed out')
        setAudioBurnerDownloading(false)
        return
      }

      // Extract audio from downloaded video
      const result = await window.api.pmv.extractAudio(downloadedPath)

      if (!result.success || !result.path) {
        alert(`Audio extraction failed: ${result.error || 'Unknown error'}`)
        setAudioBurnerDownloading(false)
        return
      }

      const filename = result.path.split(/[/\\]/).pop() || 'extracted_audio.mp3'

      setProject(prev => ({
        ...prev,
        music: {
          path: result.path!,
          filename,
          duration: result.duration || 0
        },
        bpmManualOverride: false
      }))

      detectBpm(result.path)
      setShowAudioBurnerModal(false)
      setAudioBurnerUrl('')
    } catch (err) {
      console.error('[PmvEditor] URL audio burner failed:', err)
      alert('Failed to download and extract audio')
    }

    setAudioBurnerDownloading(false)
  }, [audioBurnerUrl, detectBpm])

  // Audio Burner - extract from existing download or collection video
  const handleAudioBurnerFromPath = useCallback(async (videoPath: string) => {
    setShowAudioBurnerModal(false)
    setIsExtractingAudio(true)

    try {
      const result = await window.api.pmv.extractAudio(videoPath)

      if (!result.success || !result.path) {
        alert(`Audio extraction failed: ${result.error || 'Unknown error'}`)
        setIsExtractingAudio(false)
        return
      }

      const filename = result.path.split(/[/\\]/).pop() || 'extracted_audio.mp3'

      setProject(prev => ({
        ...prev,
        music: {
          path: result.path!,
          filename,
          duration: result.duration || 0
        },
        bpmManualOverride: false
      }))

      detectBpm(result.path)
    } catch (err) {
      console.error('[PmvEditor] Audio burner from path failed:', err)
      alert('Failed to extract audio from video')
    }

    setIsExtractingAudio(false)
  }, [detectBpm])

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
  // Phase 2: Auto-Cut Generation
  // ─────────────────────────────────────────────────────────────────────────────

  // AUTO-GENERATE clips when both music and videos are present and BPM is detected
  // This makes the workflow more intuitive - user just adds content and it works
  const autoGenerateTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  useEffect(() => {
    // Clear any pending auto-generate
    if (autoGenerateTimeoutRef.current) {
      clearTimeout(autoGenerateTimeoutRef.current)
    }

    // Only auto-generate if:
    // 1. We have music
    // 2. We have at least one video
    // 3. BPM has been detected (confidence > 0 or manual override)
    // 4. Clips haven't been generated yet
    const shouldAutoGenerate =
      project.music &&
      project.videos.length > 0 &&
      (project.bpmConfidence > 0 || project.bpmManualOverride) &&
      !project.isGenerated &&
      !isGenerating

    if (shouldAutoGenerate) {
      // Small delay to allow BPM detection to settle
      autoGenerateTimeoutRef.current = setTimeout(() => {
        console.log('[PmvEditor] Auto-generating clips...')
        // Trigger generation
        setIsGenerating(true)
        setTimeout(() => {
          const clips = generateClips(
            project.videos,
            project.music!,
            project.bpm,
            project.cutSettings
          )
          setProject(prev => ({
            ...prev,
            clips,
            isGenerated: true
          }))
          setIsGenerating(false)
        }, 100)
      }, 500)
    }

    return () => {
      if (autoGenerateTimeoutRef.current) {
        clearTimeout(autoGenerateTimeoutRef.current)
      }
    }
  }, [project.music, project.videos.length, project.bpm, project.bpmConfidence, project.bpmManualOverride, project.isGenerated, isGenerating])

  // Apply a cut template preset
  const handleApplyTemplate = useCallback((templateId: BuiltInTemplate) => {
    const template = BUILT_IN_TEMPLATES[templateId]
    setProject(prev => ({
      ...prev,
      cutSettings: {
        ...prev.cutSettings,
        template: templateId,
        beatsPerClip: template.beatsPerClip,
        crossfadeDuration: template.crossfade
      },
      isGenerated: false // Need to regenerate
    }))
    setShowTemplateMenu(false)
  }, [])

  // Update cut settings
  const handleUpdateCutSettings = useCallback((updates: Partial<CutSettings>) => {
    setProject(prev => ({
      ...prev,
      cutSettings: { ...prev.cutSettings, ...updates },
      isGenerated: false // Need to regenerate
    }))
  }, [])

  // Generate clips from current settings
  const handleGenerateClips = useCallback(() => {
    if (!project.music || project.videos.length === 0) return

    setIsGenerating(true)

    // Use setTimeout to allow UI to update
    setTimeout(() => {
      const clips = generateClips(
        project.videos,
        project.music!,
        project.bpm,
        project.cutSettings
      )

      setProject(prev => ({
        ...prev,
        clips,
        isGenerated: true
      }))

      setIsGenerating(false)
    }, 100)
  }, [project.music, project.videos, project.bpm, project.cutSettings])

  // Reshuffle clips (new random seed)
  const handleReshuffle = useCallback(() => {
    setProject(prev => ({
      ...prev,
      cutSettings: {
        ...prev.cutSettings,
        randomizeSeed: Date.now()
      }
    }))
    // Auto-regenerate after seed change
    setTimeout(() => handleGenerateClips(), 50)
  }, [handleGenerateClips])

  // Handle timeline click to seek
  const handleTimelineClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!project.music || !timelineRef.current) return

    const rect = timelineRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const ratio = x / rect.width
    const newTime = ratio * project.music.duration

    waveform.seek(newTime)
    setTimelineCurrentTime(newTime)
  }, [project.music, waveform])

  // Preview a specific clip
  const handlePreviewClip = useCallback(async (clipIndex: number) => {
    const clip = project.clips[clipIndex]
    if (!clip) return

    const video = project.videos[clip.videoIndex]
    if (!video) return

    setSelectedClipIndex(clipIndex)
    const url = await toFileUrlCached(video.path)
    setPreviewUrl(url)

    // Seek to clip start time when video loads
    if (videoRef.current && url) {
      videoRef.current.onloadedmetadata = () => {
        if (videoRef.current) {
          videoRef.current.currentTime = clip.startTime
        }
      }
    }
  }, [project.clips, project.videos])

  // ─────────────────────────────────────────────────────────────────────────────
  // Phase 3: Custom Template Management
  // ─────────────────────────────────────────────────────────────────────────────

  // Open template editor for creating a new template
  const handleCreateTemplate = useCallback(() => {
    setEditingTemplate(null)
    setTemplateForm({
      name: '',
      description: '',
      beatsPerClip: project.cutSettings.beatsPerClip,
      crossfade: project.cutSettings.crossfadeDuration,
      avoidConsecutive: project.cutSettings.avoidConsecutive,
      preferAction: project.cutSettings.preferAction
    })
    setShowTemplateEditor(true)
    setShowTemplateMenu(false)
  }, [project.cutSettings])

  // Open template editor for editing an existing custom template
  const handleEditTemplate = useCallback((template: CustomTemplate) => {
    setEditingTemplate(template)
    setTemplateForm({
      name: template.name,
      description: template.description,
      beatsPerClip: template.beatsPerClip,
      crossfade: template.crossfade,
      avoidConsecutive: template.avoidConsecutive,
      preferAction: template.preferAction
    })
    setShowTemplateEditor(true)
    setShowTemplateMenu(false)
  }, [])

  // Save template (create or update)
  const handleSaveTemplate = useCallback(() => {
    if (!templateForm.name.trim()) return

    if (editingTemplate) {
      // Update existing template
      const updated = customTemplates.map(t =>
        t.id === editingTemplate.id
          ? { ...t, ...templateForm, name: templateForm.name.trim(), description: templateForm.description.trim() }
          : t
      )
      setCustomTemplates(updated)
      saveCustomTemplates(updated)
    } else {
      // Create new template
      const newTemplate: CustomTemplate = {
        id: `custom-${Date.now()}`,
        name: templateForm.name.trim(),
        description: templateForm.description.trim(),
        beatsPerClip: templateForm.beatsPerClip,
        crossfade: templateForm.crossfade,
        avoidConsecutive: templateForm.avoidConsecutive,
        preferAction: templateForm.preferAction,
        createdAt: Date.now()
      }
      const updated = [...customTemplates, newTemplate]
      setCustomTemplates(updated)
      saveCustomTemplates(updated)
    }

    setShowTemplateEditor(false)
    setEditingTemplate(null)
  }, [templateForm, editingTemplate, customTemplates])

  // Delete a custom template
  const handleDeleteTemplate = useCallback((templateId: string) => {
    const updated = customTemplates.filter(t => t.id !== templateId)
    setCustomTemplates(updated)
    saveCustomTemplates(updated)

    // If currently using this template, switch to classic
    if (project.cutSettings.template === templateId) {
      handleApplyTemplate('classic')
    }
  }, [customTemplates, project.cutSettings.template, handleApplyTemplate])

  // Apply a template (built-in or custom)
  const handleApplyTemplateOrCustom = useCallback((templateId: string) => {
    if (isBuiltInTemplate(templateId)) {
      handleApplyTemplate(templateId)
    } else {
      // Apply custom template
      const custom = customTemplates.find(t => t.id === templateId)
      if (custom) {
        setProject(prev => ({
          ...prev,
          cutSettings: {
            ...prev.cutSettings,
            template: templateId,
            beatsPerClip: custom.beatsPerClip,
            crossfadeDuration: custom.crossfade,
            avoidConsecutive: custom.avoidConsecutive,
            preferAction: custom.preferAction
          },
          isGenerated: false
        }))
      }
    }
    setShowTemplateMenu(false)
  }, [handleApplyTemplate, customTemplates])

  // Get current template name for display
  const currentTemplateName = useMemo(() => {
    const templateId = project.cutSettings.template
    if (isBuiltInTemplate(templateId)) {
      return BUILT_IN_TEMPLATES[templateId].name
    }
    const custom = customTemplates.find(t => t.id === templateId)
    return custom?.name || 'Custom'
  }, [project.cutSettings.template, customTemplates])

  // ─────────────────────────────────────────────────────────────────────────────
  // Phase 4: Effects Management
  // ─────────────────────────────────────────────────────────────────────────────

  // Update effects settings
  const handleUpdateEffects = useCallback((updates: Partial<EffectsSettings>) => {
    setProject(prev => ({
      ...prev,
      effectsSettings: { ...prev.effectsSettings, ...updates }
    }))
  }, [])

  // Get combined filter string for preview
  const getPreviewFilters = useMemo(() => {
    const effects = project.effectsSettings
    const filters: string[] = []

    // Video effect filter
    if (effects.videoEffect !== 'none') {
      const effectDef = VIDEO_EFFECTS[effects.videoEffect]
      if (effectDef.filter) {
        // Apply intensity to filter
        const filter = effectDef.filter.replace(/\(([^)]+)\)/g, (_, value) => {
          const num = parseFloat(value)
          if (!isNaN(num)) {
            const adjusted = 1 + (num - 1) * effects.effectIntensity
            return `(${adjusted})`
          }
          return `(${value})`
        })
        filters.push(filter)
      }
    }

    // Color grade filter
    if (effects.colorGrade !== 'none') {
      const gradeDef = COLOR_GRADES[effects.colorGrade]
      if (gradeDef.filter) {
        filters.push(gradeDef.filter)
      }
    }

    return filters.join(' ')
  }, [project.effectsSettings])

  // Get overlay CSS class for preview
  const getOverlayClass = useMemo(() => {
    const effect = project.effectsSettings.overlayEffect
    switch (effect) {
      case 'scanlines': return 'pmv-overlay-scanlines'
      case 'crt': return 'pmv-overlay-crt'
      case 'vhs': return 'pmv-overlay-vhs'
      default: return ''
    }
  }, [project.effectsSettings.overlayEffect])

  // Count active effects for badge
  const activeEffectsCount = useMemo(() => {
    const effects = project.effectsSettings
    let count = 0
    if (effects.transitionType !== 'cut') count++
    if (effects.videoEffect !== 'none') count++
    if (effects.colorGrade !== 'none') count++
    if (effects.overlayEffect !== 'none') count++
    return count
  }, [project.effectsSettings])

  // ─────────────────────────────────────────────────────────────────────────────
  // Phase 5: Audio Management
  // ─────────────────────────────────────────────────────────────────────────────

  // Update audio settings
  const handleUpdateAudio = useCallback((updates: Partial<AudioSettings>) => {
    setProject(prev => ({
      ...prev,
      audioSettings: { ...prev.audioSettings, ...updates }
    }))
  }, [])

  // Sync music volume with waveform (when volume changes)
  useEffect(() => {
    waveform.setVolume(project.audioSettings.musicVolume)
  }, [project.audioSettings.musicVolume, waveform.setVolume])

  // Count audio settings that differ from default
  const audioSettingsCount = useMemo(() => {
    const audio = project.audioSettings
    let count = 0
    if (audio.keepOriginalAudio) count++
    if (audio.fadeInDuration > 0 || audio.fadeOutDuration > 0) count++
    if (audio.clipFadeEnabled) count++
    if (!audio.normalizeVolume) count++
    return count
  }, [project.audioSettings])

  // ─────────────────────────────────────────────────────────────────────────────
  // Phase 6: Export Management
  // ─────────────────────────────────────────────────────────────────────────────

  // Open export modal
  const handleOpenExport = useCallback(() => {
    if (!project.isGenerated || project.clips.length === 0) return

    // Set default filename based on music filename
    const musicName = project.music?.filename?.replace(/\.[^.]+$/, '') || 'My PMV'
    setExportSettings(prev => ({ ...prev, filename: musicName }))
    setExportProgress({ status: 'idle', progress: 0 })
    setShowExportModal(true)
    setShowEffectsPanel(false)
    setShowAudioPanel(false)
  }, [project.isGenerated, project.clips.length, project.music?.filename])

  // Listen for export progress updates from main process
  useEffect(() => {
    const unsubscribe = window.api.pmv.onExportProgress((progress: ExportProgress) => {
      setExportProgress(progress)
    })
    return () => unsubscribe()
  }, [])

  // Start export
  const handleStartExport = useCallback(async () => {
    if (!project.music || project.clips.length === 0) return

    setExportProgress({ status: 'preparing', progress: 0, currentStep: 'Preparing project...' })

    try {
      // Prepare project data for export
      const projectData = {
        videos: project.videos.map(v => ({
          id: v.id,
          path: v.path,
          filename: v.filename,
          duration: v.duration,
          width: v.width,
          height: v.height
        })),
        music: {
          path: project.music.path,
          filename: project.music.filename,
          duration: project.music.duration
        },
        clips: project.clips.map(c => ({
          id: c.id,
          videoId: c.videoId,
          videoIndex: c.videoIndex,
          startTime: c.startTime,
          endTime: c.endTime,
          duration: c.duration
        })),
        effects: {
          transitionType: project.effectsSettings.transitionType,
          transitionDuration: project.effectsSettings.transitionDuration,
          videoEffect: project.effectsSettings.videoEffect,
          effectIntensity: project.effectsSettings.effectIntensity,
          colorGrade: project.effectsSettings.colorGrade
        },
        audio: {
          musicVolume: project.audioSettings.musicVolume,
          keepOriginalAudio: project.audioSettings.keepOriginalAudio,
          originalAudioVolume: project.audioSettings.originalAudioVolume,
          mixMode: project.audioSettings.mixMode,
          fadeInDuration: project.audioSettings.fadeInDuration,
          fadeOutDuration: project.audioSettings.fadeOutDuration
        },
        export: {
          format: exportSettings.format,
          quality: exportSettings.quality,
          destination: exportSettings.destination,
          filename: exportSettings.filename
        }
      }

      // Call the actual export IPC
      const result = await window.api.pmv.export(projectData)

      if (!result.success) {
        setExportProgress({
          status: 'error',
          progress: 0,
          error: result.error || 'Export failed'
        })
      }
    } catch (err: any) {
      console.error('[PmvEditor] Export error:', err)
      setExportProgress({
        status: 'error',
        progress: 0,
        error: err?.message || 'Export failed'
      })
    }
  }, [project, exportSettings])

  // Cancel export
  const handleCancelExport = useCallback(async () => {
    try {
      await window.api.pmv.cancelExport()
    } catch (err) {
      console.error('[PmvEditor] Cancel export error:', err)
    }
    setExportProgress({ status: 'idle', progress: 0 })
  }, [])

  // Check if ready to export
  const canExport = project.isGenerated && project.clips.length > 0 && project.music !== null

  // Export custom templates to JSON
  const handleExportTemplates = useCallback(() => {
    if (customTemplates.length === 0) return

    const data = JSON.stringify(customTemplates, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pmv-templates-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [customTemplates])

  // Import custom templates from JSON
  const handleImportTemplates = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      try {
        const text = await file.text()
        const imported = JSON.parse(text) as CustomTemplate[]

        // Validate imported data
        if (!Array.isArray(imported)) throw new Error('Invalid format')

        // Merge with existing, avoiding duplicates by name
        const existingNames = new Set(customTemplates.map(t => t.name.toLowerCase()))
        const newTemplates = imported.filter(t =>
          t.name && t.beatsPerClip && !existingNames.has(t.name.toLowerCase())
        ).map(t => ({
          ...t,
          id: `custom-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          createdAt: t.createdAt || Date.now()
        }))

        const updated = [...customTemplates, ...newTemplates]
        setCustomTemplates(updated)
        saveCustomTemplates(updated)
      } catch (err) {
        console.error('[PmvEditor] Failed to import templates:', err)
      }
    }
    input.click()
  }, [customTemplates])

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  const selectedVideo = selectedVideoIndex !== null ? project.videos[selectedVideoIndex] : null
  const selectedClip = selectedClipIndex !== null ? project.clips[selectedClipIndex] : null
  const canGenerate = project.music && project.videos.length > 0

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
          {/* Audio button */}
          <button
            onClick={() => { setShowAudioPanel(!showAudioPanel); setShowEffectsPanel(false) }}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-lg flex items-center gap-2 transition',
              showAudioPanel
                ? 'bg-cyan-500/20 text-cyan-400 ring-1 ring-cyan-500/50'
                : 'bg-zinc-800 hover:bg-zinc-700'
            )}
          >
            <Volume2 size={14} />
            Audio
            {audioSettingsCount > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-cyan-500 text-white">
                {audioSettingsCount}
              </span>
            )}
          </button>
          {/* Effects button */}
          <button
            onClick={() => { setShowEffectsPanel(!showEffectsPanel); setShowAudioPanel(false) }}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-lg flex items-center gap-2 transition',
              showEffectsPanel
                ? 'bg-purple-500/20 text-purple-400 ring-1 ring-purple-500/50'
                : 'bg-zinc-800 hover:bg-zinc-700'
            )}
          >
            <Wand2 size={14} />
            Effects
            {activeEffectsCount > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-purple-500 text-white">
                {activeEffectsCount}
              </span>
            )}
          </button>
          <button
            onClick={handleOpenExport}
            disabled={!canExport}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-lg flex items-center gap-2 transition',
              canExport
                ? 'bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-400 hover:to-emerald-400 text-white'
                : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
            )}
          >
            <Download size={14} />
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

            <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
              {previewUrl && selectedVideo ? (
                <div className={cn('relative w-full h-full flex items-center justify-center', getOverlayClass)}>
                  <video
                    ref={videoRef}
                    src={previewUrl}
                    className="max-w-full max-h-full"
                    style={{ filter: getPreviewFilters || undefined }}
                    controls
                  />
                  {/* Vignette overlay */}
                  {project.effectsSettings.videoEffect === 'vignette' && (
                    <div
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        background: `radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,${project.effectsSettings.effectIntensity * 0.8}) 100%)`
                      }}
                    />
                  )}
                  {/* Film grain overlay */}
                  {project.effectsSettings.videoEffect === 'filmGrain' && (
                    <div
                      className="absolute inset-0 pointer-events-none mix-blend-overlay"
                      style={{
                        opacity: project.effectsSettings.effectIntensity * 0.4,
                        backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\'/%3E%3C/svg%3E")'
                      }}
                    />
                  )}
                  {/* Active effects indicator */}
                  {activeEffectsCount > 0 && (
                    <div className="absolute top-2 right-2 px-2 py-1 bg-purple-500/80 rounded text-[10px] font-medium text-white flex items-center gap-1">
                      <Wand2 size={10} />
                      {activeEffectsCount} effect{activeEffectsCount > 1 ? 's' : ''}
                    </div>
                  )}
                </div>
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
                <div className="flex-1 flex gap-3 p-2">
                  {/* Add Music Track */}
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
                        <div className="text-xs text-zinc-500">MP3, WAV, FLAC, etc.</div>
                      </>
                    )}
                  </div>

                  {/* Audio Burner - extract from video */}
                  <div
                    onClick={handleAudioBurner}
                    className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-orange-700/50 rounded-lg cursor-pointer hover:border-orange-500/70 hover:bg-orange-900/20 transition"
                  >
                    {isExtractingAudio ? (
                      <>
                        <Loader2 size={24} className="animate-spin text-orange-500 mb-2" />
                        <div className="text-sm font-medium text-orange-300">Extracting...</div>
                      </>
                    ) : (
                      <>
                        <Flame size={24} className="text-orange-500 mb-2" />
                        <div className="text-sm font-medium text-orange-300">Audio Burner</div>
                        <div className="text-xs text-zinc-500">Extract from video</div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Phase 2: Timeline Panel with Beat Markers */}
          <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 overflow-hidden">
            {/* Timeline Header */}
            <div className="px-4 py-2 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Scissors size={14} className="text-zinc-500" />
                <span className="text-sm font-medium">Timeline</span>
                {project.isGenerated && (
                  <span className="text-xs text-zinc-500">
                    {project.clips.length} clips • {beatCount} beats
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {/* Template selector */}
                <div className="relative">
                  <button
                    onClick={() => setShowTemplateMenu(!showTemplateMenu)}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg bg-zinc-800 hover:bg-zinc-700 transition"
                  >
                    <LayoutTemplate size={12} />
                    {currentTemplateName}
                    <ChevronDown size={12} />
                  </button>

                  {showTemplateMenu && (
                    <div className="absolute right-0 top-full mt-1 w-64 bg-zinc-800 rounded-lg shadow-xl border border-zinc-700 z-50 overflow-hidden">
                      {/* Built-in templates */}
                      <div className="py-1">
                        <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-zinc-500 font-medium">
                          Built-in Templates
                        </div>
                        {(Object.keys(BUILT_IN_TEMPLATES) as BuiltInTemplate[]).map(id => {
                          const t = BUILT_IN_TEMPLATES[id]
                          return (
                            <button
                              key={id}
                              onClick={() => handleApplyTemplateOrCustom(id)}
                              className={cn(
                                'w-full px-3 py-2 text-left hover:bg-zinc-700 transition',
                                project.cutSettings.template === id && 'bg-purple-500/20'
                              )}
                            >
                              <div className="text-sm font-medium">{t.name}</div>
                              <div className="text-xs text-zinc-500">{t.description}</div>
                            </button>
                          )
                        })}
                      </div>

                      {/* Custom templates */}
                      {customTemplates.length > 0 && (
                        <div className="py-1 border-t border-zinc-700">
                          <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-zinc-500 font-medium">
                            Custom Templates
                          </div>
                          {customTemplates.map(t => (
                            <div
                              key={t.id}
                              className={cn(
                                'group flex items-center justify-between px-3 py-2 hover:bg-zinc-700 transition',
                                project.cutSettings.template === t.id && 'bg-purple-500/20'
                              )}
                            >
                              <button
                                onClick={() => handleApplyTemplateOrCustom(t.id)}
                                className="flex-1 text-left"
                              >
                                <div className="text-sm font-medium">{t.name}</div>
                                <div className="text-xs text-zinc-500">{t.description || `${t.beatsPerClip} beats/clip`}</div>
                              </button>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleEditTemplate(t) }}
                                  className="p-1 rounded hover:bg-zinc-600 text-zinc-400 hover:text-white"
                                  title="Edit template"
                                >
                                  <RefreshCw size={12} />
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDeleteTemplate(t.id) }}
                                  className="p-1 rounded hover:bg-red-500/20 text-zinc-400 hover:text-red-400"
                                  title="Delete template"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Actions */}
                      <div className="py-1 border-t border-zinc-700">
                        <button
                          onClick={handleCreateTemplate}
                          className="w-full px-3 py-2 text-left hover:bg-zinc-700 transition flex items-center gap-2 text-purple-400"
                        >
                          <Plus size={14} />
                          <span className="text-sm font-medium">Create Template</span>
                        </button>
                        {customTemplates.length > 0 && (
                          <button
                            onClick={handleExportTemplates}
                            className="w-full px-3 py-2 text-left hover:bg-zinc-700 transition flex items-center gap-2 text-zinc-400"
                          >
                            <ChevronDown size={14} className="rotate-90" />
                            <span className="text-sm">Export Templates</span>
                          </button>
                        )}
                        <button
                          onClick={handleImportTemplates}
                          className="w-full px-3 py-2 text-left hover:bg-zinc-700 transition flex items-center gap-2 text-zinc-400"
                        >
                          <ChevronDown size={14} className="-rotate-90" />
                          <span className="text-sm">Import Templates</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Beats per clip */}
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-zinc-800">
                  <Clock size={12} className="text-zinc-500" />
                  <select
                    value={project.cutSettings.beatsPerClip}
                    onChange={(e) => handleUpdateCutSettings({ beatsPerClip: Number(e.target.value) })}
                    className="bg-transparent text-xs focus:outline-none"
                  >
                    <option value={0.5}>½ beat</option>
                    <option value={1}>1 beat</option>
                    <option value={2}>2 beats</option>
                    <option value={4}>4 beats</option>
                    <option value={8}>8 beats</option>
                  </select>
                </div>

                {/* Shuffle button */}
                <button
                  onClick={handleReshuffle}
                  disabled={!canGenerate}
                  className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 transition"
                  title="Reshuffle clips"
                >
                  <Shuffle size={14} />
                </button>

                {/* Generate button */}
                <button
                  onClick={handleGenerateClips}
                  disabled={!canGenerate || isGenerating}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-500 hover:bg-purple-400 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {isGenerating ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Zap size={12} />
                  )}
                  {project.isGenerated ? 'Regenerate' : 'Auto-Cut'}
                </button>
              </div>
            </div>

            {/* Timeline Track */}
            <div className="p-3">
              {project.isGenerated && project.music ? (
                <div className="space-y-2">
                  {/* Time markers */}
                  <div className="flex justify-between text-[10px] text-zinc-500 px-1">
                    <span>0:00</span>
                    <span>{formatDuration(project.music.duration / 4)}</span>
                    <span>{formatDuration(project.music.duration / 2)}</span>
                    <span>{formatDuration(project.music.duration * 3 / 4)}</span>
                    <span>{formatDuration(project.music.duration)}</span>
                  </div>

                  {/* Timeline track with clips */}
                  <div
                    ref={timelineRef}
                    onClick={handleTimelineClick}
                    className="relative h-16 bg-zinc-800 rounded-lg cursor-pointer overflow-hidden"
                  >
                    {/* Beat markers */}
                    <BeatMarkers bpm={project.bpm} duration={project.music.duration} />

                    {/* Clips */}
                    {project.clips.map((clip, index) => (
                      <TimelineClip
                        key={clip.id}
                        clip={clip}
                        video={project.videos[clip.videoIndex]}
                        totalDuration={project.music!.duration}
                        isPlaying={waveform.isPlaying}
                        currentTime={timelineCurrentTime}
                        onClick={() => handlePreviewClip(index)}
                      />
                    ))}

                    {/* Playhead */}
                    <div
                      className="absolute top-0 h-full w-0.5 bg-white shadow-lg z-10 pointer-events-none"
                      style={{
                        left: `${(timelineCurrentTime / project.music.duration) * 100}%`
                      }}
                    >
                      <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-white rounded-full" />
                    </div>
                  </div>

                  {/* Clip info */}
                  {selectedClip && (
                    <div className="flex items-center gap-4 mt-2 px-2 py-1.5 bg-zinc-800/50 rounded text-xs">
                      <span className="text-zinc-400">
                        Clip {selectedClipIndex! + 1} of {project.clips.length}
                      </span>
                      <span className="text-zinc-500">•</span>
                      <span className="text-zinc-400">
                        {project.videos[selectedClip.videoIndex]?.filename || 'Video'}
                      </span>
                      <span className="text-zinc-500">•</span>
                      <span className="text-zinc-400">
                        {selectedClip.startTime.toFixed(1)}s - {selectedClip.endTime.toFixed(1)}s
                      </span>
                      <span className="text-zinc-500">•</span>
                      <span className="text-zinc-400">
                        Beats {selectedClip.beatStart} - {selectedClip.beatEnd}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-20 flex flex-col items-center justify-center text-zinc-500">
                  {!project.music ? (
                    <>
                      <Music size={24} className="mb-2 opacity-50" />
                      <div className="text-sm">Add a music track to generate timeline</div>
                    </>
                  ) : project.videos.length === 0 ? (
                    <>
                      <Film size={24} className="mb-2 opacity-50" />
                      <div className="text-sm">Add videos to generate timeline</div>
                    </>
                  ) : (
                    <>
                      <Sparkles size={24} className="mb-2 opacity-50" />
                      <div className="text-sm">Click "Auto-Cut" to generate clips at beat markers</div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Settings row */}
            {project.music && project.videos.length > 0 && (
              <div className="px-4 py-2 border-t border-zinc-800 flex items-center gap-4 text-xs">
                <label className="flex items-center gap-2 text-zinc-400">
                  <input
                    type="checkbox"
                    checked={project.cutSettings.avoidConsecutive}
                    onChange={(e) => handleUpdateCutSettings({ avoidConsecutive: e.target.checked })}
                    className="rounded border-zinc-600 bg-zinc-800 text-purple-500 focus:ring-purple-500"
                  />
                  Avoid consecutive clips
                </label>
                <label className="flex items-center gap-2 text-zinc-400">
                  <input
                    type="checkbox"
                    checked={project.cutSettings.preferAction}
                    onChange={(e) => handleUpdateCutSettings({ preferAction: e.target.checked })}
                    className="rounded border-zinc-600 bg-zinc-800 text-purple-500 focus:ring-purple-500"
                  />
                  Prefer action moments
                </label>
                <div className="flex items-center gap-2 text-zinc-400 ml-auto">
                  <span>Crossfade:</span>
                  <input
                    type="range"
                    min={0}
                    max={0.5}
                    step={0.05}
                    value={project.cutSettings.crossfadeDuration}
                    onChange={(e) => handleUpdateCutSettings({ crossfadeDuration: Number(e.target.value) })}
                    className="w-20 accent-purple-500"
                  />
                  <span className="w-10">{(project.cutSettings.crossfadeDuration * 1000).toFixed(0)}ms</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Phase 4: Effects Panel */}
      {showEffectsPanel && (
        <div className="fixed right-4 top-24 w-80 bg-zinc-900 rounded-2xl border border-zinc-700 shadow-2xl z-40 overflow-hidden">
          {/* Panel Header */}
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wand2 size={16} className="text-purple-400" />
              <span className="text-sm font-semibold">Effects</span>
            </div>
            <button
              onClick={() => setShowEffectsPanel(false)}
              className="p-1 rounded hover:bg-zinc-800 transition"
            >
              <X size={16} />
            </button>
          </div>

          {/* Tab Navigation */}
          <div className="flex border-b border-zinc-800">
            {(['transitions', 'effects', 'overlays'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveEffectTab(tab)}
                className={cn(
                  'flex-1 px-3 py-2 text-xs font-medium transition',
                  activeEffectTab === tab
                    ? 'bg-zinc-800 text-white border-b-2 border-purple-500'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
                )}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="p-4 max-h-96 overflow-y-auto space-y-4">
            {/* Transitions Tab */}
            {activeEffectTab === 'transitions' && (
              <>
                <div>
                  <label className="text-xs text-zinc-400 block mb-2">Transition Type</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(Object.keys(TRANSITION_TYPES) as TransitionType[]).map((type) => (
                      <button
                        key={type}
                        onClick={() => handleUpdateEffects({ transitionType: type })}
                        className={cn(
                          'px-2 py-2 text-xs rounded-lg transition flex flex-col items-center gap-1',
                          project.effectsSettings.transitionType === type
                            ? 'bg-purple-500/30 ring-1 ring-purple-500 text-white'
                            : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                        )}
                      >
                        <span className="text-base">{TRANSITION_TYPES[type].icon}</span>
                        <span>{TRANSITION_TYPES[type].name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {project.effectsSettings.transitionType !== 'cut' && (
                  <div>
                    <label className="text-xs text-zinc-400 block mb-2">
                      Transition Duration: {project.effectsSettings.transitionDuration}ms
                    </label>
                    <input
                      type="range"
                      min={50}
                      max={500}
                      step={25}
                      value={project.effectsSettings.transitionDuration}
                      onChange={(e) => handleUpdateEffects({ transitionDuration: Number(e.target.value) })}
                      className="w-full accent-purple-500"
                    />
                    <div className="flex justify-between text-[10px] text-zinc-500 mt-1">
                      <span>Fast</span>
                      <span>Slow</span>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Effects Tab */}
            {activeEffectTab === 'effects' && (
              <>
                <div>
                  <label className="text-xs text-zinc-400 block mb-2">Video Effect</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(Object.keys(VIDEO_EFFECTS) as VideoEffectType[]).map((type) => (
                      <button
                        key={type}
                        onClick={() => handleUpdateEffects({ videoEffect: type })}
                        className={cn(
                          'px-2 py-2 text-[11px] rounded-lg transition',
                          project.effectsSettings.videoEffect === type
                            ? 'bg-purple-500/30 ring-1 ring-purple-500 text-white'
                            : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                        )}
                      >
                        {VIDEO_EFFECTS[type].name}
                      </button>
                    ))}
                  </div>
                </div>

                {project.effectsSettings.videoEffect !== 'none' && (
                  <div>
                    <label className="text-xs text-zinc-400 block mb-2">
                      Intensity: {Math.round(project.effectsSettings.effectIntensity * 100)}%
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.1}
                      value={project.effectsSettings.effectIntensity}
                      onChange={(e) => handleUpdateEffects({ effectIntensity: Number(e.target.value) })}
                      className="w-full accent-purple-500"
                    />
                  </div>
                )}

                <div>
                  <label className="text-xs text-zinc-400 block mb-2">Color Grading</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(Object.keys(COLOR_GRADES) as ColorGradePreset[]).map((grade) => (
                      <button
                        key={grade}
                        onClick={() => handleUpdateEffects({ colorGrade: grade })}
                        className={cn(
                          'px-2 py-2 text-[11px] rounded-lg transition',
                          project.effectsSettings.colorGrade === grade
                            ? 'bg-purple-500/30 ring-1 ring-purple-500 text-white'
                            : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                        )}
                      >
                        {COLOR_GRADES[grade].name}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Overlays Tab */}
            {activeEffectTab === 'overlays' && (
              <>
                <div>
                  <label className="text-xs text-zinc-400 block mb-2">Overlay Effect</label>
                  <div className="space-y-1.5">
                    {(Object.keys(OVERLAY_EFFECTS) as OverlayEffectType[]).map((type) => (
                      <button
                        key={type}
                        onClick={() => handleUpdateEffects({ overlayEffect: type })}
                        className={cn(
                          'w-full px-3 py-2 text-left rounded-lg transition flex justify-between items-center',
                          project.effectsSettings.overlayEffect === type
                            ? 'bg-purple-500/30 ring-1 ring-purple-500'
                            : 'bg-zinc-800 hover:bg-zinc-700'
                        )}
                      >
                        <div>
                          <div className="text-sm font-medium">{OVERLAY_EFFECTS[type].name}</div>
                          <div className="text-[10px] text-zinc-500">{OVERLAY_EFFECTS[type].description}</div>
                        </div>
                        {project.effectsSettings.overlayEffect === type && (
                          <div className="w-2 h-2 rounded-full bg-purple-500" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {project.effectsSettings.overlayEffect === 'beatFlash' && (
                  <>
                    <div>
                      <label className="text-xs text-zinc-400 block mb-2">
                        Flash Intensity: {Math.round(project.effectsSettings.beatFlashIntensity * 100)}%
                      </label>
                      <input
                        type="range"
                        min={0.1}
                        max={1}
                        step={0.1}
                        value={project.effectsSettings.beatFlashIntensity}
                        onChange={(e) => handleUpdateEffects({ beatFlashIntensity: Number(e.target.value) })}
                        className="w-full accent-purple-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-zinc-400 block mb-2">Flash On Every</label>
                      <div className="flex gap-2">
                        {[1, 2, 4].map((n) => (
                          <button
                            key={n}
                            onClick={() => handleUpdateEffects({ beatFlashOnEvery: n })}
                            className={cn(
                              'flex-1 px-3 py-2 text-sm rounded-lg transition',
                              project.effectsSettings.beatFlashOnEvery === n
                                ? 'bg-purple-500/30 ring-1 ring-purple-500 text-white'
                                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                            )}
                          >
                            {n} beat{n > 1 ? 's' : ''}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* Beat-Synced Text Overlays */}
                <div className="pt-4 border-t border-zinc-800">
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-xs text-zinc-400 font-medium">Beat-Synced Text</label>
                    <button
                      onClick={() => {
                        const newOverlay: BeatTextOverlay = {
                          id: `text-${Date.now()}`,
                          text: 'BEAT',
                          style: 'pulse',
                          position: 'center',
                          color: '#ffffff',
                          fontSize: 48,
                          fontFamily: 'Impact',
                          showOnBeat: 2,
                          duration: 0.5,
                          enabled: true
                        }
                        handleUpdateEffects({
                          textOverlays: [...project.effectsSettings.textOverlays, newOverlay]
                        })
                      }}
                      className="px-2 py-1 text-xs bg-purple-500/20 text-purple-400 rounded hover:bg-purple-500/30 transition"
                    >
                      + Add Text
                    </button>
                  </div>
                  {project.effectsSettings.textOverlays.length === 0 && (
                    <p className="text-[10px] text-zinc-500 text-center py-2">
                      Add text that appears synced to beats
                    </p>
                  )}
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {project.effectsSettings.textOverlays.map((overlay, idx) => (
                      <div
                        key={overlay.id}
                        className="p-2 rounded-lg bg-zinc-800/50 border border-zinc-700 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <input
                            type="text"
                            value={overlay.text}
                            onChange={(e) => {
                              const updated = [...project.effectsSettings.textOverlays]
                              updated[idx] = { ...overlay, text: e.target.value }
                              handleUpdateEffects({ textOverlays: updated })
                            }}
                            className="flex-1 px-2 py-1 text-xs bg-black/30 rounded border border-zinc-700 focus:outline-none"
                            placeholder="Text..."
                          />
                          <button
                            onClick={() => {
                              const updated = project.effectsSettings.textOverlays.filter((_, i) => i !== idx)
                              handleUpdateEffects({ textOverlays: updated })
                            }}
                            className="ml-2 p-1 text-red-400 hover:text-red-300"
                          >
                            <X size={12} />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <select
                            value={overlay.style}
                            onChange={(e) => {
                              const updated = [...project.effectsSettings.textOverlays]
                              updated[idx] = { ...overlay, style: e.target.value as TextOverlayStyle }
                              handleUpdateEffects({ textOverlays: updated })
                            }}
                            className="text-[10px] px-1 py-0.5 bg-black/30 border border-zinc-700 rounded"
                          >
                            {(Object.keys(TEXT_OVERLAY_STYLES) as TextOverlayStyle[]).map(s => (
                              <option key={s} value={s}>{TEXT_OVERLAY_STYLES[s].name}</option>
                            ))}
                          </select>
                          <select
                            value={overlay.position}
                            onChange={(e) => {
                              const updated = [...project.effectsSettings.textOverlays]
                              updated[idx] = { ...overlay, position: e.target.value as TextOverlayPosition }
                              handleUpdateEffects({ textOverlays: updated })
                            }}
                            className="text-[10px] px-1 py-0.5 bg-black/30 border border-zinc-700 rounded"
                          >
                            <option value="center">Center</option>
                            <option value="top">Top</option>
                            <option value="bottom">Bottom</option>
                            <option value="random">Random</option>
                          </select>
                        </div>
                        <div className="flex gap-2 items-center">
                          <input
                            type="color"
                            value={overlay.color}
                            onChange={(e) => {
                              const updated = [...project.effectsSettings.textOverlays]
                              updated[idx] = { ...overlay, color: e.target.value }
                              handleUpdateEffects({ textOverlays: updated })
                            }}
                            className="w-6 h-5 rounded cursor-pointer"
                          />
                          <select
                            value={overlay.showOnBeat}
                            onChange={(e) => {
                              const updated = [...project.effectsSettings.textOverlays]
                              updated[idx] = { ...overlay, showOnBeat: Number(e.target.value) }
                              handleUpdateEffects({ textOverlays: updated })
                            }}
                            className="flex-1 text-[10px] px-1 py-0.5 bg-black/30 border border-zinc-700 rounded"
                          >
                            <option value={1}>Every beat</option>
                            <option value={2}>Every 2 beats</option>
                            <option value={4}>Every 4 beats</option>
                            <option value={8}>Every 8 beats</option>
                          </select>
                          <button
                            onClick={() => {
                              const updated = [...project.effectsSettings.textOverlays]
                              updated[idx] = { ...overlay, enabled: !overlay.enabled }
                              handleUpdateEffects({ textOverlays: updated })
                            }}
                            className={cn(
                              'px-2 py-0.5 text-[10px] rounded',
                              overlay.enabled ? 'bg-green-500/20 text-green-400' : 'bg-zinc-700 text-zinc-500'
                            )}
                          >
                            {overlay.enabled ? 'On' : 'Off'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Reset Button */}
          <div className="px-4 py-3 border-t border-zinc-800">
            <button
              onClick={() => handleUpdateEffects(DEFAULT_EFFECTS_SETTINGS)}
              className="w-full px-3 py-2 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition"
            >
              Reset All Effects
            </button>
          </div>
        </div>
      )}

      {/* Phase 5: Audio Panel */}
      {showAudioPanel && (
        <div className="fixed right-4 top-24 w-80 bg-zinc-900 rounded-2xl border border-zinc-700 shadow-2xl z-40 overflow-hidden">
          {/* Panel Header */}
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Volume2 size={16} className="text-cyan-400" />
              <span className="text-sm font-semibold">Audio Settings</span>
            </div>
            <button
              onClick={() => setShowAudioPanel(false)}
              className="p-1 rounded hover:bg-zinc-800 transition"
            >
              <X size={16} />
            </button>
          </div>

          {/* Audio Content */}
          <div className="p-4 max-h-[450px] overflow-y-auto space-y-5">
            {/* Music Volume */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-zinc-400 flex items-center gap-1.5">
                  <Music size={12} />
                  Music Volume
                </label>
                <span className="text-xs font-medium text-cyan-400">
                  {Math.round(project.audioSettings.musicVolume * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={project.audioSettings.musicVolume}
                onChange={(e) => handleUpdateAudio({ musicVolume: Number(e.target.value) })}
                className="w-full accent-cyan-500"
              />
            </div>

            {/* Audio Mix Mode */}
            <div>
              <label className="text-xs text-zinc-400 block mb-2">Audio Source</label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['music', 'video', 'mix'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => handleUpdateAudio({ mixMode: mode })}
                    className={cn(
                      'px-2 py-2 text-xs rounded-lg transition flex flex-col items-center gap-1',
                      project.audioSettings.mixMode === mode
                        ? 'bg-cyan-500/30 ring-1 ring-cyan-500 text-white'
                        : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                    )}
                  >
                    {mode === 'music' && <Music size={14} />}
                    {mode === 'video' && <Film size={14} />}
                    {mode === 'mix' && <ArrowRightLeft size={14} />}
                    <span className="capitalize">{mode}</span>
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-zinc-500 mt-2">
                {project.audioSettings.mixMode === 'music' && 'Use only the music track audio'}
                {project.audioSettings.mixMode === 'video' && 'Use only original video audio'}
                {project.audioSettings.mixMode === 'mix' && 'Mix music with original video audio'}
              </p>
            </div>

            {/* Original Audio Volume (when mix mode is enabled) */}
            {project.audioSettings.mixMode === 'mix' && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-zinc-400">Original Audio Volume</label>
                  <span className="text-xs font-medium text-zinc-300">
                    {Math.round(project.audioSettings.originalAudioVolume * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={project.audioSettings.originalAudioVolume}
                  onChange={(e) => handleUpdateAudio({ originalAudioVolume: Number(e.target.value) })}
                  className="w-full accent-cyan-500"
                />
              </div>
            )}

            <div className="border-t border-zinc-800 pt-4">
              <div className="flex items-center gap-2 mb-3">
                <AudioLines size={12} className="text-zinc-400" />
                <span className="text-xs font-medium text-zinc-300">Fade Effects</span>
              </div>

              {/* Fade In */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs text-zinc-500">Fade In</label>
                  <span className="text-[10px] text-zinc-400">
                    {project.audioSettings.fadeInDuration}ms
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={2000}
                  step={100}
                  value={project.audioSettings.fadeInDuration}
                  onChange={(e) => handleUpdateAudio({ fadeInDuration: Number(e.target.value) })}
                  className="w-full accent-cyan-500"
                />
              </div>

              {/* Fade Out */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs text-zinc-500">Fade Out</label>
                  <span className="text-[10px] text-zinc-400">
                    {project.audioSettings.fadeOutDuration}ms
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={2000}
                  step={100}
                  value={project.audioSettings.fadeOutDuration}
                  onChange={(e) => handleUpdateAudio({ fadeOutDuration: Number(e.target.value) })}
                  className="w-full accent-cyan-500"
                />
              </div>

              {/* Clip Fade */}
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-zinc-400">
                  <input
                    type="checkbox"
                    checked={project.audioSettings.clipFadeEnabled}
                    onChange={(e) => handleUpdateAudio({ clipFadeEnabled: e.target.checked })}
                    className="rounded border-zinc-600 bg-zinc-800 text-cyan-500 focus:ring-cyan-500"
                  />
                  Crossfade between clips
                </label>
                {project.audioSettings.clipFadeEnabled && (
                  <span className="text-[10px] text-zinc-500">
                    {project.audioSettings.clipFadeDuration}ms
                  </span>
                )}
              </div>
              {project.audioSettings.clipFadeEnabled && (
                <input
                  type="range"
                  min={0}
                  max={500}
                  step={25}
                  value={project.audioSettings.clipFadeDuration}
                  onChange={(e) => handleUpdateAudio({ clipFadeDuration: Number(e.target.value) })}
                  className="w-full accent-cyan-500 mt-2"
                />
              )}
            </div>

            {/* Volume Normalization */}
            <div className="border-t border-zinc-800 pt-4">
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={project.audioSettings.normalizeVolume}
                  onChange={(e) => handleUpdateAudio({ normalizeVolume: e.target.checked })}
                  className="rounded border-zinc-600 bg-zinc-800 text-cyan-500 focus:ring-cyan-500"
                />
                <span className="text-zinc-300">Normalize audio levels</span>
              </label>
              <p className="text-[10px] text-zinc-500 mt-1.5 ml-5">
                Automatically adjust volume to prevent clipping
              </p>
            </div>
          </div>

          {/* Reset Button */}
          <div className="px-4 py-3 border-t border-zinc-800">
            <button
              onClick={() => handleUpdateAudio(DEFAULT_AUDIO_SETTINGS)}
              className="w-full px-3 py-2 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition"
            >
              Reset Audio Settings
            </button>
          </div>
        </div>
      )}

      {/* Audio Burner Modal */}
      {showAudioBurnerModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-zinc-900 rounded-2xl border border-zinc-700 w-full max-w-xl mx-4 max-h-[80vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
                  <Flame size={18} className="text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Audio Burner</h2>
                  <p className="text-xs text-zinc-500">Extract audio from video</p>
                </div>
              </div>
              {!audioBurnerDownloading && (
                <button
                  onClick={() => setShowAudioBurnerModal(false)}
                  className="p-2 rounded-lg hover:bg-zinc-800 transition"
                >
                  <X size={18} />
                </button>
              )}
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6 overflow-y-auto flex-1">
              {/* Option 1: Paste URL */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-orange-500/20 text-orange-400 text-xs flex items-center justify-center font-bold">1</span>
                  <span className="text-sm font-medium">Download from URL</span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={audioBurnerUrl}
                    onChange={(e) => setAudioBurnerUrl(e.target.value)}
                    placeholder="Paste video URL (YouTube, etc.)"
                    className="flex-1 px-4 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 focus:border-orange-500 focus:outline-none text-sm"
                    disabled={audioBurnerDownloading}
                  />
                  <button
                    onClick={handleAudioBurnerFromUrl}
                    disabled={!audioBurnerUrl.trim() || audioBurnerDownloading}
                    className="px-4 py-2.5 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition flex items-center gap-2"
                  >
                    {audioBurnerDownloading ? (
                      <><Loader2 size={14} className="animate-spin" /> Downloading...</>
                    ) : (
                      <><Download size={14} /> Extract</>
                    )}
                  </button>
                </div>
              </div>

              {/* Option 2: From Downloads */}
              {audioBurnerDownloads.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-orange-500/20 text-orange-400 text-xs flex items-center justify-center font-bold">2</span>
                    <span className="text-sm font-medium">From Downloaded Videos ({audioBurnerDownloads.length})</span>
                  </div>
                  <div className="max-h-32 overflow-y-auto space-y-1 bg-zinc-800/50 rounded-lg p-2">
                    {audioBurnerDownloads.slice(0, 10).map(d => (
                      <button
                        key={d.id}
                        onClick={() => handleAudioBurnerFromPath(d.path)}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-zinc-700 transition text-sm truncate flex items-center gap-2"
                      >
                        <FileVideo size={14} className="shrink-0 text-zinc-400" />
                        <span className="truncate">{d.filename}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Option 3: From Collection */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-orange-500/20 text-orange-400 text-xs flex items-center justify-center font-bold">{audioBurnerDownloads.length > 0 ? '3' : '2'}</span>
                  <span className="text-sm font-medium">From Your Collection ({audioBurnerCollectionVideos.length})</span>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1 bg-zinc-800/50 rounded-lg p-2">
                  {audioBurnerCollectionVideos.length === 0 ? (
                    <div className="text-center text-zinc-500 text-sm py-4">No videos in collection</div>
                  ) : (
                    audioBurnerCollectionVideos.slice(0, 20).map(v => (
                      <button
                        key={v.id}
                        onClick={() => handleAudioBurnerFromPath(v.path)}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-zinc-700 transition text-sm truncate flex items-center gap-2"
                      >
                        <FileVideo size={14} className="shrink-0 text-zinc-400" />
                        <span className="truncate">{v.filename}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>

              {/* Option 4: Browse Files */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-orange-500/20 text-orange-400 text-xs flex items-center justify-center font-bold">{audioBurnerDownloads.length > 0 ? '4' : '3'}</span>
                  <span className="text-sm font-medium">Browse Files</span>
                </div>
                <button
                  onClick={handleAudioBurnerFromFile}
                  className="w-full px-4 py-3 rounded-lg border-2 border-dashed border-zinc-700 hover:border-orange-500/50 hover:bg-zinc-800/30 transition flex items-center justify-center gap-2 text-sm"
                >
                  <FolderPlus size={16} className="text-zinc-400" />
                  <span>Select video file from disk</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Phase 6: Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-zinc-900 rounded-2xl border border-zinc-700 w-full max-w-lg mx-4 overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center">
                  <Download size={18} className="text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Export PMV</h2>
                  <p className="text-xs text-zinc-500">{project.clips.length} clips • {formatDuration(project.music?.duration || 0)}</p>
                </div>
              </div>
              {exportProgress.status === 'idle' && (
                <button
                  onClick={() => setShowExportModal(false)}
                  className="p-2 rounded-lg hover:bg-zinc-800 transition"
                >
                  <X size={18} />
                </button>
              )}
            </div>

            {/* Modal Body */}
            <div className="p-6">
              {exportProgress.status === 'idle' ? (
                <div className="space-y-5">
                  {/* Filename */}
                  <div>
                    <label className="text-sm text-zinc-400 block mb-2">Filename</label>
                    <input
                      type="text"
                      value={exportSettings.filename}
                      onChange={(e) => setExportSettings(s => ({ ...s, filename: e.target.value }))}
                      placeholder="My PMV"
                      className="w-full px-4 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 focus:border-green-500 focus:outline-none text-sm"
                    />
                  </div>

                  {/* Format */}
                  <div>
                    <label className="text-sm text-zinc-400 block mb-2">Format</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(Object.keys(EXPORT_FORMATS) as ExportFormat[]).map((format) => (
                        <button
                          key={format}
                          onClick={() => setExportSettings(s => ({ ...s, format }))}
                          className={cn(
                            'px-3 py-3 rounded-lg transition text-center',
                            exportSettings.format === format
                              ? 'bg-green-500/30 ring-1 ring-green-500 text-white'
                              : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                          )}
                        >
                          <div className="text-sm font-medium">{EXPORT_FORMATS[format].name}</div>
                          <div className="text-[10px] text-zinc-500 mt-0.5">{EXPORT_FORMATS[format].description}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Quality (not for GIF) */}
                  {exportSettings.format !== 'gif' && (
                    <div>
                      <label className="text-sm text-zinc-400 block mb-2">Quality</label>
                      <div className="grid grid-cols-4 gap-2">
                        {(Object.keys(EXPORT_QUALITIES) as ExportQuality[]).map((quality) => (
                          <button
                            key={quality}
                            onClick={() => setExportSettings(s => ({ ...s, quality }))}
                            className={cn(
                              'px-2 py-2 rounded-lg transition text-center',
                              exportSettings.quality === quality
                                ? 'bg-green-500/30 ring-1 ring-green-500 text-white'
                                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                            )}
                          >
                            <div className="text-xs font-medium">{EXPORT_QUALITIES[quality].name}</div>
                            <div className="text-[9px] text-zinc-500 mt-0.5">{EXPORT_QUALITIES[quality].resolution}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Destination */}
                  <div>
                    <label className="text-sm text-zinc-400 block mb-2">Save To</label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={() => setExportSettings(s => ({ ...s, destination: 'file' }))}
                        className={cn(
                          'px-3 py-3 rounded-lg transition flex flex-col items-center gap-1.5',
                          exportSettings.destination === 'file'
                            ? 'bg-green-500/30 ring-1 ring-green-500 text-white'
                            : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                        )}
                      >
                        <Download size={18} />
                        <span className="text-xs">Downloads</span>
                      </button>
                      <button
                        onClick={() => setExportSettings(s => ({ ...s, destination: 'library' }))}
                        className={cn(
                          'px-3 py-3 rounded-lg transition flex flex-col items-center gap-1.5',
                          exportSettings.destination === 'library'
                            ? 'bg-green-500/30 ring-1 ring-green-500 text-white'
                            : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                        )}
                      >
                        <FolderPlus size={18} />
                        <span className="text-xs">Add to Library</span>
                      </button>
                      <button
                        onClick={() => setExportSettings(s => ({ ...s, destination: 'playlist' }))}
                        className={cn(
                          'px-3 py-3 rounded-lg transition flex flex-col items-center gap-1.5',
                          exportSettings.destination === 'playlist'
                            ? 'bg-green-500/30 ring-1 ring-green-500 text-white'
                            : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                        )}
                      >
                        <ListPlus size={18} />
                        <span className="text-xs">Add to Playlist</span>
                      </button>
                    </div>
                  </div>

                  {/* Export Info */}
                  <div className="bg-zinc-800/50 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-xs text-zinc-400">
                      <FileVideo size={14} />
                      <span>Estimated output: ~{Math.round((project.music?.duration || 0) * 2)}MB</span>
                    </div>
                  </div>
                </div>
              ) : (
                /* Progress View */
                <div className="py-6">
                  {/* Progress Circle/Bar */}
                  <div className="flex flex-col items-center">
                    {exportProgress.status === 'complete' ? (
                      <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mb-4">
                        <Check size={36} className="text-green-500" />
                      </div>
                    ) : exportProgress.status === 'error' ? (
                      <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center mb-4">
                        <AlertTriangle size={36} className="text-red-500" />
                      </div>
                    ) : (
                      <div className="w-20 h-20 rounded-full border-4 border-zinc-700 border-t-green-500 animate-spin mb-4" />
                    )}

                    <div className="text-center mb-4">
                      <div className="text-lg font-medium">
                        {exportProgress.status === 'complete' ? 'Export Complete!' :
                         exportProgress.status === 'error' ? 'Export Failed' :
                         `${Math.round(exportProgress.progress)}%`}
                      </div>
                      <div className="text-sm text-zinc-400 mt-1">{exportProgress.currentStep}</div>
                      {exportProgress.eta && exportProgress.status === 'encoding' && (
                        <div className="text-xs text-zinc-500 mt-1">{exportProgress.eta}</div>
                      )}
                    </div>

                    {/* Progress Bar */}
                    {exportProgress.status !== 'complete' && exportProgress.status !== 'error' && (
                      <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-green-500 to-emerald-500 transition-all duration-300"
                          style={{ width: `${exportProgress.progress}%` }}
                        />
                      </div>
                    )}

                    {/* Output path */}
                    {exportProgress.outputPath && (
                      <div className="mt-4 px-4 py-2 bg-zinc-800 rounded-lg text-xs text-zinc-400 font-mono">
                        {exportProgress.outputPath}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-zinc-800 flex items-center justify-end gap-3">
              {exportProgress.status === 'idle' ? (
                <>
                  <button
                    onClick={() => setShowExportModal(false)}
                    className="px-4 py-2 text-sm font-medium rounded-lg hover:bg-zinc-800 transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleStartExport}
                    disabled={!exportSettings.filename.trim()}
                    className="px-6 py-2 text-sm font-medium rounded-lg bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-400 hover:to-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2"
                  >
                    <Download size={14} />
                    Export
                  </button>
                </>
              ) : exportProgress.status === 'complete' || exportProgress.status === 'error' ? (
                <button
                  onClick={() => setShowExportModal(false)}
                  className="px-6 py-2 text-sm font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 transition"
                >
                  Close
                </button>
              ) : (
                <button
                  onClick={handleCancelExport}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 transition"
                >
                  Cancel Export
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Template Editor Modal */}
      {showTemplateEditor && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-zinc-900 rounded-2xl border border-zinc-700 w-full max-w-md mx-4 overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                  <LayoutTemplate size={16} className="text-purple-400" />
                </div>
                <h2 className="text-lg font-semibold">
                  {editingTemplate ? 'Edit Template' : 'Create Template'}
                </h2>
              </div>
              <button
                onClick={() => setShowTemplateEditor(false)}
                className="p-2 rounded-lg hover:bg-zinc-800 transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              {/* Name */}
              <div>
                <label className="text-sm text-zinc-400 block mb-1.5">Template Name</label>
                <input
                  type="text"
                  value={templateForm.name}
                  onChange={(e) => setTemplateForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="My Custom Template"
                  className="w-full px-4 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 focus:border-purple-500 focus:outline-none text-sm"
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-sm text-zinc-400 block mb-1.5">Description (optional)</label>
                <input
                  type="text"
                  value={templateForm.description}
                  onChange={(e) => setTemplateForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="A brief description of this template"
                  className="w-full px-4 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 focus:border-purple-500 focus:outline-none text-sm"
                />
              </div>

              {/* Beats per clip */}
              <div>
                <label className="text-sm text-zinc-400 block mb-1.5">Beats per Clip</label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0.5}
                    max={8}
                    step={0.5}
                    value={templateForm.beatsPerClip}
                    onChange={(e) => setTemplateForm(f => ({ ...f, beatsPerClip: Number(e.target.value) }))}
                    className="flex-1 accent-purple-500"
                  />
                  <span className="w-16 text-center text-sm font-medium bg-zinc-800 px-2 py-1 rounded">
                    {templateForm.beatsPerClip} {templateForm.beatsPerClip === 1 ? 'beat' : 'beats'}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-zinc-500 mt-1">
                  <span>Fast (½)</span>
                  <span>Slow (8)</span>
                </div>
              </div>

              {/* Crossfade */}
              <div>
                <label className="text-sm text-zinc-400 block mb-1.5">Crossfade Duration</label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={0.5}
                    step={0.05}
                    value={templateForm.crossfade}
                    onChange={(e) => setTemplateForm(f => ({ ...f, crossfade: Number(e.target.value) }))}
                    className="flex-1 accent-purple-500"
                  />
                  <span className="w-16 text-center text-sm font-medium bg-zinc-800 px-2 py-1 rounded">
                    {(templateForm.crossfade * 1000).toFixed(0)}ms
                  </span>
                </div>
                <div className="flex justify-between text-xs text-zinc-500 mt-1">
                  <span>Hard cut</span>
                  <span>500ms blend</span>
                </div>
              </div>

              {/* Options */}
              <div className="flex gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={templateForm.avoidConsecutive}
                    onChange={(e) => setTemplateForm(f => ({ ...f, avoidConsecutive: e.target.checked }))}
                    className="rounded border-zinc-600 bg-zinc-800 text-purple-500 focus:ring-purple-500"
                  />
                  <span className="text-zinc-300">Avoid consecutive clips</span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={templateForm.preferAction}
                    onChange={(e) => setTemplateForm(f => ({ ...f, preferAction: e.target.checked }))}
                    className="rounded border-zinc-600 bg-zinc-800 text-purple-500 focus:ring-purple-500"
                  />
                  <span className="text-zinc-300">Prefer action moments</span>
                </label>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-zinc-800 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowTemplateEditor(false)}
                className="px-4 py-2 text-sm font-medium rounded-lg hover:bg-zinc-800 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTemplate}
                disabled={!templateForm.name.trim()}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-purple-500 hover:bg-purple-400 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2"
              >
                <Sparkles size={14} />
                {editingTemplate ? 'Save Changes' : 'Create Template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default PmvEditorPage
