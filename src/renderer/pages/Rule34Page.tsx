// File: src/renderer/pages/Rule34Page.tsx
//
// Rule 34 / booru viewer with download-to-library. Custom UI matching
// Vault's existing design system (panel cards, var(--primary) accents,
// rounded-xl panels, lucide icons). NSFW content — same vault that the
// rest of the app handles, so no extra gating.
//
// Search → rule34.xxx public JSON API (no auth). Tag input mirrors the
// site's syntax: space-separated, `-` to negate. Pagination via the
// API's `pid` (post id offset, 0-indexed pages).
//
// Download button: hits booru:download-to-library which fetches the
// file URL and drops it into the user's first media directory. The
// existing media scanner picks it up within a few seconds.

import { useEffect, useState, useCallback, useRef } from 'react'
import Hls from 'hls.js'
import { AnimatePresence, motion } from 'motion/react'
import {
  Search, Download, Loader2, Globe, X, ChevronLeft, ChevronRight, ExternalLink, Play,
  Maximize2, Minimize2,
} from 'lucide-react'
import { useToast } from '../contexts'
import { cn } from '../utils/cn'

interface BooruPost {
  id: number
  file_url: string
  preview_url: string
  sample_url: string
  tags: string
  rating: string
  score: number
  source: string
  width: number
  height: number
  source_booru?: string  // populated by multi-source search
  hash?: string          // md5/post hash from booru API, used for in-library duplicate detection
}

const VIDEO_EXT = /\.(mp4|webm|mov|m4v)(\?.*)?$/i
const GIF_EXT = /\.gif(\?.*)?$/i

function isVideo(url: string): boolean {
  return VIDEO_EXT.test(url || '')
}
function isGif(url: string): boolean {
  return GIF_EXT.test(url || '')
}

type Source = 'all' | 'e621' | 'rule34' | 'safebooru' | 'yande.re' | 'konachan' | 'tbib' | 'xbooru' | 'hypnohub' | 'eporner' | 'redtube' | 'pornhub' | 'xnxx' | 'redgifs' | 'e926' | 'gelbooru' | 'realbooru' | 'danbooru' | 'aibooru' | 'civitai' | 'bluesky' | 'reddit' | 'paheal' | 'spankbang' | 'erome' | 'motherless' | 'pixiv' | 'pullpush' | 'coomer' | 'kemono'

const SOURCE_OPTIONS: Array<{ id: Source; label: string; auth: 'free' | 'key' | 'broken'; note?: string; family?: 'booru' | 'tube' }> = [
  { id: 'all', label: 'All sources', auth: 'free', note: 'parallel search across every booru + tube site' },
  // Booru family — drawings, GIFs, illustrations
  { id: 'e621', label: 'e621', auth: 'key', note: 'NSFW furry · drawings', family: 'booru' },
  { id: 'rule34', label: 'rule34.xxx', auth: 'key', note: 'NSFW general · drawings', family: 'booru' },
  { id: 'safebooru', label: 'safebooru', auth: 'free', note: 'SFW general · drawings', family: 'booru' },
  { id: 'yande.re', label: 'yande.re', auth: 'free', note: 'NSFW anime · drawings', family: 'booru' },
  { id: 'konachan', label: 'konachan', auth: 'free', note: 'NSFW anime · drawings', family: 'booru' },
  { id: 'tbib', label: 'tbib', auth: 'free', note: 'The Big Imageboard · mixed', family: 'booru' },
  { id: 'xbooru', label: 'xbooru', auth: 'free', note: 'NSFW general · drawings', family: 'booru' },
  { id: 'hypnohub', label: 'hypnohub', auth: 'free', note: 'NSFW hypno fetish', family: 'booru' },
  // Tube family — real video aggregators (embed-based)
  { id: 'eporner', label: 'Eporner', auth: 'free', note: 'NSFW real videos · tube', family: 'tube' },
  { id: 'redtube', label: 'RedTube', auth: 'free', note: 'NSFW real videos · tube', family: 'tube' },
  { id: 'pornhub', label: 'PornHub', auth: 'key', note: 'NSFW real videos · search + trending + downloads up to 1080p', family: 'tube' },
  { id: 'xnxx', label: 'xnxx', auth: 'key', note: 'NSFW real videos · search + 360p downloads', family: 'tube' },
  { id: 'redgifs', label: 'RedGifs', auth: 'free', note: 'NSFW GIFs/short videos · most Reddit NSFW GIF traffic ends up here · free temp-token', family: 'tube' },
  { id: 'e926', label: 'e926', auth: 'key', note: 'SFW twin of e621 (uses same key, rating:s locked)', family: 'booru' },
  { id: 'gelbooru', label: 'gelbooru', auth: 'key', note: 'NSFW general · drawings · same schema as rule34', family: 'booru' },
  { id: 'realbooru', label: 'realbooru', auth: 'broken', note: 'API confirmed dead 2026 — site now serves only an "API offline indefinitely" XML response', family: 'booru' },
  { id: 'danbooru', label: 'danbooru', auth: 'key', note: 'NSFW anime/general · richest tag taxonomy · own schema (e621-fork)', family: 'booru' },
  { id: 'aibooru', label: 'aibooru', auth: 'key', note: 'AI-generated anime · danbooru software · separate account', family: 'booru' },
  { id: 'civitai', label: 'Civitai', auth: 'free', note: 'AI-image gallery with full prompt/model metadata · optional key for higher rate limits', family: 'booru' },
  { id: 'bluesky', label: 'Bluesky', auth: 'free', note: 'NSFW-labeled posts (porn/sexual) · free public AT Protocol API · growing artist corpus', family: 'booru' },
  { id: 'reddit', label: 'Reddit', auth: 'broken', note: 'Removed — Reddit Data API now requires Responsible Builder Policy gating. Use PullPush instead (no auth, same content)', family: 'tube' },
  { id: 'paheal', label: 'rule34.paheal', auth: 'free', note: 'Shimmie2 software · distinct corpus from rule34.xxx · danbooru-XML API', family: 'booru' },
  { id: 'spankbang', label: 'SpankBang', auth: 'free', note: 'HTML scrape · yt-dlp handles downloads · amateur+studio mix', family: 'tube' },
  { id: 'erome', label: 'Erome', auth: 'broken', note: 'HTML scrape selectors broke 2026 — site redesign changed the markup. Will need a new scraper to re-enable', family: 'tube' },
  { id: 'motherless', label: 'Motherless', auth: 'broken', note: 'Anti-bot protection added 2026 — returns 503 on scrape. Re-enable when bypass found or API access purchased', family: 'tube' },
  { id: 'pixiv', label: 'Pixiv R-18', auth: 'key', note: 'Pixiv ajax JSON · R-18 mode · needs PHPSESSID cookie for results (see settings → AI Tools)', family: 'booru' },
  { id: 'pullpush', label: 'PullPush (Reddit)', auth: 'free', note: 'Pushshift successor · Reddit archive · no auth required · fills the gap left by Reddit OAuth gating', family: 'tube' },
  { id: 'coomer', label: 'Coomer', auth: 'free', note: 'Patreon / OnlyFans / Fansly archive · query "<service>:<user>" for a specific creator (e.g. patreon:asanagi)', family: 'tube' },
  { id: 'kemono', label: 'Kemono', auth: 'free', note: 'Patreon / Fanbox / Gumroad / SubscribeStar archive · same query syntax as Coomer', family: 'tube' },
]

// Tube embed detection — when file_url is an embed page rather than a
// direct .mp4 URL, the lightbox uses an iframe instead of <video>.
const EMBED_HOSTS = /(eporner\.com\/embed|embed\.redtube\.com|pornhub\.com\/embed|pornhub\.com\/view_video|xvideos\.com\/embedframe|spankbang\.com\/embed|xhamster\.com\/embed|xnxx\.com\/video-)/i

function isEmbedUrl(url: string): boolean {
  return EMBED_HOSTS.test(url || '')
}

// yt-dlp returns HLS (.m3u8) URLs for most tube content. Chromium's
// native <video> can't play HLS, so we attach hls.js to the element
// when the URL is an HLS manifest. For direct .mp4 / .webm we just
// set src as normal.
function isHlsUrl(url: string): boolean {
  return /\.m3u8(\?|$)/i.test(url || '')
}

// Generic tags that DON'T identify content meaningfully — when "More
// like this" picks similar posts, including these in the new query
// turns "find more like this anime girl" into "find anything tagged
// 1girl" which returns everything. We strip them so the resulting
// query is built from character / copyright / scenario / kink tags
// that actually narrow results to similar posts.
const GENERIC_TAGS = new Set([
  // Composition / pose / camera
  '1girl', '1boy', '2girls', '2boys', '3girls', 'multiple_girls', 'multiple_boys',
  'solo', 'solo_focus', 'group', 'looking_at_viewer', 'standing', 'sitting',
  'lying', 'kneeling', 'looking_back', 'from_behind', 'from_above', 'from_below',
  'pov', 'close-up', 'closeup', 'cropped', 'portrait',
  // Ratings / meta
  'rating:safe', 'rating:questionable', 'rating:explicit', 'rating:s', 'rating:q', 'rating:e',
  'safe', 'questionable', 'explicit', 'nsfw', 'sfw',
  // Hair colors (user explicitly removed these from canonical vocab)
  'blonde_hair', 'brown_hair', 'black_hair', 'red_hair', 'redhead', 'pink_hair',
  'blue_hair', 'green_hair', 'silver_hair', 'white_hair', 'long_hair', 'short_hair',
  'hair', 'twintails', 'ponytail',
  // Eye colors
  'blue_eyes', 'green_eyes', 'brown_eyes', 'red_eyes', 'purple_eyes', 'yellow_eyes',
  // Quality / source meta
  'highres', 'absurdres', 'lowres', 'official_art', 'commentary_request',
  'translated', 'translation_request', 'tagme', 'meta',
  // Body parts as solo tags (only useful in combination)
  'breasts', 'nipples', 'pussy', 'penis', 'ass', 'thighs', 'feet', 'hands',
])

// Filter a tag string down to the most meaningful tokens for a "More
// like this" search. Drops generic composition / hair-color / quality
// tags, prefers character / copyright / kink / scenario tags. Returns
// up to 6 tokens (more than 3 = better signal, less than 8 = source
// APIs cap out).
function getMeaningfulTags(rawTags: string, limit = 6): string {
  const tokens = String(rawTags || '').split(/\s+/).filter(Boolean)
  const meaningful: string[] = []
  for (const t of tokens) {
    const lower = t.toLowerCase()
    if (GENERIC_TAGS.has(lower)) continue
    // Skip boilerplate prefixed metadata
    if (/^(highres|absurdres|lowres|tagme|translated)/.test(lower)) continue
    meaningful.push(t)
    if (meaningful.length >= limit) break
  }
  return meaningful.join(' ')
}

// Sentinel that calls `onIntersect` once each time the user scrolls
// it into view. Hands-free Load-more for the infinite-scroll feel.
// Auto-dismounts when the caller removes it (no more posts available).
function InfiniteScrollSentinel({ onIntersect }: { onIntersect: () => void }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const cooldownRef = useRef(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (entry?.isIntersecting && !cooldownRef.current) {
          cooldownRef.current = true
          onIntersect()
          // Prevent re-firing while the next page fetches. Caller
          // re-mounts a fresh sentinel when posts state grows.
          setTimeout(() => { cooldownRef.current = false }, 1500)
        }
      },
      { rootMargin: '200px' }  // fire 200px before bottom for smooth feel
    )
    io.observe(el)
    return () => io.disconnect()
  }, [onIntersect])
  return <div ref={ref} aria-hidden="true" className="h-8 w-full" />
}

interface HlsAwareVideoProps {
  src: string
  className?: string
  autoPlay?: boolean
  loop?: boolean
  controls?: boolean
  onDoubleClick?: () => void
  onError?: (e: any) => void
}

function HlsAwareVideo({ src, className, autoPlay = true, loop = true, controls = true, onDoubleClick, onError }: HlsAwareVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  // Refs for the HLS instance + the latest onError callback. Without
  // these the effect ran on every parent render (inline `onError={...}`
  // callbacks are new function identities every time), tearing down +
  // re-creating the HLS attachment, which restarted the video. Now
  // the effect deps are JUST `src` — onError changes don't re-mount.
  const hlsRef = useRef<Hls | null>(null)
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    // Always tear down a prior HLS attachment before starting a new one.
    if (hlsRef.current) {
      try { hlsRef.current.destroy() } catch { /* noop */ }
      hlsRef.current = null
    }
    if (!isHlsUrl(src)) {
      // Direct file URL — let the browser handle it natively.
      video.src = src
      return
    }
    // HLS path: attach hls.js, parse manifest, hand the MediaSource
    // buffer to the <video>. Safari has native HLS so we could skip
    // hls.js there, but in Electron+Chromium we always need it.
    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        // Larger forward buffer so an in-stream segment hiccup doesn't
        // trigger the browser's end-of-stream → loop-to-0 behavior
        // (root cause of the "plays 5s then restarts" bug). Default is
        // 30s of forward buffer; bumping prevents stutters on slower
        // CDNs from looking like end-of-video to the <video> element.
        maxBufferLength: 60,
        maxMaxBufferLength: 120,
        // Auto-recover on transient errors instead of bubbling them
        // up as a fatal load failure. xnxx CDN segments occasionally
        // 403 on rapid seeks; recovery transparently re-fetches.
        nudgeMaxRetry: 10,
        fragLoadingMaxRetry: 6,
      })
      hlsRef.current = hls
      hls.loadSource(src)
      hls.attachMedia(video)
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (!data?.fatal) return  // non-fatal errors recover internally
        console.warn('[Browse lightbox] HLS fatal:', data?.type, data?.details)
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          try { hls.startLoad() } catch { /* noop */ }
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          try { hls.recoverMediaError() } catch { /* noop */ }
        } else {
          onErrorRef.current?.(new Error(`HLS fatal: ${data.details}`))
        }
      })
      return () => {
        try { hls.destroy() } catch { /* noop */ }
        if (hlsRef.current === hls) hlsRef.current = null
      }
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src
    } else {
      console.warn('[Browse lightbox] No HLS support and URL is HLS:', src)
      onErrorRef.current?.(new Error('HLS not supported by this browser'))
    }
  }, [src])  // intentionally ONLY src — onError lives in a ref

  // Booru-CDN Referer stripping happens in main.ts via a webRequest
  // override (REFERER_OVERRIDES with stripReferer: true). Doing it in
  // the network layer is the only reliable path — the HTML
  // referrerpolicy attribute is not honored on <video>.
  return (
    <video
      ref={videoRef}
      autoPlay={autoPlay}
      // Looping on HLS streams is fragile — hls.js's internal "stream
      // ended" signal can fire prematurely on slow CDN responses,
      // looping the video back to 0 even mid-playback. Honor the
      // caller's intent but warn when loop is set on HLS.
      loop={loop && !isHlsUrl(src)}
      controls={controls}
      preload="auto"
      className={className}
      onDoubleClick={onDoubleClick}
      onError={onError}
    />
  )
}

// Source family classification for the family tabs UI. The SOURCE_OPTIONS
// `family` field is binary (booru|tube) so we layer a richer 4-way
// classification on top: ai = AI-image platforms, social = artist /
// post platforms with user-curated content (Reddit / Bluesky / Pixiv).
type SourceFamily = 'booru' | 'tube' | 'ai' | 'social'
const SOURCE_FAMILY_4: Record<string, SourceFamily> = {
  aibooru: 'ai',
  civitai: 'ai',
  reddit: 'social',
  bluesky: 'social',
  pixiv: 'social',
  pullpush: 'social',
  // Tubes — explicit
  eporner: 'tube', redtube: 'tube', pornhub: 'tube', xnxx: 'tube',
  redgifs: 'tube', spankbang: 'tube', erome: 'tube', motherless: 'tube',
  // Everything else (default) → booru
}
function familyOf(id: string): SourceFamily {
  return SOURCE_FAMILY_4[id] ?? 'booru'
}

