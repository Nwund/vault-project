// File: src/renderer/pages/CaptionsPage.tsx
//
// "Brainwash" — caption / filter editor. Lets the user add top+bottom
// text overlays plus image filters to images and GIFs. Includes the
// memoised CaptionedThumb child used by the captioned-media grid.
// Extracted from App.tsx as part of #48.

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Download,
  Edit2,
  Image as ImageIcon,
  Loader2,
  Maximize2,
  MessageSquare,
  Play,
  Plus,
  RefreshCw,
  Search,
  Shuffle,
  Sparkles,
  Trash2,
  Type,
  X,
  Zap,
} from 'lucide-react'
import Fuse from 'fuse.js'
import type { MediaRow, VaultSettings } from '../types'
import { useToast } from '../contexts'
import { cn } from '../utils/cn'
import { extractItems } from '../utils/api'
import { toFileUrlCached } from '../hooks/usePerformance'
import GifMakerModal from '../components/GifMakerModal'
import { expandCaptionTemplate, KNOWN_CAPTION_VARIABLES, type CaptionContext } from '../utils/caption-template'


// ═══════════════════════════════════════════════════════════════════════════
// CAPTIONS PAGE - "Brainwash" - Add captions to media
// ═══════════════════════════════════════════════════════════════════════════

interface CaptionedMedia {
  id: string
  mediaId: string
  topText: string | null
  bottomText: string | null
  presetId: string
  customStyle: string | null
  createdAt: number
  updatedAt: number
  path: string
  filename: string
  type: string
  thumbPath: string | null
}

interface CaptionTemplate {
  id: string
  topText: string | null
  bottomText: string | null
  category: string
  createdAt: number
}

// Example captions for inspiration
const EXAMPLE_CAPTIONS: Array<{ top: string | null; bottom: string | null; category: string }> = [
  // Mommy
  { top: "Mommy's throat is your cocksleeve", bottom: "Now fuck it like you hate me", category: "mommy" },
  { top: "MOMMY'S GOOD BOY", bottom: null, category: "mommy" },
  { top: "CUM FOR MOMMY", bottom: null, category: "mommy" },

  // Degrading
  { top: "You're just a set of holes for my cock", bottom: "And I'm going to ruin every single one", category: "degrading" },
  { top: "I'm daddy's good little cumdump", bottom: "Please pump my stomach full of your seed", category: "degrading" },
  { top: "Stare at my ass while I bounce on your dick", bottom: "Don't you dare look away, you pathetic fuck", category: "degrading" },
  { top: "I want you to ruin my makeup with your cum", bottom: "Cover my face until I'm unrecognizable", category: "degrading" },
  { top: "Choke me on your thick cock", bottom: "Make me gag and tear up like a good whore", category: "degrading" },
  { top: "I'm a worthless piece of fuckmeat", bottom: "Use me until I'm broken and discarded", category: "degrading" },

  // Goon
  { top: "Your mind is breaking and your cock is leaking", bottom: "Just let go and become a mindless gooner", category: "goon" },
  { top: "I'm a brainless gooner who needs porn", bottom: "Please melt my mind with your cock", category: "goon" },
  { top: null, bottom: "GOOD GOONER", category: "goon" },
  { top: null, bottom: "STROKE PUMP EDGE", category: "goon" },
  { top: null, bottom: "MINDLESS", category: "goon" },
  { top: null, bottom: "PORN IS LIFE", category: "goon" },
  { top: "I'm a mindless drone for your cock", bottom: "Please reprogram me to be your perfect slave", category: "goon" },

  // Bimbo
  { top: "Your cock is making me so stupid", bottom: "I can't think about anything but being fucked", category: "bimbo" },
  { top: "I'm a brainless bimbo fuckdoll", bottom: "My only purpose is to please your cock", category: "bimbo" },

  // Worship
  { top: "Your cock is my new religion", bottom: "I'm going to worship it every single day", category: "worship" },
  { top: "Beg for me to sit on your stupid face", bottom: "Smother you with this perfect ass", category: "worship" },

  // Cheating
  { top: "Your cock looks so much better than my husband's", bottom: "I'm going to drain your balls completely dry", category: "cheating" },
  { top: "I'm a cheating whore who loves big cock", bottom: "And I don't care who knows it", category: "cheating" },

  // Submissive
  { top: "Thank you for using my throat, sir", bottom: "I love being a worthless little cocksucker", category: "submissive" },
  { top: "My ass is yours to destroy", bottom: "Stretch me out until I'm gaping for you", category: "submissive" },
  { top: "I'm a public cumdump for anyone to use", bottom: "Please fill my holes with your hot load", category: "submissive" },
  { top: "I'm a submissive little puppy for my master", bottom: "Please train me to be the perfect pet", category: "submissive" },

  // Gangbang
  { top: "I'm a gangbang whore who loves being used", bottom: "Please pass me around to all your friends", category: "gangbang" },
]


// Thumbnail component with on-demand generation for captioned media
// Uses IntersectionObserver for lazy loading to improve performance
// Memoized to prevent re-renders when parent state changes
const CaptionedThumb = memo(function CaptionedThumb({ mediaId, thumbPath, filename, filePath, className, style }: { mediaId: string; thumbPath: string | null; filename: string; filePath?: string | null; className?: string; style?: React.CSSProperties }) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  // Eager-load by default. The earlier IntersectionObserver gate measured against
  // the document viewport, but Brainwash renders this grid inside a scrolling
  // 400px container — so tiles never registered as "intersecting" until a
  // click forced a re-layout, which is why thumbnails appeared blank until
  // clicked. urlCache + on-disk thumbs make eager-load cheap here.
  const [isVisible, setIsVisible] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isVisible) return // Don't load until visible

    let cancelled = false
    async function loadThumb() {
      setLoading(true)
      try {
        // Always use thumbnail path first for performance
        if (thumbPath) {
          const url = await toFileUrlCached(thumbPath)
          if (!cancelled && url) {
            setThumbUrl(url)
            setLoading(false)
            return
          }
        }

        // Fall back to file path for images (only if no thumbnail)
        const ext = (filename || '').toLowerCase()
        const isImage = ext.endsWith('.png') || ext.endsWith('.jpg') || ext.endsWith('.jpeg') ||
                        ext.endsWith('.webp') || ext.endsWith('.bmp') || ext.endsWith('.gif')

        if (isImage && filePath) {
          const url = await toFileUrlCached(filePath)
          if (!cancelled && url) {
            setThumbUrl(url)
            setLoading(false)
            return
          }
        }

        // Last resort - request on-demand generation
        const generatedUrl = await window.api.media.generateThumb(mediaId)
        if (!cancelled && generatedUrl) {
          setThumbUrl(generatedUrl)
        }
      } catch (err) {
        console.error('[CaptionedThumb] Error loading thumbnail:', err)
      }
      if (!cancelled) setLoading(false)
    }
    loadThumb()
    return () => { cancelled = true }
  }, [mediaId, thumbPath, filePath, filename, isVisible])

  return (
    <div
      ref={containerRef}
      className={cn("w-full h-full relative", className)}
      style={style}
    >
      {!isVisible || (loading && !thumbUrl) ? (
        // Pure-CSS placeholder — no extra image DOM at scale.
        <div className="w-full h-full bg-black/50 flex items-center justify-center">
          <div className="w-6 h-6 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
        </div>
      ) : !thumbUrl ? (
        <div className="w-full h-full flex items-center justify-center bg-black/30">
          <ImageIcon size={24} className="text-[var(--muted)]" />
        </div>
      ) : (
        <img
          src={thumbUrl}
          alt={filename}
          className="w-full h-full object-cover"
          loading="lazy"
          decoding="async"
          // Tell the browser these aren't critical — let them yield to higher-pri loads
          // (Vite typings don't know about fetchpriority yet, but Chromium does)
          {...({ fetchpriority: 'low' } as any)}
          onError={(e) => {
            // If thumbnail fails to load, show placeholder
            e.currentTarget.style.display = 'none'
          }}
        />
      )}
    </div>
  )
})

// Image filter types for stacking
type ImageFilter = 'invert' | 'grayscale' | 'sepia' | 'saturate' | 'contrast' | 'brightness' | 'blur' | 'hueRotate' | 'pixelate' | 'lowQuality' | 'vignette'

const FILTER_PRESETS: { id: string; name: string; filters: ImageFilter[]; values?: Partial<Record<ImageFilter, number>> }[] = [
  { id: 'none', name: 'None', filters: [] },
  { id: 'retro', name: 'Retro VHS', filters: ['sepia', 'contrast', 'saturate'], values: { sepia: 0.3, contrast: 1.2, saturate: 1.3 } },
  { id: 'thermal', name: 'Thermal', filters: ['hueRotate', 'saturate', 'contrast'], values: { hueRotate: 180, saturate: 2, contrast: 1.3 } },
  { id: 'noir', name: 'Noir', filters: ['grayscale', 'contrast'], values: { grayscale: 1, contrast: 1.4 } },
  { id: 'dreamy', name: 'Dreamy', filters: ['blur', 'saturate', 'brightness'], values: { blur: 1, saturate: 1.5, brightness: 1.1 } },
  { id: 'negative', name: 'Negative', filters: ['invert'], values: { invert: 1 } },
  { id: 'intense', name: 'Intense', filters: ['saturate', 'contrast'], values: { saturate: 2, contrast: 1.5 } },
  { id: 'faded', name: 'Faded', filters: ['grayscale', 'brightness'], values: { grayscale: 0.5, brightness: 1.2 } },
  { id: 'psychedelic', name: 'Psychedelic', filters: ['hueRotate', 'saturate', 'invert'], values: { hueRotate: 90, saturate: 3, invert: 0.2 } },
  { id: 'pixelated', name: 'Pixelated', filters: ['pixelate'], values: { pixelate: 8 } },
  { id: 'lowquality', name: 'Low Quality', filters: ['lowQuality', 'contrast', 'blur'], values: { lowQuality: 5, contrast: 1.1, blur: 0.5 } },
  { id: 'corrupted', name: 'Corrupted', filters: ['pixelate', 'hueRotate', 'contrast'], values: { pixelate: 4, hueRotate: 30, contrast: 1.3 } },
  { id: 'vaporwave', name: 'Vaporwave', filters: ['saturate', 'hueRotate', 'contrast'], values: { saturate: 1.8, hueRotate: 280, contrast: 1.2 } },
  { id: 'cinematic', name: 'Cinematic', filters: ['vignette', 'contrast', 'saturate'], values: { vignette: 0.6, contrast: 1.2, saturate: 0.9 } },
  { id: 'dramatic', name: 'Dramatic', filters: ['vignette', 'contrast', 'brightness'], values: { vignette: 0.8, contrast: 1.4, brightness: 0.9 } },
  { id: 'moody', name: 'Moody', filters: ['vignette', 'grayscale', 'contrast'], values: { vignette: 0.7, grayscale: 0.3, contrast: 1.3 } },
]

export function CaptionsPage({ settings }: { settings: VaultSettings | null }) {
  const { showToast } = useToast()
  const [captionedMedia, setCaptionedMedia] = useState<CaptionedMedia[]>([])
  const [templates, setTemplates] = useState<CaptionTemplate[]>([])
  // Templates panel — Create New form + AI Generate flow
  const [showCreateTemplateForm, setShowCreateTemplateForm] = useState(false)
  const [newTemplateTop, setNewTemplateTop] = useState('')
  const [newTemplateBottom, setNewTemplateBottom] = useState('')
  const [newTemplateCategory, setNewTemplateCategory] = useState('dirty')
  const [aiGeneratingTemplates, setAiGeneratingTemplates] = useState(false)
  const [allMedia, setAllMedia] = useState<MediaRow[]>([])
  const [selectedMedia, setSelectedMedia] = useState<MediaRow | null>(null)
  const [topText, setTopText] = useState('')
  const [bottomText, setBottomText] = useState('')
  const [selectedPreset, setSelectedPreset] = useState('default')
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  // Note: 'gifmaker' kept as a runtime-valid value so persisted state from
  // older sessions doesn't crash the type, but the tab list no longer
  // surfaces it — see the Tabs section. The editor branch's "Make GIF"
  // button is now the canonical entry point for GIF creation.
  const [activeTab, setActiveTab] = useState<'editor' | 'captioned' | 'templates' | 'gifmaker'>('editor')
  const [captionModeEnabled, setCaptionModeEnabled] = useState(settings?.captions?.enabled ?? false)
  // Tag list for the currently-selected media — fetched on selection
  // change so caption-template variables like {tag1}, {tags}, and
  // {performer} (derived from `performer:Name` tags) can resolve.
  const [selectedMediaTags, setSelectedMediaTags] = useState<string[]>([])
  useEffect(() => {
    if (!selectedMedia?.id) { setSelectedMediaTags([]); return }
    let cancelled = false
    void (async () => {
      try {
        const tags: any = await window.api.tags.listForMedia(selectedMedia.id)
        const names: string[] = Array.isArray(tags)
          ? tags.map((t: any) => typeof t === 'string' ? t : t?.name).filter(Boolean)
          : []
        if (!cancelled) setSelectedMediaTags(names)
      } catch {
        if (!cancelled) setSelectedMediaTags([])
      }
    })()
    return () => { cancelled = true }
  }, [selectedMedia?.id])
  // Context used to expand {performer}, {duration}, {tags}, etc. at
  // render time. Performers are extracted from tags prefixed with
  // `performer:` (the canonical convention).
  const captionCtx = useMemo<CaptionContext>(() => {
    const performers = selectedMediaTags
      .filter((t) => t.toLowerCase().startsWith('performer:'))
      .map((t) => t.slice('performer:'.length).trim())
    return {
      filename: selectedMedia?.filename ?? null,
      durationSec: selectedMedia?.durationSec ?? null,
      tags: selectedMediaTags.filter((t) => !t.includes(':')),
      performers,
    }
  }, [selectedMedia, selectedMediaTags])
  // Memoize the expanded preview strings so re-renders of unrelated
  // panel sections don't re-walk the template.
  const expandedTopText = useMemo(() => expandCaptionTemplate(topText, captionCtx), [topText, captionCtx])
  const expandedBottomText = useMemo(() => expandCaptionTemplate(bottomText, captionCtx), [bottomText, captionCtx])

  // New filter states
  const [activeFilters, setActiveFilters] = useState<ImageFilter[]>([])
  const [filterValues, setFilterValues] = useState<Record<ImageFilter, number>>({
    invert: 0, grayscale: 0, sepia: 0, saturate: 1, contrast: 1,
    brightness: 1, blur: 0, hueRotate: 0, pixelate: 0, lowQuality: 0, vignette: 0
  })

  // Caption bar settings
  const [showCaptionBar, setShowCaptionBar] = useState(false)
  const [captionBarColor, setCaptionBarColor] = useState<'black' | 'white'>('black')
  const [captionBarSize, setCaptionBarSize] = useState(60) // pixels
  const [captionBarPosition, setCaptionBarPosition] = useState<'top' | 'bottom' | 'both'>('both')

  // Text position (for draggable text)
  const [topTextY, setTopTextY] = useState(10) // percent from top
  const [bottomTextY, setBottomTextY] = useState(90) // percent from top
  const [isDraggingText, setIsDraggingText] = useState<'top' | 'bottom' | null>(null)
  const imageContainerRef = useRef<HTMLDivElement>(null)

  // Floating text labels
  type FloatingLabel = {
    id: string
    text: string
    x: number // percent
    y: number // percent
    fontSize: number
    color: string
    fontFamily: string
    shadow: boolean
    rotation: number
  }
  const [floatingLabels, setFloatingLabels] = useState<FloatingLabel[]>([])
  const [draggingLabelId, setDraggingLabelId] = useState<string | null>(null)
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null)
  const labelDragOffset = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

  // Crop functionality
  const [cropMode, setCropMode] = useState(false)
  const [cropSelection, setCropSelection] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null)
  const [isCropping, setIsCropping] = useState(false)
  const [croppedImageUrl, setCroppedImageUrl] = useState<string | null>(null)
  const cropStartRef = useRef<{ x: number; y: number } | null>(null)

  // Preview URL - must be declared before crop handlers that use it
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  // Video frame capture state
  const [capturedFrameUrl, setCapturedFrameUrl] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)

  // Image loading error state for GIFs and images
  const [imageLoadError, setImageLoadError] = useState(false)
  const [imageRetryCount, setImageRetryCount] = useState(0)

  // GIF Maker state
  const [gifStartTime, setGifStartTime] = useState(0)
  const [gifEndTime, setGifEndTime] = useState(3)
  const [gifFps, setGifFps] = useState(15)
  const [gifQuality, setGifQuality] = useState<'low' | 'medium' | 'high'>('medium')
  const [gifGenerating, setGifGenerating] = useState(false)
  // Modal entry-point for the GIF maker (called from inside the editor toolbar)
  const [showGifModal, setShowGifModal] = useState(false)
  const [gifPreviewUrl, setGifPreviewUrl] = useState<string | null>(null)
  const [gifOutputPath, setGifOutputPath] = useState<string | null>(null)
  const [gifVideoUrl, setGifVideoUrl] = useState<string | null>(null)
  const [gifSelectedVideo, setGifSelectedVideo] = useState<MediaRow | null>(null)
  const gifVideoRef = useRef<HTMLVideoElement>(null)
  const [gifShuffledVideos, setGifShuffledVideos] = useState<MediaRow[]>([])
  const [gifSearchQuery, setGifSearchQuery] = useState('')
  const [gifRenameValue, setGifRenameValue] = useState('')

  // Edit captioned media
  const [editingCaption, setEditingCaption] = useState<CaptionedMedia | null>(null)
  const [editCaptionTop, setEditCaptionTop] = useState('')
  const [editCaptionBottom, setEditCaptionBottom] = useState('')

  // Handle text drag
  const handleTextDragStart = useCallback((which: 'top' | 'bottom') => (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingText(which)
  }, [])

  const handleTextDrag = useCallback((e: MouseEvent) => {
    if (!isDraggingText || !imageContainerRef.current) return

    const rect = imageContainerRef.current.getBoundingClientRect()
    const relativeY = e.clientY - rect.top
    const percentY = Math.max(5, Math.min(95, (relativeY / rect.height) * 100))

    if (isDraggingText === 'top') {
      setTopTextY(Math.round(percentY))
    } else {
      setBottomTextY(Math.round(percentY))
    }
  }, [isDraggingText])

  const handleTextDragEnd = useCallback(() => {
    setIsDraggingText(null)
  }, [])

  // Global mouse handlers for drag
  useEffect(() => {
    if (isDraggingText) {
      document.addEventListener('mousemove', handleTextDrag)
      document.addEventListener('mouseup', handleTextDragEnd)
      return () => {
        document.removeEventListener('mousemove', handleTextDrag)
        document.removeEventListener('mouseup', handleTextDragEnd)
      }
    }
  }, [isDraggingText, handleTextDrag, handleTextDragEnd])

  // Floating label handlers
  const addFloatingLabel = useCallback(() => {
    const newLabel: FloatingLabel = {
      id: `label-${Date.now()}`,
      text: 'New Label',
      x: 50,
      y: 50,
      fontSize: 24,
      color: '#ffffff',
      fontFamily: 'Impact',
      shadow: true,
      rotation: 0
    }
    setFloatingLabels(prev => [...prev, newLabel])
    setEditingLabelId(newLabel.id)
  }, [])

  const updateFloatingLabel = useCallback((id: string, updates: Partial<FloatingLabel>) => {
    setFloatingLabels(prev => prev.map(label =>
      label.id === id ? { ...label, ...updates } : label
    ))
  }, [])

  const deleteFloatingLabel = useCallback((id: string) => {
    setFloatingLabels(prev => prev.filter(label => label.id !== id))
    if (editingLabelId === id) setEditingLabelId(null)
  }, [editingLabelId])

  const handleLabelDragStart = useCallback((id: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!imageContainerRef.current) return
    const rect = imageContainerRef.current.getBoundingClientRect()
    const label = floatingLabels.find(l => l.id === id)
    if (!label) return
    const labelX = (label.x / 100) * rect.width
    const labelY = (label.y / 100) * rect.height
    labelDragOffset.current = {
      x: e.clientX - rect.left - labelX,
      y: e.clientY - rect.top - labelY
    }
    setDraggingLabelId(id)
  }, [floatingLabels])

  const handleLabelDrag = useCallback((e: MouseEvent) => {
    if (!draggingLabelId || !imageContainerRef.current) return
    const rect = imageContainerRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left - labelDragOffset.current.x) / rect.width) * 100))
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top - labelDragOffset.current.y) / rect.height) * 100))
    updateFloatingLabel(draggingLabelId, { x, y })
  }, [draggingLabelId, updateFloatingLabel])

  const handleLabelDragEnd = useCallback(() => {
    setDraggingLabelId(null)
  }, [])

  useEffect(() => {
    if (draggingLabelId) {
      document.addEventListener('mousemove', handleLabelDrag)
      document.addEventListener('mouseup', handleLabelDragEnd)
      return () => {
        document.removeEventListener('mousemove', handleLabelDrag)
        document.removeEventListener('mouseup', handleLabelDragEnd)
      }
    }
  }, [draggingLabelId, handleLabelDrag, handleLabelDragEnd])

  // Crop handlers
  const handleCropStart = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!cropMode || !imageContainerRef.current) return
    e.preventDefault()
    const rect = imageContainerRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    cropStartRef.current = { x, y }
    setCropSelection({ startX: x, startY: y, endX: x, endY: y })
    setIsCropping(true)
  }, [cropMode])

  const handleCropMove = useCallback((e: MouseEvent) => {
    if (!isCropping || !cropStartRef.current || !imageContainerRef.current) return
    const rect = imageContainerRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100))
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100))
    setCropSelection({
      startX: cropStartRef.current.x,
      startY: cropStartRef.current.y,
      endX: x,
      endY: y
    })
  }, [isCropping])

  const handleCropEnd = useCallback(() => {
    setIsCropping(false)
    cropStartRef.current = null
  }, [])

  // Global handlers for crop dragging
  useEffect(() => {
    if (isCropping) {
      document.addEventListener('mousemove', handleCropMove)
      document.addEventListener('mouseup', handleCropEnd)
      return () => {
        document.removeEventListener('mousemove', handleCropMove)
        document.removeEventListener('mouseup', handleCropEnd)
      }
    }
  }, [isCropping, handleCropMove, handleCropEnd])

  // Check if selected media is a GIF
  const isSelectedGif = useMemo(() => {
    if (!selectedMedia) return false
    const filename = (selectedMedia.filename || selectedMedia.path || '').toLowerCase()
    return filename.endsWith('.gif') || selectedMedia.type === 'gif'
  }, [selectedMedia])

  // Apply crop to create a new cropped image
  const applyCrop = useCallback(async () => {
    if (!cropSelection || !previewUrl) return

    // Normalize coordinates (handle negative selections)
    const x1 = Math.min(cropSelection.startX, cropSelection.endX)
    const y1 = Math.min(cropSelection.startY, cropSelection.endY)
    const x2 = Math.max(cropSelection.startX, cropSelection.endX)
    const y2 = Math.max(cropSelection.startY, cropSelection.endY)

    // Skip if selection is too small
    if (x2 - x1 < 5 || y2 - y1 < 5) {
      showToast('warning', 'Selection too small. Draw a larger crop area.')
      return
    }

    try {
      // Load the image
      const img = new Image()
      img.crossOrigin = 'anonymous'
      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
        img.src = previewUrl
      })

      // Calculate actual pixel coordinates
      const cropX = Math.round((x1 / 100) * img.naturalWidth)
      const cropY = Math.round((y1 / 100) * img.naturalHeight)
      const cropW = Math.round(((x2 - x1) / 100) * img.naturalWidth)
      const cropH = Math.round(((y2 - y1) / 100) * img.naturalHeight)

      // Create canvas and crop
      const canvas = document.createElement('canvas')
      canvas.width = cropW
      canvas.height = cropH
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Could not get canvas context')

      ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH)

      // Get data URL
      const dataUrl = canvas.toDataURL('image/png')
      setCroppedImageUrl(dataUrl)
      setCropSelection(null)
      setCropMode(false)

      // Show appropriate message
      if (isSelectedGif) {
        showToast('warning', 'GIF cropped as static image (animation not preserved)')
      } else {
        showToast('success', 'Image cropped successfully!')
      }
    } catch (err) {
      console.error('[Brainwash] Crop failed:', err)
      showToast('error', 'Failed to crop image')
    }
  }, [cropSelection, previewUrl, showToast, isSelectedGif])

  // Reset crop
  const resetCrop = useCallback(() => {
    setCroppedImageUrl(null)
    setCropSelection(null)
    setCropMode(false)
  }, [])

  // Capture current video frame
  const captureVideoFrame = useCallback(() => {
    if (!videoRef.current) {
      showToast('error', 'No video loaded')
      return
    }

    const video = videoRef.current
    if (video.readyState < 2) {
      showToast('warning', 'Video not ready yet. Please wait.')
      return
    }

    try {
      // Create canvas to capture frame
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Could not get canvas context')

      // Draw current video frame
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      // Convert to data URL
      const dataUrl = canvas.toDataURL('image/png')
      setCapturedFrameUrl(dataUrl)
      setPreviewUrl(dataUrl) // Use captured frame as preview for captioning
      showToast('success', 'Frame captured! You can now add captions.')
    } catch (err) {
      console.error('[Brainwash] Frame capture failed:', err)
      showToast('error', 'Failed to capture frame')
    }
  }, [showToast])

  // Reset captured frame
  const resetCapturedFrame = useCallback(() => {
    setCapturedFrameUrl(null)
    setPreviewUrl(null)
  }, [])

  // Check if current media is a video
  const isSelectedVideo = useMemo(() => {
    if (!selectedMedia) return false
    return selectedMedia.type === 'video'
  }, [selectedMedia])

  // AI caption generation state
  const [generatingCaption, setGeneratingCaption] = useState(false)
  const [veniceConfigured, setVeniceConfigured] = useState(false)
  const [selectedFilterPreset, setSelectedFilterPreset] = useState('none')

  // Check Venice AI status on mount
  useEffect(() => {
    window.api.ai.veniceStatus?.().then((status: { configured: boolean } | null) => {
      setVeniceConfigured(status?.configured ?? false)
    }).catch(() => setVeniceConfigured(false))
  }, [])
  const [mediaTypeFilter, setMediaTypeFilter] = useState<'all' | 'image' | 'gif' | 'video'>('all')

  // Default caption presets (fallback if settings don't have them)
  const DEFAULT_PRESETS = [
    // Each fontFamily uses a vibe-matched Google Font (imported in index.css)
    // with a generic fallback so designs degrade gracefully if the network blocks fonts.
    { id: 'default', name: 'Classic Meme', fontFamily: '"Anton", Impact, sans-serif', fontSize: 48, fontColor: '#ffffff', fontWeight: 'bold' as const, textShadow: false, shadowColor: '#000000', strokeEnabled: true, strokeColor: '#000000', strokeWidth: 2, backgroundColor: 'transparent', backgroundOpacity: 0, textTransform: 'uppercase' as const, position: 'both' as const },
    { id: 'sissy', name: 'Sissy Pink', fontFamily: '"Pacifico", "Brush Script MT", cursive', fontSize: 36, fontColor: '#ff69b4', fontWeight: 'bold' as const, textShadow: true, shadowColor: '#000000', strokeEnabled: true, strokeColor: '#ffffff', strokeWidth: 1, backgroundColor: 'transparent', backgroundOpacity: 0, textTransform: 'none' as const, position: 'both' as const },
    { id: 'degrading', name: 'Degrading', fontFamily: '"Bowlby One", "Arial Black", sans-serif', fontSize: 42, fontColor: '#ff0000', fontWeight: 'bolder' as const, textShadow: true, shadowColor: '#000000', strokeEnabled: true, strokeColor: '#000000', strokeWidth: 2, backgroundColor: 'transparent', backgroundOpacity: 0, textTransform: 'uppercase' as const, position: 'both' as const },
    { id: 'neon', name: 'Neon Glow', fontFamily: '"Audiowide", "Arial", sans-serif', fontSize: 40, fontColor: '#00ffff', fontWeight: 'bold' as const, textShadow: true, shadowColor: '#00ffff', strokeEnabled: true, strokeColor: '#ff00ff', strokeWidth: 2, backgroundColor: 'transparent', backgroundOpacity: 0, textTransform: 'uppercase' as const, position: 'both' as const },
    { id: 'hypno', name: 'Hypno', fontFamily: '"Faster One", "Times New Roman", serif', fontSize: 44, fontColor: '#9400d3', fontWeight: 'bold' as const, textShadow: true, shadowColor: '#ff00ff', strokeEnabled: true, strokeColor: '#ffffff', strokeWidth: 1, backgroundColor: 'transparent', backgroundOpacity: 0, textTransform: 'lowercase' as const, position: 'both' as const },
    { id: 'bimbo', name: 'Bimbo', fontFamily: '"Bubblegum Sans", "Comic Sans MS", cursive', fontSize: 38, fontColor: '#ff1493', fontWeight: 'bold' as const, textShadow: true, shadowColor: '#ffb6c1', strokeEnabled: true, strokeColor: '#ffffff', strokeWidth: 2, backgroundColor: 'transparent', backgroundOpacity: 0, textTransform: 'none' as const, position: 'both' as const },
    { id: 'domme', name: 'Domme', fontFamily: '"Cinzel", Georgia, serif', fontSize: 36, fontColor: '#8b0000', fontWeight: 'bold' as const, textShadow: true, shadowColor: '#000000', strokeEnabled: true, strokeColor: '#ffd700', strokeWidth: 1, backgroundColor: 'transparent', backgroundOpacity: 0, textTransform: 'uppercase' as const, position: 'both' as const },
    { id: 'edging', name: 'Edge Mode', fontFamily: '"Bungee", Impact, sans-serif', fontSize: 46, fontColor: '#ff4500', fontWeight: 'bold' as const, textShadow: true, shadowColor: '#ff0000', strokeEnabled: true, strokeColor: '#000000', strokeWidth: 3, backgroundColor: 'transparent', backgroundOpacity: 0, textTransform: 'uppercase' as const, position: 'both' as const },
    { id: 'subliminal', name: 'Subliminal', fontFamily: '"Major Mono Display", "Courier New", monospace', fontSize: 28, fontColor: 'rgba(255,255,255,0.3)', fontWeight: 'normal' as const, textShadow: false, shadowColor: 'transparent', strokeEnabled: false, strokeColor: 'transparent', strokeWidth: 0, backgroundColor: 'transparent', backgroundOpacity: 0, textTransform: 'lowercase' as const, position: 'both' as const },
    { id: 'glitch', name: 'Glitch', fontFamily: '"VT323", "Courier New", monospace', fontSize: 40, fontColor: '#00ff00', fontWeight: 'bold' as const, textShadow: true, shadowColor: '#ff0000', strokeEnabled: true, strokeColor: '#0000ff', strokeWidth: 2, backgroundColor: 'transparent', backgroundOpacity: 0, textTransform: 'uppercase' as const, position: 'both' as const },
    { id: 'retro', name: 'Retro 80s', fontFamily: '"Monoton", "Arial Black", sans-serif', fontSize: 44, fontColor: '#ff00ff', fontWeight: 'bold' as const, textShadow: true, shadowColor: '#00ffff', strokeEnabled: true, strokeColor: '#ffff00', strokeWidth: 3, backgroundColor: 'transparent', backgroundOpacity: 0, textTransform: 'uppercase' as const, position: 'both' as const },
    { id: 'elegant', name: 'Elegant', fontFamily: '"Playfair Display", Georgia, serif', fontSize: 36, fontColor: '#ffd700', fontWeight: 'normal' as const, textShadow: true, shadowColor: '#000000', strokeEnabled: false, strokeColor: 'transparent', strokeWidth: 0, backgroundColor: 'transparent', backgroundOpacity: 0, textTransform: 'none' as const, position: 'both' as const },
    { id: 'brutal', name: 'Brutal', fontFamily: '"Bowlby One SC", Impact, sans-serif', fontSize: 52, fontColor: '#ff0000', fontWeight: 'bold' as const, textShadow: true, shadowColor: '#000000', strokeEnabled: true, strokeColor: '#ffffff', strokeWidth: 4, backgroundColor: 'transparent', backgroundOpacity: 0, textTransform: 'uppercase' as const, position: 'both' as const },
    { id: 'cute', name: 'Cute', fontFamily: '"Fredoka", "Comic Sans MS", sans-serif', fontSize: 34, fontColor: '#ffb6c1', fontWeight: 'bold' as const, textShadow: true, shadowColor: '#ff69b4', strokeEnabled: true, strokeColor: '#ffffff', strokeWidth: 2, backgroundColor: 'transparent', backgroundOpacity: 0, textTransform: 'none' as const, position: 'both' as const },
    { id: 'dark', name: 'Dark Mode', fontFamily: '"Roboto Slab", Georgia, serif', fontSize: 38, fontColor: '#333333', fontWeight: 'bold' as const, textShadow: true, shadowColor: '#000000', strokeEnabled: true, strokeColor: '#666666', strokeWidth: 2, backgroundColor: 'transparent', backgroundOpacity: 0, textTransform: 'uppercase' as const, position: 'both' as const },
    { id: 'anime', name: 'Anime', fontFamily: '"Bangers", "Arial Black", sans-serif', fontSize: 36, fontColor: '#ffffff', fontWeight: 'bold' as const, textShadow: true, shadowColor: '#ff69b4', strokeEnabled: true, strokeColor: '#000000', strokeWidth: 3, backgroundColor: 'transparent', backgroundOpacity: 0, textTransform: 'none' as const, position: 'both' as const },
    { id: 'hentai', name: 'Hentai', fontFamily: '"Black Ops One", "Arial Black", sans-serif', fontSize: 40, fontColor: '#ff1493', fontWeight: 'bold' as const, textShadow: true, shadowColor: '#9400d3', strokeEnabled: true, strokeColor: '#ffffff', strokeWidth: 2, backgroundColor: 'transparent', backgroundOpacity: 0, textTransform: 'uppercase' as const, position: 'both' as const },
    // Social media styles
    { id: 'snapchat', name: 'Snapchat', fontFamily: '"Inter", "Helvetica Neue", Arial, sans-serif', fontSize: 32, fontColor: '#00bfff', fontWeight: 'bold' as const, textShadow: false, shadowColor: 'transparent', strokeEnabled: false, strokeColor: 'transparent', strokeWidth: 0, backgroundColor: 'rgba(0,0,0,0.6)', backgroundOpacity: 0.6, textTransform: 'none' as const, position: 'center' as const },
    { id: 'story', name: 'Story Mode', fontFamily: '"Inter", Arial, sans-serif', fontSize: 28, fontColor: '#ffffff', fontWeight: 'normal' as const, textShadow: true, shadowColor: '#000000', strokeEnabled: false, strokeColor: 'transparent', strokeWidth: 0, backgroundColor: 'rgba(0,0,0,0.5)', backgroundOpacity: 0.5, textTransform: 'none' as const, position: 'center' as const },
    { id: 'tiktok', name: 'TikTok', fontFamily: '"Manrope", Arial, sans-serif', fontSize: 36, fontColor: '#ffd700', fontWeight: 'bold' as const, textShadow: true, shadowColor: '#000000', strokeEnabled: true, strokeColor: '#000000', strokeWidth: 1, backgroundColor: 'transparent', backgroundOpacity: 0, textTransform: 'none' as const, position: 'bottom' as const },
    { id: 'category', name: 'Category Badge', fontFamily: '"Bebas Neue", Impact, sans-serif', fontSize: 56, fontColor: '#ffffff', fontWeight: 'bold' as const, textShadow: true, shadowColor: '#000000', strokeEnabled: true, strokeColor: '#000000', strokeWidth: 4, backgroundColor: 'transparent', backgroundOpacity: 0, textTransform: 'uppercase' as const, position: 'bottom' as const },
    { id: 'goon', name: 'Goon Mode', fontFamily: '"Bungee Spice", Impact, sans-serif', fontSize: 44, fontColor: '#ff00ff', fontWeight: 'bold' as const, textShadow: true, shadowColor: '#000000', strokeEnabled: true, strokeColor: '#ffffff', strokeWidth: 3, backgroundColor: 'transparent', backgroundOpacity: 0, textTransform: 'lowercase' as const, position: 'both' as const },
    { id: 'cuck', name: 'Cuck', fontFamily: '"Bowlby One", "Arial Black", sans-serif', fontSize: 38, fontColor: '#ffffff', fontWeight: 'bold' as const, textShadow: true, shadowColor: '#000000', strokeEnabled: true, strokeColor: '#000000', strokeWidth: 2, backgroundColor: 'transparent', backgroundOpacity: 0, textTransform: 'none' as const, position: 'top' as const },
    // 2026 round — extra display fonts to fit underused vibes
    { id: 'horror', name: 'Horror', fontFamily: '"Creepster", "Bowlby One", cursive', fontSize: 44, fontColor: '#9b1c1c', fontWeight: 'bold' as const, textShadow: true, shadowColor: '#000000', strokeEnabled: true, strokeColor: '#000000', strokeWidth: 2, backgroundColor: 'transparent', backgroundOpacity: 0, textTransform: 'uppercase' as const, position: 'both' as const },
    { id: 'romantic', name: 'Romantic', fontFamily: '"Sacramento", "Brush Script MT", cursive', fontSize: 38, fontColor: '#ff80ab', fontWeight: 'normal' as const, textShadow: true, shadowColor: '#000000', strokeEnabled: false, strokeColor: 'transparent', strokeWidth: 0, backgroundColor: 'transparent', backgroundOpacity: 0, textTransform: 'none' as const, position: 'both' as const },
    { id: 'cyberpunk', name: 'Cyberpunk', fontFamily: '"Wallpoet", "Audiowide", sans-serif', fontSize: 42, fontColor: '#39ff14', fontWeight: 'bold' as const, textShadow: true, shadowColor: '#ff1744', strokeEnabled: true, strokeColor: '#000000', strokeWidth: 2, backgroundColor: 'transparent', backgroundOpacity: 0, textTransform: 'uppercase' as const, position: 'both' as const },
    { id: 'graffiti', name: 'Graffiti', fontFamily: '"Nosifer", "Bangers", cursive', fontSize: 46, fontColor: '#ffffff', fontWeight: 'bold' as const, textShadow: true, shadowColor: '#ff1493', strokeEnabled: true, strokeColor: '#000000', strokeWidth: 3, backgroundColor: 'transparent', backgroundOpacity: 0, textTransform: 'uppercase' as const, position: 'both' as const },
  ]

  // Always use DEFAULT_PRESETS - they have all 17 built-in styles
  const presets = DEFAULT_PRESETS

  // Build CSS filter string from active filters
  const buildFilterCSS = useCallback(() => {
    const parts: string[] = []
    if (filterValues.invert > 0) parts.push(`invert(${filterValues.invert})`)
    if (filterValues.grayscale > 0) parts.push(`grayscale(${filterValues.grayscale})`)
    if (filterValues.sepia > 0) parts.push(`sepia(${filterValues.sepia})`)
    if (filterValues.saturate !== 1) parts.push(`saturate(${filterValues.saturate})`)
    if (filterValues.contrast !== 1) parts.push(`contrast(${filterValues.contrast})`)
    if (filterValues.brightness !== 1) parts.push(`brightness(${filterValues.brightness})`)
    if (filterValues.blur > 0) parts.push(`blur(${filterValues.blur}px)`)
    if (filterValues.hueRotate !== 0) parts.push(`hue-rotate(${filterValues.hueRotate}deg)`)
    // Low quality adds blur + contrast boost to simulate compression
    if (filterValues.lowQuality > 0) {
      parts.push(`blur(${filterValues.lowQuality * 0.2}px)`)
      parts.push(`contrast(${1 + filterValues.lowQuality * 0.05})`)
    }
    return parts.length > 0 ? parts.join(' ') : 'none'
  }, [filterValues])

  // Build pixelation style (uses CSS image-rendering)
  const getPixelateStyle = useCallback((): React.CSSProperties => {
    if (filterValues.pixelate <= 0) return {}
    const scale = Math.max(1, 100 / (filterValues.pixelate * 10))
    return {
      imageRendering: 'pixelated' as const,
      transform: `scale(${1 / scale})`,
      transformOrigin: 'center center',
    }
  }, [filterValues.pixelate])

  // Load preview URL for selected media (supports GIFs and videos)
  useEffect(() => {
    if (!selectedMedia) {
      setPreviewUrl(null)
      setVideoUrl(null)
      setCapturedFrameUrl(null)
      setImageLoadError(false)
      setImageRetryCount(0)
      return
    }

    let cancelled = false
    const loadPreview = async () => {
      // Reset error state when loading new media
      setImageLoadError(false)

      try {
        const filename = selectedMedia.filename?.toLowerCase() || ''
        const isGif = filename.endsWith('.gif')
        const isImageExt = filename.endsWith('.png') || filename.endsWith('.jpg') ||
          filename.endsWith('.jpeg') || filename.endsWith('.webp') || filename.endsWith('.bmp')
        const isImage = selectedMedia.type === 'image' || isGif || isImageExt
        const isVideo = selectedMedia.type === 'video'

        // Reset captured frame when changing media
        setCapturedFrameUrl(null)

        if (isVideo && selectedMedia.path) {
          // Load video URL for frame capture
          const url = await toFileUrlCached(selectedMedia.path)
          if (!cancelled && url) {
            setVideoUrl(url)
            setPreviewUrl(null) // Use video player instead of static preview
          }
        } else if (isImage && selectedMedia.path) {
          // For images (including GIFs), use direct file URL
          const url = await toFileUrlCached(selectedMedia.path)
          if (!cancelled && url) {
            // Log GIF loading for debugging
            if (isGif) {
              console.log('[Brainwash] Loading GIF:', selectedMedia.path, '-> URL:', url)
            }
            setPreviewUrl(url)
            setVideoUrl(null)
          }
        } else if (selectedMedia.thumbPath) {
          // Fallback to thumbnail
          const thumbUrl = await toFileUrlCached(selectedMedia.thumbPath)
          if (!cancelled && thumbUrl) {
            setPreviewUrl(thumbUrl)
            setVideoUrl(null)
          }
        } else {
          if (!cancelled) {
            setPreviewUrl(null)
            setVideoUrl(null)
          }
        }
      } catch (err) {
        console.warn('[Brainwash] Failed to load preview URL:', err)
        if (!cancelled) {
          setPreviewUrl(null)
          setVideoUrl(null)
          setImageLoadError(true)
          showToast('error', 'Failed to load media preview')
        }
      }
    }

    loadPreview()
    return () => { cancelled = true }
  }, [selectedMedia, showToast, imageRetryCount])

  // Load data - fetch ALL images and GIFs for brainwash editing
  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        const [captioned, templateList, mediaList] = await Promise.all([
          window.api.captions?.listCaptioned?.() ?? [],
          window.api.captions?.templates?.list?.() ?? [],
          // Fetch more media - 2000 items to ensure we get all images/GIFs
          window.api.media?.list?.({ limit: 2000, sortBy: 'newest' }) ?? { items: [] }
        ])
        setCaptionedMedia(captioned as CaptionedMedia[])
        // Deduplicate templates by topText+bottomText (in case old duplicates exist in DB)
        const seen = new Set<string>()
        const deduped = (templateList as CaptionTemplate[]).filter(t => {
          const key = `${t.topText ?? ''}|||${t.bottomText ?? ''}`
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
        setTemplates(deduped)

        // Include all media types - videos can have frames captured
        const allItems = extractItems<MediaRow>(mediaList)
        setAllMedia(allItems)
      } catch (err) {
        console.error('Failed to load captions data:', err)
      }
      setLoading(false)
    }
    loadData()
  }, [])

  // Build a Fuse index lazily over the type-filtered set so fuzzy search
  // matches typos and partial words ("blnde" finds "blonde", "missionry"
  // finds "missionary"). Re-built only when the source list / type filter
  // changes — a typing query reuses the index.
  const fuseIndex = useMemo(() => {
    let pool = allMedia
    if (mediaTypeFilter === 'gif') {
      pool = pool.filter(m => m.type === 'gif' || m.filename?.toLowerCase().endsWith('.gif'))
    } else if (mediaTypeFilter === 'image') {
      pool = pool.filter(m => m.type === 'image' && !m.filename?.toLowerCase().endsWith('.gif'))
    } else if (mediaTypeFilter === 'video') {
      pool = pool.filter(m => m.type === 'video')
    }
    return {
      pool,
      fuse: new Fuse(pool, {
        keys: ['filename'],
        threshold: 0.4,         // 0 = exact, 1 = match anything; 0.4 is a forgiving balance
        ignoreLocation: true,    // don't downweight matches near the end of the filename
        minMatchCharLength: 2
      })
    }
  }, [allMedia, mediaTypeFilter])

  const filteredMedia = useMemo(() => {
    if (!searchQuery.trim()) return fuseIndex.pool
    return fuseIndex.fuse.search(searchQuery.trim()).map((r) => r.item)
  }, [fuseIndex, searchQuery])

  // Shuffle media for random selection
  const shuffleMedia = useCallback(() => {
    setAllMedia(prev => {
      const shuffled = [...prev]
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
      }
      return shuffled
    })
  }, [])

  // Pick random media
  const pickRandomMedia = useCallback(() => {
    if (filteredMedia.length === 0) return
    const randomIndex = Math.floor(Math.random() * filteredMedia.length)
    setSelectedMedia(filteredMedia[randomIndex])
  }, [filteredMedia])

  // GIF Maker - Shuffle videos
  const shuffleVideosForGif = useCallback(() => {
    const videos = allMedia.filter(m => m.type === 'video')
    const shuffled = [...videos]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    setGifShuffledVideos(shuffled)
  }, [allMedia])

  // GIF Maker - Pick random video
  const pickRandomVideoForGif = useCallback(async () => {
    const videos = allMedia.filter(m => m.type === 'video')
    if (videos.length === 0) return
    const randomIndex = Math.floor(Math.random() * videos.length)
    const video = videos[randomIndex]
    setGifSelectedVideo(video)
    if (video.path) {
      const url = await toFileUrlCached(video.path)
      setGifVideoUrl(url)
      setGifPreviewUrl(null)
      setGifStartTime(0)
      setGifEndTime(Math.min(5, video.durationSec || 5))
    }
  }, [allMedia])

  // Apply filter preset
  const applyFilterPreset = useCallback((presetId: string) => {
    setSelectedFilterPreset(presetId)
    const preset = FILTER_PRESETS.find(p => p.id === presetId)
    if (!preset) return
    // Reset all filters first
    const newValues: Record<ImageFilter, number> = {
      invert: 0, grayscale: 0, sepia: 0, saturate: 1, contrast: 1,
      brightness: 1, blur: 0, hueRotate: 0, pixelate: 0, lowQuality: 0, vignette: 0
    }
    // Apply preset values
    if (preset.values) {
      Object.entries(preset.values).forEach(([key, val]) => {
        newValues[key as ImageFilter] = val as number
      })
    }
    setFilterValues(newValues)
    setActiveFilters(preset.filters)
  }, [])

  // Reset all filters
  const resetFilters = useCallback(() => {
    setFilterValues({
      invert: 0, grayscale: 0, sepia: 0, saturate: 1, contrast: 1,
      brightness: 1, blur: 0, hueRotate: 0, pixelate: 0, lowQuality: 0, vignette: 0
    })
    setActiveFilters([])
    setSelectedFilterPreset('none')
    setShowCaptionBar(false)
  }, [])

  const handleSaveCaption = async () => {
    if (!selectedMedia) return
    try {
      await window.api.captions?.upsert?.(
        selectedMedia.id,
        topText || null,
        bottomText || null,
        selectedPreset
      )
      // Refresh captioned list
      const updated = await window.api.captions?.listCaptioned?.() ?? []
      setCaptionedMedia(updated as CaptionedMedia[])
      // Clear form
      setTopText('')
      setBottomText('')
      setSelectedMedia(null)
    } catch (err) {
      console.error('Failed to save caption:', err)
    }
  }

  const handleDeleteCaption = async (mediaId: string) => {
    try {
      await window.api.captions?.delete?.(mediaId)
      setCaptionedMedia(prev => prev.filter(c => c.mediaId !== mediaId))
    } catch (err) {
      console.error('Failed to delete caption:', err)
    }
  }

  const handleEditCaption = (caption: CaptionedMedia) => {
    setEditingCaption(caption)
    setEditCaptionTop(caption.topText || '')
    setEditCaptionBottom(caption.bottomText || '')
  }

  const handleSaveEditedCaption = async () => {
    if (!editingCaption) return
    try {
      await window.api.captions?.upsert?.(
        editingCaption.mediaId,
        editCaptionTop || null,
        editCaptionBottom || null,
        editingCaption.presetId || 'default'
      )
      // Refresh captioned list
      const updated = await window.api.captions?.listCaptioned?.() ?? []
      setCaptionedMedia(updated as CaptionedMedia[])
      setEditingCaption(null)
      showToast('success', 'Caption updated!')
    } catch (err) {
      console.error('Failed to update caption:', err)
      showToast('error', 'Failed to update caption')
    }
  }

  const handleApplyTemplate = (template: { top: string | null; bottom: string | null }) => {
    setTopText(template.top || '')
    setBottomText(template.bottom || '')
  }

  const handleSeedExampleCaptions = async () => {
    try {
      for (const ex of EXAMPLE_CAPTIONS) {
        await window.api.captions?.templates?.add?.(ex.top, ex.bottom, ex.category)
      }
      const updated = await window.api.captions?.templates?.list?.() ?? []
      // Deduplicate templates
      const seen = new Set<string>()
      const deduped = (updated as CaptionTemplate[]).filter(t => {
        const key = `${t.topText ?? ''}|||${t.bottomText ?? ''}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      setTemplates(deduped)
    } catch (err) {
      console.error('Failed to seed example captions:', err)
    }
  }

  const handleClearAllTemplates = async () => {
    try {
      // Delete all templates
      for (const t of templates) {
        await window.api.captions?.templates?.delete?.(t.id)
      }
      setTemplates([])
    } catch (err) {
      console.error('Failed to clear templates:', err)
    }
  }

  // Save the inline Create-New form. Refreshes the list in place rather
  // than mutating local state so any persisted-id round-trip is honored.
  const handleCreateTemplate = async () => {
    const top = newTemplateTop.trim()
    const bottom = newTemplateBottom.trim()
    if (!top && !bottom) return
    try {
      await window.api.captions?.templates?.add?.(top, bottom, newTemplateCategory.trim() || 'dirty')
      const fresh = await window.api.captions?.templates?.list?.() ?? []
      setTemplates(fresh)
      setNewTemplateTop('')
      setNewTemplateBottom('')
      setNewTemplateCategory('dirty')
      setShowCreateTemplateForm(false)
    } catch (err) {
      console.error('Failed to save template:', err)
    }
  }

  // Ask Venice for a fresh batch of caption pairs and add them all. Theme
  // is empty for now (mixed-pack); a future spec adds a theme prompt.
  const handleAiGenerateTemplates = async () => {
    if (aiGeneratingTemplates) return
    setAiGeneratingTemplates(true)
    try {
      const generated = await window.api.ai.generateCaptions?.({ count: 10 }) ?? []
      for (const g of generated) {
        if (!g.topText && !g.bottomText) continue
        await window.api.captions?.templates?.add?.(g.topText, g.bottomText, g.category || 'dirty')
      }
      const fresh = await window.api.captions?.templates?.list?.() ?? []
      setTemplates(fresh)
    } catch (err) {
      console.error('Failed to AI-generate templates:', err)
    } finally {
      setAiGeneratingTemplates(false)
    }
  }

  const toggleCaptionMode = async (enabled: boolean) => {
    setCaptionModeEnabled(enabled)
    await window.api.settings.captions?.update?.({ enabled })
  }

  const currentPreset = presets.find(p => p.id === selectedPreset) || presets[0]

  return (
    <div className="h-full w-full flex flex-col overflow-x-hidden">
      {/* Top Bar */}
      <div className="shrink-0 h-14 flex items-center justify-between px-4 border-b border-[var(--border)] bg-[var(--panel)]">
        <div className="flex items-center gap-3">
          <MessageSquare size={20} className="text-[var(--primary)]" />
          <span className="font-semibold">Brainwash</span>
          <span className="text-xs text-[var(--muted)]">Caption & Meme Editor</span>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-[var(--muted)]">Caption Mode</span>
            <button
              onClick={() => toggleCaptionMode(!captionModeEnabled)}
              className={cn(
                'w-11 h-6 rounded-full transition-colors relative',
                captionModeEnabled ? 'bg-[var(--primary)]' : 'bg-white/20'
              )}
            >
              <div className={cn(
                'w-4 h-4 rounded-full bg-white absolute top-1 transition-transform',
                captionModeEnabled ? 'translate-x-6' : 'translate-x-1'
              )} />
            </button>
          </label>
        </div>
      </div>

      {/* Tabs — `gifmaker` collapsed into `editor` ("Media Maker") because
          the editor tab already exposes a "Make GIF" button that opens the
          full GifMakerModal. Keeping a separate GIF-Maker tab duplicated
          the workflow without adding unique capability. The branch's JSX
          stays in this file for now so its state hooks don't need a
          coordinated removal — it's just unreachable from the tab strip. */}
      <div className="shrink-0 flex border-b border-[var(--border)] bg-[var(--panel)]">
        {(['editor', 'captioned', 'templates'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium transition border-b-2',
              activeTab === tab
                ? 'border-[var(--primary)] text-[var(--primary)]'
                : 'border-transparent text-[var(--muted)] hover:text-white'
            )}
          >
            {tab === 'editor' ? 'Media Maker' : tab === 'captioned' ? 'Captioned Media' : 'Templates'}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 pb-safe">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <RefreshCw className="animate-spin text-[var(--primary)]" size={32} />
          </div>
        ) : activeTab === 'editor' ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Media Selection */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Select Media</div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowGifModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-fuchsia-500/30 text-fuchsia-200 text-xs hover:bg-fuchsia-500/50 transition border border-fuchsia-500/40"
                    title="Create a new GIF from a video and edit it like an image"
                  >
                    <Sparkles size={12} />
                    Make GIF
                  </button>
                  <button
                    onClick={pickRandomMedia}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--primary)]/20 text-[var(--primary)] text-xs hover:bg-[var(--primary)]/30 transition"
                    title="Pick random media"
                  >
                    <Zap size={12} />
                    Random
                  </button>
                  <button
                    onClick={shuffleMedia}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 text-xs hover:bg-white/20 transition"
                    title="Shuffle all media"
                  >
                    <Shuffle size={12} />
                    Shuffle
                  </button>
                </div>
              </div>

              {/* Type Filter & Search */}
              <div className="flex gap-2">
                <div className="flex rounded-lg bg-black/30 border border-[var(--border)] p-0.5">
                  {(['all', 'image', 'gif', 'video'] as const).map(type => (
                    <button
                      key={type}
                      onClick={() => setMediaTypeFilter(type)}
                      className={cn(
                        'px-3 py-1 rounded-md text-xs transition',
                        mediaTypeFilter === type
                          ? 'bg-[var(--primary)] text-white'
                          : 'text-[var(--muted)] hover:text-white'
                      )}
                    >
                      {type === 'all' ? 'All' : type === 'gif' ? 'GIFs' : type === 'video' ? 'Videos' : 'Images'}
                    </button>
                  ))}
                </div>
                <div className="relative flex-1">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
                  <input
                    type="text"
                    placeholder="Search media..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 rounded-xl bg-black/30 border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)]"
                  />
                </div>
              </div>

              <div className="text-xs text-[var(--muted)]">{filteredMedia.length} items</div>

              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-[400px] overflow-auto">
                {filteredMedia.map(media => {
                  const isGif = media.filename?.toLowerCase().endsWith('.gif')
                  return (
                    <button
                      key={media.id}
                      onClick={() => setSelectedMedia(media)}
                      className={cn(
                        'aspect-video rounded-lg overflow-hidden border-2 transition relative',
                        selectedMedia?.id === media.id
                          ? 'border-[var(--primary)] ring-2 ring-[var(--primary)]/50'
                          : 'border-transparent hover:border-white/30'
                      )}
                    >
                      <CaptionedThumb
                        mediaId={media.id}
                        thumbPath={media.thumbPath ?? null}
                        filename={media.filename ?? 'Unknown'}
                        filePath={media.path}
                      />
                      {isGif && (
                        <span className="absolute top-1 right-1 px-1.5 py-0.5 rounded text-[10px] bg-purple-500/80 text-white font-medium">
                          GIF
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Caption Editor */}
            <div className="space-y-4">
              <div className="text-sm font-semibold">Caption Editor</div>

              {selectedMedia ? (
                <div className="space-y-4">
                  {/* Preview with filters and caption bars */}
                  <div className="relative rounded-xl overflow-hidden bg-black/50 border border-[var(--border)]">
                    {/* Top caption bar */}
                    {showCaptionBar && (captionBarPosition === 'top' || captionBarPosition === 'both') && (
                      <div
                        className="w-full flex items-center justify-center"
                        style={{
                          height: `${captionBarSize}px`,
                          backgroundColor: captionBarColor === 'black' ? '#000000' : '#ffffff',
                        }}
                      >
                        {topText && (
                          <div
                            style={{
                              fontFamily: currentPreset?.fontFamily || 'Impact',
                              fontSize: `${(currentPreset?.fontSize || 48) / 2}px`,
                              color: captionBarColor === 'black' ? '#ffffff' : '#000000',
                              fontWeight: currentPreset?.fontWeight || 'bold',
                              textTransform: currentPreset?.textTransform || 'uppercase',
                            }}
                          >
                            {expandedTopText}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Image/Video area */}
                    <div
                      ref={imageContainerRef}
                      className={`relative aspect-video ${cropMode ? 'cursor-crosshair' : ''}`}
                      onMouseDown={cropMode ? handleCropStart : undefined}
                    >
                      {/* Video player for frame capture */}
                      {isSelectedVideo && videoUrl && !capturedFrameUrl ? (
                        <div className="w-full h-full relative">
                          <video
                            ref={videoRef}
                            src={videoUrl}
                            className="w-full h-full object-contain"
                            controls
                            muted
                          />
                          {/* Capture button is anchored top-right so it doesn't
                              collide with the native HTML5 video controls bar
                              (which lives at the bottom). Earlier placement at
                              bottom-4 was eating clicks on the scrub bar / play
                              button. */}
                          <button
                            onClick={captureVideoFrame}
                            className="absolute top-2 right-2 px-3 py-1.5 rounded-lg bg-[var(--primary)] hover:opacity-90 text-white text-xs font-semibold flex items-center gap-1.5 shadow-lg"
                            title="Capture the currently displayed frame"
                          >
                            <ImageIcon size={14} />
                            Capture Frame
                          </button>
                          <div className="absolute top-2 left-2 px-2 py-1 rounded bg-black/70 text-xs text-white pointer-events-none">
                            Scrub to the perfect frame, then capture
                          </div>
                        </div>
                      ) : imageLoadError ? (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-4 text-white/60">
                          <div className="text-4xl">⚠️</div>
                          <div className="text-sm">Failed to load image</div>
                          <div className="text-xs text-white/40 max-w-xs text-center">
                            The file may have been moved, deleted, or is in an unsupported format.
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setImageRetryCount(c => c + 1)}
                              className="px-3 py-1.5 rounded-lg bg-[var(--primary)] hover:opacity-90 text-white text-xs font-medium"
                            >
                              Retry
                            </button>
                            <button
                              onClick={() => setSelectedMedia(null)}
                              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs"
                            >
                              Select Another
                            </button>
                          </div>
                        </div>
                      ) : (croppedImageUrl || capturedFrameUrl || previewUrl) ? (
                        <img
                          src={croppedImageUrl || capturedFrameUrl || previewUrl || ''}
                          alt={selectedMedia.filename}
                          className="w-full h-full object-contain"
                          style={{
                            filter: buildFilterCSS(),
                            imageRendering: filterValues.pixelate > 0 ? 'pixelated' : 'auto',
                            pointerEvents: cropMode ? 'none' : 'auto',
                          }}
                          onError={async (e) => {
                            const filename = selectedMedia.filename?.toLowerCase() || ''
                            const isGif = filename.endsWith('.gif')
                            console.error('[Brainwash] Image failed to load:', selectedMedia.path, isGif ? '(GIF)' : '')

                            // For GIFs, try fallback to thumbnail if available
                            if (isGif && selectedMedia.thumbPath && !croppedImageUrl && !capturedFrameUrl) {
                              try {
                                const thumbUrl = await toFileUrlCached(selectedMedia.thumbPath)
                                if (thumbUrl) {
                                  console.log('[Brainwash] GIF load failed, using thumbnail fallback')
                                  setPreviewUrl(thumbUrl)
                                  return // Don't set error state, we have a fallback
                                }
                              } catch {
                                // Thumbnail also failed
                              }
                            }
                            setImageLoadError(true)
                          }}
                          onLoad={() => {
                            // Clear error state on successful load
                            if (imageLoadError) setImageLoadError(false)
                          }}
                        />
                      ) : (
                        <CaptionedThumb
                          mediaId={selectedMedia.id}
                          thumbPath={selectedMedia.thumbPath ?? null}
                          filename={selectedMedia.filename ?? 'Unknown'}
                          className="object-contain"
                          style={{
                            filter: buildFilterCSS(),
                            imageRendering: filterValues.pixelate > 0 ? 'pixelated' : 'auto',
                          }}
                        />
                      )}

                      {/* Vignette overlay effect */}
                      {filterValues.vignette > 0 && (
                        <div
                          className="absolute inset-0 pointer-events-none"
                          style={{
                            background: `radial-gradient(ellipse at center, transparent 0%, transparent ${60 - filterValues.vignette * 40}%, rgba(0,0,0,${filterValues.vignette}) 100%)`,
                          }}
                        />
                      )}

                      {/* Floating Labels */}
                      {floatingLabels.map(label => (
                        <div
                          key={label.id}
                          className={cn(
                            'absolute cursor-move select-none transition-shadow',
                            editingLabelId === label.id && 'ring-2 ring-[var(--primary)] ring-offset-2 ring-offset-transparent',
                            draggingLabelId === label.id && 'opacity-80'
                          )}
                          style={{
                            left: `${label.x}%`,
                            top: `${label.y}%`,
                            transform: `translate(-50%, -50%) rotate(${label.rotation}deg)`,
                            fontSize: `${label.fontSize}px`,
                            fontFamily: label.fontFamily,
                            color: label.color,
                            textShadow: label.shadow ? '2px 2px 4px rgba(0,0,0,0.8), -1px -1px 2px rgba(0,0,0,0.5)' : 'none',
                            whiteSpace: 'nowrap',
                          }}
                          onMouseDown={(e) => handleLabelDragStart(label.id, e)}
                          onClick={(e) => { e.stopPropagation(); setEditingLabelId(label.id) }}
                        >
                          {label.text}
                        </div>
                      ))}

                      {/* Crop selection overlay */}
                      {cropMode && cropSelection && (
                        <div
                          className="absolute border-2 border-dashed border-white bg-black/30 pointer-events-none"
                          style={{
                            left: `${Math.min(cropSelection.startX, cropSelection.endX)}%`,
                            top: `${Math.min(cropSelection.startY, cropSelection.endY)}%`,
                            width: `${Math.abs(cropSelection.endX - cropSelection.startX)}%`,
                            height: `${Math.abs(cropSelection.endY - cropSelection.startY)}%`,
                          }}
                        >
                          {/* Corner handles */}
                          <div className="absolute -top-1 -left-1 w-2 h-2 bg-white rounded-full" />
                          <div className="absolute -top-1 -right-1 w-2 h-2 bg-white rounded-full" />
                          <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-white rounded-full" />
                          <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-white rounded-full" />
                        </div>
                      )}

                      {/* Crop mode overlay with dimmed areas */}
                      {cropMode && !cropSelection && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none">
                          <span className="text-white text-sm font-medium px-3 py-1.5 bg-black/50 rounded-lg">
                            Click and drag to select crop area
                          </span>
                        </div>
                      )}

                      {/* Caption overlay preview (when bars are off) - DRAGGABLE.
                          Renders the template-expanded text so users see
                          variables like {performer} resolved in the live
                          preview. The raw template still sits in the textarea. */}
                      {!showCaptionBar && !cropMode && topText && (
                        <div
                          onMouseDown={handleTextDragStart('top')}
                          className={`absolute left-0 right-0 text-center px-4 select-none ${
                            isDraggingText === 'top' ? 'cursor-grabbing' : 'cursor-grab'
                          }`}
                          style={{
                            top: `${topTextY}%`,
                            transform: 'translateY(-50%)',
                            fontFamily: currentPreset?.fontFamily || 'Impact',
                            fontSize: `${(currentPreset?.fontSize || 48) / 2}px`,
                            color: currentPreset?.fontColor || '#ffffff',
                            fontWeight: currentPreset?.fontWeight || 'bold',
                            textTransform: currentPreset?.textTransform || 'uppercase',
                            WebkitTextStroke: currentPreset?.strokeEnabled
                              ? `${currentPreset.strokeWidth || 2}px ${currentPreset.strokeColor || '#000000'}`
                              : 'none',
                            textShadow: currentPreset?.strokeEnabled
                              ? `0 0 8px ${currentPreset.strokeColor}, 2px 2px 4px rgba(0,0,0,0.8)`
                              : 'none',
                            paintOrder: 'stroke fill',
                            transition: isDraggingText === 'top' ? 'none' : 'top 0.1s ease-out',
                          }}
                          title="Drag to reposition"
                        >
                          {expandedTopText}
                        </div>
                      )}
                      {!showCaptionBar && !cropMode && bottomText && (
                        <div
                          onMouseDown={handleTextDragStart('bottom')}
                          className={`absolute left-0 right-0 text-center px-4 select-none ${
                            isDraggingText === 'bottom' ? 'cursor-grabbing' : 'cursor-grab'
                          }`}
                          style={{
                            top: `${bottomTextY}%`,
                            transform: 'translateY(-50%)',
                            fontFamily: currentPreset?.fontFamily || 'Impact',
                            fontSize: `${(currentPreset?.fontSize || 48) / 2}px`,
                            color: currentPreset?.fontColor || '#ffffff',
                            fontWeight: currentPreset?.fontWeight || 'bold',
                            textTransform: currentPreset?.textTransform || 'uppercase',
                            WebkitTextStroke: currentPreset?.strokeEnabled
                              ? `${currentPreset.strokeWidth || 2}px ${currentPreset.strokeColor || '#000000'}`
                              : 'none',
                            textShadow: currentPreset?.strokeEnabled
                              ? `0 0 8px ${currentPreset.strokeColor}, 2px 2px 4px rgba(0,0,0,0.8)`
                              : 'none',
                            paintOrder: 'stroke fill',
                            transition: isDraggingText === 'bottom' ? 'none' : 'top 0.1s ease-out',
                          }}
                          title="Drag to reposition"
                        >
                          {expandedBottomText}
                        </div>
                      )}
                      {/* Media type badge */}
                      {selectedMedia.filename?.toLowerCase().endsWith('.gif') && (
                        <span className="absolute top-2 right-2 px-2 py-1 rounded text-xs bg-purple-500/80 text-white font-medium">
                          GIF (Animated)
                        </span>
                      )}
                    </div>

                    {/* Bottom caption bar */}
                    {showCaptionBar && (captionBarPosition === 'bottom' || captionBarPosition === 'both') && (
                      <div
                        className="w-full flex items-center justify-center"
                        style={{
                          height: `${captionBarSize}px`,
                          backgroundColor: captionBarColor === 'black' ? '#000000' : '#ffffff',
                        }}
                      >
                        {bottomText && (
                          <div
                            style={{
                              fontFamily: currentPreset?.fontFamily || 'Impact',
                              fontSize: `${(currentPreset?.fontSize || 48) / 2}px`,
                              color: captionBarColor === 'black' ? '#ffffff' : '#000000',
                              fontWeight: currentPreset?.fontWeight || 'bold',
                              textTransform: currentPreset?.textTransform || 'uppercase',
                            }}
                          >
                            {expandedBottomText}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Video Frame Capture - Only show for videos */}
                  {isSelectedVideo && (
                    <div className="rounded-xl bg-black/30 border border-[var(--border)] p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-semibold text-[var(--muted)]">Video Frame</div>
                        {capturedFrameUrl && (
                          <button
                            onClick={resetCapturedFrame}
                            className="text-xs text-red-400 hover:text-red-300"
                            title="Recapture a different frame"
                          >
                            Recapture
                          </button>
                        )}
                      </div>
                      {!capturedFrameUrl ? (
                        <div className="text-[10px] text-white/60">
                          Use the video player above to pause at the desired frame, then click "Capture This Frame"
                        </div>
                      ) : (
                        <div className="text-[10px] text-green-400 flex items-center gap-1">
                          <CheckCircle2 size={10} />
                          Frame captured! Add captions below.
                        </div>
                      )}
                    </div>
                  )}

                  {/* Crop Tools - Only show for images/GIFs or captured frames */}
                  {(!isSelectedVideo || capturedFrameUrl) && (
                  <div className="rounded-xl bg-black/30 border border-[var(--border)] p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold text-[var(--muted)]">Crop Image</div>
                      {croppedImageUrl && (
                        <button
                          onClick={resetCrop}
                          className="text-xs text-red-400 hover:text-red-300"
                          title="Reset to original image"
                        >
                          Reset Crop
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          if (cropMode) {
                            setCropMode(false)
                            setCropSelection(null)
                          } else {
                            setCropMode(true)
                          }
                        }}
                        className={cn(
                          'flex-1 px-3 py-2 rounded-lg text-xs font-medium transition flex items-center justify-center gap-2',
                          cropMode
                            ? 'bg-[var(--primary)] text-white'
                            : 'bg-white/10 hover:bg-white/20 text-white'
                        )}
                        title={cropMode ? 'Cancel crop selection' : 'Enter crop mode to select area'}
                      >
                        <Maximize2 size={14} />
                        {cropMode ? 'Cancel' : 'Crop Mode'}
                      </button>
                      {cropMode && cropSelection && (
                        <button
                          onClick={applyCrop}
                          className="px-3 py-2 rounded-lg text-xs font-medium bg-green-500 hover:bg-green-600 text-white transition flex items-center gap-2"
                          title="Apply the crop to the image"
                        >
                          <Check size={14} />
                          Apply
                        </button>
                      )}
                    </div>
                    {isSelectedGif && cropMode && (
                      <div className="text-[10px] text-yellow-400 flex items-center gap-1">
                        <AlertCircle size={10} />
                        Warning: Cropping a GIF will convert it to a static image
                      </div>
                    )}
                    {croppedImageUrl && (
                      <div className="text-[10px] text-green-400 flex items-center gap-1">
                        <CheckCircle2 size={10} />
                        Image cropped. Captions will be added to cropped version.
                      </div>
                    )}
                  </div>
                  )}

                  {/* Image Filters */}
                  <div className="rounded-xl bg-black/30 border border-[var(--border)] p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold text-[var(--muted)]">Image Filters</div>
                      <button
                        onClick={resetFilters}
                        className="text-xs text-[var(--primary)] hover:underline"
                      >
                        Reset
                      </button>
                    </div>

                    {/* Filter Presets */}
                    <div className="flex flex-wrap gap-1.5">
                      {FILTER_PRESETS.map(preset => (
                        <button
                          key={preset.id}
                          onClick={() => applyFilterPreset(preset.id)}
                          className={cn(
                            'px-2 py-1 rounded text-xs transition',
                            selectedFilterPreset === preset.id
                              ? 'bg-[var(--primary)] text-white'
                              : 'bg-white/10 hover:bg-white/20'
                          )}
                        >
                          {preset.name}
                        </button>
                      ))}
                    </div>

                    {/* Individual Filter Sliders */}
                    <div className="grid grid-cols-2 gap-2 pt-2">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-[var(--muted)]">Brightness</span>
                          <span className="text-xs text-[var(--muted)]">{filterValues.brightness.toFixed(1)}</span>
                        </div>
                        <input
                          type="range" min="0.5" max="2" step="0.1"
                          value={filterValues.brightness}
                          onChange={(e) => setFilterValues(v => ({ ...v, brightness: parseFloat(e.target.value) }))}
                          className="w-full h-1 accent-[var(--primary)]"
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-[var(--muted)]">Contrast</span>
                          <span className="text-xs text-[var(--muted)]">{filterValues.contrast.toFixed(1)}</span>
                        </div>
                        <input
                          type="range" min="0.5" max="2" step="0.1"
                          value={filterValues.contrast}
                          onChange={(e) => setFilterValues(v => ({ ...v, contrast: parseFloat(e.target.value) }))}
                          className="w-full h-1 accent-[var(--primary)]"
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-[var(--muted)]">Saturation</span>
                          <span className="text-xs text-[var(--muted)]">{filterValues.saturate.toFixed(1)}</span>
                        </div>
                        <input
                          type="range" min="0" max="3" step="0.1"
                          value={filterValues.saturate}
                          onChange={(e) => setFilterValues(v => ({ ...v, saturate: parseFloat(e.target.value) }))}
                          className="w-full h-1 accent-[var(--primary)]"
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-[var(--muted)]">Hue Rotate</span>
                          <span className="text-xs text-[var(--muted)]">{filterValues.hueRotate}°</span>
                        </div>
                        <input
                          type="range" min="0" max="360" step="10"
                          value={filterValues.hueRotate}
                          onChange={(e) => setFilterValues(v => ({ ...v, hueRotate: parseInt(e.target.value) }))}
                          className="w-full h-1 accent-[var(--primary)]"
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-[var(--muted)]">Grayscale</span>
                          <span className="text-xs text-[var(--muted)]">{Math.round(filterValues.grayscale * 100)}%</span>
                        </div>
                        <input
                          type="range" min="0" max="1" step="0.1"
                          value={filterValues.grayscale}
                          onChange={(e) => setFilterValues(v => ({ ...v, grayscale: parseFloat(e.target.value) }))}
                          className="w-full h-1 accent-[var(--primary)]"
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-[var(--muted)]">Sepia</span>
                          <span className="text-xs text-[var(--muted)]">{Math.round(filterValues.sepia * 100)}%</span>
                        </div>
                        <input
                          type="range" min="0" max="1" step="0.1"
                          value={filterValues.sepia}
                          onChange={(e) => setFilterValues(v => ({ ...v, sepia: parseFloat(e.target.value) }))}
                          className="w-full h-1 accent-[var(--primary)]"
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-[var(--muted)]">Invert</span>
                          <span className="text-xs text-[var(--muted)]">{Math.round(filterValues.invert * 100)}%</span>
                        </div>
                        <input
                          type="range" min="0" max="1" step="0.1"
                          value={filterValues.invert}
                          onChange={(e) => setFilterValues(v => ({ ...v, invert: parseFloat(e.target.value) }))}
                          className="w-full h-1 accent-[var(--primary)]"
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-[var(--muted)]">Blur</span>
                          <span className="text-xs text-[var(--muted)]">{filterValues.blur}px</span>
                        </div>
                        <input
                          type="range" min="0" max="10" step="0.5"
                          value={filterValues.blur}
                          onChange={(e) => setFilterValues(v => ({ ...v, blur: parseFloat(e.target.value) }))}
                          className="w-full h-1 accent-[var(--primary)]"
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-[var(--muted)]">Pixelate</span>
                          <span className="text-xs text-[var(--muted)]">{filterValues.pixelate}</span>
                        </div>
                        <input
                          type="range" min="0" max="20" step="1"
                          value={filterValues.pixelate}
                          onChange={(e) => setFilterValues(v => ({ ...v, pixelate: parseInt(e.target.value) }))}
                          className="w-full h-1 accent-[var(--primary)]"
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-[var(--muted)]">Low Quality</span>
                          <span className="text-xs text-[var(--muted)]">{filterValues.lowQuality}</span>
                        </div>
                        <input
                          type="range" min="0" max="10" step="1"
                          value={filterValues.lowQuality}
                          onChange={(e) => setFilterValues(v => ({ ...v, lowQuality: parseInt(e.target.value) }))}
                          className="w-full h-1 accent-[var(--primary)]"
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-[var(--muted)]">Vignette</span>
                          <span className="text-xs text-[var(--muted)]">{Math.round(filterValues.vignette * 100)}%</span>
                        </div>
                        <input
                          type="range" min="0" max="1" step="0.05"
                          value={filterValues.vignette}
                          onChange={(e) => setFilterValues(v => ({ ...v, vignette: parseFloat(e.target.value) }))}
                          className="w-full h-1 accent-[var(--primary)]"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Caption Bars */}
                  <div className="rounded-xl bg-black/30 border border-[var(--border)] p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold text-[var(--muted)]">Caption Bars</div>
                      <button
                        onClick={() => setShowCaptionBar(!showCaptionBar)}
                        className={cn(
                          'px-2 py-1 rounded text-xs transition',
                          showCaptionBar ? 'bg-[var(--primary)] text-white' : 'bg-white/10 hover:bg-white/20'
                        )}
                      >
                        {showCaptionBar ? 'On' : 'Off'}
                      </button>
                    </div>
                    {showCaptionBar && (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <button
                            onClick={() => setCaptionBarColor('black')}
                            className={cn('flex-1 px-2 py-1.5 rounded text-xs transition', captionBarColor === 'black' ? 'bg-black text-white border border-white/20' : 'bg-white/10')}
                          >
                            Black
                          </button>
                          <button
                            onClick={() => setCaptionBarColor('white')}
                            className={cn('flex-1 px-2 py-1.5 rounded text-xs transition', captionBarColor === 'white' ? 'bg-white text-black' : 'bg-white/10')}
                          >
                            White
                          </button>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setCaptionBarPosition('top')}
                            className={cn('flex-1 px-2 py-1 rounded text-xs', captionBarPosition === 'top' ? 'bg-[var(--primary)] text-white' : 'bg-white/10')}
                          >
                            Top
                          </button>
                          <button
                            onClick={() => setCaptionBarPosition('bottom')}
                            className={cn('flex-1 px-2 py-1 rounded text-xs', captionBarPosition === 'bottom' ? 'bg-[var(--primary)] text-white' : 'bg-white/10')}
                          >
                            Bottom
                          </button>
                          <button
                            onClick={() => setCaptionBarPosition('both')}
                            className={cn('flex-1 px-2 py-1 rounded text-xs', captionBarPosition === 'both' ? 'bg-[var(--primary)] text-white' : 'bg-white/10')}
                          >
                            Both
                          </button>
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-[var(--muted)]">Bar Height</span>
                            <span className="text-xs text-[var(--muted)]">{captionBarSize}px</span>
                          </div>
                          <input
                            type="range" min="30" max="120" step="5"
                            value={captionBarSize}
                            onChange={(e) => setCaptionBarSize(parseInt(e.target.value))}
                            className="w-full h-1 accent-[var(--primary)]"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Floating Labels */}
                  <div className="rounded-xl bg-black/30 border border-[var(--border)] p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold text-[var(--muted)]">Floating Labels</div>
                      <button
                        onClick={addFloatingLabel}
                        className="px-2 py-1 rounded text-xs bg-[var(--primary)] text-white hover:bg-[var(--primary)]/80 transition"
                      >
                        + Add
                      </button>
                    </div>
                    {floatingLabels.length > 0 && (
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {floatingLabels.map(label => (
                          <div
                            key={label.id}
                            className={cn(
                              'p-2 rounded-lg border transition cursor-pointer',
                              editingLabelId === label.id
                                ? 'bg-[var(--primary)]/20 border-[var(--primary)]'
                                : 'bg-black/20 border-[var(--border)] hover:border-[var(--primary)]/50'
                            )}
                            onClick={() => setEditingLabelId(editingLabelId === label.id ? null : label.id)}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs truncate flex-1 mr-2">{label.text}</span>
                              <button
                                onClick={(e) => { e.stopPropagation(); deleteFloatingLabel(label.id) }}
                                className="text-red-400 hover:text-red-300 text-xs"
                              >
                                ✕
                              </button>
                            </div>
                            {editingLabelId === label.id && (
                              <div className="space-y-2 mt-2 pt-2 border-t border-[var(--border)]">
                                <input
                                  type="text"
                                  value={label.text}
                                  onChange={(e) => updateFloatingLabel(label.id, { text: e.target.value })}
                                  className="w-full px-2 py-1 text-xs rounded bg-black/30 border border-[var(--border)] focus:outline-none"
                                  onClick={(e) => e.stopPropagation()}
                                />
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <span className="text-[10px] text-[var(--muted)]">Size</span>
                                    <input
                                      type="range" min="12" max="72" step="2"
                                      value={label.fontSize}
                                      onChange={(e) => updateFloatingLabel(label.id, { fontSize: parseInt(e.target.value) })}
                                      className="w-full h-1"
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                  </div>
                                  <div>
                                    <span className="text-[10px] text-[var(--muted)]">Rotation</span>
                                    <input
                                      type="range" min="-45" max="45" step="5"
                                      value={label.rotation}
                                      onChange={(e) => updateFloatingLabel(label.id, { rotation: parseInt(e.target.value) })}
                                      className="w-full h-1"
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <input
                                    type="color"
                                    value={label.color}
                                    onChange={(e) => updateFloatingLabel(label.id, { color: e.target.value })}
                                    className="w-8 h-6 rounded cursor-pointer"
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                  <select
                                    value={label.fontFamily}
                                    onChange={(e) => updateFloatingLabel(label.id, { fontFamily: e.target.value })}
                                    className="flex-1 text-xs px-1 py-0.5 rounded bg-black/30 border border-[var(--border)]"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <option value="Impact">Impact</option>
                                    <option value="Arial Black">Arial Black</option>
                                    <option value="Comic Sans MS">Comic Sans</option>
                                    <option value="Georgia">Georgia</option>
                                    <option value="Times New Roman">Times</option>
                                    <option value="Courier New">Courier</option>
                                  </select>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); updateFloatingLabel(label.id, { shadow: !label.shadow }) }}
                                    className={cn('px-2 py-0.5 text-xs rounded', label.shadow ? 'bg-[var(--primary)]' : 'bg-white/10')}
                                  >
                                    Shadow
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {floatingLabels.length === 0 && (
                      <p className="text-[10px] text-[var(--muted)] text-center py-2">
                        Add floating labels that can be dragged anywhere on the image
                      </p>
                    )}
                  </div>

                  {/* Caption inputs */}
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-[var(--muted)] block mb-1">Top Text</label>
                      <input
                        type="text"
                        value={topText}
                        onChange={(e) => setTopText(e.target.value)}
                        placeholder="Top caption..."
                        className="w-full px-3 py-2 rounded-xl bg-black/30 border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)]"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-[var(--muted)] block mb-1">Bottom Text</label>
                      <input
                        type="text"
                        value={bottomText}
                        onChange={(e) => setBottomText(e.target.value)}
                        placeholder="Bottom caption..."
                        className="w-full px-3 py-2 rounded-xl bg-black/30 border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)]"
                      />
                    </div>
                    {/* Variable hints — wrap each as a click-to-insert
                        chip so users can build templates without
                        remembering syntax. Targets the last-focused
                        input via document.activeElement. */}
                    <div className="text-[10px] text-[var(--muted)] leading-relaxed">
                      <span className="font-medium text-white/70">Variables:</span>{' '}
                      {KNOWN_CAPTION_VARIABLES.map((v) => (
                        <button
                          key={v}
                          onClick={() => {
                            const token = `{${v}}`
                            const ae = document.activeElement as HTMLInputElement | null
                            if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) {
                              const start = ae.selectionStart ?? ae.value.length
                              const end = ae.selectionEnd ?? ae.value.length
                              const next = ae.value.slice(0, start) + token + ae.value.slice(end)
                              if (ae === document.activeElement && (ae as any).setRangeText) {
                                (ae as any).setRangeText(token, start, end, 'end')
                                ae.dispatchEvent(new Event('input', { bubbles: true }))
                              } else {
                                ae.value = next
                                ae.dispatchEvent(new Event('input', { bubbles: true }))
                              }
                              return
                            }
                            // Fallback: append to top text
                            setTopText((t) => (t + ' ' + token).trim())
                          }}
                          className="inline-block mr-1 mb-1 px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/15 transition text-[var(--primary)]/90 font-mono"
                          title={`Insert {${v}}`}
                        >
                          {`{${v}}`}
                        </button>
                      ))}
                    </div>
                    <div>
                      <label className="text-xs text-[var(--muted)] block mb-1">Text Style</label>
                      <select
                        value={selectedPreset}
                        onChange={(e) => setSelectedPreset(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-black/30 border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)]"
                      >
                        {presets.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Text Position Controls */}
                  {!showCaptionBar && (topText || bottomText) && (
                    <div className="rounded-xl bg-black/30 border border-[var(--border)] p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-semibold text-[var(--muted)]">Text Position</div>
                        <span className="text-[10px] text-[var(--muted)] italic">✋ Drag text on image</span>
                      </div>
                      {topText && (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-[var(--muted)]">Top Text Y</span>
                            <span className="text-xs text-[var(--muted)]">{topTextY}%</span>
                          </div>
                          <input
                            type="range" min="5" max="95" step="1"
                            value={topTextY}
                            onChange={(e) => setTopTextY(parseInt(e.target.value))}
                            className="w-full h-1 accent-[var(--primary)]"
                          />
                        </div>
                      )}
                      {bottomText && (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-[var(--muted)]">Bottom Text Y</span>
                            <span className="text-xs text-[var(--muted)]">{bottomTextY}%</span>
                          </div>
                          <input
                            type="range" min="5" max="95" step="1"
                            value={bottomTextY}
                            onChange={(e) => setBottomTextY(parseInt(e.target.value))}
                            className="w-full h-1 accent-[var(--primary)]"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveCaption}
                      disabled={!topText && !bottomText}
                      className="flex-1 px-4 py-2 rounded-xl bg-[var(--primary)] text-white font-medium text-sm hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Save Caption
                    </button>
                    <button
                      onClick={pickRandomMedia}
                      className="px-4 py-2 rounded-xl bg-purple-500/20 text-purple-300 text-sm hover:bg-purple-500/30 transition"
                      title="Pick random media"
                    >
                      <Shuffle size={16} />
                    </button>
                    <button
                      onClick={() => {
                        setSelectedMedia(null)
                        setTopText('')
                        setBottomText('')
                        resetFilters()
                      }}
                      className="px-4 py-2 rounded-xl bg-white/10 text-sm hover:bg-white/20 transition"
                    >
                      Clear
                    </button>
                  </div>

                  {/* Secondary Actions */}
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        if (!selectedMedia) return
                        setGeneratingCaption(true)
                        try {
                          // Try Venice AI first if configured, then fall back to template-based.
                          // 'meme' is the 4chan/Twitter-style caption prompt — vision-driven, references
                          // what's actually in the image (per user request).
                          if (veniceConfigured) {
                            const veniceResult = await window.api.ai.veniceCaption?.(selectedMedia.id, 'meme')
                            if (veniceResult && !veniceResult.error && (veniceResult.topText || veniceResult.bottomText)) {
                              if (veniceResult.topText) setTopText(veniceResult.topText)
                              if (veniceResult.bottomText) setBottomText(veniceResult.bottomText)
                              showToast('success', 'Venice AI caption generated!')
                              return
                            }
                            // If Venice fails, fall through to template-based
                            console.log('[Brainwash] Venice AI failed, falling back to templates:', veniceResult?.error)
                          }

                          // Use template-based captions (analyzes tags)
                          const result = await window.api.ai.analyzeForCaption?.(selectedMedia.id)
                          if (result?.topText) setTopText(result.topText)
                          if (result?.bottomText) setBottomText(result.bottomText)
                          if (result?.topText || result?.bottomText) {
                            showToast('success', veniceConfigured ? 'Caption generated (fallback)' : 'AI caption generated!')
                          } else {
                            showToast('info', 'Using random caption')
                            // Fallback: pick a random caption from examples
                            const randomCaption = EXAMPLE_CAPTIONS[Math.floor(Math.random() * EXAMPLE_CAPTIONS.length)]
                            if (randomCaption.top) setTopText(randomCaption.top)
                            if (randomCaption.bottom) setBottomText(randomCaption.bottom)
                          }
                        } catch (err) {
                          console.error('AI caption generation failed:', err)
                          showToast('warning', 'AI failed, using random caption')
                          // Fallback: pick a random caption from examples
                          const randomCaption = EXAMPLE_CAPTIONS[Math.floor(Math.random() * EXAMPLE_CAPTIONS.length)]
                          if (randomCaption.top) setTopText(randomCaption.top)
                          if (randomCaption.bottom) setBottomText(randomCaption.bottom)
                        } finally {
                          setGeneratingCaption(false)
                        }
                      }}
                      disabled={generatingCaption || !selectedMedia}
                      className={`flex-1 px-3 py-2 rounded-xl text-xs transition flex items-center justify-center gap-1.5 disabled:opacity-50 ${
                        veniceConfigured
                          ? 'bg-gradient-to-r from-cyan-500/20 to-purple-500/20 text-cyan-300 hover:from-cyan-500/30 hover:to-purple-500/30'
                          : 'bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-300 hover:from-purple-500/30 hover:to-pink-500/30'
                      }`}
                      title={veniceConfigured ? 'Generate with Venice AI vision' : 'Generate from templates (configure Venice AI for smarter captions)'}
                    >
                      {generatingCaption ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Sparkles size={14} />
                      )}
                      {veniceConfigured ? 'Venice AI' : 'AI Caption'}
                    </button>
                    <button
                      onClick={async () => {
                        if (!selectedMedia) return
                        try {
                          // Export the captioned image as a new file
                          const exported = await window.api.captions?.export?.(selectedMedia.id, {
                            topText: topText || null,
                            bottomText: bottomText || null,
                            presetId: selectedPreset,
                            filters: filterValues,
                            captionBar: showCaptionBar ? { color: captionBarColor, size: captionBarSize, position: captionBarPosition } : null,
                          })
                          if (exported) {
                            console.log('[Brainwash] Exported to:', exported)
                            showToast('success', 'Image exported successfully!')
                          }
                        } catch (err) {
                          console.error('[Brainwash] Export failed:', err)
                          showToast('error', 'Failed to export image')
                        }
                      }}
                      disabled={!selectedMedia}
                      className="flex-1 px-3 py-2 rounded-xl bg-green-500/20 text-green-300 text-xs hover:bg-green-500/30 transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                      title="Export as new image"
                    >
                      <Download size={14} />
                      Export
                    </button>
                    <button
                      onClick={() => {
                        if (!selectedMedia) return
                        // Show add to playlist popup (reuse existing)
                        const event = new CustomEvent('show-add-to-playlist', { detail: { mediaId: selectedMedia.id } })
                        window.dispatchEvent(event)
                      }}
                      disabled={!selectedMedia}
                      className="px-3 py-2 rounded-xl bg-blue-500/20 text-blue-300 text-xs hover:bg-blue-500/30 transition disabled:opacity-50"
                      title="Add to playlist"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <ImageIcon size={48} className="text-[var(--muted)] mb-4" />
                  <p className="text-[var(--muted)]">Select media to add captions</p>
                  <button
                    onClick={pickRandomMedia}
                    className="mt-4 flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--primary)] text-white text-sm hover:opacity-90 transition"
                  >
                    <Zap size={14} />
                    Pick Random
                  </button>
                </div>
              )}

              {/* Quick templates */}
              {templates.length > 0 && (
                <div className="mt-6">
                  <div className="text-xs text-[var(--muted)] mb-2">Quick Apply Template</div>
                  <div className="flex flex-wrap gap-2">
                    {templates.slice(0, 6).map(t => (
                      <button
                        key={t.id}
                        onClick={() => handleApplyTemplate({ top: t.topText, bottom: t.bottomText })}
                        className="px-3 py-1.5 rounded-lg bg-white/10 text-xs hover:bg-white/20 transition truncate max-w-[150px]"
                      >
                        {t.topText || t.bottomText}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : activeTab === 'gifmaker' ? (
          /* GIF Maker Tab - Create GIFs from video clips */
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Video Selection */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Select Video</div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={pickRandomVideoForGif}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--primary)]/20 text-[var(--primary)] text-xs hover:bg-[var(--primary)]/30 transition"
                    title="Pick random video"
                  >
                    <Zap size={12} />
                    Random
                  </button>
                  <button
                    onClick={shuffleVideosForGif}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 text-xs hover:bg-white/20 transition"
                    title="Shuffle all videos"
                  >
                    <Shuffle size={12} />
                    Shuffle
                  </button>
                </div>
              </div>

              {/* Search */}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Search videos..."
                  value={gifSearchQuery}
                  onChange={e => setGifSearchQuery(e.target.value)}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-sm"
                />
              </div>

              {/* Video Grid — show full library; container is the scroll viewport */}
              <div className="grid grid-cols-3 gap-2 max-h-[400px] overflow-y-auto">
                {(gifShuffledVideos.length > 0 ? gifShuffledVideos : allMedia.filter(m => m.type === 'video')).filter(m =>
                  !gifSearchQuery || (m.filename || '').toLowerCase().includes(gifSearchQuery.toLowerCase())
                ).map(m => (
                  <button
                    key={m.id}
                    onClick={async () => {
                      setGifSelectedVideo(m)
                      if (m.path) {
                        try {
                          const url = await toFileUrlCached(m.path)
                          setGifVideoUrl(url)
                          setGifPreviewUrl(null)
                          setGifStartTime(0)
                          setGifEndTime(Math.min(5, m.durationSec || 5))
                        } catch (err) {
                          console.error('[GifMaker] Failed to load video URL:', err)
                        }
                      }
                    }}
                    className={cn(
                      'aspect-video rounded-lg overflow-hidden border-2 transition relative',
                      gifSelectedVideo?.id === m.id ? 'border-[var(--primary)]' : 'border-transparent hover:border-white/20'
                    )}
                  >
                    <CaptionedThumb mediaId={m.id} thumbPath={m.thumbPath ?? null} filename={m.filename ?? ''} />
                    <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/70 text-[10px]">
                      {m.durationSec ? `${Math.floor(m.durationSec / 60)}:${String(Math.floor(m.durationSec % 60)).padStart(2, '0')}` : '?'}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* GIF Preview & Controls */}
            <div className="space-y-4">
              {/* Video Preview */}
              <div className="aspect-video bg-black rounded-xl overflow-hidden relative">
                {gifVideoUrl ? (
                  <>
                    <video
                      ref={gifVideoRef}
                      src={gifVideoUrl}
                      className="w-full h-full object-contain"
                      controls
                      onLoadedMetadata={() => {
                        if (gifVideoRef.current && gifSelectedVideo?.durationSec) {
                          setGifEndTime(Math.min(5, gifSelectedVideo.durationSec))
                        }
                      }}
                    />
                    <div className="absolute top-2 left-2 px-2 py-1 rounded bg-black/70 text-xs">
                      {gifSelectedVideo?.filename || 'Video'}
                    </div>
                  </>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-[var(--muted)]">
                    <Play size={48} className="mb-2 opacity-50" />
                    <p className="text-sm">Select a video to create a GIF</p>
                  </div>
                )}
              </div>

              {/* GIF Settings */}
              {gifVideoUrl && (
                <div className="bg-[var(--surface)] rounded-xl p-4 space-y-4">
                  <div className="text-sm font-semibold">GIF Settings</div>

                  {/* Time Range */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-[var(--muted)] block mb-1">Start Time (sec)</label>
                      <input
                        type="number"
                        min={0}
                        max={gifEndTime - 0.1}
                        step={0.1}
                        value={gifStartTime}
                        onChange={e => setGifStartTime(Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-[var(--muted)] block mb-1">End Time (sec)</label>
                      <input
                        type="number"
                        min={gifStartTime + 0.1}
                        max={gifSelectedVideo?.durationSec || 60}
                        step={0.1}
                        value={gifEndTime}
                        onChange={e => setGifEndTime(Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-sm"
                      />
                    </div>
                  </div>

                  {/* Duration display */}
                  <div className="text-xs text-[var(--muted)]">
                    Duration: {(gifEndTime - gifStartTime).toFixed(1)} seconds
                    {gifEndTime - gifStartTime > 10 && (
                      <span className="text-yellow-500 ml-2">(Warning: Long GIFs will be large files)</span>
                    )}
                  </div>

                  {/* Quick set buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        if (gifVideoRef.current) {
                          setGifStartTime(gifVideoRef.current.currentTime)
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg bg-white/10 text-xs hover:bg-white/20 transition"
                    >
                      Set Start from Player
                    </button>
                    <button
                      onClick={() => {
                        if (gifVideoRef.current) {
                          setGifEndTime(gifVideoRef.current.currentTime)
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg bg-white/10 text-xs hover:bg-white/20 transition"
                    >
                      Set End from Player
                    </button>
                  </div>

                  {/* FPS & Quality */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-[var(--muted)] block mb-1">Frame Rate (FPS)</label>
                      <select
                        value={gifFps}
                        onChange={e => setGifFps(Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-sm"
                      >
                        <option value={10}>10 FPS (small file)</option>
                        <option value={15}>15 FPS (balanced)</option>
                        <option value={24}>24 FPS (smooth)</option>
                        <option value={30}>30 FPS (very smooth)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-[var(--muted)] block mb-1">Quality</label>
                      <select
                        value={gifQuality}
                        onChange={e => setGifQuality(e.target.value as 'low' | 'medium' | 'high')}
                        className="w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-sm"
                      >
                        <option value="low">Low (320px, small file)</option>
                        <option value="medium">Medium (480px)</option>
                        <option value="high">High (720px, large file)</option>
                      </select>
                    </div>
                  </div>

                  {/* Generate Button */}
                  <button
                    onClick={async () => {
                      if (!gifSelectedVideo?.id) return
                      setGifGenerating(true)
                      try {
                        const result = await window.api.media?.createGif?.({
                          mediaId: gifSelectedVideo.id,
                          startTime: gifStartTime,
                          endTime: gifEndTime,
                          fps: gifFps,
                          quality: gifQuality
                        })
                        if (result?.success && result.gifPath) {
                          const url = await toFileUrlCached(result.gifPath)
                          setGifPreviewUrl(url)
                          // Store path for save operations
                          setGifOutputPath(result.gifPath)
                          showToast('success', 'GIF created successfully!')
                        } else {
                          showToast('error', result?.error || 'Failed to create GIF')
                        }
                      } catch (err: any) {
                        showToast('error', err?.message || 'Failed to create GIF')
                      }
                      setGifGenerating(false)
                    }}
                    disabled={gifGenerating || !gifSelectedVideo}
                    className="w-full py-3 rounded-xl bg-[var(--primary)] hover:opacity-90 disabled:opacity-50 text-white font-medium flex items-center justify-center gap-2"
                  >
                    {gifGenerating ? (
                      <>
                        <RefreshCw size={16} className="animate-spin" />
                        Creating GIF...
                      </>
                    ) : (
                      <>
                        <Sparkles size={16} />
                        Create GIF
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* GIF Preview */}
              {gifPreviewUrl && gifOutputPath && (
                <div className="bg-[var(--surface)] rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">Preview</div>
                    <div className="text-xs text-[var(--muted)]">
                      {gifOutputPath.split(/[\\/]/).pop()}
                    </div>
                  </div>
                  <div className="aspect-video bg-black rounded-lg overflow-hidden">
                    <img src={gifPreviewUrl} alt="GIF Preview" className="w-full h-full object-contain" />
                  </div>

                  {/* Rename GIF */}
                  <div className="space-y-2">
                    <label className="text-xs text-[var(--muted)]">Rename GIF (optional)</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Enter new name..."
                        value={gifRenameValue}
                        onChange={e => setGifRenameValue(e.target.value)}
                        className="flex-1 px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-sm"
                      />
                      <button
                        onClick={async () => {
                          if (!gifRenameValue.trim() || !gifOutputPath) return
                          try {
                            const result = await window.api.media?.renameGif?.(gifOutputPath, gifRenameValue.trim())
                            if (result?.success && result.newPath) {
                              setGifOutputPath(result.newPath)
                              const url = await toFileUrlCached(result.newPath)
                              setGifPreviewUrl(url)
                              setGifRenameValue('')
                              showToast('success', 'GIF renamed!')
                            } else {
                              showToast('error', result?.error || 'Failed to rename')
                            }
                          } catch {
                            showToast('error', 'Failed to rename GIF')
                          }
                        }}
                        disabled={!gifRenameValue.trim()}
                        className="px-4 py-2 rounded-lg bg-[var(--primary)]/20 text-[var(--primary)] text-sm hover:bg-[var(--primary)]/30 transition disabled:opacity-50"
                      >
                        <Edit2 size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        try {
                          const result = await window.api.media?.addGifToLibrary?.(gifOutputPath)
                          if (result?.success) {
                            showToast('success', 'GIF added to library!')
                          } else {
                            showToast('error', result?.error || 'Failed to add to library')
                          }
                        } catch {
                          showToast('error', 'Failed to add to library')
                        }
                      }}
                      className="flex-1 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium"
                    >
                      Add to Library
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          const result = await window.api.media?.saveGif?.(gifOutputPath)
                          if (result?.success) {
                            showToast('success', `GIF saved to ${result.savedPath}`)
                          } else if (result?.error !== 'Save cancelled') {
                            showToast('error', result?.error || 'Failed to save GIF')
                          }
                        } catch {
                          showToast('error', 'Failed to save GIF')
                        }
                      }}
                      className="flex-1 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-medium"
                    >
                      Save to Folder
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : activeTab === 'captioned' ? (
          <div className="space-y-4">
            <div className="text-sm font-semibold">Captioned Media ({captionedMedia.length})</div>

            {/* Edit Caption Modal */}
            {editingCaption && (
              <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
                <div className="bg-[var(--panel)] rounded-xl p-6 max-w-md w-full space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-lg font-semibold">Edit Caption</div>
                    <button
                      onClick={() => setEditingCaption(null)}
                      className="p-1 rounded-lg hover:bg-white/10"
                    >
                      <X size={20} />
                    </button>
                  </div>
                  <div className="text-xs text-[var(--muted)]">{editingCaption.filename}</div>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-[var(--muted)] block mb-1">Top Text</label>
                      <input
                        type="text"
                        value={editCaptionTop}
                        onChange={e => setEditCaptionTop(e.target.value)}
                        placeholder="Enter top caption..."
                        className="w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-[var(--muted)] block mb-1">Bottom Text</label>
                      <input
                        type="text"
                        value={editCaptionBottom}
                        onChange={e => setEditCaptionBottom(e.target.value)}
                        placeholder="Enter bottom caption..."
                        className="w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-sm"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => setEditingCaption(null)}
                      className="flex-1 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveEditedCaption}
                      className="flex-1 py-2 rounded-lg bg-[var(--primary)] hover:opacity-90 text-white text-sm font-medium"
                    >
                      Save Changes
                    </button>
                  </div>
                </div>
              </div>
            )}

            {captionedMedia.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <MessageSquare size={48} className="text-[var(--muted)] mb-4" />
                <p className="text-[var(--muted)]">No captioned media yet</p>
                <p className="text-xs text-[var(--muted)] mt-1">Add captions in the editor tab</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {captionedMedia.map(c => (
                  <div key={c.id} className="relative group">
                    <div className="aspect-video rounded-lg overflow-hidden bg-black/50 border border-[var(--border)]">
                      <CaptionedThumb
                        mediaId={c.mediaId}
                        thumbPath={c.thumbPath}
                        filename={c.filename}
                      />
                      {/* Caption preview */}
                      {c.topText && (
                        <div className="absolute top-1 left-0 right-0 text-center px-1 text-[10px] font-bold text-white drop-shadow-lg truncate">
                          {c.topText}
                        </div>
                      )}
                      {c.bottomText && (
                        <div className="absolute bottom-1 left-0 right-0 text-center px-1 text-[10px] font-bold text-white drop-shadow-lg truncate">
                          {c.bottomText}
                        </div>
                      )}
                    </div>
                    {/* Edit button */}
                    <button
                      onClick={() => handleEditCaption(c)}
                      className="absolute top-1 left-1 p-1 rounded-full bg-blue-500/80 opacity-0 group-hover:opacity-100 transition"
                      title="Edit caption"
                    >
                      <Edit2 size={12} />
                    </button>
                    {/* Delete button */}
                    <button
                      onClick={() => handleDeleteCaption(c.mediaId)}
                      className="absolute top-1 right-1 p-1 rounded-full bg-red-500/80 opacity-0 group-hover:opacity-100 transition"
                      title="Delete caption"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-sm font-semibold">Caption Templates ({templates.length})</div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setShowCreateTemplateForm((v) => !v)}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 text-xs hover:bg-emerald-500/30 transition flex items-center gap-1.5"
                  title="Hand-write a new template"
                >
                  <Plus size={12} /> Create New
                </button>
                <button
                  onClick={handleAiGenerateTemplates}
                  disabled={aiGeneratingTemplates}
                  className="px-3 py-1.5 rounded-lg bg-fuchsia-500/20 text-fuchsia-300 text-xs hover:bg-fuchsia-500/30 transition flex items-center gap-1.5 disabled:opacity-50"
                  title="Have Venice generate fresh templates from a theme"
                >
                  {aiGeneratingTemplates ? <RefreshCw size={12} className="animate-spin" /> : <Sparkles size={12} />}
                  AI Generate
                </button>
                {templates.length > 0 && (
                  <button
                    onClick={handleClearAllTemplates}
                    className="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-xs hover:bg-red-500/30 transition"
                  >
                    Clear All
                  </button>
                )}
                {templates.length === 0 && (
                  <button
                    onClick={handleSeedExampleCaptions}
                    className="px-3 py-1.5 rounded-lg bg-[var(--primary)]/20 text-[var(--primary)] text-xs hover:bg-[var(--primary)]/30 transition"
                  >
                    Load Example Captions
                  </button>
                )}
              </div>
            </div>

            {/* Inline Create New form — small + immediate. Submitting saves
                via the captions templates IPC and refreshes the list. */}
            {showCreateTemplateForm && (
              <div className="p-4 rounded-xl bg-black/30 border border-emerald-500/30 space-y-3">
                <div className="text-xs font-medium text-emerald-300">New template</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    placeholder="Top text"
                    value={newTemplateTop}
                    onChange={(e) => setNewTemplateTop(e.target.value)}
                    className="px-3 py-2 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-sm"
                  />
                  <input
                    placeholder="Bottom text"
                    value={newTemplateBottom}
                    onChange={(e) => setNewTemplateBottom(e.target.value)}
                    className="px-3 py-2 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-sm"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    placeholder="category (e.g. praise, dirty, kink)"
                    value={newTemplateCategory}
                    onChange={(e) => setNewTemplateCategory(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-xs"
                  />
                  <button
                    onClick={handleCreateTemplate}
                    disabled={!newTemplateTop && !newTemplateBottom}
                    className="px-3 py-2 rounded-lg bg-emerald-500/30 text-emerald-200 text-xs hover:bg-emerald-500/50 transition disabled:opacity-40"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => { setShowCreateTemplateForm(false); setNewTemplateTop(''); setNewTemplateBottom(''); setNewTemplateCategory('') }}
                    className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-xs transition"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {templates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Type size={48} className="text-[var(--muted)] mb-4" />
                <p className="text-[var(--muted)]">No templates yet</p>
                <p className="text-xs text-[var(--muted)] mt-1">Click "Load Example Captions", "Create New", or "AI Generate" to get started</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {templates.map(t => (
                  <div
                    key={t.id}
                    className="p-4 rounded-xl bg-black/30 border border-[var(--border)] hover:border-[var(--primary)]/50 transition cursor-pointer group"
                    onClick={() => handleApplyTemplate({ top: t.topText, bottom: t.bottomText })}
                  >
                    <div className="space-y-2">
                      {t.topText && (
                        <p className="font-bold text-sm">{t.topText}</p>
                      )}
                      {t.bottomText && (
                        <p className="font-bold text-sm">{t.bottomText}</p>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-xs text-[var(--muted)] bg-white/10 px-2 py-0.5 rounded">{t.category}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          window.api.captions?.templates?.delete?.(t.id)
                          setTemplates(prev => prev.filter(x => x.id !== t.id))
                        }}
                        className="p-1 rounded-full text-red-400 opacity-0 group-hover:opacity-100 hover:bg-red-500/20 transition"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* GIF Maker modal — opens from "Make GIF" button in the editor toolbar */}
      <GifMakerModal
        open={showGifModal}
        onClose={() => setShowGifModal(false)}
        videos={allMedia.filter((m) => m.type === 'video')}
        showToast={showToast}
        onCreated={async (newMediaId) => {
          // Refresh the library so the new GIF shows up in the gallery
          try {
            const mediaList = await window.api.media?.list?.({ limit: 2000, sortBy: 'newest' }) ?? { items: [] }
            const items = extractItems<MediaRow>(mediaList)
            setAllMedia(items)
            // Auto-select the new GIF so it's ready for caption editing
            const fresh = items.find((m) => m.id === newMediaId)
            if (fresh) setSelectedMedia(fresh)
            setMediaTypeFilter('gif')
          } catch (err) {
            console.error('[GifMaker] Failed to reload library after creation:', err)
          }
        }}
      />
    </div>
  )
}