// Compact score formatter: 1432 → 1.4k, 4_500_000 → 4.5M. Used in tiles
// + lightbox metadata so high-score boorus don't take up 7 digits.
function fmtScore(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '0'
  const abs = Math.abs(n)
  if (abs >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + 'B'
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (abs >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'k'
  return String(Math.round(n))
}

// Source-specific brand emoji for the per-tile origin badge. Cheap
// visual hint — no licensed-icon assets needed.
const SOURCE_ICONS: Record<string, string> = {
  e621: '🦊', e926: '🦊',
  rule34: '🔞', gelbooru: '🎨', realbooru: '📷',
  safebooru: '✅', 'yande.re': '🌸', konachan: '🌸',
  tbib: '🖼️', xbooru: '🎴', hypnohub: '🌀',
  danbooru: '📚', aibooru: '🤖', civitai: '🤖',
  paheal: '⛓️', pixiv: '🎌',
  bluesky: '☁️', reddit: '👽',
  eporner: '🎬', redtube: '📺', pornhub: '🎥', xnxx: '🎞️',
  redgifs: '⚡', spankbang: '🎬', erome: '📁', motherless: '🎥',
  pullpush: '📦',
}

// Per-source operator hints. Shown as clickable chips below the search
// bar when a single source is active. Each chip appends to the current
// query (space-prefixed) so users can stack operators.
const SOURCE_HINTS: Record<string, string[]> = {
  e621:    ['rating:e', 'rating:s', 'score:>50', 'order:score', 'order:random'],
  e926:    ['rating:s', 'score:>20', 'order:score', 'order:random'],
  rule34:  ['rating:explicit', 'score:>50', 'sort:score', 'sort:updated'],
  safebooru: ['rating:safe', 'order:score', 'order:random'],
  'yande.re': ['rating:e', 'order:score', 'order:random'],
  konachan: ['rating:e', 'order:score'],
  tbib:    ['score:>20', 'sort:score'],
  xbooru:  ['rating:explicit', 'sort:score'],
  hypnohub: ['rating:explicit', 'sort:score'],
  danbooru: ['rating:e', 'order:rank', 'order:score', 'score:>50'],
  aibooru: ['rating:e', 'order:rank', 'order:score'],
  paheal:  ['order:score'],
  gelbooru: ['rating:explicit', 'sort:score'],
  realbooru: ['rating:explicit', 'sort:score'],
  civitai: ['(searches prompt text — try: "redhead", "1girl outdoors")'],
  pixiv:   ['(R-18 only; comma-separate tags for AND)'],
  reddit:  ['(searches NSFW subs you configured)'],
  pullpush:['(plain keywords; queries Reddit archive — no auth needed)'],
  bluesky: ['nsfw', 'porn', 'sexual'],
  eporner: ['(empty = trending)'],
  redtube: ['(empty = trending)'],
  pornhub: ['(empty = trending)'],
  xnxx:    ['(empty = popular)'],
  redgifs: ['(empty = trending; otherwise plain keywords)'],
  spankbang: ['(empty = trending)'],
  erome:   ['(plain keywords)'],
  motherless: ['(plain keywords)'],
  coomer:  ['patreon:<id>', 'onlyfans:<id>', '(plain text = global creator search)'],
  kemono:  ['patreon:<id>', 'fanbox:<id>', 'gumroad:<id>', '(plain text = global)'],
}

// #118 — Tube categories. Per-source curated category chips for
// one-click discovery without typing. Most tubes treat category
// names as search terms, so clicking a chip just runs that search.
const TUBE_CATEGORIES: Record<string, string[]> = {
  pornhub: ['amateur', 'anal', 'big tits', 'blowjob', 'cumshot', 'creampie', 'lesbian', 'milf', 'pov', 'public', 'threesome', 'verified amateurs'],
  redtube: ['amateur', 'anal', 'asian', 'big tits', 'blonde', 'brunette', 'cumshot', 'lesbian', 'milf', 'teen', 'threesome'],
  eporner: ['amateur', 'anal', 'asian', 'big tits', 'blowjob', 'cumshot', 'lesbian', 'milf', 'pov', 'redhead', 'squirt'],
  xnxx:    ['amateur', 'anal', 'big ass', 'big tits', 'blowjob', 'cumshot', 'lesbian', 'milf', 'pov', 'teen', 'threesome'],
  redgifs: ['amateur', 'anal', 'blowjob', 'cumshot', 'lesbian', 'milf', 'pov', 'public', 'squirt'],
  spankbang: ['amateur', 'anal', 'asian', 'big tits', 'blowjob', 'cumshot', 'lesbian', 'milf', 'pov'],
  erome:   ['amateur', 'anal', 'lesbian', 'milf', 'pov', 'teen'],
  motherless: ['amateur', 'anal', 'big tits', 'blowjob', 'cumshot', 'lesbian', 'milf', 'teen'],
}

const PER_PAGE = 60

export default function Rule34Page() {
  const { showToast } = useToast()
  const [tagInput, setTagInput] = useState('')
  const [activeQuery, setActiveQuery] = useState('')
  const [page, setPage] = useState(0)
  const [source, setSource] = useState<Source>('all')
  // Media-type filter — drives the client-side filter applied after a
  // search returns. Boorus return mixed image / GIF / video posts;
  // tubes return only embeds.
  const [mediaFilter, setMediaFilter] = useState<'all' | 'image' | 'gif' | 'video' | 'tube'>('all')
  const [sortBy, setSortBy] = useState<'default' | 'score' | 'newest'>('default')
  const [posts, setPosts] = useState<BooruPost[]>([])
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [sourceErrors, setSourceErrors] = useState<Array<{ source: string; error: string }>>([])
  const [perSourceCounts, setPerSourceCounts] = useState<Record<string, number>>({})
  const [error, setError] = useState<string | null>(null)
  // Track which posts the user has downloaded this session so the UI
  // can disable the button + show a "Saved" badge.
  const [downloaded, setDownloaded] = useState<Set<number>>(new Set())
  const [downloading, setDownloading] = useState<Set<number>>(new Set())
  // Lightbox state — clicking a thumbnail opens the full image.
  const [lightbox, setLightbox] = useState<BooruPost | null>(null)
  // Lightbox display mode: 'window' = sized to fit panel chrome,
  // 'fullscreen' = covers viewport edge-to-edge, controls floating.
  const [lightboxFullscreen, setLightboxFullscreen] = useState(false)
  // Resolved direct-MP4 URL for xnxx posts. xnxx blocks third-party
  // iframe embedding so we lazily resolve view URLs to direct files
  // when the lightbox opens.
  const [resolvedVideoUrl, setResolvedVideoUrl] = useState<string | null>(null)
  const [resolvingVideo, setResolvingVideo] = useState(false)
  // Paste-URL panel: user pastes a tube URL, backend resolves to a
  // direct MP4 or embed URL, inline player + Save-to-Library shows.
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteUrl, setPasteUrl] = useState('')
  const [pasteLoading, setPasteLoading] = useState(false)
  const [pasteResult, setPasteResult] = useState<{
    videoUrl?: string
    thumbUrl?: string | null
    source?: string
    sourceUrl: string
    error?: string
    unresolved?: boolean
  } | null>(null)
  const [pasteSaved, setPasteSaved] = useState(false)
  const [pasteSaving, setPasteSaving] = useState(false)
  // "Only direct-saveable" toggle — hides tube embed posts (xnxx /
  // pornhub etc. that need RapidAPI to resolve). Off by default.
  const [onlyDirect, setOnlyDirect] = useState(false)
  // Failed sources that should be excluded from the next "All sources"
  // fan-out. Populated automatically after 3 consecutive failures and
  // user-mutable via the per-source error retry/mute buttons.
  const [mutedSources, setMutedSources] = useState<Set<string>>(new Set())
  // Tile-hover preview state. Tracks the post id that's currently
  // hovered + a delay-timer ref so a fast cursor sweep doesn't fire
  // a video load on every tile. Only direct-MP4 URLs preview;
  // embed-tubes are skipped (would need iframe + autoplay headers).
  const [hoverPreviewId, setHoverPreviewId] = useState<number | null>(null)
  const hoverTimerRef = useRef<number | null>(null)
  // Source family filter. When set to anything other than 'all', the
  // chip list narrows AND the "All sources" multi-source fan-out
  // restricts to sources in that family. Reduces visual + query load.
  const [activeFamily, setActiveFamily] = useState<'all' | 'booru' | 'tube' | 'ai' | 'social'>('all')
  // Rating filter — narrows the visible grid by booru rating.
  // 'all' shows everything, 's' = safe only, 'q' = questionable, 'e' = explicit.
  const [ratingFilter, setRatingFilter] = useState<'all' | 's' | 'q' | 'e'>('all')
  // Minimum-resolution filter (client-side). 0 = any.
  const [minResolution, setMinResolution] = useState<0 | 720 | 1080 | 2160>(0)
  // Minimum-score filter. 0 = any.
  const [minScore, setMinScore] = useState<0 | 50 | 200 | 1000>(0)
  // Grid density / layout — affects column count + tile padding.
  const [layoutSize, setLayoutSize] = useState<'compact' | 'comfortable' | 'large'>(() => {
    try { return (localStorage.getItem('vault.browse.layoutSize') as any) || 'comfortable' }
    catch { return 'comfortable' }
  })
  // Multi-select mode for bulk operations. When on, clicking tiles
  // toggles selection instead of opening the lightbox. Ctrl-click in
  // normal mode also toggles a tile into selection. Persisted set.
  const [multiSelect, setMultiSelect] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())  // composite "<source>-<id>"
  const [bulkSaving, setBulkSaving] = useState(false)
  // #115 — user-supplied tags applied to every selected item on bulk-save.
  // Comma- or space-separated; lowercased + trimmed at save time.
  const [bulkExtraTags, setBulkExtraTags] = useState('')
  // Hidden-for-session set — Esc menu's "Hide this post" stashes a
  // post's composite id here so subsequent renders / paginations skip it.
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())
  // Header collapse — give back vertical real estate on small windows.
  const [headerCollapsed, setHeaderCollapsed] = useState(false)
  // Filters popover — when open, shows rating/min-res/min-score/SFW/
  // blacklist/layout/density/etc. as a dropdown panel under the
  // search bar. Saves vertical space in the header by hiding controls
  // that aren't tweaked every query.
  const [filtersOpen, setFiltersOpen] = useState(false)
  // SFW-only quick-toggle. When on, auto-injects rating:safe / rating:s
  // operators into queries on supported sources + applies the s/q filter
  // client-side as belt-and-suspenders.
  const [sfwOnly, setSfwOnly] = useState(false)
  // Vault tag vocabulary for autocomplete. Lazy-loaded from `tags:list`
  // IPC on first focus. Used to suggest completions as the user types.
  const [vaultTags, setVaultTags] = useState<string[]>([])
  const [vaultTagsLoaded, setVaultTagsLoaded] = useState(false)
  // Custom filename template. Supports placeholders:
  //   {source}    → source_booru (e.g. "e621")
  //   {id}        → post id (numeric)
  //   {topTags3}  → first 3 tags joined with "_"
  //   {ext}       → file extension (with leading dot)
  //   {date}      → YYYYMMDD of save time
  // When empty, backend falls back to the source-specific default
  // (e.g. "rule34-12345.jpg"). Persisted to localStorage.
  const [filenameTemplate, setFilenameTemplate] = useState<string>(() => {
    try { return localStorage.getItem('vault.browse.filenameTemplate') ?? '' }
    catch { return '' }
  })
  // Already-in-library hash check. Stores the set of media hashes
  // already present in Vault — Browse posts whose hash matches get
  // an "In Library" badge so the user doesn't accidentally re-save.
  const [libraryHashes, setLibraryHashes] = useState<Set<string>>(new Set())
  // Per-source exhausted-set — on each multi-source fan-out, sources
  // that returned 0 results get added here. Subsequent pages skip them
  // so we don't waste calls on already-empty sources. Reset when the
  // user runs a fresh search or changes family/source.
  const exhaustedSourcesRef = useRef<Set<string>>(new Set())
  // Vault blacklist tags — posts whose tag string contains any of
  // these get hidden from Browse results. Loaded once on mount.
  const [blacklistTags, setBlacklistTags] = useState<string[]>([])
  // Master toggle for applying the blacklist. Off by default so
  // first-time users see everything; user opts in.
  const [applyBlacklist, setApplyBlacklist] = useState<boolean>(() => {
    try { return localStorage.getItem('vault.browse.applyBlacklist') === '1' }
    catch { return false }
  })
  // Tag autocomplete dropdown state — derived from the LAST token in
  // the search input. Shows up to 8 matches.
  const [autocompleteOpen, setAutocompleteOpen] = useState(false)
  const [autocompleteIdx, setAutocompleteIdx] = useState(0)
  // Save destination dropdown — populated from settings.library.mediaDirs.
  // User-selectable so they can route to e.g. their AI-gen folder vs
  // the general library folder. Persists across sessions via localStorage.
  const [mediaDirs, setMediaDirs] = useState<string[]>([])
  const [saveTargetDir, setSaveTargetDir] = useState<string>(() => {
    try { return localStorage.getItem('vault.browse.saveTargetDir') ?? '' }
    catch { return '' }
  })
  // Recent searches — persisted to localStorage. Dropdown shows on
  // search-input focus when the input is empty. Click an entry to
  // re-run that query against its original source.
  interface RecentSearch { q: string; source: Source; ts: number; results?: number }
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>(() => {
    try {
      const raw = localStorage.getItem('vault.browse.recentSearches')
      if (!raw) return []
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.slice(0, 20) : []
    } catch { return [] }
  })
  const [searchFocused, setSearchFocused] = useState(false)
  // Tile right-click context menu — reverse-image-search providers +
  // copy URL. Local to Browse (the global ContextMenuContext is tied
  // to MediaRow which booru posts aren't). Closes on outside-click.
  const [tileMenu, setTileMenu] = useState<{ post: BooruPost; x: number; y: number } | null>(null)
  // Saved (pinned) searches — same shape as recent but pinned by user.
  interface SavedSearch { name: string; q: string; source: Source; ts: number }
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>(() => {
    try {
      const raw = localStorage.getItem('vault.browse.savedSearches')
      if (!raw) return []
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch { return [] }
  })

  // Append mode — true if the caller wants new posts appended to the
  // existing list (infinite-scroll style) instead of replacing them.
  // Triggered by the Load more button.
  // _autoFillDepth is internal — used to cap recursive auto-fills.
  const search = useCallback(async (query: string, p: number, src: Source, opts?: { append?: boolean; _autoFillDepth?: number }) => {
    setLoading(true)
    setError(null)
    if (!opts?.append) setSourceErrors([])
    try {
      if (!window.api?.booru?.search) {
        setError('Vault needs to restart to load the booru viewer module. Close and reopen the app.')
        setLoading(false)
        return
      }
      if (src === 'all') {
        // Fan out to every working source in parallel. Pagination
        // applies uniformly — page N pulls page N from each source.
        // Muted sources are excluded — user has explicitly told us to
        // stop wasting query time on them this session. Family-tab
        // narrowing further restricts to one of booru/tube/ai/social.
        const allSources = ['e621', 'rule34', 'safebooru', 'yande.re', 'konachan', 'tbib', 'xbooru', 'hypnohub', 'eporner', 'redtube', 'pornhub', 'xnxx', 'redgifs', 'e926', 'gelbooru', 'realbooru', 'danbooru', 'aibooru', 'civitai', 'bluesky', 'reddit', 'paheal', 'spankbang', 'erome', 'motherless', 'pixiv', 'pullpush', 'coomer', 'kemono']
        // Per-source independent pagination: when paginating forward,
        // skip sources that returned 0 last time AND sources the user
        // muted AND sources outside the active family. Fresh queries
        // (p === 0) reset the exhausted set so all sources get a chance.
        if (p === 0) exhaustedSourcesRef.current = new Set()
        // Sources marked auth:'broken' in SOURCE_OPTIONS are confirmed
        // dead — skip them at fan-out time so we don't burn quota or
        // pollute the per-source-error display with known failures.
        const brokenSources = new Set(SOURCE_OPTIONS.filter((s) => s.auth === 'broken').map((s) => s.id as string))
        const activeSources = allSources.filter((s) => {
          if (brokenSources.has(s)) return false
          if (mutedSources.has(s)) return false
          if (activeFamily !== 'all' && familyOf(s) !== activeFamily) return false
          if (exhaustedSourcesRef.current.has(s)) return false
          return true
        })
        const r = await window.api.booru.searchMulti({
          sources: activeSources,
          tags: query,
          perPage: PER_PAGE,
          page: p,
        })
        if (r?.ok) {
          if (opts?.append) {
            setPosts((prev) => {
              // Dedupe by (source_booru, id) so re-paging doesn't show
              // the same post twice when sources return overlap.
              const seen = new Set(prev.map((x: BooruPost) => `${x.source_booru ?? ''}-${x.id}`))
              const fresh = (r.posts ?? []).filter((x: BooruPost) => !seen.has(`${x.source_booru ?? ''}-${x.id}`))
              return [...prev, ...fresh]
            })
          } else {
            setPosts(r.posts ?? [])
          }
          setHasMore(!!r.hasMore)
          setPage(r.page ?? p)
          setSourceErrors(r.errors ?? [])
          setPerSourceCounts((r as any).perSourceCounts ?? {})
          // Mark sources that returned 0 as exhausted for THIS query
          // so subsequent pages skip them. Sources with errors don't
          // get exhausted — they get retried in case of transient fails.
          const erroredSet = new Set((r.errors ?? []).map((e: any) => e.source))
          const perCounts: Record<string, number> = (r as any).perSourceCounts ?? {}
          for (const [src, count] of Object.entries(perCounts)) {
            if (count === 0 && !erroredSet.has(src)) {
              exhaustedSourcesRef.current.add(src)
            }
          }
        } else {
          setError('Multi-source search failed')
          if (!opts?.append) setPosts([])
        }
      } else {
        setPerSourceCounts({})
        const r = await window.api.booru.search({ source: src, tags: query, perPage: PER_PAGE, page: p })
        if (r?.ok) {
          if (opts?.append) {
            setPosts((prev) => {
              const seen = new Set(prev.map((x: BooruPost) => `${x.source_booru ?? ''}-${x.id}`))
              const fresh = (r.posts ?? []).filter((x: BooruPost) => !seen.has(`${x.source_booru ?? ''}-${x.id}`))
              return [...prev, ...fresh]
            })
          } else {
            setPosts(r.posts ?? [])
          }
          setHasMore(!!r.hasMore)
          setPage(r.page)
        } else {
          setError(r?.error ?? `${src} search failed`)
          if (!opts?.append) setPosts([])
          setHasMore(false)
        }
      }
    } catch (err: any) {
      setError(err?.message ?? 'Search failed')
      setPosts([])
      setHasMore(false)
    } finally {
      setLoading(false)
    }
  }, [mutedSources, activeFamily])

  // Auto-fill page: when active filters (media-type / only-direct)
  // shave the visible count below half of PER_PAGE AND there's more
  // available, auto-load + append the next page. Repeats up to 4 times.
  // Stops early when a fetched page adds 0 new visible posts (filter
  // is too restrictive for the current source mix — user should
  // change family / filter instead of burning quota).
  const autoFillCountRef = useRef(0)
  const lastVisibleRef = useRef(0)
  useEffect(() => {
    if (loading) return
    if (!hasMore) { autoFillCountRef.current = 0; return }
    if (posts.length === 0) { autoFillCountRef.current = 0; return }
    if (!activeQuery && page === 0) return  // skip initial empty state

    const visibleNow = posts.filter((post) => {
      if (onlyDirect && isEmbedUrl(post.file_url)) return false
      if (mediaFilter === 'all') return true
      if (mediaFilter === 'video') return isVideo(post.file_url) || isEmbedUrl(post.file_url)
      if (mediaFilter === 'tube') return isEmbedUrl(post.file_url)
      if (mediaFilter === 'gif') return isGif(post.file_url)
      if (mediaFilter === 'image') return !isVideo(post.file_url) && !isGif(post.file_url) && !isEmbedUrl(post.file_url)
      return true
    }).length

    // No-progress guard: if the previous fetch added posts but the
    // visible count didn't move, the filter is too tight for what's
    // available. Stop hammering the APIs.
    const noProgress = autoFillCountRef.current > 0 && visibleNow <= lastVisibleRef.current
    if (noProgress) {
      autoFillCountRef.current = 99  // disable until user does something
      return
    }
    lastVisibleRef.current = visibleNow

    if (visibleNow < PER_PAGE / 2 && autoFillCountRef.current < 4) {
      autoFillCountRef.current += 1
      void search(activeQuery, page + 1, source, { append: true })
    } else if (visibleNow >= PER_PAGE / 2) {
      autoFillCountRef.current = 0
    }
  }, [posts, loading, hasMore, mediaFilter, onlyDirect, page, activeQuery, source, search])

  // Reset auto-fill counter on any explicit user action (new query,
  // changed source, family change). Without this, after a successful
  // fill the counter stays maxed and won't refill on later filter changes.
  useEffect(() => {
    autoFillCountRef.current = 0
    lastVisibleRef.current = 0
  }, [activeQuery, source, activeFamily, mediaFilter, onlyDirect])

  // After every successful search (not the empty initial call), prepend
  // to the recent-searches list. Dedupe by (q, source) so re-running
  // the same query just bumps it to the top without duplicating.
  const recordRecentSearch = useCallback((q: string, src: Source, results: number) => {
    if (!q.trim()) return  // skip empty/default queries
    setRecentSearches((prev) => {
      const trimmedQ = q.trim()
      const filtered = prev.filter((r) => !(r.q === trimmedQ && r.source === src))
      const next: RecentSearch[] = [{ q: trimmedQ, source: src, ts: Date.now(), results }, ...filtered].slice(0, 20)
      try { localStorage.setItem('vault.browse.recentSearches', JSON.stringify(next)) } catch { /* noop */ }
      return next
    })
  }, [])

  // Page-level keyboard shortcuts.
  //   PgUp/PgDn + F/B : pagination
  //   Home            : jump to page 0
  //   Ctrl+K          : focus search input
  //   1-9             : jump to source N (in the visible source picker)
  //   r               : random pick from current results
  //   s               : shuffle (re-randomize) current grid
  //   M               : toggle multi-select
  // Active when the lightbox is CLOSED.
  useEffect(() => {
    if (lightbox) return
    const onPageKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const inInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      // Ctrl+K → focus search even when not in an input
      if (e.key === 'k' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        const input = document.querySelector<HTMLInputElement>('input[type="text"][placeholder^="Tags"]')
        input?.focus()
        input?.select()
        return
      }
      if (inInput) return
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      if ((e.key === 'PageDown' || e.key === 'f' || e.key === 'F') && hasMore && !loading) {
        e.preventDefault()
        search(activeQuery, page + 1, source)
      } else if ((e.key === 'PageUp' || e.key === 'b' || e.key === 'B') && page > 0 && !loading) {
        e.preventDefault()
        search(activeQuery, Math.max(0, page - 1), source)
      } else if (e.key === 'Home' && page !== 0 && !loading) {
        e.preventDefault()
        search(activeQuery, 0, source)
      } else if (e.key === 'r' && posts.length > 0) {
        // Random pick from current results.
        e.preventDefault()
        const pick = posts[Math.floor(Math.random() * posts.length)]
        if (pick) setLightbox(pick)
      } else if (e.key === 'M' && e.shiftKey === false) {
        e.preventDefault()
        setMultiSelect((v) => !v)
      } else if (e.key === 'Escape' && multiSelect) {
        e.preventDefault()
        setMultiSelect(false)
      }
    }
    window.addEventListener('keydown', onPageKey)
    return () => window.removeEventListener('keydown', onPageKey)
  }, [lightbox, hasMore, loading, page, activeQuery, source, search, posts, multiSelect])

  // Lightbox keyboard handler. Esc closes (exits fullscreen first if
  // active). ← / → step through posts. F toggles fullscreen.
  // ↑ / ↓ are aliased for trackpad / vertical-feel users.
  useEffect(() => {
    if (!lightbox) return
    const onKey = (e: KeyboardEvent) => {
      // Ignore when focus is in an input/textarea (paste-URL bar etc).
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return

      if (e.key === 'Escape') {
        if (lightboxFullscreen) {
          setLightboxFullscreen(false)
        } else {
          setLightbox(null)
        }
        return
      }
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault()
        setLightboxFullscreen((f) => !f)
        return
      }
      const idx = posts.findIndex((p) => p.id === lightbox.id && p.source === lightbox.source)
      if (idx < 0) return
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault()
        if (idx < posts.length - 1) setLightbox(posts[idx + 1])
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        if (idx > 0) setLightbox(posts[idx - 1])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox, posts, lightboxFullscreen])

  // Reset fullscreen state when the lightbox closes — so the next
  // open returns to the default windowed view.
  useEffect(() => {
    if (!lightbox) setLightboxFullscreen(false)
  }, [lightbox])

  // Load media-directory list from settings once on mount. The Save
  // destination dropdown defaults to dirs[0] if no choice persisted.
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const s = await (window as any).api?.settings?.get?.()
        const dirs: string[] = Array.isArray(s?.library?.mediaDirs) ? s.library.mediaDirs : []
        if (!alive) return
        setMediaDirs(dirs)
        if (!saveTargetDir && dirs.length > 0) setSaveTargetDir(dirs[0])
        else if (saveTargetDir && !dirs.includes(saveTargetDir) && dirs.length > 0) {
          // Persisted dir no longer exists in settings — fall back to first.
          setSaveTargetDir(dirs[0])
        }
      } catch (err) {
        console.warn('[Browse] media-dirs load failed:', err)
      }
    })()
    return () => { alive = false }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // Persist save-dir choice so re-opening Browse remembers the target.
  useEffect(() => {
    if (saveTargetDir) {
      try { localStorage.setItem('vault.browse.saveTargetDir', saveTargetDir) } catch { /* noop */ }
    }
  }, [saveTargetDir])
  useEffect(() => {
    try { localStorage.setItem('vault.browse.layoutSize', layoutSize) } catch { /* noop */ }
  }, [layoutSize])
  useEffect(() => {
    try { localStorage.setItem('vault.browse.applyBlacklist', applyBlacklist ? '1' : '0') } catch { /* noop */ }
  }, [applyBlacklist])
  useEffect(() => {
    try { localStorage.setItem('vault.browse.filenameTemplate', filenameTemplate) } catch { /* noop */ }
  }, [filenameTemplate])
  // Load library hashes once on mount so we can flag posts that
  // already exist in Vault. Cheap: just file md5s + booru hashes.
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const hashes = await (window as any).api?.media?.allHashes?.()
        if (!alive) return
        const s = new Set<string>()
        if (Array.isArray(hashes)) {
          for (const h of hashes) if (h) s.add(String(h).toLowerCase())
        }
        setLibraryHashes(s)
      } catch { /* IPC missing on older builds — silent fallback */ }
    })()
    return () => { alive = false }
  }, [])
  // Load Vault's tag blacklist once on mount.
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const s = await (window as any).api?.settings?.get?.()
        if (!alive) return
        const tags: string[] = Array.isArray(s?.blacklist?.tags) ? s.blacklist.tags.map((t: string) => t.toLowerCase()) : []
        setBlacklistTags(tags)
      } catch { /* noop */ }
    })()
    return () => { alive = false }
  }, [])
  // Lazy-load Vault's tag vocabulary on first focus of the search input.
  // ~30k rows shouldn't be expensive but the round-trip is wasted when
  // the user never opens autocomplete, so we defer until needed.
  useEffect(() => {
    if (vaultTagsLoaded) return
    if (!searchFocused) return
    let alive = true
    ;(async () => {
      try {
        const list = await (window as any).api?.tags?.list?.()
        if (!alive) return
        const names = Array.isArray(list)
          ? list.map((t: any) => (typeof t === 'string' ? t : t?.name)).filter(Boolean)
          : []
        setVaultTags(names)
        setVaultTagsLoaded(true)
      } catch (err) {
        console.warn('[Browse] tag list load failed:', err)
      }
    })()
    return () => { alive = false }
  }, [searchFocused, vaultTagsLoaded])
  // Clear selection when leaving multi-select mode so subsequent
  // normal-mode clicks don't accidentally bulk-act on stale selections.
  useEffect(() => {
    if (!multiSelect) setSelectedIds(new Set())
  }, [multiSelect])

  // xnxx watch URLs can't be iframe-embedded — third-party hosts get
  // a blank page. Resolve them to a direct MP4/HLS via yt-dlp (fallback
  // when RapidAPI fails). Cached per-URL (Map below) so paging back
  // and forth doesn't refetch + paying for RapidAPI quota.
  // The cache survives ALL lightbox open/close cycles in this session.
  // Also pre-fetches neighbor posts (idx ± 1, ± 2) so arrow nav is
  // instant instead of waiting 1-2s for each yt-dlp spawn.
  const resolvedUrlCacheRef = useRef<Map<string, string>>(new Map())
  const inflightResolvesRef = useRef<Set<string>>(new Set())
  // Helper that kicks off a yt-dlp/RapidAPI resolve for a single post
  // url, caching the result. Safe to call multiple times for the same
  // URL — concurrent calls are deduped via inflightResolvesRef.
  const resolveUrlIntoCache = useCallback(async (url: string): Promise<string | null> => {
    if (!url) return null
    const cached = resolvedUrlCacheRef.current.get(url)
    if (cached) return cached
    if (inflightResolvesRef.current.has(url)) return null  // another in-flight call will cache it
    inflightResolvesRef.current.add(url)
    try {
      const r = await (window as any).api?.booru?.resolveUrl?.(url)
      if (r?.videoUrl) {
        resolvedUrlCacheRef.current.set(url, r.videoUrl)
        return r.videoUrl
      }
    } catch (err) {
      console.warn('[Browse lightbox] resolve failed for', url, err)
    } finally {
      inflightResolvesRef.current.delete(url)
    }
    return null
  }, [])

  useEffect(() => {
    setResolvedVideoUrl(null)
    if (!lightbox) return
    const url = lightbox.file_url || ''
    const isXnxxView = /xnxx\.com\/video-/i.test(url)
    if (!isXnxxView) return
    // Cache hit — show resolved URL immediately, skip the network roundtrip.
    const cached = resolvedUrlCacheRef.current.get(url)
    if (cached) {
      setResolvedVideoUrl(cached)
    } else {
      let alive = true
      setResolvingVideo(true)
      ;(async () => {
        const resolved = await resolveUrlIntoCache(url)
        if (!alive) return
        if (resolved) setResolvedVideoUrl(resolved)
        setResolvingVideo(false)
      })()

      // Pre-fetch ±1 and ±2 neighbors in the background so arrow nav
      // hits the cache. Don't await — fire and forget. Each yt-dlp
      // spawn is ~1-2s; staggering by 200ms keeps CPU under control.
      const idx = posts.findIndex((p) => p.id === lightbox.id && p.source === lightbox.source)
      for (const delta of [1, -1, 2, -2]) {
        const neighbor = posts[idx + delta]
        if (!neighbor) continue
        const nurl = neighbor.file_url || ''
        if (/xnxx\.com\/video-/i.test(nurl) && !resolvedUrlCacheRef.current.has(nurl)) {
          setTimeout(() => { void resolveUrlIntoCache(nurl) }, Math.abs(delta) * 200)
        }
      }

      return () => { alive = false }
    }
  }, [lightbox, posts, resolveUrlIntoCache])

  const handleSearch = () => {
    const q = tagInput.trim()
    setActiveQuery(q)
    setPage(0)
    setSearchFocused(false)
    void search(q, 0, source).then(() => {
      // posts.length might not be updated yet; recordRecentSearch
      // also fires on the success branch of search(), but recording
      // here is the only way to know the user kicked it off via
      // Enter/click vs an internal recurring call.
    })
    recordRecentSearch(q, source, 0)
  }

  // #117 — Creator/artist channel view. Click any tag (typically an
  // artist:/uploader:/by_artist: tag) to fan that handle out across
  // every configured source in one shot. Forces source='all' so the
  // user sees results from e621, rule34, Pixiv, Bluesky, PullPush,
  // etc. simultaneously instead of just the source the original
  // result came from.
  const openCreatorChannel = useCallback((tag: string) => {
    const cleaned = tag.trim().toLowerCase()
    if (!cleaned) return
    setSource('all')
    setTagInput(cleaned)
    setActiveQuery(cleaned)
    setPage(0)
    void search(cleaned, 0, 'all')
    recordRecentSearch(cleaned, 'all', 0)
  }, [search, recordRecentSearch])

  const resolvePastedUrl = async () => {
    const url = pasteUrl.trim()
    if (!url) return
    setPasteLoading(true)
    setPasteResult(null)
    setPasteSaved(false)
    try {
      if (!window.api?.booru?.resolveUrl) {
        setPasteResult({ sourceUrl: url, error: 'Restart Vault to pick up the resolver IPC' })
        return
      }
      const r = await window.api.booru.resolveUrl(url)
      setPasteResult(r ?? { sourceUrl: url, unresolved: true })
    } catch (err: any) {
      setPasteResult({ sourceUrl: url, error: err?.message ?? 'Resolve failed' })
    } finally {
      setPasteLoading(false)
    }
  }

  const savePastedToLibrary = async () => {
    if (!pasteResult || !pasteResult.videoUrl || pasteSaved || pasteSaving) return
    setPasteSaving(true)
    try {
      // For xnxx + pornhub, downloadToLibrary auto-routes through the
      // proper API. We pass a synthetic post with source set to the
      // original URL so the routing logic kicks in.
      const post = {
        id: Date.now(),
        file_url: pasteResult.videoUrl,
        preview_url: pasteResult.thumbUrl ?? '',
        sample_url: pasteResult.thumbUrl ?? '',
        tags: '',
        rating: 'explicit',
        score: 0,
        source: pasteResult.sourceUrl,
        width: 0,
        height: 0,
      }
      const r = await window.api.booru.downloadToLibrary({ ...post, targetDir: saveTargetDir || undefined, filenameTemplate: filenameTemplate || undefined } as any)
      if (r?.ok) {
        showToast('success', `Saved to library — ${r.filename}`)
        setPasteSaved(true)
      } else {
        showToast('error', r?.error ?? 'Save failed')
      }
    } catch (err: any) {
      showToast('error', err?.message ?? 'Save failed')
    } finally {
      setPasteSaving(false)
    }
  }

  const handleDownload = async (post: BooruPost) => {
    if (downloaded.has(post.id) || downloading.has(post.id)) return
    // Tube embeds aren't direct file URLs — route them through the
    // existing yt-dlp downloader (Downloads tab) instead.
    if (isEmbedUrl(post.file_url)) {
      const sourceUrl = post.source || post.file_url
      try {
        // Open Downloads with the source URL pre-filled by dispatching
        // a custom event. The Downloads page listens for these.
        window.dispatchEvent(new CustomEvent('vault-add-url-download', { detail: { url: sourceUrl } }))
        showToast('info', `Queued for yt-dlp download: ${sourceUrl}`)
      } catch (err: any) {
        showToast('error', err?.message ?? 'Tube download requires Downloads tab')
      }
      return
    }
    setDownloading((prev) => {
      const next = new Set(prev)
      next.add(post.id)
      return next
    })
    try {
      if (!window.api?.booru?.downloadToLibrary) {
        showToast('error', 'Restart Vault to enable downloads')
        setDownloading((prev) => {
          const next = new Set(prev)
          next.delete(post.id)
          return next
        })
        return
      }
      // targetDir is read by the booru:download-to-library handler when
      // present; falls back to mediaDirs[0] on missing/invalid value.
      const r = await window.api.booru.downloadToLibrary({ ...post, targetDir: saveTargetDir || undefined, filenameTemplate: filenameTemplate || undefined } as any)
      if (r?.ok) {
        showToast('success', `Saved to library — ${r.filename}`)
        setDownloaded((prev) => {
          const next = new Set(prev)
          next.add(post.id)
          return next
        })
      } else {
        showToast('error', r?.error ?? 'Download failed')
      }
    } catch (err: any) {
      showToast('error', err?.message ?? 'Download failed')
    } finally {
      setDownloading((prev) => {
        const next = new Set(prev)
        next.delete(post.id)
        return next
      })
    }
  }

  const ratingColors: Record<string, string> = {
    safe: 'bg-green-500/20 text-green-300 border-green-500/30',
    questionable: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    explicit: 'bg-red-500/20 text-red-300 border-red-500/30',
  }

  return (
    <div className="h-full flex flex-col bg-[var(--bg)]">
      {/* Header */}
      <div className="flex-none px-6 py-4 border-b border-[var(--border)]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Globe size={24} className="text-[var(--primary)]" />
            <div>
              <h1 className="text-xl font-semibold">Booru Aggregator</h1>
              <p className="text-sm text-[var(--muted)]">
                Search {SOURCE_OPTIONS.filter((s) => s.auth !== 'broken').length} boorus in parallel · download directly into your library
              </p>
            </div>
          </div>
        </div>
        {/* Media-type filter + sort — client-side filter applied to
            whatever the API returns. */}
        <div className="flex flex-wrap items-center gap-3 mb-3 text-[11px] text-[var(--muted)]">
          <span>Show:</span>
          <div className="flex items-center gap-1 bg-black/20 rounded-md p-0.5 border border-[var(--border)]">
            {([
              { id: 'all',   label: 'All' },
              { id: 'image', label: 'Images' },
              { id: 'gif',   label: 'GIFs' },
              { id: 'video', label: 'Videos' },
              { id: 'tube',  label: 'Tube' },
            ] as const).map((opt) => (
              <button
                key={opt.id}
                onClick={() => setMediaFilter(opt.id)}
                className={cn(
                  'px-2 py-0.5 rounded text-[10px] font-medium transition',
                  mediaFilter === opt.id
                    ? 'bg-[var(--primary)] text-white'
                    : 'text-[var(--muted)] hover:text-white'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <span className="ml-2">Sort:</span>
          <div className="flex items-center gap-1 bg-black/20 rounded-md p-0.5 border border-[var(--border)]">
            {([
              { id: 'default', label: 'Default' },
              { id: 'score',   label: 'Top scored' },
              { id: 'newest',  label: 'Newest ID' },
            ] as const).map((opt) => (
              <button
                key={opt.id}
                onClick={() => setSortBy(opt.id)}
                className={cn(
                  'px-2 py-0.5 rounded text-[10px] font-medium transition',
                  sortBy === opt.id
                    ? 'bg-[var(--primary)] text-white'
                    : 'text-[var(--muted)] hover:text-white'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {/* Multi-select toggle — kept inline because it's a primary
              action, not a config preference. */}
          <button
            type="button"
            onClick={() => setMultiSelect((v) => !v)}
            className={cn(
              'ml-2 px-2 py-0.5 rounded text-[10px] font-medium transition border',
              multiSelect
                ? 'bg-[var(--primary)]/20 border-[var(--primary)]/40 text-[var(--primary)]'
                : 'bg-white/5 border-white/10 text-[var(--muted)] hover:text-white'
            )}
            title="Toggle multi-select for bulk operations"
          >
            {multiSelect ? `Multi (${selectedIds.size})` : 'Multi'}
          </button>
          {/* "Filters" popover button — collapses rating/res/score/SFW/
              blacklist/layout/save-dir/filename-template/etc. into a
              single dropdown panel so they don't crowd the header. The
              count badge shows how many filters are active so the user
              can see at a glance whether their results are narrowed. */}
          {(() => {
            const activeCount =
              (ratingFilter !== 'all' ? 1 : 0) +
              (minResolution > 0 ? 1 : 0) +
              (minScore > 0 ? 1 : 0) +
              (sfwOnly ? 1 : 0) +
              (applyBlacklist ? 1 : 0) +
              (onlyDirect ? 1 : 0) +
              (filenameTemplate.trim() ? 1 : 0)
            return (
              <button
                type="button"
                onClick={() => setFiltersOpen((v) => !v)}
                className={cn(
                  'ml-2 px-2.5 py-0.5 rounded text-[11px] font-medium transition border inline-flex items-center gap-1.5',
                  filtersOpen || activeCount > 0
                    ? 'bg-[var(--primary)]/20 border-[var(--primary)]/40 text-[var(--primary)]'
                    : 'bg-white/5 border-white/10 text-[var(--muted)] hover:text-white'
                )}
              >
                Filters
                {activeCount > 0 && (
                  <span className="px-1 py-0 rounded-full bg-[var(--primary)] text-white text-[9px] tabular-nums">
                    {activeCount}
                  </span>
                )}
                <span className="text-[8px] opacity-60">{filtersOpen ? '▴' : '▾'}</span>
              </button>
            )
          })()}
          {hiddenIds.size > 0 && (
            <button
              type="button"
              onClick={() => setHiddenIds(new Set())}
              className="ml-1 text-[10px] text-amber-300 hover:text-white"
              title="Unhide all posts hidden this session"
            >
              Unhide {hiddenIds.size}
            </button>
          )}
        </div>

        {/* Filters dropdown panel — appears under the filter row when
            the Filters button is clicked. Holds rating/res/score/SFW/
            blacklist/layout/density/onlyDirect/save-dir/filename. */}
        {filtersOpen && (
          <div className="mb-3 p-3 rounded-lg bg-[var(--panel)]/95 border border-[var(--border)] shadow-lg space-y-3">
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-[var(--muted)]">
              <span className="font-medium text-white/80">Rating:</span>
              <div className="flex items-center gap-1 bg-black/20 rounded-md p-0.5 border border-[var(--border)]">
                {([
                  { id: 'all', label: 'Any' },
                  { id: 's',   label: 'Safe' },
                  { id: 'q',   label: 'Quest.' },
                  { id: 'e',   label: 'Explicit' },
                ] as const).map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setRatingFilter(opt.id)}
                    className={cn(
                      'px-2 py-0.5 rounded text-[10px] font-medium transition',
                      ratingFilter === opt.id ? 'bg-[var(--primary)] text-white' : 'text-[var(--muted)] hover:text-white'
                    )}
                  >{opt.label}</button>
                ))}
              </div>
              <span className="ml-2 font-medium text-white/80">Min res:</span>
              <div className="flex items-center gap-1 bg-black/20 rounded-md p-0.5 border border-[var(--border)]">
                {([
                  { id: 0,    label: 'Any' },
                  { id: 720,  label: '720p+' },
                  { id: 1080, label: '1080p+' },
                  { id: 2160, label: '4K' },
                ] as const).map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setMinResolution(opt.id)}
                    className={cn(
                      'px-2 py-0.5 rounded text-[10px] font-medium transition',
                      minResolution === opt.id ? 'bg-[var(--primary)] text-white' : 'text-[var(--muted)] hover:text-white'
                    )}
                  >{opt.label}</button>
                ))}
              </div>
              <span className="ml-2 font-medium text-white/80">Min score:</span>
              <div className="flex items-center gap-1 bg-black/20 rounded-md p-0.5 border border-[var(--border)]">
                {([
                  { id: 0,    label: 'Any' },
                  { id: 50,   label: '50+' },
                  { id: 200,  label: '200+' },
                  { id: 1000, label: '1k+' },
                ] as const).map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setMinScore(opt.id)}
                    className={cn(
                      'px-2 py-0.5 rounded text-[10px] font-medium transition',
                      minScore === opt.id ? 'bg-[var(--primary)] text-white' : 'text-[var(--muted)] hover:text-white'
                    )}
                  >{opt.label}</button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-[var(--muted)]">
              <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={sfwOnly}
                  onChange={(e) => setSfwOnly(e.target.checked)}
                  className="accent-[var(--primary)] cursor-pointer"
                />
                <span className={cn(sfwOnly ? 'text-emerald-300' : 'text-[var(--muted)]')}>SFW only</span>
              </label>
              {blacklistTags.length > 0 && (
                <label className="inline-flex items-center gap-1.5 cursor-pointer select-none" title={`Hide posts containing any of: ${blacklistTags.slice(0, 5).join(', ')}${blacklistTags.length > 5 ? ` + ${blacklistTags.length - 5} more` : ''}`}>
                  <input
                    type="checkbox"
                    checked={applyBlacklist}
                    onChange={(e) => setApplyBlacklist(e.target.checked)}
                    className="accent-[var(--primary)] cursor-pointer"
                  />
                  <span className={cn(applyBlacklist ? 'text-amber-200' : 'text-[var(--muted)]')}>
                    Apply Vault blacklist <span className="opacity-60">({blacklistTags.length} tags)</span>
                  </span>
                </label>
              )}
              <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={onlyDirect}
                  onChange={(e) => setOnlyDirect(e.target.checked)}
                  className="accent-[var(--primary)] cursor-pointer"
                />
                <span className={cn(onlyDirect ? 'text-white' : 'text-[var(--muted)]')}>
                  Only direct-saveable
                </span>
              </label>
              <span className="ml-2 font-medium text-white/80">Layout:</span>
              <div className="flex items-center gap-1 bg-black/20 rounded-md p-0.5 border border-[var(--border)]">
                {([
                  { id: 'compact',     label: 'S' },
                  { id: 'comfortable', label: 'M' },
                  { id: 'large',       label: 'L' },
                ] as const).map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setLayoutSize(opt.id)}
                    title={opt.id}
                    className={cn(
                      'w-6 py-0.5 rounded text-[10px] font-medium transition tabular-nums',
                      layoutSize === opt.id
                        ? 'bg-[var(--primary)] text-white'
                        : 'text-[var(--muted)] hover:text-white'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            {(mediaDirs.length > 1 || filenameTemplate) && (
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-[var(--muted)]">
                {mediaDirs.length > 1 && (
                  <>
                    <span className="font-medium text-white/80">Save to:</span>
                    <select
                      value={saveTargetDir}
                      onChange={(e) => setSaveTargetDir(e.target.value)}
                      className="px-2 py-0.5 rounded text-[11px] bg-black/30 border border-[var(--border)] text-white font-mono max-w-[18rem] truncate cursor-pointer"
                      title={saveTargetDir}
                    >
                      {mediaDirs.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </>
                )}
                <span className="ml-2 font-medium text-white/80">Filename:</span>
                <input
                  type="text"
                  value={filenameTemplate}
                  onChange={(e) => setFilenameTemplate(e.target.value)}
                  placeholder="{source}-{id}{ext}"
                  className="px-2 py-0.5 rounded text-[11px] bg-black/30 border border-[var(--border)] text-white font-mono w-[16rem]"
                  title="Placeholders: {source} {id} {topTags3} {ext} {date}. Empty = source default."
                />
              </div>
            )}
          </div>
        )}

        {/* Source-family tabs — narrow the chip list AND the
            All-sources fan-out to one family at a time. Family counts
            shown when there are last-query results. */}
        <div className="flex items-center gap-1 mb-2 text-[11px]">
          <span className="text-[var(--muted)] mr-2">Family:</span>
          {([
            { id: 'all',    label: 'All',    },
            { id: 'booru',  label: 'Booru',  },
            { id: 'tube',   label: 'Tube',   },
            { id: 'ai',     label: 'AI-gen', },
            { id: 'social', label: 'Social', },
          ] as const).map((tab) => {
            const familyCount = tab.id === 'all'
              ? Object.values(perSourceCounts).reduce((a, b) => a + (b || 0), 0)
              : Object.entries(perSourceCounts)
                  .filter(([id]) => familyOf(id) === tab.id)
                  .reduce((a, [, n]) => a + (n || 0), 0)
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveFamily(tab.id)}
                className={cn(
                  'px-2.5 py-1 rounded text-[11px] font-medium transition border inline-flex items-center gap-1.5',
                  activeFamily === tab.id
                    ? 'bg-[var(--primary)] border-[var(--primary)] text-white'
                    : 'bg-white/5 border-white/10 text-[var(--muted)] hover:text-white hover:border-white/30'
                )}
              >
                {tab.label}
                {familyCount > 0 && (
                  <span className="tabular-nums opacity-70 text-[10px]">{familyCount}</span>
                )}
              </button>
            )
          })}
        </div>

        {/* Source picker — capped at ~2 rows in narrow windows; scrolls
            inside the cap so chips never push the search bar offscreen
            when the Electron window is small (Win+Left/Right half-screen). */}
        <div className="flex flex-wrap items-center gap-1.5 mb-3 max-h-[5.5rem] overflow-y-auto pr-1 scrollbar-thin">
          <span className="text-[11px] text-[var(--muted)] mr-1 sticky left-0">Source:</span>
          {SOURCE_OPTIONS.filter((opt) => {
            // Drop confirmed-dead sources from the picker entirely —
            // user doesn't want to see them at all.
            if (opt.auth === 'broken') return false
            if (opt.id === 'all') return true
            return activeFamily === 'all' || familyOf(opt.id) === activeFamily
          }).map((opt) => {
            const isActive = source === opt.id
            const isBroken = opt.auth === 'broken'
            // Health dot: from the most recent multi-source query state.
            // green = returned results · red = errored · gray = unknown.
            // "all" + broken sources get no dot.
            const failed = sourceErrors.some((e) => e.source === opt.id)
            const count = perSourceCounts[opt.id]
            const health: 'ok' | 'err' | 'unknown' | null =
              opt.id === 'all' || isBroken ? null
              : failed ? 'err'
              : typeof count === 'number' && count > 0 ? 'ok'
              : typeof count === 'number' && count === 0 ? 'err'  // returned cleanly but empty
              : 'unknown'
            const isMuted = mutedSources.has(opt.id)
            return (
              <button
                key={opt.id}
                onClick={() => setSource(opt.id)}
                onDoubleClick={(e) => {
                  // Click-once = select (default). Click-twice = toggle
                  // mute, which excludes the source from the "All sources"
                  // fan-out. Visible state: red strike-through ring + tooltip.
                  // Doesn't apply to the "all" chip since muting it is
                  // meaningless.
                  if (opt.id === 'all') return
                  e.preventDefault()
                  e.stopPropagation()
                  setMutedSources((prev) => {
                    const next = new Set(prev)
                    if (next.has(opt.id)) next.delete(opt.id)
                    else next.add(opt.id)
                    return next
                  })
                }}
                title={
                  isMuted ? `${opt.note} — MUTED (double-click to unmute)`
                  : health === 'err' ? `${opt.note} — last query failed (double-click to mute)`
                  : `${opt.note} (double-click to mute)`
                }
                disabled={isBroken}
                className={cn(
                  'px-2.5 py-1 rounded text-[11px] font-medium transition border inline-flex items-center gap-1.5',
                  isBroken
                    ? 'bg-white/5 border-white/5 text-white/30 cursor-not-allowed line-through'
                    : isMuted
                      ? 'bg-red-500/10 border-red-500/40 text-red-300 line-through opacity-70'
                      : isActive
                        ? 'bg-[var(--primary)] border-[var(--primary)] text-white'
                        : 'bg-white/5 border-white/10 text-[var(--muted)] hover:text-white hover:border-white/30'
                )}
              >
                {health && !isMuted && (
                  <span
                    aria-hidden="true"
                    className={cn(
                      'inline-block w-1.5 h-1.5 rounded-full',
                      health === 'ok' ? 'bg-emerald-400'
                        : health === 'err' ? 'bg-red-400'
                        : 'bg-zinc-500/60'
                    )}
                  />
                )}
                {opt.label}
                {opt.auth === 'key' && <span className="ml-1 opacity-70">🔑</span>}
              </button>
            )
          })}
        </div>
        {/* Search */}
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
            {tagInput && (
              <button
                type="button"
                onClick={() => { setTagInput(''); setAutocompleteOpen(false) }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-white w-5 h-5 rounded-full bg-white/5 hover:bg-white/10 inline-flex items-center justify-center text-[10px]"
                title="Clear search input"
                aria-label="Clear search"
              >
                ×
              </button>
            )}
            <input
              type="text"
              value={tagInput}
              onChange={(e) => {
                setTagInput(e.target.value)
                // Reset autocomplete navigation on every keystroke so
                // the first suggestion is always highlighted.
                setAutocompleteIdx(0)
                setAutocompleteOpen(true)
              }}
              onKeyDown={(e) => {
                // Autocomplete navigation (when suggestions are showing).
                const matches = (() => {
                  if (!autocompleteOpen || !tagInput.trim()) return [] as string[]
                  const tokens = tagInput.split(/\s+/)
                  const cur = (tokens[tokens.length - 1] || '').replace(/^-/, '').toLowerCase()
                  if (cur.length < 2) return []
                  return vaultTags
                    .filter((t) => t.toLowerCase().startsWith(cur))
                    .slice(0, 8)
                })()
                if (matches.length > 0 && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Tab')) {
                  e.preventDefault()
                  setAutocompleteIdx((i) => {
                    if (e.key === 'ArrowDown') return (i + 1) % matches.length
                    if (e.key === 'ArrowUp')   return (i - 1 + matches.length) % matches.length
                    return (i + 1) % matches.length  // Tab cycles forward
                  })
                  return
                }
                if (e.key === 'Enter') {
                  // If autocomplete is open + has matches, insert the
                  // highlighted suggestion in place of the last token
                  // and DO NOT submit yet — user may want more terms.
                  if (matches.length > 0) {
                    const tokens = tagInput.split(/\s+/)
                    const wasNeg = tokens[tokens.length - 1].startsWith('-')
                    tokens[tokens.length - 1] = (wasNeg ? '-' : '') + matches[autocompleteIdx]
                    setTagInput(tokens.join(' ') + ' ')
                    setAutocompleteOpen(false)
                    e.preventDefault()
                    return
                  }
                  handleSearch()
                } else if (e.key === 'Escape') {
                  if (autocompleteOpen) setAutocompleteOpen(false)
                  else setSearchFocused(false)
                }
              }}
              onFocus={() => { setSearchFocused(true); setAutocompleteOpen(true) }}
              onBlur={() => setTimeout(() => { setSearchFocused(false); setAutocompleteOpen(false) }, 150)}
              placeholder='Tags (space-separated; use "-tag" to exclude). Empty = recent posts. Ctrl+K to focus.'
              className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-white/5 border border-[var(--border)] focus:border-[var(--primary)] focus:outline-none text-sm font-mono"
            />
            {/* Tag autocomplete dropdown — appears when the user is
                typing a token of 2+ chars that matches Vault canonical
                vocab. ↑/↓/Tab navigates, Enter inserts, Esc dismisses. */}
            {autocompleteOpen && tagInput.trim() && (() => {
              const tokens = tagInput.split(/\s+/)
              const cur = (tokens[tokens.length - 1] || '').replace(/^-/, '').toLowerCase()
              if (cur.length < 2) return null
              const matches = vaultTags.filter((t) => t.toLowerCase().startsWith(cur)).slice(0, 8)
              if (matches.length === 0) return null
              const wasNeg = tokens[tokens.length - 1].startsWith('-')
              return (
                <div className="absolute top-full left-0 right-0 mt-1 rounded-lg bg-[var(--panel)] border border-[var(--border)] shadow-2xl overflow-hidden z-30">
                  <div className="px-3 py-1 text-[9px] uppercase tracking-wider text-[var(--muted)] bg-white/[0.03]">
                    Vault tags — ↑↓ navigate · Enter insert · Esc dismiss
                  </div>
                  {matches.map((m, i) => (
                    <button
                      key={m}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        const t = [...tokens]
                        t[t.length - 1] = (wasNeg ? '-' : '') + m
                        setTagInput(t.join(' ') + ' ')
                        setAutocompleteOpen(false)
                      }}
                      className={cn(
                        'w-full text-left px-3 py-1.5 text-xs font-mono transition flex items-center justify-between',
                        i === autocompleteIdx ? 'bg-[var(--primary)]/15 text-white' : 'text-[var(--muted)] hover:bg-white/5'
                      )}
                    >
                      <span>
                        {wasNeg && <span className="text-red-300">-</span>}
                        {m}
                      </span>
                      {i === autocompleteIdx && <span className="text-[10px] opacity-60">↵</span>}
                    </button>
                  ))}
                </div>
              )
            })()}
            {/* Recent + saved searches dropdown. Shows on focus when
                the input is empty. Click an entry to re-run that
                query against its original source. Blur is delayed so
                an entry click registers before the dropdown closes. */}
            {searchFocused && !tagInput.trim() && (recentSearches.length > 0 || savedSearches.length > 0) && (
              <div className="absolute top-full left-0 right-0 mt-1 rounded-lg bg-[var(--panel)] border border-[var(--border)] shadow-2xl max-h-80 overflow-y-auto z-30">
                {savedSearches.length > 0 && (
                  <div className="border-b border-[var(--border)]">
                    <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-amber-300/80 bg-amber-500/5">
                      Saved ({savedSearches.length})
                    </div>
                    {savedSearches.map((s, i) => (
                      <div key={`saved-${i}`} className="flex items-center px-3 py-1.5 hover:bg-white/5">
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setTagInput(s.q)
                            setSource(s.source)
                            setActiveQuery(s.q)
                            setPage(0)
                            setSearchFocused(false)
                            void search(s.q, 0, s.source)
                            recordRecentSearch(s.q, s.source, 0)
                          }}
                          className="flex-1 text-left text-xs font-mono text-white truncate"
                          title={`${s.name} → ${s.q} @ ${s.source}`}
                        >
                          <span className="text-amber-300 mr-2">★</span>
                          {s.name} <span className="opacity-50 ml-1">[{s.source}]</span>
                        </button>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setSavedSearches((prev) => {
                              const next = prev.filter((p, idx) => idx !== i)
                              try { localStorage.setItem('vault.browse.savedSearches', JSON.stringify(next)) } catch { /* noop */ }
                              return next
                            })
                          }}
                          title="Remove saved search"
                          className="ml-2 text-[10px] text-[var(--muted)] hover:text-red-300"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {recentSearches.length > 0 && (
                  <>
                    <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-[var(--muted)] bg-white/[0.03] flex items-center justify-between">
                      <span>Recent</span>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setRecentSearches([])
                          try { localStorage.removeItem('vault.browse.recentSearches') } catch { /* noop */ }
                        }}
                        className="text-[10px] hover:text-white"
                      >
                        Clear
                      </button>
                    </div>
                    {recentSearches.map((r, i) => (
                      <div key={`recent-${i}`} className="flex items-center px-3 py-1.5 hover:bg-white/5">
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setTagInput(r.q)
                            setSource(r.source)
                            setActiveQuery(r.q)
                            setPage(0)
                            setSearchFocused(false)
                            void search(r.q, 0, r.source)
                            recordRecentSearch(r.q, r.source, 0)
                          }}
                          className="flex-1 text-left text-xs font-mono text-white truncate"
                          title={`${r.q} @ ${r.source}`}
                        >
                          {r.q} <span className="opacity-50 ml-1">[{r.source}]</span>
                        </button>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            const name = window.prompt('Save as (name):', r.q.slice(0, 40))
                            if (!name) return
                            setSavedSearches((prev) => {
                              const next: SavedSearch[] = [...prev, { name, q: r.q, source: r.source, ts: Date.now() }]
                              try { localStorage.setItem('vault.browse.savedSearches', JSON.stringify(next)) } catch { /* noop */ }
                              return next
                            })
                          }}
                          title="Pin this query"
                          className="ml-2 text-[10px] text-[var(--muted)] hover:text-amber-300"
                        >
                          ★
                        </button>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
          <button
            onClick={handleSearch}
            disabled={loading}
            className="px-6 py-2.5 rounded-lg bg-[var(--primary)] text-white font-medium hover:opacity-90 transition disabled:opacity-50"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : 'Search'}
          </button>
          <button
            onClick={() => setPasteOpen((v) => !v)}
            title="Paste a tube URL → play + save"
            className={cn(
              'px-4 py-2.5 rounded-lg text-sm font-medium transition',
              pasteOpen
                ? 'bg-[var(--primary)]/30 border border-[var(--primary)]/50 text-[var(--primary)]'
                : 'bg-white/5 border border-[var(--border)] text-[var(--muted)] hover:text-white hover:border-white/30'
            )}
          >
            Paste URL
          </button>
          {/* Discovery quick actions: trending / shuffle / random.
              Trending = empty-query search to surface "what's hot".
              Shuffle = re-randomize current grid order.
              Random = open lightbox on a random post from current grid. */}
          <button
            onClick={() => {
              setTagInput('')
              setActiveQuery('')
              setPage(0)
              void search('', 0, source)
            }}
            title="Trending / top recent posts across active sources"
            className="px-3 py-2.5 rounded-lg text-sm font-medium bg-white/5 border border-[var(--border)] text-[var(--muted)] hover:text-white hover:border-white/30"
          >
            🔥
          </button>
          <button
            onClick={() => {
              // Shuffle the current posts state in place. Uses a quick
              // Fisher-Yates so no API call needed.
              setPosts((prev) => {
                const a = [...prev]
                for (let i = a.length - 1; i > 0; i--) {
                  const j = Math.floor(Math.random() * (i + 1))
                  ;[a[i], a[j]] = [a[j], a[i]]
                }
                return a
              })
            }}
            title="Shuffle current grid"
            disabled={posts.length === 0}
            className="px-3 py-2.5 rounded-lg text-sm font-medium bg-white/5 border border-[var(--border)] text-[var(--muted)] hover:text-white hover:border-white/30 disabled:opacity-30"
          >
            🔀
          </button>
          <button
            onClick={() => {
              if (posts.length === 0) return
              const pick = posts[Math.floor(Math.random() * posts.length)]
              if (pick) setLightbox(pick)
            }}
            title="Open a random post from current results (R)"
            disabled={posts.length === 0}
            className="px-3 py-2.5 rounded-lg text-sm font-medium bg-white/5 border border-[var(--border)] text-[var(--muted)] hover:text-white hover:border-white/30 disabled:opacity-30"
          >
            🎲
          </button>
        </div>
        {pasteOpen && (
          <div className="mt-3 p-3 rounded-lg bg-[var(--panel)] border border-[var(--border)] space-y-2">
            <div className="text-xs text-[var(--muted)]">
              Paste a tube URL (xnxx · eporner · redtube · pornhub) → Vault resolves it via the right API or embed pattern.
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={pasteUrl}
                onChange={(e) => setPasteUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void resolvePastedUrl() }}
                placeholder="https://xnxx.com/video-... · https://www.pornhub.com/view_video.php?viewkey=..."
                className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-[var(--border)] focus:border-[var(--primary)] focus:outline-none text-sm font-mono"
              />
              <button
                onClick={resolvePastedUrl}
                disabled={pasteLoading || !pasteUrl.trim()}
                className="px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
              >
                {pasteLoading ? <Loader2 size={14} className="animate-spin" /> : 'Resolve'}
              </button>
            </div>
            {pasteResult && pasteResult.error && (
              <div className="text-xs text-red-300">{pasteResult.error}</div>
            )}
            {pasteResult && pasteResult.unresolved && (
              <div className="text-xs text-amber-300">
                URL not recognized by Vault's built-in resolvers. Use the Downloads tab (yt-dlp) for generic URLs.
              </div>
            )}
            {pasteResult && pasteResult.videoUrl && (
              <div className="flex gap-3 items-start mt-2">
                {pasteResult.source === 'embed' || /xnxx|pornhub|eporner|redtube/.test(pasteResult.videoUrl) ? (
                  <iframe
                    src={pasteResult.videoUrl}
                    className="rounded-lg bg-black"
                    style={{ width: 480, height: 270 }}
                    allow="autoplay; fullscreen; encrypted-media"
                    allowFullScreen
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <video
                    src={pasteResult.videoUrl}
                    controls
                    className="rounded-lg bg-black"
                    style={{ width: 480, height: 270 }}
                  />
                )}
                <div className="flex-1 space-y-2">
                  <div className="text-xs text-[var(--muted)]">
                    Resolved via <span className="text-[var(--primary)] font-mono">{pasteResult.source}</span>
                  </div>
                  <button
                    onClick={savePastedToLibrary}
                    disabled={pasteSaved || pasteSaving}
                    className={cn(
                      'px-3 py-1.5 rounded text-xs font-medium transition inline-flex items-center gap-1',
                      pasteSaved
                        ? 'bg-green-500/20 border border-green-500/40 text-green-300 cursor-default'
                        : 'bg-[var(--primary)] hover:opacity-90 text-white'
                    )}
                  >
                    {pasteSaved ? '✓ Saved' : pasteSaving ? <><Loader2 size={11} className="animate-spin" /> Saving…</> : <><Download size={11} /> Save to Library</>}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        {/* Source-specific hint chips — single-source mode only. Each
            chip clicks to append the operator (with space prefix) to
            the current tag input. Helps users discover what each source
            supports without leaving Browse. */}
        {/* #118 — Tube categories. One-click search for common tube
            categories per source. Click a chip → fires a search with
            that category name as the query. Single-source mode only;
            avoids overwhelming the user when 'all sources' is active. */}
        {source !== 'all' && TUBE_CATEGORIES[source] && TUBE_CATEGORIES[source].length > 0 && (
          <div className="mt-1 mb-1 flex items-center gap-1.5 flex-wrap text-[11px]">
            <span className="mr-1 opacity-70 text-[var(--muted)]">Categories:</span>
            {TUBE_CATEGORIES[source].map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => {
                  setTagInput(cat)
                  setActiveQuery(cat)
                  setPage(0)
                  void search(cat, 0, source)
                }}
                className="px-2 py-0.5 rounded-full bg-[var(--primary)]/10 hover:bg-[var(--primary)]/20 border border-[var(--primary)]/30 text-[var(--primary)] transition"
                title={`Browse "${cat}" on ${source}`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
        {source !== 'all' && SOURCE_HINTS[source] && SOURCE_HINTS[source].length > 0 && (
          <div className="mt-1 mb-1 flex items-center gap-1.5 flex-wrap text-[11px] text-[var(--muted)]">
            <span className="mr-1 opacity-70">Hints:</span>
            {SOURCE_HINTS[source].map((hint) => {
              const isInformational = hint.startsWith('(')
              if (isInformational) {
                return (
                  <span key={hint} className="text-[var(--muted)]/60 italic">{hint}</span>
                )
              }
              return (
                <button
                  key={hint}
                  type="button"
                  onClick={() => setTagInput((cur) => (cur.trim() ? cur.trim() + ' ' + hint : hint))}
                  className="px-1.5 py-0.5 rounded font-mono bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/30 text-[var(--muted)] hover:text-white transition"
                  title={`Append ${hint} to the search`}
                >
                  {hint}
                </button>
              )
            })}
          </div>
        )}
        {activeQuery && (
          <div className="mt-2 text-xs text-[var(--muted)] flex items-center gap-2 flex-wrap">
            <span>Active query:</span>
            {activeQuery.split(/\s+/).filter(Boolean).map((tag, i) => {
              const isNeg = tag.startsWith('-')
              const bare = isNeg ? tag.slice(1) : tag
              return (
                <span
                  key={i}
                  className={cn(
                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] group',
                    isNeg
                      ? 'bg-red-500/10 border-red-500/30 text-red-300'
                      : 'bg-[var(--primary)]/10 border-[var(--primary)]/30 text-[var(--primary)]'
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      // Toggle negation: positive ↔ negative for this tag.
                      const tokens = activeQuery.split(/\s+/).filter(Boolean)
                      const updated = tokens.map((t) => {
                        if (t !== tag) return t
                        return isNeg ? bare : `-${bare}`
                      }).join(' ')
                      setTagInput(updated)
                      setActiveQuery(updated)
                      setPage(0)
                      void search(updated, 0, source)
                    }}
                    title={isNeg ? 'Make positive' : 'Negate this tag'}
                    className={cn(isNeg ? 'line-through' : '')}
                  >
                    {tag}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      // Remove this token entirely from the query.
                      const tokens = activeQuery.split(/\s+/).filter(Boolean).filter((t) => t !== tag)
                      const updated = tokens.join(' ')
                      setTagInput(updated)
                      setActiveQuery(updated)
                      setPage(0)
                      void search(updated, 0, source)
                    }}
                    className="opacity-50 hover:opacity-100 text-[8px]"
                    title="Remove from query"
                    aria-label="Remove tag"
                  >
                    ×
                  </button>
                </span>
              )
            })}
            <span className="ml-2 text-[var(--muted)]/60">·</span>
            <span>Page {page + 1}</span>
            <span>·</span>
            <span className="tabular-nums">{posts.length} results</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 text-red-200 px-4 py-3 mb-4 text-sm">
            {error}
          </div>
        )}

        {sourceErrors.length > 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 mb-4 text-xs text-amber-200 space-y-1">
            <div className="font-medium text-amber-100 flex items-center justify-between">
              <span>{sourceErrors.length} source{sourceErrors.length === 1 ? '' : 's'} skipped:</span>
              <button
                type="button"
                onClick={() => search(activeQuery, page, source)}
                className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-100"
                title="Re-run all sources"
              >
                Retry all
              </button>
            </div>
            {sourceErrors.map((se, i) => (
              <div key={i} className="font-mono opacity-80 flex items-center gap-2 text-[11px]" title={se.error}>
                <span className="text-amber-300 flex-shrink-0">{se.source}</span>
                <span className="truncate flex-1 opacity-80">{se.error.slice(0, 120)}</span>
                <button
                  type="button"
                  onClick={() => {
                    // Single-source retry: temporarily switch to that source
                    // for one query, then revert so the user stays in
                    // multi-source mode.
                    const prevSource = source
                    setSource(se.source as Source)
                    search(activeQuery, page, se.source as Source).then(() => setSource(prevSource))
                  }}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-100"
                  title={`Re-run just ${se.source}`}
                >
                  Retry
                </button>
                <button
                  type="button"
                  onClick={() => setMutedSources((s) => new Set([...s, se.source]))}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-200"
                  title={`Stop including ${se.source} in 'All sources' fan-out`}
                >
                  Mute
                </button>
              </div>
            ))}
            {mutedSources.size > 0 && (
              <div className="pt-1 mt-1 border-t border-amber-500/20 text-[10px] text-amber-200/70 flex items-center gap-2 flex-wrap">
                <span>Muted:</span>
                {[...mutedSources].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setMutedSources((set) => {
                      const next = new Set(set)
                      next.delete(s)
                      return next
                    })}
                    className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 font-mono"
                    title={`Unmute ${s}`}
                  >
                    {s} ×
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {Object.keys(perSourceCounts).length > 0 && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-white/5 border border-white/10">
            <div className="text-[10px] text-[var(--muted)] mb-1.5 uppercase tracking-wider">
              Per-source results
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
              {SOURCE_OPTIONS.filter((s) => s.id !== 'all' && s.auth !== 'broken').map((s) => {
                const count = perSourceCounts[s.id] ?? 0
                const failed = sourceErrors.some((e) => e.source === s.id)
                return (
                  <span key={s.id} className="inline-flex items-center gap-1">
                    <span className={cn(
                      'tabular-nums font-medium',
                      failed ? 'text-red-300' : count > 0 ? 'text-[var(--primary)]' : 'text-[var(--muted)]/50'
                    )}>
                      {count}
                    </span>
                    <span className={cn(
                      failed ? 'text-red-300/70' : count > 0 ? 'text-[var(--muted)]' : 'text-[var(--muted)]/50'
                    )}>
                      {s.label}
                    </span>
                    {failed && <span className="text-red-400">✗</span>}
                  </span>
                )
              })}
            </div>
          </div>
        )}

        {/* Loading skeleton grid — shimmer placeholders matching the
            responsive column count keep the page from feeling dead
            while a fan-out across 27 sources runs. */}
        {loading && posts.length === 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {Array.from({ length: 18 }).map((_, i) => (
              <div
                key={`sk-${i}`}
                className="rounded-lg overflow-hidden bg-[var(--panel)] border border-[var(--border)]"
              >
                <div className="aspect-square bg-gradient-to-br from-white/[0.04] via-white/[0.08] to-white/[0.04] animate-pulse" />
                <div className="p-2 space-y-1.5">
                  <div className="flex items-center justify-between gap-1">
                    <div className="h-3 w-6 rounded bg-white/[0.06] animate-pulse" />
                    <div className="h-3 w-12 rounded bg-white/[0.06] animate-pulse" />
                    <div className="h-3 w-8 rounded bg-white/[0.06] animate-pulse" />
                  </div>
                  <div className="h-6 rounded bg-white/[0.04] animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        )}

        {posts.length === 0 && !loading && !error && (
          <div className="text-center text-[var(--muted)] py-20">
            <Globe size={48} className="mx-auto mb-3 opacity-30" />
            <p>Enter tags above and press Search to see posts.</p>
            <p className="text-xs mt-2 opacity-70 mb-3">Try one of these to get started:</p>
            <div className="flex flex-wrap gap-2 justify-center max-w-md mx-auto">
              {['solo', 'underwear -3d', 'stockings -loli', 'pov', 'creampie -3d', 'lingerie'].map((suggested) => (
                <button
                  key={suggested}
                  type="button"
                  onClick={() => {
                    setTagInput(suggested)
                    setActiveQuery(suggested)
                    setPage(0)
                    search(suggested, 0, source)
                  }}
                  className="px-3 py-1 rounded-full text-xs font-mono bg-[var(--primary)]/10 border border-[var(--primary)]/30 text-[var(--primary)] hover:bg-[var(--primary)]/20 transition"
                >
                  {suggested}
                </button>
              ))}
            </div>
          </div>
        )}

        {posts.length > 0 && (() => {
          // Apply media-type filter + sort client-side. Filter doesn't
          // re-query the API — just narrows what's shown from the
          // current result set. Sort is also client-side.
          const filtered = posts.filter((p) => {
            // Hidden-for-session (Esc menu choice) — never show again.
            const compositeKey = `${p.source_booru ?? 'unknown'}-${p.id}`
            if (hiddenIds.has(compositeKey)) return false
            // Vault tag-blacklist application — when enabled, drop any
            // post whose raw tag string contains a blacklisted token.
            // Cheap substring check; tags arrive space-separated.
            if (applyBlacklist && blacklistTags.length > 0) {
              const tagStr = String(p.tags ?? '').toLowerCase()
              if (blacklistTags.some((bt) => tagStr.split(/\s+/).includes(bt))) return false
            }
            // Drop tube embeds when user wants only directly-saveable
            // results (no paid RapidAPI dependency).
            if (onlyDirect && isEmbedUrl(p.file_url)) return false
            // Rating filter — drops posts whose rating doesn't match.
            // First char of rating ('safe' → 's', 'explicit' → 'e').
            if (ratingFilter !== 'all') {
              const r0 = String(p.rating ?? '').toLowerCase().charAt(0)
              if (r0 !== ratingFilter) return false
            }
            // SFW-only forces safe rating on top of the explicit filter
            // (so q + e are both dropped even when ratingFilter='all').
            if (sfwOnly) {
              const r0 = String(p.rating ?? '').toLowerCase().charAt(0)
              if (r0 !== 's') return false
            }
            // Min-resolution — drop posts whose pixel height is below.
            if (minResolution > 0 && (p.height ?? 0) > 0 && p.height < minResolution) return false
            // Min-score — drop low-engagement posts.
            if (minScore > 0 && (p.score ?? 0) < minScore) return false

            if (mediaFilter === 'all') return true
            if (mediaFilter === 'video') return isVideo(p.file_url) || isEmbedUrl(p.file_url)
            if (mediaFilter === 'tube') return isEmbedUrl(p.file_url)
            if (mediaFilter === 'gif') return isGif(p.file_url)
            if (mediaFilter === 'image') {
              return !isVideo(p.file_url) && !isGif(p.file_url) && !isEmbedUrl(p.file_url)
            }
            return true
          })
          const sorted = sortBy === 'default' ? filtered
            : sortBy === 'score' ? [...filtered].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
            : [...filtered].sort((a, b) => (b.id ?? 0) - (a.id ?? 0))
          // Per-page score quartiles for visual ranking. Sorted ascending
          // so p90 = scores[90% index]. Cheap; runs once per render.
          const scores = filtered.map((p) => p.score ?? 0).sort((a, b) => a - b)
          const pct = (q: number) => scores[Math.floor(scores.length * q)] ?? 0
          const p90 = pct(0.9), p75 = pct(0.75), p50 = pct(0.5)
          const scoreTier = (s: number): 'gold' | 'silver' | 'bronze' | null => {
            if (scores.length < 4) return null  // not enough data to rank
            if (s >= p90) return 'gold'
            if (s >= p75) return 'silver'
            if (s >= p50) return 'bronze'
            return null
          }
          const tierBorder: Record<'gold' | 'silver' | 'bronze', string> = {
            gold:   'border-amber-400/60 shadow-[0_0_0_1px_rgba(251,191,36,0.25)]',
            silver: 'border-zinc-300/40',
            bronze: 'border-orange-700/40',
          }
          const tierText: Record<'gold' | 'silver' | 'bronze', string> = {
            gold:   'text-amber-300',
            silver: 'text-zinc-200',
            bronze: 'text-orange-300',
          }
          return (
          <>
            {filtered.length < posts.length && (
              <div className="mb-3 text-xs text-[var(--muted)] flex items-center gap-2 flex-wrap">
                <span>
                  Showing <span className="text-white font-medium tabular-nums">{filtered.length}</span> of {posts.length} loaded results
                  {mediaFilter !== 'all' && <> (filter: <span className="text-[var(--primary)]">{mediaFilter}</span>)</>}
                  {onlyDirect && <span className="text-[var(--primary)]"> · only direct-saveable</span>}
                </span>
                {mediaFilter !== 'all' && filtered.length < PER_PAGE / 4 && hasMore && (
                  <button
                    type="button"
                    onClick={() => search(activeQuery, page + 1, source, { append: true })}
                    disabled={loading}
                    className="px-2 py-0.5 rounded bg-[var(--primary)]/15 hover:bg-[var(--primary)]/25 border border-[var(--primary)]/30 text-[var(--primary)] font-medium text-[11px]"
                  >
                    Load more pages
                  </button>
                )}
                {mediaFilter === 'video' && filtered.length === 0 && (
                  <span className="text-amber-300/80">
                    No videos in these sources. Try switching to the <span className="font-medium">Tube</span> family tab.
                  </span>
                )}
              </div>
            )}
            {/* Grid — density-aware via layoutSize. Compact = tighter
                gutters + more columns; large = fewer columns + breathing
                room. Keeps responsive breakpoints so narrow Electron
                windows degrade gracefully. */}
            <div className={cn(
              'grid',
              layoutSize === 'compact'   ? 'grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8 gap-1.5' :
              layoutSize === 'large'     ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-4' :
              /* comfortable */            'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3'
            )}>
              {sorted.map((post) => {
                const isDownloaded = downloaded.has(post.id)
                const isDownloading = downloading.has(post.id)
                const tier = scoreTier(post.score ?? 0)
                const tileKey = `${post.source_booru ?? 'unknown'}-${post.id}`
                const isSelected = selectedIds.has(tileKey)
                return (
                  <div
                    key={tileKey}
                    draggable
                    onDragStart={(e) => {
                      // HTML5 drag: set transferable data so the tile
                      // can be dropped on the OS desktop / a browser /
                      // any other drag-aware target. Vault's own sidebar
                      // doesn't yet listen for these (App.tsx work),
                      // but external drops work today.
                      try {
                        e.dataTransfer.setData('text/uri-list', post.file_url)
                        e.dataTransfer.setData('text/plain', post.file_url)
                        e.dataTransfer.setData('application/x-vault-booru-post', JSON.stringify({
                          id: post.id,
                          source_booru: post.source_booru,
                          file_url: post.file_url,
                          tags: post.tags,
                          score: post.score,
                          rating: post.rating,
                        }))
                        e.dataTransfer.effectAllowed = 'copyLink'
                      } catch { /* noop */ }
                    }}
                    className={cn(
                      'group relative rounded-lg overflow-hidden bg-[var(--panel)] border transition',
                      isSelected
                        ? 'border-[var(--primary)] ring-2 ring-[var(--primary)]/40'
                        : (tier ? tierBorder[tier] : 'border-[var(--border)] hover:border-[var(--primary)]/40')
                    )}
                  >
                    {/* Multi-select checkbox overlay — only visible when
                        in multi-select mode (or on hover when tile is
                        already selected). Clicking the checkbox toggles
                        without triggering the tile's lightbox-open. */}
                    {(multiSelect || isSelected) && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedIds((prev) => {
                            const next = new Set(prev)
                            if (next.has(tileKey)) next.delete(tileKey)
                            else next.add(tileKey)
                            return next
                          })
                        }}
                        className={cn(
                          'absolute top-1.5 right-1.5 z-20 w-5 h-5 rounded-md border-2 flex items-center justify-center transition',
                          isSelected
                            ? 'bg-[var(--primary)] border-[var(--primary)] text-white'
                            : 'bg-black/60 border-white/40 hover:border-white text-transparent'
                        )}
                        aria-label={isSelected ? 'Deselect' : 'Select'}
                      >
                        ✓
                      </button>
                    )}
                    {/* Thumbnail — clickable to open lightbox. Video
                        posts get a play-icon overlay; GIFs get a small
                        animated indicator. */}
                    <button
                      type="button"
                      onClick={(e) => {
                        // Ctrl/Meta-click in normal mode = enter multi-select
                        // mode AND select this tile. Plain click in multi-
                        // select mode toggles selection. Plain click in
                        // normal mode opens the lightbox.
                        if (multiSelect || e.ctrlKey || e.metaKey) {
                          if (!multiSelect) setMultiSelect(true)
                          setSelectedIds((prev) => {
                            const next = new Set(prev)
                            if (next.has(tileKey)) next.delete(tileKey)
                            else next.add(tileKey)
                            return next
                          })
                          return
                        }
                        setLightbox(post)
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        setTileMenu({ post, x: e.clientX, y: e.clientY })
                      }}
                      onMouseEnter={() => {
                        // Only direct video URLs get a hover preview —
                        // embed tubes can't autoplay cross-origin without
                        // each tube's specific embed params.
                        if (!isVideo(post.file_url)) return
                        if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current)
                        hoverTimerRef.current = window.setTimeout(() => {
                          setHoverPreviewId(post.id)
                        }, 400)
                      }}
                      onMouseLeave={() => {
                        if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current)
                        if (hoverPreviewId === post.id) setHoverPreviewId(null)
                      }}
                      className="block w-full aspect-square overflow-hidden bg-black/30 cursor-zoom-in relative"
                    >
                      {post.preview_url || post.sample_url ? (
                        <img
                          src={post.preview_url || post.sample_url}
                          alt={`Post ${post.id}`}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                          loading="lazy"
                          // Per-source referrer policy: pixiv CDN
                          // (i.pximg.net) REQUIRES pixiv.net referer
                          // and 403s without it. xbooru / booru CDNs
                          // mostly accept anything. Default browser
                          // policy works for everyone EXCEPT xbooru/
                          // gelbooru videos (handled separately).
                          // Auto-hide ONLY for PullPush — its archive
                          // routinely points at deleted Imgur/redd.it
                          // images. Other sources show broken-image
                          // icons rather than disappearing.
                          onError={post.source_booru === 'pullpush' ? (e) => {
                            const tile = (e.currentTarget.closest('.group') as HTMLElement | null)
                            if (tile) tile.style.display = 'none'
                          } : undefined}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[var(--muted)]/40">
                          <Globe size={24} />
                        </div>
                      )}
                      {/* Hover preview — direct .mp4/.webm only. Layered
                          on top of the still thumbnail so leaving the
                          tile snaps back instantly without re-loading
                          the thumb. */}
                      {hoverPreviewId === post.id && isVideo(post.file_url) && (
                        <video
                          src={post.file_url}
                          autoPlay
                          muted
                          loop
                          playsInline
                          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                        />
                      )}
                      {(isVideo(post.file_url) || isEmbedUrl(post.file_url)) && (
                        <>
                          {hoverPreviewId !== post.id && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition pointer-events-none">
                              <div className="rounded-full bg-black/60 p-2.5 backdrop-blur-sm">
                                <Play size={20} className="fill-white text-white" />
                              </div>
                            </div>
                          )}
                          <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/70 text-[9px] font-medium text-white uppercase tracking-wider">
                            {isEmbedUrl(post.file_url) ? 'tube' : 'video'}
                          </span>
                        </>
                      )}
                      {!isVideo(post.file_url) && isGif(post.file_url) && (
                        <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-purple-500/80 text-[9px] font-medium text-white uppercase tracking-wider">
                          gif
                        </span>
                      )}
                      {/* Already-in-library badge — when this post's
                          hash matches anything already in Vault, show
                          a clear "In Library" pill so the user doesn't
                          accidentally re-save. Match by md5 or post id. */}
                      {(() => {
                        const h = String(post.hash ?? '').toLowerCase()
                        if (h && libraryHashes.has(h)) {
                          return (
                            <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-emerald-500/85 text-[9px] font-medium text-white uppercase tracking-wider shadow-md">
                              In Library
                            </span>
                          )
                        }
                        return null
                      })()}
                      {/* Dimensions overlay — bottom-right, hover-only.
                          Lets users spot low-res junk without clicking
                          through to the lightbox. */}
                      {post.width > 0 && post.height > 0 && (
                        <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/70 text-[9px] font-medium text-white/90 tabular-nums opacity-0 group-hover:opacity-100 transition pointer-events-none">
                          {post.width}×{post.height}
                          {post.width >= 1920 && <span className="ml-1 text-emerald-300">HD</span>}
                          {post.width >= 3840 && <span className="ml-1 text-amber-300">4K</span>}
                        </span>
                      )}
                    </button>
                    {/* Metadata footer */}
                    <div className="p-2 space-y-1.5">
                      <div className="flex items-center justify-between gap-1 text-[10px] text-[var(--muted)]">
                        <span className={cn(
                          'inline-block px-1.5 py-0.5 rounded border uppercase tracking-wider',
                          ratingColors[post.rating] ?? 'bg-white/10 border-white/20 text-white/70'
                        )}>
                          {post.rating.charAt(0)}
                        </span>
                        <span className="tabular-nums">
                          {post.width}×{post.height}
                        </span>
                        <span className={cn(
                          'tabular-nums',
                          tier ? `${tierText[tier]} font-medium` : ''
                        )}>
                          ↑ {fmtScore(post.score ?? 0)}
                        </span>
                      </div>
                      {post.source_booru && (
                        <div className="text-[9px] text-[var(--primary)]/70 truncate inline-flex items-center gap-1" title={`From ${post.source_booru}`}>
                          <span aria-hidden="true">{SOURCE_ICONS[post.source_booru] ?? '🌐'}</span>
                          {post.source_booru}
                        </div>
                      )}
                      <button
                        onClick={() => handleDownload(post)}
                        disabled={isDownloaded || isDownloading}
                        className={cn(
                          'w-full px-2 py-1.5 rounded text-[11px] font-medium transition flex items-center justify-center gap-1',
                          isDownloaded
                            ? 'bg-green-500/20 border border-green-500/40 text-green-300 cursor-default'
                            : isDownloading
                              ? 'bg-white/5 text-[var(--muted)] cursor-wait'
                              : 'bg-[var(--primary)]/15 border border-[var(--primary)]/30 text-[var(--primary)] hover:bg-[var(--primary)]/25'
                        )}
                      >
                        {isDownloaded ? (
                          <>✓ Saved</>
                        ) : isDownloading ? (
                          <>
                            <Loader2 size={11} className="animate-spin" />
                            Saving…
                          </>
                        ) : (
                          <>
                            <Download size={11} />
                            Save to Library
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Infinite-scroll sentinel — when this slides into view
                AND there's more available, auto-trigger the Load more
                action. Same path as the button, just hands-free. The
                sentinel mounts only when hasMore is true so we don't
                burn observer cycles on completed result sets. */}
            {hasMore && !loading && (
              <InfiniteScrollSentinel
                onIntersect={() => search(activeQuery, page + 1, source, { append: true })}
              />
            )}
            {/* Load more — appends next page's results to the current
                grid (infinite-scroll style). Lower-friction than
                paginate-and-replace when scanning lots of content. */}
            {hasMore && (
              <div className="mt-6 mb-2 flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => search(activeQuery, page + 1, source, { append: true })}
                  disabled={loading}
                  className="px-6 py-2.5 rounded-lg bg-[var(--primary)]/15 hover:bg-[var(--primary)]/25 border border-[var(--primary)]/30 text-[var(--primary)] font-medium transition inline-flex items-center gap-2 text-sm disabled:opacity-50"
                >
                  {loading ? <><Loader2 size={14} className="animate-spin" /> Loading more…</> : <>Load {PER_PAGE} more</>}
                </button>
              </div>
            )}
            {/* Pagination (page replace) — kept as alternative for users
                who want classic pager navigation. Page indicator
                reflects the last fetched page. */}
            <div className="mt-4 flex items-center justify-center gap-2">
              <button
                onClick={() => search(activeQuery, Math.max(0, page - 1), source)}
                disabled={page === 0 || loading}
                className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition inline-flex items-center gap-1 text-sm"
              >
                <ChevronLeft size={14} />
                Prev (replace)
              </button>
              <span className="px-3 py-2 text-sm tabular-nums text-[var(--muted)]">
                Page {page + 1} · {posts.length} loaded
              </span>
              <button
                onClick={() => search(activeQuery, page + 1, source)}
                disabled={!hasMore || loading}
                className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition inline-flex items-center gap-1 text-sm"
              >
                Next (replace)
                <ChevronRight size={14} />
              </button>
            </div>
          </>
          )
        })()}
      </div>

      {/* Floating bulk-action bar — visible when 1+ tiles selected.
          Animated entrance/exit via motion's AnimatePresence so the
          bar slides up from the bottom edge instead of popping in. */}
      <AnimatePresence>
      {selectedIds.size > 0 && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--panel)]/95 border border-[var(--primary)]/40 shadow-2xl backdrop-blur"
        >
          <span className="text-sm font-medium text-white tabular-nums">
            {selectedIds.size} selected
          </span>
          {/* #115 — Apply tags to all on save. Comma- or space-separated.
              Forwarded as `extraTags` on each booru:download-to-library
              call; backend normalizes + ensureTag's each before adding. */}
          <input
            type="text"
            value={bulkExtraTags}
            onChange={(e) => setBulkExtraTags(e.target.value)}
            placeholder="Extra tags (artist:foo …)"
            className="px-2 py-1 rounded text-[11px] bg-white/5 border border-white/10 focus:outline-none focus:border-[var(--primary)] w-44 placeholder:text-[var(--muted)]/70"
            title="Optional. Tag(s) added to every selected post on save. Comma or space separated."
          />
          <button
            type="button"
            onClick={async () => {
              setBulkSaving(true)
              try {
                let ok = 0, fail = 0
                for (const post of posts) {
                  const k = `${post.source_booru ?? 'unknown'}-${post.id}`
                  if (!selectedIds.has(k)) continue
                  if (downloaded.has(post.id) || downloading.has(post.id)) continue
                  if (isEmbedUrl(post.file_url)) {
                    // Tube embeds → yt-dlp via the resolver pathway.
                    // For now just skip — bulk-save targets direct files.
                    fail++
                    continue
                  }
                  try {
                    const r = await (window as any).api?.booru?.downloadToLibrary?.({
                      ...post,
                      targetDir: saveTargetDir || undefined,
                      filenameTemplate: filenameTemplate || undefined,
                      extraTags: bulkExtraTags.trim() || undefined,
                    })
                    if (r?.ok) {
                      ok++
                      setDownloaded((prev) => { const next = new Set(prev); next.add(post.id); return next })
                    } else fail++
                  } catch { fail++ }
                }
                showToast(fail === 0 ? 'success' : 'info', `Bulk save: ${ok} saved, ${fail} skipped`)
                setSelectedIds(new Set())
              } finally {
                setBulkSaving(false)
              }
            }}
            disabled={bulkSaving}
            className="px-3 py-1.5 rounded text-xs font-medium bg-[var(--primary)] hover:opacity-90 text-white disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {bulkSaving ? <><Loader2 size={12} className="animate-spin" /> Saving…</> : <><Download size={12} /> Save {selectedIds.size} to library</>}
          </button>
          <button
            type="button"
            onClick={() => {
              const all = new Set(posts.map((p) => `${p.source_booru ?? 'unknown'}-${p.id}`))
              setSelectedIds(all)
            }}
            className="px-2 py-1 rounded text-[11px] bg-white/5 hover:bg-white/10 text-[var(--muted)] hover:text-white"
          >
            Select all
          </button>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="px-2 py-1 rounded text-[11px] bg-white/5 hover:bg-white/10 text-[var(--muted)] hover:text-white"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => {
              // Hide selected from this session.
              setHiddenIds((prev) => new Set([...prev, ...selectedIds]))
              setSelectedIds(new Set())
              showToast('info', `Hidden ${selectedIds.size} posts for this session`)
            }}
            className="px-2 py-1 rounded text-[11px] bg-white/5 hover:bg-white/10 text-amber-200 hover:text-amber-100"
          >
            Hide
          </button>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Right-click context menu — reverse image search providers,
          copy URL, open source page. Fixed-positioned at cursor;
          click-outside backdrop closes it. */}
      {tileMenu && (() => {
        const p = tileMenu.post
        // Use the preview/thumbnail for reverse search — full file URL
        // is often too large or a tube embed that the searcher can't load.
        const imgUrl = p.preview_url || p.sample_url || p.file_url
        const enc = encodeURIComponent(imgUrl)
        const items: Array<{ label: string; href: string }> = [
          { label: 'SauceNAO',     href: `https://saucenao.com/search.php?url=${enc}` },
          { label: 'iqdb',         href: `https://iqdb.org/?url=${enc}` },
          { label: 'TraceMoe',     href: `https://trace.moe/?url=${enc}` },
          { label: 'Yandex Images',href: `https://yandex.com/images/search?rpt=imageview&url=${enc}` },
          { label: 'Google Lens',  href: `https://lens.google.com/uploadbyurl?url=${enc}` },
        ]
        const openExt = (url: string) => {
          try { (window as any).api?.shell?.openExternal?.(url) }
          catch (err) { console.warn('[Browse menu] openExternal failed:', err) }
        }
        // Clamp menu to viewport so it doesn't render off the edge.
        const menuW = 220
        const menuH = 280  // rough estimate; auto-fits content
        const x = Math.min(tileMenu.x, window.innerWidth - menuW - 8)
        const y = Math.min(tileMenu.y, window.innerHeight - menuH - 8)
        return (
          <>
            {/* invisible backdrop to capture outside clicks */}
            <div
              className="fixed inset-0 z-[90]"
              onClick={() => setTileMenu(null)}
              onContextMenu={(e) => { e.preventDefault(); setTileMenu(null) }}
            />
            <div
              className="fixed z-[91] rounded-lg bg-[var(--panel)] border border-[var(--border)] shadow-2xl py-1 text-xs min-w-[200px]"
              style={{ left: x, top: y }}
            >
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-[var(--muted)] border-b border-[var(--border)]">
                Find similar
              </div>
              {items.map((it) => (
                <button
                  key={it.label}
                  type="button"
                  onClick={() => { openExt(it.href); setTileMenu(null) }}
                  className="w-full text-left px-3 py-1.5 hover:bg-white/5 text-white"
                >
                  {it.label}
                </button>
              ))}
              {/* #205 — Native SauceNAO that returns results into the
                  current Browse grid instead of popping a tab. */}
              <button
                type="button"
                onClick={async () => {
                  setTileMenu(null)
                  try {
                    const r = await (window as any).api?.booru?.saucenaoSearch?.({ imageUrl: imgUrl })
                    if (r?.ok && Array.isArray(r.posts)) {
                      setPosts(r.posts)
                      setHasMore(false)
                      setPage(0)
                      setActiveQuery('(SauceNAO match)')
                      showToast('success', `${r.posts.length} SauceNAO matches`)
                    } else {
                      showToast('error', r?.error ?? 'SauceNAO failed')
                    }
                  } catch (err: any) {
                    showToast('error', err?.message ?? 'SauceNAO failed')
                  }
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-white/5 text-yellow-200 font-medium"
              >
                🍢 Find sauce (native)
              </button>
              <div className="border-t border-[var(--border)] my-1" />
              <button
                type="button"
                onClick={() => {
                  try { navigator.clipboard.writeText(p.file_url) } catch { /* noop */ }
                  showToast('info', 'Copied file URL')
                  setTileMenu(null)
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-white/5 text-white"
              >
                Copy file URL
              </button>
              {p.source && (
                <button
                  type="button"
                  onClick={() => { openExt(p.source); setTileMenu(null) }}
                  className="w-full text-left px-3 py-1.5 hover:bg-white/5 text-white"
                >
                  Open source page
                </button>
              )}
              {/* #119 — Civitai pivot: when this post came from Civitai
                  and we have a model/version anchor, offer one-click
                  re-search for everything from that LoRA / checkpoint. */}
              {((p as any).civitaiModelId || (p as any).civitaiModelVersionId) && (
                <button
                  type="button"
                  onClick={async () => {
                    setTileMenu(null)
                    try {
                      const r = await (window as any).api?.booru?.civitaiByModel?.({
                        modelId: (p as any).civitaiModelId,
                        modelVersionId: (p as any).civitaiModelVersionId,
                        perPage: PER_PAGE,
                        page: 0,
                      })
                      if (r?.ok && Array.isArray(r.posts)) {
                        // Replace the current results pool with the
                        // model-filtered hits + reset pagination.
                        setPosts(r.posts)
                        setHasMore(!!r.hasMore)
                        setPage(0)
                        setActiveQuery(`(model ${(p as any).civitaiModelVersionId ?? (p as any).civitaiModelId})`)
                        showToast('success', `${r.posts.length} more from this Civitai model`)
                      } else {
                        showToast('error', r?.error ?? 'Civitai pivot failed')
                      }
                    } catch (err: any) {
                      showToast('error', err?.message ?? 'Civitai pivot failed')
                    }
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-white/5 text-pink-300 font-medium"
                >
                  More from this model
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  handleDownload(p)
                  setTileMenu(null)
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-white/5 text-[var(--primary)] font-medium"
              >
                Save to Library
              </button>
              <div className="border-t border-[var(--border)] my-1" />
              <button
                type="button"
                onClick={() => {
                  // "More like this" — replace current query with the
                  // most meaningful tags from the clicked post (filters
                  // out generic 1girl/solo/hair-color/etc that turn the
                  // query into "find anything"). Uses up to 6 tags.
                  const topTags = getMeaningfulTags(p.tags || '', 6)
                  if (topTags) {
                    setTagInput(topTags)
                    setActiveQuery(topTags)
                    setPage(0)
                    setSearchFocused(false)
                    void search(topTags, 0, source)
                  }
                  setTileMenu(null)
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-white/5 text-white"
              >
                More like this
              </button>
              <button
                type="button"
                onClick={() => {
                  const k = `${p.source_booru ?? 'unknown'}-${p.id}`
                  setHiddenIds((prev) => new Set([...prev, k]))
                  setTileMenu(null)
                  showToast('info', 'Hidden for this session')
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-white/5 text-amber-200"
              >
                Hide this post
              </button>
              {p.source_booru && (
                <button
                  type="button"
                  onClick={() => {
                    // Tag-wiki link — e621/danbooru have rich wikis.
                    const first = (p.tags || '').split(/\s+/).find((t) => t && !t.startsWith('-'))
                    if (!first) { setTileMenu(null); return }
                    const wikiUrl =
                      p.source_booru === 'e621' || p.source_booru === 'e926'
                        ? `https://e621.net/wiki_pages/show_or_new?title=${encodeURIComponent(first)}`
                        : p.source_booru === 'danbooru' || p.source_booru === 'aibooru'
                        ? `https://danbooru.donmai.us/wiki_pages/${encodeURIComponent(first)}`
                        : `https://${p.source_booru}.com/index.php?page=tags&q=${encodeURIComponent(first)}`
                    openExt(wikiUrl)
                    setTileMenu(null)
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-white/5 text-white"
                  title="Open the booru's wiki page for the first tag"
                >
                  Tag wiki: first tag
                </button>
              )}
            </div>
          </>
        )
      })()}

      {/* Lightbox modal */}
      {lightbox && (() => {
        const idx = posts.findIndex((p) => p.id === lightbox.id && p.source === lightbox.source)
        const hasPrev = idx > 0
        const hasNext = idx >= 0 && idx < posts.length - 1
        const goPrev = () => { if (hasPrev) setLightbox(posts[idx - 1]) }
        const goNext = () => { if (hasNext) setLightbox(posts[idx + 1]) }
        return (
        <div
          className={cn(
            "fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center",
            // Padding only when windowed — fullscreen mode needs to fill
            // every pixel of the Electron BrowserWindow (which may itself
            // be smaller than the monitor in windowed mode).
            lightboxFullscreen ? "p-0" : "p-4 sm:p-6"
          )}
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
        >
          <button
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition z-10"
            title="Close (Esc)"
          >
            <X size={20} />
          </button>
          {/* Fullscreen toggle — windowed vs viewport-fill. F also toggles. */}
          <button
            onClick={(e) => { e.stopPropagation(); setLightboxFullscreen((f) => !f) }}
            className="absolute top-4 right-16 p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition z-10"
            title={lightboxFullscreen ? 'Exit fullscreen (F)' : 'Fullscreen (F)'}
            aria-label={lightboxFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {lightboxFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
          </button>
          {/* Prev / next post — paired with ← / → keyboard nav. */}
          <button
            onClick={(e) => { e.stopPropagation(); goPrev() }}
            disabled={!hasPrev}
            className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-25 disabled:cursor-not-allowed text-white transition z-10"
            title="Previous (←)"
            aria-label="Previous post"
          >
            <ChevronLeft size={24} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); goNext() }}
            disabled={!hasNext}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-25 disabled:cursor-not-allowed text-white transition z-10"
            title="Next (→)"
            aria-label="Next post"
          >
            <ChevronRight size={24} />
          </button>
          {idx >= 0 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/60 text-[10px] tabular-nums text-white/80 pointer-events-none z-10">
              {idx + 1} / {posts.length}
            </div>
          )}
          <div
            className={cn(
              "flex flex-col gap-3 transition-all",
              // w-full / h-full are PARENT-relative (the fixed inset-0
              // backdrop) — they fill the Electron window even in
              // windowed mode. w-screen / h-screen are SCREEN-relative
              // and overflow when the window is smaller than the monitor.
              lightboxFullscreen
                ? "w-full h-full p-0"
                : "max-w-[min(90vw,1600px)] max-h-[90vh] w-full"
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const url = lightbox.file_url || ''
              const isXnxxView = /xnxx\.com\/video-/i.test(url)
              const videoCls = cn(
                "bg-black",
                lightboxFullscreen
                  ? "w-full h-full object-contain rounded-none"
                  : "max-w-full max-h-[75vh] rounded-lg shadow-2xl"
              )

              // xnxx: prefer the resolved direct MP4. While the
              // resolver is in-flight, show a loader so the user
              // doesn't stare at a blank screen.
              if (isXnxxView) {
                if (resolvingVideo && !resolvedVideoUrl) {
                  return (
                    <div className="flex items-center justify-center bg-black rounded-lg shadow-2xl text-white/70 text-sm gap-2"
                      style={{ width: 'min(90vw, 1280px)', height: 'min(75vh, 720px)' }}>
                      <Loader2 size={20} className="animate-spin" />
                      Resolving direct video URL…
                    </div>
                  )
                }
                if (resolvedVideoUrl) {
                  // yt-dlp typically returns HLS .m3u8 for xnxx; the
                  // wrapper transparently attaches hls.js when needed.
                  return (
                    <HlsAwareVideo
                      src={resolvedVideoUrl}
                      controls
                      autoPlay
                      loop
                      className={videoCls}
                      onError={(e) => console.warn('[Booru lightbox] xnxx resolved video failed', resolvedVideoUrl, e)}
                      onDoubleClick={() => setLightboxFullscreen((f) => !f)}
                    />
                  )
                }
                return (
                  <div className="flex flex-col items-center justify-center bg-black rounded-lg shadow-2xl text-amber-200 text-sm gap-3 p-6"
                    style={{ width: 'min(90vw, 1280px)', height: 'min(75vh, 720px)' }}>
                    <span>Couldn&apos;t resolve a direct video for this xnxx post.</span>
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs px-3 py-1.5 rounded bg-white/10 hover:bg-white/20 text-white"
                    >
                      Open on xnxx.com
                    </a>
                  </div>
                )
              }

              if (isEmbedUrl(url)) {
                return (
                  <iframe
                    src={url}
                    className={cn(
                      "bg-black",
                      lightboxFullscreen ? "w-full flex-1 rounded-none" : "rounded-lg shadow-2xl"
                    )}
                    style={lightboxFullscreen
                      ? { width: '100%', height: '100%' }
                      : { width: 'min(90vw, 1280px)', height: 'min(75vh, 720px)' }
                    }
                    allow="autoplay; fullscreen; encrypted-media"
                    allowFullScreen
                    referrerPolicy="no-referrer"
                    title={`Embed ${lightbox.id}`}
                  />
                )
              }

              if (isVideo(url) || isHlsUrl(url)) {
                return (
                  <HlsAwareVideo
                    src={url}
                    controls
                    autoPlay
                    loop
                    className={videoCls}
                    onError={(e) => console.warn('[Booru lightbox] video failed to load', url, e)}
                    onDoubleClick={() => setLightboxFullscreen((f) => !f)}
                  />
                )
              }

              return (
                <img
                  src={lightbox.sample_url || url}
                  alt={`Post ${lightbox.id}`}
                  className={cn(
                    "object-contain",
                    lightboxFullscreen
                      ? "w-full h-full rounded-none"
                      : "max-w-full max-h-[75vh] rounded-lg shadow-2xl"
                  )}
                  onDoubleClick={() => setLightboxFullscreen((f) => !f)}
                  // Two-stage fallback for hotlink-protected sources
                  // (tbib, some boorus): if sample_url 403s, try the
                  // raw file_url; if THAT also fails, swap to the
                  // already-loaded thumbnail at preview_url so the user
                  // at least sees something instead of a broken-icon void.
                  onError={(e) => {
                    const img = e.currentTarget
                    const tried = img.getAttribute('data-fallback-stage') ?? '0'
                    if (tried === '0' && url && img.src !== url) {
                      img.setAttribute('data-fallback-stage', '1')
                      img.src = url
                    } else if (tried !== '2' && lightbox.preview_url && img.src !== lightbox.preview_url) {
                      img.setAttribute('data-fallback-stage', '2')
                      img.src = lightbox.preview_url
                    }
                  }}
                />
              )
            })()}
            <div className={cn(
              "flex items-center justify-between gap-3 transition-all",
              lightboxFullscreen
                ? "absolute bottom-12 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur-md rounded-lg px-4 py-2 max-w-[90vw] z-10 opacity-0 hover:opacity-100 focus-within:opacity-100"
                : "bg-[var(--panel)]/95 border border-[var(--border)] rounded-lg px-4 py-2"
            )}>
              <div className="text-xs text-[var(--muted)] truncate inline-flex items-center gap-2">
                {lightbox.source_booru && (
                  <span className="inline-flex items-center gap-1 text-[var(--primary)]/80" title={`From ${lightbox.source_booru}`}>
                    <span aria-hidden="true">{SOURCE_ICONS[lightbox.source_booru] ?? '🌐'}</span>
                    {lightbox.source_booru}
                  </span>
                )}
                <span className="mx-1 opacity-60">·</span>
                <span className="tabular-nums">#{lightbox.id}</span>
                <span className="mx-1 opacity-60">·</span>
                <span className="tabular-nums">{lightbox.width}×{lightbox.height}</span>
                <span className="mx-1 opacity-60">·</span>
                <span>↑ {fmtScore(lightbox.score)}</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    // "More like this" — replace query with the most
                    // meaningful tags from the lightbox post (skips
                    // 1girl/solo/hair-color/quality meta), close
                    // lightbox, re-search.
                    const topTags = getMeaningfulTags(lightbox.tags || '', 6)
                    if (topTags) {
                      setTagInput(topTags)
                      setActiveQuery(topTags)
                      setPage(0)
                      setLightbox(null)
                      void search(topTags, 0, source)
                    }
                  }}
                  className="text-xs px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 text-[var(--muted)] hover:text-white transition"
                  title="Re-search using this post's top tags"
                >
                  ✨ More like this
                </button>
                <button
                  type="button"
                  onClick={() => {
                    try { navigator.clipboard.writeText(lightbox.file_url) } catch { /* noop */ }
                    showToast('info', 'Copied file URL')
                  }}
                  className="text-xs px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 text-[var(--muted)] hover:text-white transition"
                  title="Copy file URL to clipboard"
                >
                  📋
                </button>
                <a
                  href={lightbox.source || lightbox.file_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 text-[var(--muted)] hover:text-white transition inline-flex items-center gap-1"
                  title="Open the original page on the source site"
                >
                  <ExternalLink size={12} />
                  Open original
                </a>
                <button
                  onClick={() => handleDownload(lightbox)}
                  disabled={downloaded.has(lightbox.id) || downloading.has(lightbox.id)}
                  className={cn(
                    'text-xs px-3 py-1.5 rounded font-medium transition inline-flex items-center gap-1',
                    downloaded.has(lightbox.id)
                      ? 'bg-green-500/20 border border-green-500/40 text-green-300 cursor-default'
                      : 'bg-[var(--primary)] hover:opacity-90 text-white'
                  )}
                >
                  {downloaded.has(lightbox.id) ? (
                    <>✓ Saved</>
                  ) : downloading.has(lightbox.id) ? (
                    <><Loader2 size={11} className="animate-spin" /> Saving…</>
                  ) : (
                    <><Download size={12} /> Save to Library</>
                  )}
                </button>
              </div>
            </div>
            {lightbox.tags && !lightboxFullscreen && (
              <div className="bg-[var(--panel)]/95 border border-[var(--border)] rounded-lg px-4 py-2 max-h-32 overflow-y-auto">
                <div className="flex flex-wrap gap-1">
                  {lightbox.tags.split(/\s+/).filter(Boolean).slice(0, 50).map((t, i) => {
                    // #117 — Tags starting with artist:/uploader:/by_/creator:
                    // get a "Channel" pivot affordance via Shift+click. Plain
                    // left-click keeps the existing same-source search behavior.
                    const isCreatorTag = /^(artist|uploader|creator|by_|by-)/i.test(t)
                    return (
                      <span
                        key={i}
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] cursor-pointer transition ${
                          isCreatorTag
                            ? 'bg-pink-500/10 border border-pink-500/30 text-pink-200 hover:bg-pink-500/20'
                            : 'bg-[var(--primary)]/10 border border-[var(--primary)]/20 text-[var(--primary)] hover:bg-[var(--primary)]/20'
                        }`}
                        onClick={(e) => {
                          setLightbox(null)
                          // Shift-click OR any click on a creator-tag opens
                          // the cross-source channel view; plain click on a
                          // regular tag stays scoped to current source.
                          if (e.shiftKey || isCreatorTag) {
                            openCreatorChannel(t)
                          } else {
                            setTagInput(t)
                            setActiveQuery(t)
                            setPage(0)
                            search(t, 0, source)
                          }
                        }}
                        title={isCreatorTag
                          ? `Click → open ${t} channel across all sources`
                          : `Click to search for "${t}" (Shift+click → all sources)`}
                      >
                        {isCreatorTag ? '👤 ' : ''}{t}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
        )
      })()}
    </div>
  )
}
