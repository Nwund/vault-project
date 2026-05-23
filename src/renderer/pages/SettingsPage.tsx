// File: src/renderer/pages/SettingsPage.tsx
//
// Settings page. Tabs: library / appearance / effects / playback / sound /
// data / services / xyrene. Receives all state through props from App so
// effect toggles can stay coordinated with the App-level providers.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  ArrowUp,
  Check,
  Copy,
  Download,
  Edit2,
  Flame,
  Folder,
  HardDrive,
  Library,
  Mic,
  Play,
  Plus,
  Save,
  Search,
  Shield,
  Sparkles,
  Trash2,
  Volume2,
  X,
} from 'lucide-react'
import type { VaultSettings } from '../types'
import { formatBytes } from '../utils/formatters'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { useConfirm } from '../components/ConfirmDialog'
import { useToast } from '../contexts'
import { cn } from '../utils/cn'
import { Btn, TopBar, ToggleSwitch } from '../components/ui'
import { HardwareEncoderSettings } from '../components/HardwareEncoderSettings'
import { XyreneSettings } from '../components/XyreneSettings'
import { CrossDeviceCard, CloudflareTunnelCard, ZeroTierCard, ResticBackupCard, WebDavCard } from '../components/AdminCards'
import { HotkeyEditorCard } from '../components/HotkeyEditorCard'
import { CardLayoutCustomizer } from '../components/CardLayoutCustomizer'
import { HueCard } from '../components/HueCard'
import { HostsBlocklistCard } from '../components/HostsBlocklistCard'
import { HomeAssistantCard } from '../components/HomeAssistantCard'
import { SelfControlCard } from '../components/SelfControlCard'
import { AgeBackupCard } from '../components/AgeBackupCard'
import { ExtraDetectorsCard } from '../components/ExtraDetectorsCard'
import { WindowsHelloCard } from '../components/WindowsHelloCard'
import { IntifaceCard } from '../components/IntifaceCard'
import {
  IrohShareCard,
  HyperswarmMeshCard,
  HeliaIpfsCard,
  VeilidCard,
  TorOnionCard,
  WebTransportCard,
  NostrSignerCard,
  SyncthingCard,
  BlueskyLabelerCard,
  UnifiedPushCard,
  ImapWatcherCard,
  VideoDiffusionCard,
  WebAuthnCard,
  ShamirCard,
  NtfyCard,
  FolderActionsCard,
  CoomerArchiveCard,
  AudioEroticaCard,
  CaptionPoolCard,
  VaultMlSidecarCard,
  YtdlpProfilesCard,
} from '../components/network'
import { TagImplicationsCard } from '../components/TagImplicationsCard'
import { themes, DARK_THEME_LIST, LIGHT_THEME_LIST, GOON_THEME_LIST, type ThemeId } from '../styles/themes'
import { QRCodeSVG } from 'qrcode.react'





// ═══════════════════════════════════════════════════════════════════════════
// HARDWARE ENCODER SETTINGS COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function SettingsPage(props: {
  settings: VaultSettings | null
  patchSettings: (p: Partial<VaultSettings>) => void
  onThemeChange: (themeId: string) => void
  visualEffects: {
    enabled: boolean
    sparkles: boolean
    bokeh: boolean
    starfield: boolean
    filmGrain: boolean
    dreamyHaze: boolean
    crtCurve: boolean
    crtIntensity: number
    crtRgbSubpixels: boolean
    crtChromaticAberration: boolean
    crtScreenFlicker: boolean
    crtGlitchGif: number | null
    tvBorder: boolean
    tvBorderGlass: boolean
    tvBorderGlassOpacity: number
    tvBorderPadding: number
    tvBorderStyle: 'classic' | 'modern' | 'retro' | 'minimal'
    pipBoy: boolean
    pipBoyColor: 'green' | 'amber' | 'blue' | 'white'
    pipBoyIntensity: number
    heatLevel: number
    hearts: boolean
    rain: boolean
    glitch: boolean
    bubbles: boolean
    matrix: boolean
    confetti: boolean
  }
  onVisualEffectsChange: {
    setEnabled: (v: boolean) => void
    setSparkles: (v: boolean) => void
    setBokeh: (v: boolean) => void
    setStarfield: (v: boolean) => void
    setFilmGrain: (v: boolean) => void
    setDreamyHaze: (v: boolean) => void
    setCrtCurve: (v: boolean) => void
    setCrtIntensity: (v: number) => void
    setCrtRgbSubpixels: (v: boolean) => void
    setCrtChromaticAberration: (v: boolean) => void
    setCrtScreenFlicker: (v: boolean) => void
    setCrtGlitchGif: (v: number | null) => void
    setTvBorder: (v: boolean) => void
    setTvBorderGlass: (v: boolean) => void
    setTvBorderGlassOpacity: (v: number) => void
    setTvBorderPadding: (v: number) => void
    setTvBorderStyle: (v: 'classic' | 'modern' | 'retro' | 'minimal') => void
    setPipBoy: (v: boolean) => void
    setPipBoyColor: (v: 'green' | 'amber' | 'blue' | 'white') => void
    setPipBoyIntensity: (v: number) => void
    setHeatLevel: (v: number) => void
    setHearts: (v: boolean) => void
    setRain: (v: boolean) => void
    setGlitch: (v: boolean) => void
    setBubbles: (v: boolean) => void
    setMatrix: (v: boolean) => void
    setConfetti: (v: boolean) => void
  }
}) {
  const s = props.settings
  const { showToast } = useToast()
  const confirm = useConfirm()
  type SettingsTab = 'library' | 'appearance' | 'effects' | 'playback' | 'sound' | 'data' | 'services' | 'xyrene'
  // Persist which Settings tab is selected — without this the user lands
  // back on 'library' every time they reopen the app even if they were
  // mid-task in another section. Matches the user-visible 'settings not
  // staying selected when it restarts' complaint.
  const VALID_TABS: ReadonlyArray<SettingsTab> = ['library', 'appearance', 'effects', 'playback', 'sound', 'data', 'services', 'xyrene']
  const [activeTab, setActiveTabRaw] = useState<SettingsTab>(() => {
    try {
      const stored = localStorage.getItem('vault.settings.activeTab')
      if (stored && (VALID_TABS as readonly string[]).includes(stored)) return stored as SettingsTab
    } catch { /* localStorage unavailable */ }
    return 'library'
  })
  const setActiveTab = useCallback((next: SettingsTab) => {
    setActiveTabRaw(next)
    try { localStorage.setItem('vault.settings.activeTab', next) } catch { /* ignore */ }
  }, [])
  const [isPremium, setIsPremium] = useState(false)
  const [allTags, setAllTags] = useState<string[]>([])
  const [settingsSearch, setSettingsSearch] = useState('')
  // 'Saved ✓' pill that briefly shows in the TopBar each time the
  // settings:changed broadcast fires. Gives the user visible
  // confirmation that a toggle persisted — the silent toggles read
  // as 'did it save?' otherwise.
  const [recentlySaved, setRecentlySaved] = useState(false)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const unsub = (window.api as any).events?.onSettingsChanged?.(() => {
      setRecentlySaved(true)
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => setRecentlySaved(false), 1200)
    })
    return () => {
      if (timer) clearTimeout(timer)
      try { unsub?.() } catch { /* ignore */ }
    }
  }, [])
  // v2.7 — Dismissable intro banner state. Persists to localStorage so
  // users who close it once don't see it again.
  const [v27BannerDismissedStr, setV27BannerDismissedStr] = useLocalStorage<string>('vault.v27ServicesBannerDismissed', '0')
  const v27BannerDismissed = v27BannerDismissedStr === '1'
  const setV27BannerDismissed = (next: boolean) => setV27BannerDismissedStr(next ? '1' : '0')
  // Settings Profiles
  const [profiles, setProfiles] = useState<Array<{ id: string; name: string; description?: string; createdAt: number; updatedAt: number }>>([])
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null)
  const [showCreateProfileModal, setShowCreateProfileModal] = useState(false)
  const [newProfileName, setNewProfileName] = useState('')
  const [newProfileDesc, setNewProfileDesc] = useState('')
  const [renamingProfileId, setRenamingProfileId] = useState<string | null>(null)
  const [renameProfileName, setRenameProfileName] = useState('')

  // Mobile Sync state
  const [mobileSyncStatus, setMobileSyncStatus] = useState<{
    running: boolean
    port: number
    addresses: string[]
    connectedDevices: number
  } | null>(null)
  const [mobilePairingCode, setMobilePairingCode] = useState<string | null>(null)
  const [mobilePairedDevices, setMobilePairedDevices] = useState<Array<{
    id: string
    name: string
    platform: string
    lastSeen: number
  }>>([])

  // DeoVR / HereSphere catalog server (#119) — read-only LAN HTTP
  // endpoint that exposes the library to VR headsets.
  const [deovrStatus, setDeovrStatus] = useState<{
    running: boolean
    port: number
    addresses: string[]
    catalogUrl: string | null
  } | null>(null)
  const [deovrPort, setDeovrPort] = useState<number>(9999)

  // Load profiles on mount
  const loadProfiles = async () => {
    const list = await window.api.profiles?.list?.() ?? []
    const active = await window.api.profiles?.getActive?.() ?? null
    setProfiles(list)
    setActiveProfileId(active)
  }

  useEffect(() => {
    window.api.license?.isPremium?.().then((p: any) => setIsPremium(!!p))
    // Load all tags for blacklist selection
    window.api.tags?.list?.().then((tags: any) => setAllTags(tags?.map?.((t: any) => t.name || t) || []))
    // Load settings profiles
    loadProfiles()
    // Load mobile sync status
    loadMobileSyncStatus()
    // Load DeoVR catalog server status
    loadDeovrStatus()
  }, [])

  // DeoVR functions
  const loadDeovrStatus = async () => {
    try {
      const status = await window.api.deovrStatus?.()
      if (status) setDeovrStatus(status)
    } catch { /* not available */ }
  }
  const toggleDeovrServer = async () => {
    try {
      if (deovrStatus?.running) {
        await window.api.deovrStop?.()
      } else {
        await window.api.deovrStart?.(deovrPort)
      }
      await loadDeovrStatus()
    } catch (e: any) {
      showToast('error', `DeoVR toggle failed: ${e?.message ?? String(e)}`)
    }
  }

  // Mobile sync functions
  const loadMobileSyncStatus = async () => {
    try {
      const status = await window.api.mobileSync?.getStatus?.()
      if (status) {
        setMobileSyncStatus(status)
      }
      const devices = await window.api.mobileSync?.getPairedDevices?.()
      if (devices) {
        setMobilePairedDevices(devices)
      }
    } catch (e) {
      // Mobile sync may not be available
    }
  }

  const toggleMobileSyncServer = async () => {
    try {
      if (mobileSyncStatus?.running) {
        await window.api.mobileSync?.stop?.()
      } else {
        await window.api.mobileSync?.start?.()
      }
      await loadMobileSyncStatus()
    } catch (e: any) {
      showToast('error', `Mobile sync toggle failed: ${e?.message ?? String(e)}`)
    }
  }

  const generateMobilePairingCode = async () => {
    try {
      const result = await window.api.mobileSync?.generatePairingCode?.()
      if (result?.code) {
        setMobilePairingCode(result.code)
        // Code expires after 5 minutes
        setTimeout(() => setMobilePairingCode(null), 5 * 60 * 1000)
      } else {
        showToast('error', `Pairing code: ${(result as any)?.error ?? 'no code in response'}`)
      }
    } catch (e: any) {
      showToast('error', `Pairing code generation failed: ${e?.message ?? String(e)}`)
    }
  }

  const unpairDevice = async (deviceId: string) => {
    try {
      await window.api.mobileSync?.unpairDevice?.(deviceId)
      await loadMobileSyncStatus()
      showToast('success', 'Device unpaired')
    } catch (e: any) {
      showToast('error', `Unpair failed: ${e?.message ?? String(e)}`)
    }
  }

  // Define searchable settings for filtering. Heavy keyword list so a
  // user typing "venice" or "deepfake" or "hypno" lands on the right
  // tab without scanning eight tabs manually.
  const settingsIndex = useMemo(() => [
    { tab: 'library', keywords: ['media', 'folder', 'directory', 'path', 'cache', 'storage', 'scan', 'pagination', 'page size', 'memory cache', 'preload', 'thumbnail quality', 'hover preview'] },
    { tab: 'appearance', keywords: ['theme', 'color', 'dark', 'light', 'accent', 'font', 'size', 'compact', 'animation', 'thumbnail', 'orb', 'aurora', 'neon rain', 'lightning', 'color blind', 'reduce motion'] },
    { tab: 'effects', keywords: ['visual', 'sparkle', 'bokeh', 'starfield', 'grain', 'haze', 'crt', 'heat', 'goon', 'word', 'hypno', 'subliminal', 'edge timer', 'pip boy', 'tv border', 'climax', 'overlay', 'glitch', 'bubbles', 'matrix', 'confetti', 'hearts', 'rain'] },
    { tab: 'playback', keywords: ['video', 'autoplay', 'mute', 'loop', 'volume', 'speed', 'resolution', 'low quality', 'transcode', 'subtitle', 'caption', 'aspect'] },
    { tab: 'sound', keywords: ['audio', 'voice', 'sound', 'mute', 'volume', 'greeting', 'sfx', 'ambience', 'ui sound'] },
    { tab: 'xyrene', keywords: ['xyrene', 'voice', 'tts', 'xtts', 'f5tts', 'whisper', 'whisperx', 'character', 'persona', 'voice clone', 'climax voice', 'sound engine', 'plap', 'wet', 'spank', 'kiss', 'gasp', 'giggle', 'moan'] },
    { tab: 'data', keywords: ['export', 'import', 'backup', 'restore', 'reset', 'privacy', 'blacklist', 'tag', 'logs', 'error', 'trash', 'duplicate', 'venice', 'tpdb', 'api key', 'profile', 'rapidapi', 'e621', 'rule34', 'danbooru', 'bluesky', 'huggingface', 'hf token'] },
    { tab: 'services', keywords: ['mobile', 'sync', 'phone', 'device', 'pair', 'privacy', 'panic', 'incognito', 'blacklist', 'cloudflared', 'tunnel', 'veilid', 'tailscale', 'deovr', 'syncthing', 'cross device', 'webhook', 'imap'] },
  ] as const, [])

  // Find matching tabs based on search
  const matchingTabs = useMemo(() => {
    if (!settingsSearch.trim()) return null
    const q = settingsSearch.toLowerCase()
    return settingsIndex
      .filter(s => s.keywords.some(k => k.includes(q)))
      .map(s => s.tab)
  }, [settingsSearch, settingsIndex])

  // Auto-switch to matching tab if there's only one match
  useEffect(() => {
    if (matchingTabs && matchingTabs.length === 1) {
      setActiveTab(matchingTabs[0] as SettingsTab)
    }
  }, [matchingTabs])

  const mediaDirs = s?.library?.mediaDirs ?? []
  const cacheDir = s?.library?.cacheDir ?? ''
  const privacySettings = s?.privacy ?? {}
  const playbackSettings = s?.playback ?? {}

  const tabs = [
    { id: 'library', name: 'Library', icon: Library },
    { id: 'appearance', name: 'Appearance', icon: Sparkles },
    { id: 'effects', name: 'Effects', icon: Flame },
    { id: 'playback', name: 'Playback', icon: Play },
    { id: 'sound', name: 'Sound', icon: Volume2 },
    { id: 'xyrene', name: 'Xyrene', icon: Mic },
    { id: 'data', name: 'Data', icon: HardDrive },
    { id: 'services', name: 'Services', icon: Shield },
  ] as const

  return (
    <div className="h-full w-full flex flex-col overflow-x-hidden">
      <TopBar title="Settings">
        {/* Recently-saved pill — fades in/out every time the
            settings:changed broadcast fires. Quiet confirmation that
            a toggle actually persisted. */}
        <span
          className={cn(
            'flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border transition-all duration-300',
            recentlySaved
              ? 'opacity-100 bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
              : 'opacity-0 pointer-events-none bg-transparent border-transparent text-transparent'
          )}
          aria-live="polite"
        >
          <Check size={10} /> Saved
        </span>
        {/* Settings search */}
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
          <input
            value={settingsSearch}
            onChange={(e) => setSettingsSearch(e.target.value)}
            placeholder="Search settings..."
            className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-white/10 border border-[var(--border)] outline-none focus:border-[var(--primary)]/50 text-sm"
          />
          {settingsSearch && (
            <button
              onClick={() => setSettingsSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-white"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </TopBar>
      {/* Search hint - show matching tabs */}
      {matchingTabs && matchingTabs.length > 0 && (
        <div className="px-4 py-2 bg-[var(--primary)]/10 border-b border-[var(--primary)]/20 flex items-center gap-2">
          <span className="text-xs text-[var(--muted)]">Found in:</span>
          {matchingTabs.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as SettingsTab)}
              className={cn(
                'px-2 py-0.5 rounded text-xs transition',
                activeTab === tab ? 'bg-[var(--primary)] text-white' : 'bg-white/10 hover:bg-white/20'
              )}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      )}
      {/* Mobile tab bar */}
      <div className="flex sm:hidden overflow-x-auto border-b border-[var(--border)] bg-[var(--panel)]">
        {tabs.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-xs whitespace-nowrap transition border-b-2',
                activeTab === tab.id
                  ? 'border-[var(--primary)] text-[var(--primary)]'
                  : 'border-transparent text-[var(--muted)] hover:text-white'
              )}
            >
              <Icon size={14} />
              {tab.name}
            </button>
          )
        })}
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Settings Tabs - desktop sidebar */}
        <div className="hidden sm:block w-48 p-4 border-r border-[var(--border)]">
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left text-sm transition',
                  activeTab === tab.id
                    ? 'bg-[var(--primary)]/20 text-[var(--primary)]'
                    : 'text-[var(--muted)] hover:text-white hover:bg-white/5'
                )}
              >
                <Icon size={18} />
                <span className="truncate">{tab.name}</span>
              </button>
            )
          })}
        </div>

        {/* Settings Content */}
        <div className="flex-1 p-6 space-y-6 overflow-y-auto pb-safe" key={activeTab} style={{ animation: 'fadeIn 200ms ease' }}>
          {/* Library Tab */}
          {activeTab === 'library' && (
            <>
              <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5">
                <div className="text-sm font-semibold">Media folders</div>
                <div className="mt-3 space-y-2">
                  {mediaDirs.map((d: string) => (
                    <div key={d} className="flex items-center justify-between gap-3">
                      <div className="text-xs text-[var(--muted)] truncate">{d}</div>
                      <Btn
                        tone="danger"
                        title="Remove this folder from library scan"
                        onClick={async () => {
                          try {
                            const next = await window.api.settings.removeMediaDir(d)
                            props.patchSettings(next)
                          } catch (err) {
                            console.error('[Settings] Failed to remove media dir:', err)
                          }
                        }}
                      >
                        Remove
                      </Btn>
                    </div>
                  ))}
                  <Btn
                    title="Add a new folder to scan for media files"
                    onClick={async () => {
                      try {
                        const nextDir = await window.api.settings.chooseMediaDir()
                        if (!nextDir) return
                      } catch (err) {
                        console.error('[Settings] Failed to add media dir:', err)
                      }
                    }}
                  >
                    Add folder
                  </Btn>
                </div>
              </div>

              <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5">
                <div className="text-sm font-semibold">Cache folder</div>
                <div className="mt-2 text-xs text-[var(--muted)] truncate">{cacheDir}</div>
                <div className="mt-3">
                  <Btn
                    title="Set folder for thumbnails and temporary files"
                    onClick={async () => {
                      try {
                        const nextDir = await window.api.settings.chooseCacheDir()
                        if (!nextDir) return
                      } catch (err) {
                        console.error('[Settings] Failed to set cache dir:', err)
                      }
                    }}
                  >
                    Choose cache folder
                  </Btn>
                </div>
              </div>

              <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5">
                <div className="text-sm font-semibold mb-4">Thumbnail Quality</div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm">Quality Level</div>
                      <div className="text-xs text-[var(--muted)]">Higher quality uses more disk space but looks better</div>
                    </div>
                    <select
                      value={s?.library?.thumbnailQuality ?? 'medium'}
                      onChange={async (e) => {
                        try {
                          await window.api.settings.library?.update?.({ thumbnailQuality: e.target.value as 'low' | 'medium' | 'high' })
                        } catch (err) {
                          console.error('[Settings] Failed to update thumbnail quality:', err)
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg bg-black/30 border border-[var(--border)] text-sm focus:outline-none focus:border-white/20"
                    >
                      <option value="low">Low (faster, smaller files)</option>
                      <option value="medium">Medium (balanced)</option>
                      <option value="high">High (best quality)</option>
                    </select>
                  </div>
                  <div className="text-xs text-[var(--muted)]">
                    Changes apply to newly generated thumbnails. Existing thumbnails can be regenerated via the Scan Library button.
                  </div>
                  <div className="mt-4 pt-4 border-t border-[var(--border)]">
                    <Btn
                      tone="danger"
                      onClick={async () => {
                        {
                          const ok = await confirm({
                            title: 'Clear all cached thumbnails?',
                            body: 'Thumbnails will be regenerated automatically on the next scan. Frees disk space immediately.',
                            confirmLabel: 'Clear cache',
                            danger: true,
                          })
                          if (!ok) return
                        }
                        try {
                          const result = await window.api.cache?.clearThumbnails?.()
                          if (result?.success) {
                            showToast('success', `Cleared ${result.count} thumbnails (${formatBytes(result.freedBytes)} freed)`)
                          } else {
                            showToast('error', `Cache clear: ${(result as any)?.error ?? 'main process returned non-success'}`)
                          }
                        } catch (err: any) {
                          showToast('error', `Cache clear failed: ${err?.message ?? String(err)}`)
                        }
                      }}
                    >
                      Clear Thumbnail Cache
                    </Btn>
                  </div>
                </div>
              </div>

              {/* Performance Settings for Low-End PCs */}
              <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5">
                <div className="text-sm font-semibold mb-4">Performance (Low-End PC Options)</div>
                <div className="space-y-4">
                  {/* Video Preview Quality */}
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm">Video Preview Quality</div>
                      <div className="text-xs text-[var(--muted)]">Lower quality = faster hover preview loading</div>
                    </div>
                    <select
                      value={s?.library?.previewQuality ?? 'medium'}
                      onChange={async (e) => {
                        await window.api.settings.library?.update?.({ previewQuality: e.target.value as 'low' | 'medium' | 'high' })
                      }}
                      className="px-3 py-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-sm"
                    >
                      <option value="low">Low (360p, fastest)</option>
                      <option value="medium">Medium (480p)</option>
                      <option value="high">High (720p)</option>
                    </select>
                  </div>

                  {/* Disable Hover Previews */}
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm">Disable Hover Previews</div>
                      <div className="text-xs text-[var(--muted)]">Turn off video preview on hover (saves memory)</div>
                    </div>
                    <ToggleSwitch
                      checked={s?.library?.disableHoverPreviews ?? false}
                      onChange={async (v) => {
                        await window.api.settings.library?.update?.({ disableHoverPreviews: v })
                      }}
                    />
                  </div>

                  {/* Reduce Animations */}
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm">Reduce Animations</div>
                      <div className="text-xs text-[var(--muted)]">Disable smooth transitions and effects</div>
                    </div>
                    <ToggleSwitch
                      checked={s?.appearance?.reduceAnimations ?? false}
                      onChange={async (v) => {
                        await window.api.settings.appearance?.update?.({ reduceAnimations: v })
                        // Apply immediately
                        document.documentElement.setAttribute('data-reduce-motion', v ? 'true' : 'false')
                      }}
                    />
                  </div>

                  {/* Max Concurrent Videos */}
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm">Max Concurrent Videos</div>
                      <div className="text-xs text-[var(--muted)]">Limit videos playing at once (GoonWall)</div>
                    </div>
                    <select
                      value={s?.library?.maxConcurrentVideos ?? 9}
                      onChange={async (e) => {
                        await window.api.settings.library?.update?.({ maxConcurrentVideos: Number(e.target.value) })
                      }}
                      className="px-3 py-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-sm"
                    >
                      <option value="4">4 (low-end PC)</option>
                      <option value="6">6 (standard)</option>
                      <option value="9">9 (default)</option>
                      <option value="12">12 (high-end)</option>
                      <option value="16">16 (powerful PC)</option>
                    </select>
                  </div>

                  {/* Cache Size Limit */}
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm">Memory Cache Size</div>
                      <div className="text-xs text-[var(--muted)]">URL cache for faster thumbnail loading</div>
                    </div>
                    <select
                      value={s?.library?.memoryCacheSize ?? 2000}
                      onChange={async (e) => {
                        await window.api.settings.library?.update?.({ memoryCacheSize: Number(e.target.value) })
                      }}
                      className="px-3 py-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-sm"
                    >
                      <option value="500">500 (low memory)</option>
                      <option value="1000">1000 (standard)</option>
                      <option value="2000">2000 (default)</option>
                      <option value="5000">5000 (high memory)</option>
                    </select>
                  </div>

                  {/* Lazy Load Margin */}
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm">Preload Distance</div>
                      <div className="text-xs text-[var(--muted)]">How far ahead to preload thumbnails (pixels)</div>
                    </div>
                    <select
                      value={s?.library?.preloadMargin ?? 600}
                      onChange={async (e) => {
                        await window.api.settings.library?.update?.({ preloadMargin: Number(e.target.value) })
                      }}
                      className="px-3 py-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-sm"
                    >
                      <option value="200">200px (minimal preload)</option>
                      <option value="400">400px (low)</option>
                      <option value="600">600px (default)</option>
                      <option value="1000">1000px (aggressive)</option>
                    </select>
                  </div>
                </div>
              </div>

            </>
          )}


          {/* Appearance Tab */}
          {activeTab === 'appearance' && (
            <>
            <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-semibold">Appearance</div>
                <button
                  onClick={async () => {
                    const ok = await confirm({
                      title: 'Reset Appearance settings?',
                      body: 'All theme, color, and chrome customizations revert to defaults.',
                      confirmLabel: 'Reset',
                      danger: true,
                    })
                    if (ok) {
                      try {
                        const next = await window.api.settings.resetSection?.('appearance')
                        if (next) {
                          props.patchSettings(next)
                          showToast('success', 'Appearance settings reset')
                        }
                      } catch (err: any) {
                        console.error('Failed to reset appearance settings:', err)
                        showToast('error', err?.message ?? 'Failed to reset settings')
                      }
                    }
                  }}
                  className="text-xs px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[var(--muted)] hover:text-white transition"
                >
                  Reset to Defaults
                </button>
              </div>

              {/* Theme Selectors */}
              {(() => {
                const currentTheme = s?.appearance?.themeId ?? s?.ui?.themeId ?? 'obsidian'
                const goonThemes = GOON_THEME_LIST.map(g => ({ id: g.id, name: g.name, subtitle: g.vibe, colors: themes[g.id as ThemeId]?.colors }))
                const darkThemes = DARK_THEME_LIST.map(t => ({ id: t.id, name: t.name, subtitle: t.description, colors: t.colors }))
                const lightThemes = LIGHT_THEME_LIST.map(t => ({ id: t.id, name: t.name, subtitle: t.description, colors: t.colors }))
                const renderGrid = (items: Array<{ id: string; name: string; subtitle: string; colors: any }>) => (
                  <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
                    {items.map((t) => {
                      const active = currentTheme === t.id
                      const primary = t.colors?.primary || '#8b5cf6'
                      const gradient = t.colors?.gradient || `linear-gradient(135deg, ${primary}, ${t.colors?.secondary || '#ec4899'})`
                      return (
                        <button
                          key={t.id}
                          onClick={() => props.onThemeChange(t.id)}
                          className="group relative rounded-xl overflow-hidden transition-transform hover:scale-105"
                          style={{
                            border: active ? `2px solid ${primary}` : '2px solid rgba(255,255,255,0.08)',
                            boxShadow: active ? `0 0 12px ${primary}40` : 'none'
                          }}
                        >
                          <div className="h-16 w-full" style={{ background: gradient }} />
                          <div className="px-2.5 py-2 bg-black/80">
                            <div className="text-xs font-medium text-white/90 truncate">{t.name}</div>
                          </div>
                          {active && (
                            <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ background: primary }}>
                              <Check size={12} />
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )
                return (
                  <div className="space-y-4">
                    <div>
                      <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2 font-semibold">Goon Themes</div>
                      {renderGrid(goonThemes)}
                    </div>
                    <div>
                      <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2 font-semibold">Dark Themes</div>
                      {renderGrid(darkThemes)}
                    </div>
                    {lightThemes.length > 0 && (
                      <div>
                        <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2 font-semibold">Light Themes</div>
                        {renderGrid(lightThemes)}
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>

            {/* Additional Appearance Settings */}
            <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5 mt-4">
              <div className="text-sm font-semibold mb-4">Display Options</div>
              <div className="space-y-4">
                {/* Animation Speed */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">Animation Speed</div>
                    <div className="text-xs text-[var(--muted)]">Controls UI animations</div>
                  </div>
                  <select
                    value={s?.appearance?.animationSpeed ?? 'full'}
                    onChange={async (e) => {
                      await window.api.settings.appearance?.update?.({ animationSpeed: e.target.value as 'none' | 'reduced' | 'full' })
                    }}
                    className="bg-black/40 border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm"
                  >
                    <option value="full">Full</option>
                    <option value="reduced">Reduced</option>
                    <option value="none">None</option>
                  </select>
                </div>

                {/* Font Size */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">Font Size</div>
                    <div className="text-xs text-[var(--muted)]">Adjust text size</div>
                  </div>
                  <select
                    value={s?.appearance?.fontSize ?? 'medium'}
                    onChange={async (e) => {
                      await window.api.settings.appearance?.update?.({ fontSize: e.target.value as 'small' | 'medium' | 'large' })
                    }}
                    className="bg-black/40 border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm"
                  >
                    <option value="small">Small</option>
                    <option value="medium">Medium</option>
                    <option value="large">Large</option>
                  </select>
                </div>

                {/* Font Style */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">Font Style</div>
                    <div className="text-xs text-[var(--muted)]">App-wide text style</div>
                  </div>
                  <select
                    value={s?.appearance?.fontStyle ?? 'default'}
                    onChange={async (e) => {
                      const style = e.target.value
                      await window.api.settings.appearance?.update?.({ fontStyle: style })
                      // Apply font style to document
                      document.documentElement.setAttribute('data-font-style', style)
                    }}
                    className="bg-black/40 border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm"
                  >
                    <option value="default">Default (System)</option>
                    <option value="degrading">Degrading — Bowlby One</option>
                    <option value="80s-hacker">80s Hacker — VT323 terminal</option>
                    <option value="perverse">Perverse — Sacramento script</option>
                    <option value="neon">Neon — Audiowide</option>
                    <option value="retro">Retro — Monoton synthwave</option>
                    <option value="gothic">Gothic — Creepster</option>
                    <option value="cyberpunk">Cyberpunk — Wallpoet</option>
                    <option value="horror">Horror — Nosifer</option>
                    <option value="comic">Comic — Bangers</option>
                    <option value="elegant">Elegant — Playfair Display</option>
                  </select>
                </div>

                {/* Background Blobs Toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">Background blobs</div>
                    <div className="text-xs text-[var(--muted)]">Three soft floating color blurs in the page background</div>
                  </div>
                  <button
                    onClick={async () => {
                      const next = !(s?.appearance?.backgroundOrbs ?? true)
                      await window.api.settings.appearance?.update?.({ backgroundOrbs: next })
                      // No need to re-fetch — settings:changed broadcast
                      // updates App-level state automatically.
                    }}
                    className={cn(
                      'relative w-11 h-6 rounded-full transition',
                      (s?.appearance?.backgroundOrbs ?? true) ? 'bg-[var(--primary)]' : 'bg-white/15'
                    )}
                    aria-pressed={(s?.appearance?.backgroundOrbs ?? true)}
                  >
                    <span
                      className={cn(
                        'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all',
                        (s?.appearance?.backgroundOrbs ?? true) ? 'left-[22px]' : 'left-0.5'
                      )}
                    />
                  </button>
                </div>

                {/* Aurora Bands Toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">Aurora Bands</div>
                    <div className="text-xs text-[var(--muted)]">Flowing gradient ribbons drifting across the screen</div>
                  </div>
                  <button
                    onClick={async () => {
                      const next = !(s?.appearance?.auroraBands ?? false)
                      await window.api.settings.appearance?.update?.({ auroraBands: next })
                      // No need to re-fetch — settings:changed broadcast
                      // updates App-level state automatically.
                    }}
                    className={cn(
                      'relative w-11 h-6 rounded-full transition',
                      (s?.appearance?.auroraBands ?? false) ? 'bg-[var(--primary)]' : 'bg-white/15'
                    )}
                    aria-pressed={(s?.appearance?.auroraBands ?? false)}
                  >
                    <span
                      className={cn(
                        'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all',
                        (s?.appearance?.auroraBands ?? false) ? 'left-[22px]' : 'left-0.5'
                      )}
                    />
                  </button>
                </div>

                {/* Neon Rain Toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">Neon Rain</div>
                    <div className="text-xs text-[var(--muted)]">Falling neon vertical streaks in theme colors</div>
                  </div>
                  <button
                    onClick={async () => {
                      const next = !(s?.appearance?.neonRain ?? false)
                      await window.api.settings.appearance?.update?.({ neonRain: next })
                      // No need to re-fetch — settings:changed broadcast
                      // updates App-level state automatically.
                    }}
                    className={cn(
                      'relative w-11 h-6 rounded-full transition',
                      (s?.appearance?.neonRain ?? false) ? 'bg-[var(--primary)]' : 'bg-white/15'
                    )}
                    aria-pressed={(s?.appearance?.neonRain ?? false)}
                  >
                    <span
                      className={cn(
                        'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all',
                        (s?.appearance?.neonRain ?? false) ? 'left-[22px]' : 'left-0.5'
                      )}
                    />
                  </button>
                </div>

                {/* Lightning Veil Toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">Lightning Veil</div>
                    <div className="text-xs text-[var(--muted)]">Occasional screen-wide flashes with branching bolts</div>
                  </div>
                  <button
                    onClick={async () => {
                      const next = !(s?.appearance?.lightningVeil ?? false)
                      await window.api.settings.appearance?.update?.({ lightningVeil: next })
                      // No need to re-fetch — settings:changed broadcast
                      // updates App-level state automatically.
                    }}
                    className={cn(
                      'relative w-11 h-6 rounded-full transition',
                      (s?.appearance?.lightningVeil ?? false) ? 'bg-[var(--primary)]' : 'bg-white/15'
                    )}
                    aria-pressed={(s?.appearance?.lightningVeil ?? false)}
                  >
                    <span
                      className={cn(
                        'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all',
                        (s?.appearance?.lightningVeil ?? false) ? 'left-[22px]' : 'left-0.5'
                      )}
                    />
                  </button>
                </div>

                {/* Color Blind Mode */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">Color Blind Mode</div>
                    <div className="text-xs text-[var(--muted)]">Accessibility color adjustments</div>
                  </div>
                  <select
                    value={s?.appearance?.colorBlindMode ?? 'none'}
                    onChange={async (e) => {
                      await window.api.settings.appearance?.update?.({ colorBlindMode: e.target.value as 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia' | 'high-contrast' })
                    }}
                    className="bg-black/40 border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm"
                  >
                    <option value="none">None</option>
                    <option value="protanopia">Protanopia (Red-blind)</option>
                    <option value="deuteranopia">Deuteranopia (Green-blind)</option>
                    <option value="tritanopia">Tritanopia (Blue-blind)</option>
                    <option value="high-contrast">High Contrast</option>
                  </select>
                </div>

                {/* Thumbnail Size */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">Thumbnail Size</div>
                    <div className="text-xs text-[var(--muted)]">Default thumbnail display size</div>
                  </div>
                  <select
                    value={s?.appearance?.thumbnailSize ?? 'medium'}
                    onChange={async (e) => {
                      await window.api.settings.appearance?.update?.({ thumbnailSize: e.target.value as 'small' | 'medium' | 'large' })
                    }}
                    className="bg-black/40 border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm"
                  >
                    <option value="small">Small</option>
                    <option value="medium">Medium</option>
                    <option value="large">Large</option>
                  </select>
                </div>

                {/* Accent Color */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">Accent Color</div>
                    <div className="text-xs text-[var(--muted)]">Custom accent highlight</div>
                  </div>
                  <input
                    type="color"
                    value={s?.appearance?.accentColor ?? '#ff6b9d'}
                    onChange={async (e) => {
                      await window.api.settings.appearance?.update?.({ accentColor: e.target.value })
                    }}
                    className="w-10 h-8 rounded cursor-pointer border border-[var(--border)]"
                  />
                </div>

                {/* Compact Mode */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">Compact Mode</div>
                    <div className="text-xs text-[var(--muted)]">Reduce spacing and padding</div>
                  </div>
                  <ToggleSwitch
                    checked={s?.appearance?.compactMode ?? false}
                    onChange={async (v) => {
                      await window.api.settings.appearance?.update?.({ compactMode: v })
                    }}
                  />
                </div>
              </div>
            </div>

            {/* #159 — Customizable card metadata + Home section order */}
            <CardLayoutCustomizer />
            </>
          )}

          {/* Visual Effects Tab */}
          {activeTab === 'effects' && (
            <>
            <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5">
              <div className="text-sm font-semibold mb-4">Visual Effects</div>
              <div className="space-y-4">
                {/* Master Toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">Enable Visual Effects</div>
                    <div className="text-xs text-[var(--muted)]">Master toggle for all overlays</div>
                  </div>
                  <ToggleSwitch
                    checked={props.visualEffects.enabled}
                    onChange={props.onVisualEffectsChange.setEnabled}
                  />
                </div>

                {/* Heat Level Slider */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">Heat Level</div>
                    <div className="text-xs text-[var(--muted)]">Ambient arousal intensity (0-10)</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={0}
                      max={10}
                      step={1}
                      value={props.visualEffects.heatLevel}
                      onChange={(e) => props.onVisualEffectsChange.setHeatLevel(Number(e.target.value))}
                      className="w-24 h-1 accent-[var(--primary)] cursor-pointer"
                      disabled={!props.visualEffects.enabled}
                    />
                    <span className="text-xs text-[var(--muted)] w-6 text-right">{props.visualEffects.heatLevel}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5 mt-4">
              <div className="text-sm font-semibold mb-4">Ambient Overlays</div>
              <div className="space-y-4">
                {/* Sparkles */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">✨ Sparkles</div>
                    <div className="text-xs text-[var(--muted)]">Floating glitter particles</div>
                  </div>
                  <ToggleSwitch
                    checked={props.visualEffects.sparkles}
                    onChange={props.onVisualEffectsChange.setSparkles}
                  />
                </div>

                {/* Bokeh */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">💫 Bokeh Lights</div>
                    <div className="text-xs text-[var(--muted)]">Soft, dreamy light circles</div>
                  </div>
                  <ToggleSwitch
                    checked={props.visualEffects.bokeh}
                    onChange={props.onVisualEffectsChange.setBokeh}
                  />
                </div>

                {/* Starfield */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">⭐ Starfield</div>
                    <div className="text-xs text-[var(--muted)]">Twinkling stars in background</div>
                  </div>
                  <ToggleSwitch
                    checked={props.visualEffects.starfield}
                    onChange={props.onVisualEffectsChange.setStarfield}
                  />
                </div>

                {/* Film Grain */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">🎞️ Film Grain</div>
                    <div className="text-xs text-[var(--muted)]">Vintage film texture overlay</div>
                  </div>
                  <ToggleSwitch
                    checked={props.visualEffects.filmGrain}
                    onChange={props.onVisualEffectsChange.setFilmGrain}
                  />
                </div>

                {/* Dreamy Haze */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">🌫️ Dreamy Haze</div>
                    <div className="text-xs text-[var(--muted)]">Soft, ethereal blur effect</div>
                  </div>
                  <ToggleSwitch
                    checked={props.visualEffects.dreamyHaze}
                    onChange={props.onVisualEffectsChange.setDreamyHaze}
                  />
                </div>

                {/* CRT Curved Screen */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">📺 CRT Curved Screen</div>
                    <div className="text-xs text-[var(--muted)]">Retro curved monitor effect</div>
                  </div>
                  <ToggleSwitch
                    checked={props.visualEffects.crtCurve}
                    onChange={props.onVisualEffectsChange.setCrtCurve}
                  />
                </div>

                {/* CRT sub-options - only show when CRT is enabled */}
                {props.visualEffects.crtCurve && (
                  <>
                    {/* Curve Intensity */}
                    <div className="flex items-center justify-between pl-4">
                      <div>
                        <div className="text-sm text-[var(--muted)]">Curve Intensity</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min={1}
                          max={10}
                          step={1}
                          value={props.visualEffects.crtIntensity}
                          onChange={(e) => props.onVisualEffectsChange.setCrtIntensity(Number(e.target.value))}
                          className="w-20 h-1 accent-[var(--primary)] cursor-pointer"
                        />
                        <span className="text-xs text-[var(--muted)] w-6 text-right">{props.visualEffects.crtIntensity}</span>
                      </div>
                    </div>

                    {/* RGB Subpixels */}
                    <div className="flex items-center justify-between pl-4">
                      <div>
                        <div className="text-sm text-[var(--muted)]">RGB Subpixels</div>
                        <div className="text-xs text-[var(--muted)]/70">Vertical RGB stripe pattern</div>
                      </div>
                      <ToggleSwitch
                        checked={props.visualEffects.crtRgbSubpixels}
                        onChange={props.onVisualEffectsChange.setCrtRgbSubpixels}
                      />
                    </div>

                    {/* Chromatic Aberration */}
                    <div className="flex items-center justify-between pl-4">
                      <div>
                        <div className="text-sm text-[var(--muted)]">Color Bleed</div>
                        <div className="text-xs text-[var(--muted)]/70">RGB separation at edges</div>
                      </div>
                      <ToggleSwitch
                        checked={props.visualEffects.crtChromaticAberration}
                        onChange={props.onVisualEffectsChange.setCrtChromaticAberration}
                      />
                    </div>

                    {/* Screen Flicker */}
                    <div className="flex items-center justify-between pl-4">
                      <div>
                        <div className="text-sm text-[var(--muted)]">Screen Flicker</div>
                        <div className="text-xs text-[var(--muted)]/70">Random brightness variations</div>
                      </div>
                      <ToggleSwitch
                        checked={props.visualEffects.crtScreenFlicker}
                        onChange={props.onVisualEffectsChange.setCrtScreenFlicker}
                      />
                    </div>

                    {/* CRT Glitch Overlay */}
                    <div className="flex items-center justify-between pl-4">
                      <div>
                        <div className="text-sm text-[var(--muted)]">Glitch Overlay</div>
                        <div className="text-xs text-[var(--muted)]/70">Animated VHS/CRT glitch effect</div>
                      </div>
                      <select
                        value={props.visualEffects.crtGlitchGif ?? 'none'}
                        onChange={(e) => {
                          const val = e.target.value === 'none' ? null : Number(e.target.value)
                          props.onVisualEffectsChange.setCrtGlitchGif(val)
                        }}
                        className="px-3 py-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-sm"
                      >
                        <option value="none">None</option>
                        <option value="0">Glitch Style 1</option>
                        <option value="1">Glitch Style 2</option>
                        <option value="2">Glitch Style 3</option>
                      </select>
                    </div>
                  </>
                )}

                {/* TV Border with Glass */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">📺 TV Border</div>
                    <div className="text-xs text-[var(--muted)]">Retro TV frame with glass effect</div>
                  </div>
                  <ToggleSwitch
                    checked={props.visualEffects.tvBorder}
                    onChange={props.onVisualEffectsChange.setTvBorder}
                  />
                </div>

                {props.visualEffects.tvBorder && (
                  <>
                    {/* TV Border Style */}
                    <div className="flex items-center justify-between pl-4">
                      <div>
                        <div className="text-sm text-[var(--muted)]">Border Style</div>
                      </div>
                      <select
                        value={props.visualEffects.tvBorderStyle}
                        onChange={(e) => props.onVisualEffectsChange.setTvBorderStyle(e.target.value as 'classic' | 'modern' | 'retro' | 'minimal')}
                        className="px-3 py-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-sm"
                      >
                        <option value="classic">Classic</option>
                        <option value="retro">Retro Wood</option>
                        <option value="modern">Modern Slim</option>
                        <option value="minimal">Minimal</option>
                      </select>
                    </div>

                    {/* Glass Effect Toggle */}
                    <div className="flex items-center justify-between pl-4">
                      <div>
                        <div className="text-sm text-[var(--muted)]">Glass Reflection</div>
                      </div>
                      <ToggleSwitch
                        checked={props.visualEffects.tvBorderGlass}
                        onChange={props.onVisualEffectsChange.setTvBorderGlass}
                      />
                    </div>

                    {/* Glass Opacity */}
                    {props.visualEffects.tvBorderGlass && (
                      <div className="flex items-center justify-between pl-4">
                        <div className="text-sm text-[var(--muted)]">Glass Intensity</div>
                        <input
                          type="range"
                          min={0.05}
                          max={0.4}
                          step={0.05}
                          value={props.visualEffects.tvBorderGlassOpacity}
                          onChange={(e) => props.onVisualEffectsChange.setTvBorderGlassOpacity(Number(e.target.value))}
                          className="w-24 h-1 accent-[var(--primary)]"
                        />
                      </div>
                    )}

                    {/* Border Padding */}
                    <div className="flex items-center justify-between pl-4">
                      <div className="text-sm text-[var(--muted)]">Border Size</div>
                      <input
                        type="range"
                        min={1}
                        max={8}
                        step={0.5}
                        value={props.visualEffects.tvBorderPadding}
                        onChange={(e) => props.onVisualEffectsChange.setTvBorderPadding(Number(e.target.value))}
                        className="w-24 h-1 accent-[var(--primary)]"
                      />
                    </div>
                  </>
                )}

                {/* Pip-Boy / Fallout Style */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">☢️ Pip-Boy Mode</div>
                    <div className="text-xs text-[var(--muted)]">Fallout-style terminal overlay</div>
                  </div>
                  <ToggleSwitch
                    checked={props.visualEffects.pipBoy}
                    onChange={props.onVisualEffectsChange.setPipBoy}
                  />
                </div>

                {props.visualEffects.pipBoy && (
                  <>
                    {/* Pip-Boy Color */}
                    <div className="flex items-center justify-between pl-4">
                      <div>
                        <div className="text-sm text-[var(--muted)]">Phosphor Color</div>
                      </div>
                      <select
                        value={props.visualEffects.pipBoyColor}
                        onChange={(e) => props.onVisualEffectsChange.setPipBoyColor(e.target.value as 'green' | 'amber' | 'blue' | 'white')}
                        className="px-3 py-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-sm"
                      >
                        <option value="green">Green (Classic)</option>
                        <option value="amber">Amber (Warm)</option>
                        <option value="blue">Blue (Cool)</option>
                        <option value="white">White (Terminal)</option>
                      </select>
                    </div>

                    {/* Pip-Boy Intensity */}
                    <div className="flex items-center justify-between pl-4">
                      <div className="text-sm text-[var(--muted)]">Intensity</div>
                      <input
                        type="range"
                        min={1}
                        max={10}
                        step={1}
                        value={props.visualEffects.pipBoyIntensity}
                        onChange={(e) => props.onVisualEffectsChange.setPipBoyIntensity(Number(e.target.value))}
                        className="w-24 h-1 accent-[var(--primary)]"
                      />
                    </div>
                  </>
                )}

                {/* Hearts */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">💕 Hearts</div>
                    <div className="text-xs text-[var(--muted)]">Floating hearts rising upward</div>
                  </div>
                  <ToggleSwitch
                    checked={props.visualEffects.hearts}
                    onChange={props.onVisualEffectsChange.setHearts}
                  />
                </div>

                {/* Rain */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">🌧️ Rain</div>
                    <div className="text-xs text-[var(--muted)]">Raindrops on glass effect</div>
                  </div>
                  <ToggleSwitch
                    checked={props.visualEffects.rain}
                    onChange={props.onVisualEffectsChange.setRain}
                  />
                </div>

                {/* Glitch */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">⚡ Glitch</div>
                    <div className="text-xs text-[var(--muted)]">RGB split and screen jitter</div>
                  </div>
                  <ToggleSwitch
                    checked={props.visualEffects.glitch}
                    onChange={props.onVisualEffectsChange.setGlitch}
                  />
                </div>

                {/* Bubbles */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">🫧 Bubbles</div>
                    <div className="text-xs text-[var(--muted)]">Floating bubbles</div>
                  </div>
                  <ToggleSwitch
                    checked={props.visualEffects.bubbles}
                    onChange={props.onVisualEffectsChange.setBubbles}
                  />
                </div>

                {/* Matrix Rain */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">🖥️ Matrix Rain</div>
                    <div className="text-xs text-[var(--muted)]">Falling green characters</div>
                  </div>
                  <ToggleSwitch
                    checked={props.visualEffects.matrix}
                    onChange={props.onVisualEffectsChange.setMatrix}
                  />
                </div>

                {/* Confetti */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">🎊 Confetti</div>
                    <div className="text-xs text-[var(--muted)]">Celebration particles</div>
                  </div>
                  <ToggleSwitch
                    checked={props.visualEffects.confetti}
                    onChange={props.onVisualEffectsChange.setConfetti}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5 mt-4">
              <div className="text-sm font-semibold mb-4">Goon Wall Effects</div>
              <div className="space-y-4">
                {/* Heat Overlay */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">🔥 Heat Overlay</div>
                    <div className="text-xs text-[var(--muted)]">Screen warms redder over time</div>
                  </div>
                  <ToggleSwitch
                    checked={s?.goonwall?.visualEffects?.heatOverlay ?? true}
                    onChange={async (v) => {
                      await window.api.settings.goonwall?.update?.({ visualEffects: { ...s?.goonwall?.visualEffects, heatOverlay: v } })
                    }}
                  />
                </div>

                {/* Vignette Intensity */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">Vignette</div>
                    <div className="text-xs text-[var(--muted)]">Dark edges focus attention</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.1}
                      value={s?.goonwall?.visualEffects?.vignetteIntensity ?? 0.3}
                      onChange={async (e) => {
                        await window.api.settings.goonwall?.update?.({ visualEffects: { ...s?.goonwall?.visualEffects, vignetteIntensity: Number(e.target.value) } })
                      }}
                      className="w-20 h-1 accent-[var(--primary)] cursor-pointer"
                    />
                    <span className="text-xs text-[var(--muted)] w-8">{((s?.goonwall?.visualEffects?.vignetteIntensity ?? 0.3) * 100).toFixed(0)}%</span>
                  </div>
                </div>

                {/* Bloom Intensity */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">Bloom</div>
                    <div className="text-xs text-[var(--muted)]">Soft glow effect</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.1}
                      value={s?.goonwall?.visualEffects?.bloomIntensity ?? 0.1}
                      onChange={async (e) => {
                        await window.api.settings.goonwall?.update?.({ visualEffects: { ...s?.goonwall?.visualEffects, bloomIntensity: Number(e.target.value) } })
                      }}
                      className="w-20 h-1 accent-[var(--primary)] cursor-pointer"
                    />
                    <span className="text-xs text-[var(--muted)] w-8">{((s?.goonwall?.visualEffects?.bloomIntensity ?? 0.1) * 100).toFixed(0)}%</span>
                  </div>
                </div>

                {/* Saturation Boost */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">Saturation</div>
                    <div className="text-xs text-[var(--muted)]">Color intensity boost</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={0.5}
                      max={2}
                      step={0.1}
                      value={s?.goonwall?.visualEffects?.saturationBoost ?? 1.1}
                      onChange={async (e) => {
                        await window.api.settings.goonwall?.update?.({ visualEffects: { ...s?.goonwall?.visualEffects, saturationBoost: Number(e.target.value) } })
                      }}
                      className="w-20 h-1 accent-[var(--primary)] cursor-pointer"
                    />
                    <span className="text-xs text-[var(--muted)] w-8">{(s?.goonwall?.visualEffects?.saturationBoost ?? 1.1).toFixed(1)}x</span>
                  </div>
                </div>

                {/* Contrast Boost */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">Contrast</div>
                    <div className="text-xs text-[var(--muted)]">Light/dark intensity</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={0.5}
                      max={2}
                      step={0.1}
                      value={s?.goonwall?.visualEffects?.contrastBoost ?? 1.0}
                      onChange={async (e) => {
                        await window.api.settings.goonwall?.update?.({ visualEffects: { ...s?.goonwall?.visualEffects, contrastBoost: Number(e.target.value) } })
                      }}
                      className="w-20 h-1 accent-[var(--primary)] cursor-pointer"
                    />
                    <span className="text-xs text-[var(--muted)] w-8">{(s?.goonwall?.visualEffects?.contrastBoost ?? 1.0).toFixed(1)}x</span>
                  </div>
                </div>
              </div>
            </div>

            {/* GoonWall-specific subliminal flash + edge timer. NOT the
                same as the global Visual Effects → Goon Words system —
                that one floats words across every page; this one flashes
                them on GoonWall tiles only. Title made explicit + cross-
                linked so the two features stop reading as redundant. */}
            <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5 mt-4">
              <div className="text-sm font-semibold mb-1">GoonWall focus mode</div>
              <div className="text-[11px] text-[var(--muted)] mb-3">
                Subliminal flash overlay on GoonWall tiles + an edge timer.
                Want floating words across every page instead? Use
                <span className="text-[var(--primary)] font-medium"> Visual Effects → Goon Words</span>.
              </div>
              <div className="space-y-5">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm">✨ Subliminal flash (GoonWall-only)</div>
                      <div className="text-xs text-[var(--muted)]">Flash short phrases over wall tiles at a hypnotic cadence</div>
                    </div>
                    <ToggleSwitch
                      checked={s?.goonwall?.hypnoMode?.enabled ?? false}
                      onChange={async (v) => {
                        await window.api.settings.goonwall?.update?.({ hypnoMode: { ...s?.goonwall?.hypnoMode, enabled: v } })
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm">Frequency</div>
                      <div className="text-xs text-[var(--muted)]">Flashes per minute (±25% jitter)</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={1}
                        max={30}
                        step={1}
                        value={s?.goonwall?.hypnoMode?.textFrequency ?? 5}
                        onChange={async (e) => {
                          await window.api.settings.goonwall?.update?.({ hypnoMode: { ...s?.goonwall?.hypnoMode, textFrequency: Number(e.target.value) } })
                        }}
                        className="w-32 h-1 accent-fuchsia-400 cursor-pointer"
                      />
                      <span className="text-xs text-[var(--muted)] w-10 tabular-nums">{s?.goonwall?.hypnoMode?.textFrequency ?? 5}/min</span>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="text-xs text-[var(--muted)]">Phrases (comma-separated)</div>
                      <button
                        onClick={async () => {
                          // Quick-reset to the canonical default list
                          // so users who erased everything can recover.
                          await window.api.settings.goonwall?.update?.({
                            hypnoMode: {
                              ...s?.goonwall?.hypnoMode,
                              subliminalText: ['GOON', 'EDGE', 'DEEPER', 'STROKE', 'LEAK', 'OBEY', 'SUBMIT'],
                            },
                          })
                        }}
                        className="text-[10px] text-fuchsia-300 hover:text-fuchsia-200 underline"
                      >
                        reset
                      </button>
                    </div>
                    <textarea
                      rows={2}
                      value={(s?.goonwall?.hypnoMode?.subliminalText ?? []).join(', ')}
                      onChange={async (e) => {
                        const phrases = e.target.value.split(',').map((p) => p.trim()).filter(Boolean)
                        await window.api.settings.goonwall?.update?.({ hypnoMode: { ...s?.goonwall?.hypnoMode, subliminalText: phrases } })
                      }}
                      placeholder="GOON, EDGE, DEEPER, OBEY..."
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs font-mono uppercase tracking-wider"
                    />
                  </div>
                </div>

                <div className="border-t border-white/5 pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm">⏱ Edge timer</div>
                      <div className="text-xs text-[var(--muted)]">Auto-pause / shuffle / cool-down at intervals</div>
                    </div>
                    <ToggleSwitch
                      checked={s?.goonwall?.edgeTimer?.enabled ?? false}
                      onChange={async (v) => {
                        await window.api.settings.goonwall?.update?.({ edgeTimer: { ...s?.goonwall?.edgeTimer, enabled: v } })
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm">Interval</div>
                      <div className="text-xs text-[var(--muted)]">Seconds between fires</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={30}
                        max={600}
                        step={15}
                        value={s?.goonwall?.edgeTimer?.interval ?? 120}
                        onChange={async (e) => {
                          await window.api.settings.goonwall?.update?.({ edgeTimer: { ...s?.goonwall?.edgeTimer, interval: Number(e.target.value) } })
                        }}
                        className="w-32 h-1 accent-amber-400 cursor-pointer"
                      />
                      <span className="text-xs text-[var(--muted)] w-12 tabular-nums">
                        {(() => {
                          const sec = s?.goonwall?.edgeTimer?.interval ?? 120
                          return sec >= 60 ? `${Math.floor(sec / 60)}:${(sec % 60).toString().padStart(2, '0')}` : `${sec}s`
                        })()}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm">Warning</div>
                      <div className="text-xs text-[var(--muted)]">Seconds before fire to flash a warning</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={0}
                        max={30}
                        step={1}
                        value={s?.goonwall?.edgeTimer?.warningTime ?? 10}
                        onChange={async (e) => {
                          await window.api.settings.goonwall?.update?.({ edgeTimer: { ...s?.goonwall?.edgeTimer, warningTime: Number(e.target.value) } })
                        }}
                        className="w-32 h-1 accent-amber-400 cursor-pointer"
                      />
                      <span className="text-xs text-[var(--muted)] w-10 tabular-nums">{s?.goonwall?.edgeTimer?.warningTime ?? 10}s</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm">Action</div>
                      <div className="text-xs text-[var(--muted)]">What fires when the timer hits zero</div>
                    </div>
                    <select
                      value={s?.goonwall?.edgeTimer?.action ?? 'pause'}
                      onChange={async (e) => {
                        await window.api.settings.goonwall?.update?.({ edgeTimer: { ...s?.goonwall?.edgeTimer, action: e.target.value as any } })
                      }}
                      className="px-2 py-1 rounded bg-black/40 border border-white/10 text-xs"
                    >
                      <option value="pause">Pause (mute)</option>
                      <option value="shuffle">Shuffle tiles</option>
                      <option value="minimize">Minimize (hide HUD)</option>
                      <option value="cooldown">5s cool-down overlay</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* GoonWords Settings */}
            <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5 mt-4">
              <div className="text-sm font-semibold mb-4">GoonWords (Floating Text)</div>
              <div className="space-y-4">
                {/* Master Toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">Enable GoonWords</div>
                    <div className="text-xs text-[var(--muted)]">Floating provocative text overlays</div>
                  </div>
                  <ToggleSwitch
                    checked={s?.visualEffects?.goonWords?.enabled ?? false}
                    onChange={async (v) => {
                      const current = s?.visualEffects?.goonWords ?? {}
                      await window.api.settings.visualEffects?.update?.({ goonWords: { ...current, enabled: v } })
                    }}
                  />
                </div>

                {s?.visualEffects?.goonWords?.enabled && (
                  <>
                    {/* Word Pack Toggles */}
                    <div className="pt-2">
                      <div className="text-sm mb-2">Word Packs</div>
                      <div className="grid grid-cols-2 gap-2">
                        {(['praise', 'humiliation', 'kink', 'goon', 'mommy', 'brat', 'insult', 'pervert', 'seduction', 'dirty', 'worship', 'denial', 'encouragement'] as const).map(packId => {
                          const packNames: Record<string, string> = {
                            praise: '💕 Praise',
                            humiliation: '😈 Humiliation',
                            kink: '⛓️ Kink',
                            goon: '🧠 Goon',
                            mommy: '👩 Mommy',
                            brat: '😤 Brat',
                            insult: '🔥 Insult',
                            pervert: '👀 Pervert',
                            seduction: '💋 Seduction',
                            dirty: '🔞 Dirty Talk',
                            worship: '🙏 Worship',
                            denial: '🚫 Denial',
                            encouragement: '✨ Encourage'
                          }
                          const enabledPacks = s?.visualEffects?.goonWords?.enabledPacks ?? ['goon', 'kink']
                          const isEnabled = enabledPacks.includes(packId)
                          return (
                            <button
                              key={packId}
                              onClick={async () => {
                                const current = s?.visualEffects?.goonWords ?? {}
                                const newPacks = isEnabled
                                  ? enabledPacks.filter((p: string) => p !== packId)
                                  : [...enabledPacks, packId]
                                await window.api.settings.visualEffects?.update?.({ goonWords: { ...current, enabledPacks: newPacks } })
                              }}
                              className={`px-3 py-1.5 rounded-lg text-xs transition-all ${
                                isEnabled
                                  ? 'bg-[var(--primary)] text-white'
                                  : 'bg-white/5 text-[var(--muted)] hover:bg-white/10'
                              }`}
                            >
                              {packNames[packId]}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* Intensity Slider */}
                    <div className="flex items-center justify-between pt-2">
                      <div>
                        <div className="text-sm">Intensity</div>
                        <div className="text-xs text-[var(--muted)]">Word size & frequency</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min={1}
                          max={10}
                          step={1}
                          value={s?.visualEffects?.goonWords?.intensity ?? 5}
                          onChange={async (e) => {
                            const current = s?.visualEffects?.goonWords ?? {}
                            await window.api.settings.visualEffects?.update?.({ goonWords: { ...current, intensity: Number(e.target.value) } })
                          }}
                          className="w-20 h-1 accent-[var(--primary)] cursor-pointer"
                        />
                        <span className="text-xs text-[var(--muted)] w-6 text-right">{s?.visualEffects?.goonWords?.intensity ?? 5}</span>
                      </div>
                    </div>

                    {/* Font Size Slider */}
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm">Font Size</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min={16}
                          max={64}
                          step={4}
                          value={s?.visualEffects?.goonWords?.fontSize ?? 32}
                          onChange={async (e) => {
                            const current = s?.visualEffects?.goonWords ?? {}
                            await window.api.settings.visualEffects?.update?.({ goonWords: { ...current, fontSize: Number(e.target.value) } })
                          }}
                          className="w-20 h-1 accent-[var(--primary)] cursor-pointer"
                        />
                        <span className="text-xs text-[var(--muted)] w-8">{s?.visualEffects?.goonWords?.fontSize ?? 32}px</span>
                      </div>
                    </div>

                    {/* Font Family */}
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm">Font Style</div>
                        <div className="text-xs text-[var(--muted)]">Choose the vibe</div>
                      </div>
                      <select
                        value={s?.visualEffects?.goonWords?.fontFamily ?? 'system-ui'}
                        onChange={async (e) => {
                          const current = s?.visualEffects?.goonWords ?? {}
                          await window.api.settings.visualEffects?.update?.({ goonWords: { ...current, fontFamily: e.target.value } })
                        }}
                        className="bg-black/30 border border-[var(--border)] rounded-lg px-2 py-1 text-sm"
                      >
                        <optgroup label="Bold & Impactful">
                          <option value="Impact">Impact (Meme Style)</option>
                          <option value="Arial Black">Arial Black</option>
                          <option value="system-ui">System Default</option>
                        </optgroup>
                        <optgroup label="Sexy & Elegant">
                          <option value="Georgia">Georgia (Classy)</option>
                          <option value="Palatino Linotype">Palatino (Elegant)</option>
                          <option value="Brush Script MT">Brush Script (Feminine)</option>
                        </optgroup>
                        <optgroup label="Edgy & Dark">
                          <option value="Courier New">Courier (Hacker)</option>
                          <option value="Lucida Console">Console (Digital)</option>
                          <option value="Trebuchet MS">Trebuchet (Modern)</option>
                        </optgroup>
                        <optgroup label="Fun & Playful">
                          <option value="Comic Sans MS">Comic Sans (Silly)</option>
                          <option value="Segoe Script">Segoe Script (Handwritten)</option>
                          <option value="Papyrus">Papyrus (Exotic)</option>
                        </optgroup>
                      </select>
                    </div>

                    {/* Color Presets */}
                    <div className="pt-2">
                      <div className="text-sm mb-2">Color Presets</div>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { name: 'Hot Pink', text: '#ffffff', glow: '#ff6b9d' },
                          { name: 'Neon Purple', text: '#e0aaff', glow: '#9d4edd' },
                          { name: 'Fire', text: '#ffcc00', glow: '#ff5500' },
                          { name: 'Ice', text: '#ffffff', glow: '#00d4ff' },
                          { name: 'Blood', text: '#ff0000', glow: '#8b0000' },
                          { name: 'Matrix', text: '#00ff00', glow: '#003300' },
                          { name: 'Gold', text: '#ffd700', glow: '#b8860b' },
                          { name: 'Demon', text: '#ff0066', glow: '#330000' },
                        ].map(preset => (
                          <button
                            key={preset.name}
                            onClick={async () => {
                              const current = s?.visualEffects?.goonWords ?? {}
                              await window.api.settings.visualEffects?.update?.({
                                goonWords: { ...current, fontColor: preset.text, glowColor: preset.glow }
                              })
                            }}
                            className="px-2 py-1 rounded text-xs transition hover:scale-105"
                            style={{
                              background: `linear-gradient(135deg, ${preset.glow}40, ${preset.glow}20)`,
                              border: `1px solid ${preset.glow}60`,
                              color: preset.text,
                              textShadow: `0 0 8px ${preset.glow}`
                            }}
                          >
                            {preset.name}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Text Color & Glow Color */}
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm">Colors</div>
                        <div className="text-xs text-[var(--muted)]">Text & Glow</div>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={s?.visualEffects?.goonWords?.fontColor ?? '#ffffff'}
                          onChange={async (e) => {
                            const current = s?.visualEffects?.goonWords ?? {}
                            await window.api.settings.visualEffects?.update?.({ goonWords: { ...current, fontColor: e.target.value } })
                          }}
                          className="w-8 h-8 rounded cursor-pointer border-0"
                          title="Text Color"
                        />
                        <input
                          type="color"
                          value={s?.visualEffects?.goonWords?.glowColor ?? '#ff6b9d'}
                          onChange={async (e) => {
                            const current = s?.visualEffects?.goonWords ?? {}
                            await window.api.settings.visualEffects?.update?.({ goonWords: { ...current, glowColor: e.target.value } })
                          }}
                          className="w-8 h-8 rounded cursor-pointer border-0"
                          title="Glow Color"
                        />
                      </div>
                    </div>

                    {/* Frequency Slider */}
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm">Frequency</div>
                        <div className="text-xs text-[var(--muted)]">Seconds between words</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min={1}
                          max={10}
                          step={1}
                          value={s?.visualEffects?.goonWords?.frequency ?? 5}
                          onChange={async (e) => {
                            const current = s?.visualEffects?.goonWords ?? {}
                            await window.api.settings.visualEffects?.update?.({ goonWords: { ...current, frequency: Number(e.target.value) } })
                          }}
                          className="w-20 h-1 accent-[var(--primary)] cursor-pointer"
                        />
                        <span className="text-xs text-[var(--muted)] w-6 text-right">{s?.visualEffects?.goonWords?.frequency ?? 5}s</span>
                      </div>
                    </div>

                    {/* Duration Slider */}
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm">Duration</div>
                        <div className="text-xs text-[var(--muted)]">How long words stay</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min={1}
                          max={8}
                          step={0.5}
                          value={s?.visualEffects?.goonWords?.duration ?? 3}
                          onChange={async (e) => {
                            const current = s?.visualEffects?.goonWords ?? {}
                            await window.api.settings.visualEffects?.update?.({ goonWords: { ...current, duration: Number(e.target.value) } })
                          }}
                          className="w-20 h-1 accent-[var(--primary)] cursor-pointer"
                        />
                        <span className="text-xs text-[var(--muted)] w-6 text-right">{s?.visualEffects?.goonWords?.duration ?? 3}s</span>
                      </div>
                    </div>

                    {/* Random Rotation Toggle */}
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm">Random Rotation</div>
                        <div className="text-xs text-[var(--muted)]">Tilt words randomly</div>
                      </div>
                      <ToggleSwitch
                        checked={s?.visualEffects?.goonWords?.randomRotation ?? true}
                        onChange={async (v) => {
                          const current = s?.visualEffects?.goonWords ?? {}
                          await window.api.settings.visualEffects?.update?.({ goonWords: { ...current, randomRotation: v } })
                        }}
                      />
                    </div>

                    {/* Custom Words */}
                    <div className="pt-2">
                      <div className="text-sm mb-2">Custom Words</div>
                      <textarea
                        value={(s?.visualEffects?.goonWords?.customWords ?? []).join('\n')}
                        onChange={async (e) => {
                          const current = s?.visualEffects?.goonWords ?? {}
                          const customWords = e.target.value.split('\n').filter(w => w.trim())
                          await window.api.settings.visualEffects?.update?.({ goonWords: { ...current, customWords } })
                        }}
                        placeholder="Add custom words (one per line)..."
                        className="w-full h-20 px-3 py-2 rounded-lg bg-black/30 border border-[var(--border)] text-sm resize-none"
                      />
                      {/* Quick-add buttons */}
                      <div className="mt-2">
                        <div className="text-xs text-[var(--muted)] mb-1">Quick Add:</div>
                        <div className="flex flex-wrap gap-1">
                          {[
                            'FUCK YES', 'SO HORNY', 'NEED IT', 'DRIPPING', 'ACHING',
                            'MORE MORE MORE', 'DON\'T STOP', 'RIGHT THERE', 'HARDER', 'DEEPER'
                          ].map(word => (
                            <button
                              key={word}
                              onClick={async () => {
                                const goonWords = s?.visualEffects?.goonWords
                                const customWords = [...(goonWords?.customWords ?? [])]
                                if (!customWords.includes(word)) {
                                  customWords.push(word)
                                  await window.api.settings.visualEffects?.update?.({ goonWords: { ...goonWords, customWords } })
                                }
                              }}
                              className="px-1.5 py-0.5 rounded text-[10px] bg-white/5 hover:bg-white/10 text-[var(--muted)] hover:text-white transition"
                            >
                              + {word}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Word Count Info */}
                    <div className="pt-2 text-xs text-[var(--muted)] border-t border-[var(--border)]">
                      <div className="flex justify-between">
                        <span>Active word packs: {(s?.visualEffects?.goonWords?.enabledPacks ?? ['goon', 'kink']).length}</span>
                        <span>Custom words: {(s?.visualEffects?.goonWords?.customWords ?? []).length}</span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5 mt-4">
              <div className="text-sm font-semibold mb-2">Heat Effects Info</div>
              <div className="text-xs text-[var(--muted)] space-y-1">
                <p>Heat level controls intensity of visual effects that build over time:</p>
                <p>• Level 3+: Pleasure particles appear</p>
                <p>• Level 4+: Heartbeat pulse effect</p>
                <p>• Level 5+: Heat shimmer distortion</p>
                <p>• Level 6+: Desire ripples</p>
                <p>• Level 7+: Passion trail effects</p>
                <p>• Level 8+: Seduction wave overlay</p>
              </div>
            </div>
            </>
          )}

          {/* Playback Tab */}
          {activeTab === 'playback' && (
            <>
            <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-semibold">Playback Settings</div>
                <button
                  onClick={async () => {
                    const ok = await confirm({
                      title: 'Reset Playback settings?',
                      body: 'Volume, autoplay, loop, picture-in-picture, and other player defaults revert.',
                      confirmLabel: 'Reset',
                      danger: true,
                    })
                    if (ok) {
                      try {
                        const next = await window.api.settings.resetSection?.('playback')
                        if (next) {
                          props.patchSettings(next)
                          showToast('success', 'Playback settings reset')
                        }
                      } catch (err: any) {
                        console.error('Failed to reset playback settings:', err)
                        showToast('error', err?.message ?? 'Failed to reset settings')
                      }
                    }
                  }}
                  className="text-xs px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[var(--muted)] hover:text-white transition"
                >
                  Reset to Defaults
                </button>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">Autoplay</div>
                    <div className="text-xs text-[var(--muted)]">Automatically play next item</div>
                  </div>
                  <ToggleSwitch
                    checked={playbackSettings.autoplayNext ?? false}
                    onChange={async (v) => {
                      await window.api.settings.playback?.update?.({ autoplayNext: v })
                    }}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">Loop Videos</div>
                    <div className="text-xs text-[var(--muted)]">Loop videos by default</div>
                  </div>
                  <ToggleSwitch
                    checked={playbackSettings.loopSingle ?? false}
                    onChange={async (v) => {
                      await window.api.settings.playback?.update?.({ loopSingle: v })
                    }}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">Mute by Default</div>
                    <div className="text-xs text-[var(--muted)]">Start videos muted</div>
                  </div>
                  <ToggleSwitch
                    checked={playbackSettings.muteByDefault ?? false}
                    onChange={async (v) => {
                      await window.api.settings.playback?.update?.({ muteByDefault: v })
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Video Quality Settings */}
            <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5 mt-4">
              <div className="text-sm font-semibold mb-4">Video Quality</div>
              <div className="space-y-4">
                {/* Low Quality Mode */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">Low Quality Mode</div>
                    <div className="text-xs text-[var(--muted)]">Degrade all videos for retro/amateur aesthetic</div>
                  </div>
                  <ToggleSwitch
                    checked={playbackSettings.lowQualityMode ?? false}
                    onChange={async (v) => {
                      await window.api.settings.playback?.update?.({ lowQualityMode: v })
                    }}
                  />
                </div>

                {/* Default Resolution */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">Default Resolution</div>
                    <div className="text-xs text-[var(--muted)]">Preferred playback quality</div>
                  </div>
                  <select
                    value={playbackSettings.defaultResolution ?? 'original'}
                    onChange={async (e) => {
                      await window.api.settings.playback?.update?.({ defaultResolution: e.target.value })
                    }}
                    className="bg-black/40 border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm"
                  >
                    <option value="original">Original</option>
                    <option value="1080p">1080p HD</option>
                    <option value="720p">720p</option>
                    <option value="480p">480p</option>
                    <option value="360p">360p</option>
                    <option value="240p">240p (Low)</option>
                  </select>
                </div>

                {/* Low Quality Intensity */}
                {playbackSettings.lowQualityMode && (
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm">Degradation Level</div>
                      <div className="text-xs text-[var(--muted)]">How "bad" the quality looks</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={1}
                        max={10}
                        step={1}
                        value={playbackSettings.lowQualityIntensity ?? 5}
                        onChange={async (e) => {
                          await window.api.settings.playback?.update?.({ lowQualityIntensity: Number(e.target.value) })
                        }}
                        className="w-24 h-1 accent-[var(--primary)] cursor-pointer"
                      />
                      <span className="text-xs text-[var(--muted)] w-6">{playbackSettings.lowQualityIntensity ?? 5}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Hardware Encoder Settings */}
            <HardwareEncoderSettings />

            {/* #204 — Customizable global hotkeys */}
            <HotkeyEditorCard />
            </>
          )}

          {/* Sound Tab */}
          {activeTab === 'sound' && (
            <>
              <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm font-semibold">Sound Settings</div>
                  <button
                    onClick={async () => {
                      const ok = await confirm({
                        title: 'Reset Sound settings?',
                        body: 'All sound engine, soundpack, and volume preferences revert to defaults.',
                        confirmLabel: 'Reset',
                        danger: true,
                      })
                      if (ok) {
                        try {
                          const next = await window.api.settings.resetSection?.('sound')
                          if (next) {
                            props.patchSettings(next)
                            showToast('success', 'Sound settings reset')
                          }
                        } catch (err: any) {
                          console.error('Failed to reset sound settings:', err)
                          showToast('error', err?.message ?? 'Failed to reset settings')
                        }
                      }
                    }}
                    className="text-xs px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[var(--muted)] hover:text-white transition"
                  >
                    Reset to Defaults
                  </button>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm">Enable Sounds</div>
                      <div className="text-xs text-[var(--muted)]">Master sound toggle</div>
                    </div>
                    <ToggleSwitch
                      checked={s?.sound?.enabled ?? true}
                      onChange={async (v) => {
                        await window.api.settings.update?.({ sound: { ...s?.sound, enabled: v } })
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm">UI Sounds</div>
                      <div className="text-xs text-[var(--muted)]">Click and interaction sounds</div>
                    </div>
                    <ToggleSwitch
                      checked={s?.sound?.uiSoundsEnabled ?? true}
                      onChange={async (v) => {
                        await window.api.settings.update?.({ sound: { ...s?.sound, uiSoundsEnabled: v } })
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm">Voice Sounds</div>
                      <div className="text-xs text-[var(--muted)]">Voice lines and reactions</div>
                    </div>
                    <ToggleSwitch
                      checked={s?.sound?.voiceSoundsEnabled ?? true}
                      onChange={async (v) => {
                        await window.api.settings.update?.({ sound: { ...s?.sound, voiceSoundsEnabled: v } })
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm">Master Volume</div>
                      <div className="text-xs text-[var(--muted)]">Overall sound volume</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.1}
                        value={s?.sound?.volume ?? 0.5}
                        onChange={async (e) => {
                          await window.api.settings.update?.({ sound: { ...s?.sound, volume: Number(e.target.value) } })
                        }}
                        className="w-24 h-1 accent-[var(--primary)] cursor-pointer"
                      />
                      <span className="text-xs text-[var(--muted)] w-8">{Math.round((s?.sound?.volume ?? 0.5) * 100)}%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Ambience Settings */}
              <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5 mt-4">
                <div className="text-sm font-semibold mb-4">Ambience</div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm">Enable Ambience</div>
                      <div className="text-xs text-[var(--muted)]">Background ambience sounds</div>
                    </div>
                    <ToggleSwitch
                      checked={s?.sound?.ambienceEnabled ?? false}
                      onChange={async (v) => {
                        await window.api.settings.update?.({ sound: { ...s?.sound, ambienceEnabled: v } })
                      }}
                    />
                  </div>

                  {s?.sound?.ambienceEnabled && (
                    <>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm">Ambience Track</div>
                          <div className="text-xs text-[var(--muted)]">Background sound</div>
                        </div>
                        <select
                          value={s?.sound?.ambienceTrack ?? 'none'}
                          onChange={async (e) => {
                            await window.api.settings.update?.({ sound: { ...s?.sound, ambienceTrack: e.target.value } })
                          }}
                          className="bg-black/40 border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm"
                        >
                          <option value="none">None</option>
                          <option value="soft_moans">Soft Moans</option>
                          <option value="breathing">Breathing</option>
                          <option value="heartbeat">Heartbeat</option>
                          <option value="rain">Rain</option>
                        </select>
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm">Ambience Volume</div>
                          <div className="text-xs text-[var(--muted)]">Background sound level</div>
                        </div>
                        <div className="flex items-center gap-3">
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.1}
                            value={s?.sound?.ambienceVolume ?? 0.3}
                            onChange={async (e) => {
                              await window.api.settings.update?.({ sound: { ...s?.sound, ambienceVolume: Number(e.target.value) } })
                            }}
                            className="w-24 h-1 accent-[var(--primary)] cursor-pointer"
                          />
                          <span className="text-xs text-[var(--muted)] w-8">{Math.round((s?.sound?.ambienceVolume ?? 0.3) * 100)}%</span>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Xyrene Tab */}
          {activeTab === 'xyrene' && (
            <XyreneSettings />
          )}

          {/* Data Tab */}
          {activeTab === 'data' && (
            <>
              <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5">
                <div className="text-sm font-semibold mb-4">Backup & Data</div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm">Auto Backup</div>
                      <div className="text-xs text-[var(--muted)]">Automatically backup settings</div>
                    </div>
                    <ToggleSwitch
                      checked={s?.data?.autoBackupEnabled ?? false}
                      onChange={async (v) => {
                        await window.api.settings.data?.update?.({ autoBackupEnabled: v })
                      }}
                    />
                  </div>

                  {s?.data?.autoBackupEnabled && (
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm">Backup Interval</div>
                        <div className="text-xs text-[var(--muted)]">Days between backups</div>
                      </div>
                      <select
                        value={s?.data?.autoBackupIntervalDays ?? 7}
                        onChange={async (e) => {
                          await window.api.settings.data?.update?.({ autoBackupIntervalDays: Number(e.target.value) })
                        }}
                        className="bg-black/40 border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm"
                      >
                        <option value={1}>Daily</option>
                        <option value={3}>Every 3 days</option>
                        <option value={7}>Weekly</option>
                        <option value={14}>Every 2 weeks</option>
                        <option value={30}>Monthly</option>
                      </select>
                    </div>
                  )}

                  {s?.data?.lastBackupDate && (
                    <div className="text-xs text-[var(--muted)]">
                      Last backup: {new Date(s.data.lastBackupDate).toLocaleDateString()}
                    </div>
                  )}
                </div>
              </div>

              {/* Export/Import */}
              <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5 mt-4">
                <div className="text-sm font-semibold mb-4">Export & Import</div>
                <div className="flex gap-3">
                  <Btn
                    onClick={async () => {
                      try {
                        const filePath = await window.api.data?.exportSettings?.()
                        if (filePath) {
                          showToast('success', 'Settings exported successfully!')
                        }
                      } catch (err: any) {
                        showToast('error', `Export failed: ${err?.message ?? String(err)}`)
                      }
                    }}
                  >
                    <Download size={14} />
                    Export Settings
                  </Btn>
                  <Btn
                    onClick={async () => {
                      try {
                        const result = await window.api.data?.importSettings?.()
                        if (result) {
                          showToast('success', 'Settings imported! Some changes may require restart.')
                        }
                      } catch (err: any) {
                        showToast('error', `Import failed: ${err?.message ?? String(err)}`)
                      }
                    }}
                  >
                    <ArrowUp size={14} />
                    Import Settings
                  </Btn>
                </div>
                <p className="text-xs text-[var(--muted)] mt-3">
                  Export your settings to a JSON file for backup, or import settings from a previous backup.
                </p>
              </div>

              {/* Settings Profiles */}
              <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5 mt-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="text-sm font-semibold">Settings Profiles</div>
                    <div className="text-xs text-[var(--muted)]">Save and switch between different configurations</div>
                  </div>
                  <Btn onClick={() => setShowCreateProfileModal(true)}>
                    <Plus size={14} />
                    New Profile
                  </Btn>
                </div>

                {profiles.length === 0 ? (
                  <div className="text-sm text-[var(--muted)] text-center py-6">
                    No profiles yet. Create one to save your current settings.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {profiles.map(profile => (
                      <div
                        key={profile.id}
                        className={`flex items-center justify-between p-3 rounded-xl border transition-colors ${
                          activeProfileId === profile.id
                            ? 'border-[var(--primary)] bg-[var(--primary)]/10'
                            : 'border-[var(--border)] bg-black/20 hover:bg-black/30'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          {renamingProfileId === profile.id ? (
                            <input
                              type="text"
                              value={renameProfileName}
                              onChange={(e) => setRenameProfileName(e.target.value)}
                              onKeyDown={async (e) => {
                                if (e.key === 'Enter' && renameProfileName.trim()) {
                                  try {
                                    await window.api.profiles?.rename?.(profile.id, renameProfileName.trim())
                                    setRenamingProfileId(null)
                                    loadProfiles()
                                  } catch (err: any) {
                                    showToast('error', err?.message ?? 'Failed to rename profile')
                                  }
                                } else if (e.key === 'Escape') {
                                  setRenamingProfileId(null)
                                }
                              }}
                              onBlur={async () => {
                                if (renameProfileName.trim() && renameProfileName !== profile.name) {
                                  try {
                                    await window.api.profiles?.rename?.(profile.id, renameProfileName.trim())
                                    loadProfiles()
                                  } catch (err: any) {
                                    showToast('error', err?.message ?? 'Failed to rename profile')
                                  }
                                }
                                setRenamingProfileId(null)
                              }}
                              autoFocus
                              className="bg-black/40 border border-[var(--border)] rounded px-2 py-1 text-sm w-full max-w-[200px]"
                            />
                          ) : (
                            <>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium truncate">{profile.name}</span>
                                {activeProfileId === profile.id && (
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--primary)] text-white">Active</span>
                                )}
                              </div>
                              {profile.description && (
                                <div className="text-xs text-[var(--muted)] truncate">{profile.description}</div>
                              )}
                              <div className="text-xs text-[var(--muted)]">
                                Updated {new Date(profile.updatedAt).toLocaleDateString()}
                              </div>
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-1 ml-3">
                          {activeProfileId !== profile.id && (
                            <Btn
                              className="text-xs px-2 py-1"
                              onClick={async () => {
                                try {
                                  await window.api.profiles?.load?.(profile.id)
                                  setActiveProfileId(profile.id)
                                  showToast('success', `Loaded profile "${profile.name}"`)
                                } catch (err: any) {
                                  showToast('error', err?.message ?? 'Failed to load profile')
                                }
                              }}
                              title="Load this profile"
                            >
                              <ArrowUp size={12} style={{ transform: 'rotate(90deg)' }} />
                              Load
                            </Btn>
                          )}
                          <Btn
                            className="text-xs px-2 py-1"
                            onClick={async () => {
                              try {
                                await window.api.profiles?.save?.(profile.id)
                                loadProfiles()
                                showToast('success', `Saved current settings to "${profile.name}"`)
                              } catch (err: any) {
                                showToast('error', err?.message ?? 'Failed to save profile')
                              }
                            }}
                            title="Save current settings to this profile"
                          >
                            <Save size={12} />
                          </Btn>
                          <Btn
                            className="text-xs px-2 py-1"
                            onClick={() => {
                              setRenamingProfileId(profile.id)
                              setRenameProfileName(profile.name)
                            }}
                            title="Rename profile"
                          >
                            <Edit2 size={12} />
                          </Btn>
                          <Btn
                            className="text-xs px-2 py-1"
                            tone="danger"
                            onClick={async () => {
                              const ok = await confirm({
                                title: `Delete profile "${profile.name}"?`,
                                body: 'The profile and its settings snapshot are removed. Active profile resets to default.',
                                confirmLabel: 'Delete profile',
                                danger: true,
                              })
                              if (ok) {
                                try {
                                  await window.api.profiles?.delete?.(profile.id)
                                  if (activeProfileId === profile.id) {
                                    setActiveProfileId(null)
                                  }
                                  loadProfiles()
                                  showToast('success', 'Profile deleted')
                                } catch (err: any) {
                                  showToast('error', err?.message ?? 'Failed to delete profile')
                                }
                              }
                            }}
                            title="Delete profile"
                          >
                            <Trash2 size={12} />
                          </Btn>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {activeProfileId && (
                  <div className="mt-4 pt-4 border-t border-[var(--border)]">
                    <Btn
                      onClick={async () => {
                        await window.api.profiles?.clearActive?.()
                        setActiveProfileId(null)
                        showToast('info', 'Cleared active profile')
                      }}
                    >
                      Clear Active Profile
                    </Btn>
                    <p className="text-xs text-[var(--muted)] mt-2">
                      Settings will no longer be linked to a profile.
                    </p>
                  </div>
                )}
              </div>

              {/* Create Profile Modal */}
              {showCreateProfileModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                  <div className="bg-[var(--bg)] rounded-3xl border border-[var(--border)] p-6 w-full max-w-md">
                    <h3 className="text-lg font-semibold mb-4">Create Settings Profile</h3>
                    <p className="text-sm text-[var(--muted)] mb-4">
                      Save your current settings as a new profile that you can switch to later.
                    </p>
                    <div className="space-y-4">
                      <div>
                        <label className="text-sm mb-1 block">Profile Name</label>
                        <input
                          type="text"
                          value={newProfileName}
                          onChange={(e) => setNewProfileName(e.target.value)}
                          placeholder="e.g., Chill Mode, Work Mode"
                          className="w-full bg-black/40 border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
                          autoFocus
                        />
                      </div>
                      <div>
                        <label className="text-sm mb-1 block">Description (optional)</label>
                        <input
                          type="text"
                          value={newProfileDesc}
                          onChange={(e) => setNewProfileDesc(e.target.value)}
                          placeholder="e.g., Relaxed settings with slow transitions"
                          className="w-full bg-black/40 border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-3 mt-6">
                      <Btn
                        tone="ghost"
                        onClick={() => {
                          setShowCreateProfileModal(false)
                          setNewProfileName('')
                          setNewProfileDesc('')
                        }}
                      >
                        Cancel
                      </Btn>
                      <Btn
                        onClick={async () => {
                          if (!newProfileName.trim()) {
                            showToast('error', 'Please enter a profile name')
                            return
                          }
                          try {
                            const profile = await window.api.profiles?.create?.(newProfileName.trim(), newProfileDesc.trim() || undefined)
                            if (profile) {
                              await window.api.profiles?.save?.(profile.id)
                              setActiveProfileId(profile.id)
                              loadProfiles()
                              showToast('success', `Created profile "${newProfileName}"`)
                            }
                            setShowCreateProfileModal(false)
                            setNewProfileName('')
                            setNewProfileDesc('')
                          } catch (err: any) {
                            showToast('error', err?.message ?? 'Failed to create profile')
                          }
                        }}
                      >
                        Create Profile
                      </Btn>
                    </div>
                  </div>
                </div>
              )}

              {/* Error Logs */}
              <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5 mt-4">
                <div className="text-sm font-semibold mb-4">Error Logs</div>
                <p className="text-xs text-[var(--muted)] mb-4">
                  View and copy error logs for debugging. Logs are stored locally and never sent anywhere.
                </p>
                <div className="flex gap-3 flex-wrap">
                  <Btn
                    onClick={async () => {
                      try {
                        const content = await window.api.logs?.getContent?.()
                        if (content) {
                          await navigator.clipboard.writeText(content)
                          showToast('success', 'Error logs copied to clipboard!')
                        } else {
                          showToast('info', 'No logs to copy')
                        }
                      } catch (err: any) {
                        showToast('error', `Log copy failed: ${err?.message ?? String(err)}`)
                      }
                    }}
                  >
                    <Copy size={14} />
                    Copy All Logs
                  </Btn>
                  <Btn
                    onClick={async () => {
                      try {
                        const errors = await window.api.logs?.getErrors?.(20)
                        if (errors && errors.length > 0) {
                          const text = errors.map((e: { timestamp: string; source: string; message: string }) =>
                            `[${e.timestamp}] ${e.source}: ${e.message}`
                          ).join('\n')
                          await navigator.clipboard.writeText(text)
                          showToast('success', `Copied ${errors.length} recent errors!`)
                        } else {
                          showToast('info', 'No errors logged')
                        }
                      } catch (err: any) {
                        showToast('error', `Error copy failed: ${err?.message ?? String(err)}`)
                      }
                    }}
                  >
                    <AlertCircle size={14} />
                    Copy Recent Errors
                  </Btn>
                  <Btn
                    onClick={async () => {
                      try {
                        const path = await window.api.logs?.getLogFilePath?.()
                        if (path) {
                          await window.api.shell?.openPath?.(path.replace(/[^\\\/]+$/, ''))
                          showToast('success', 'Opened logs folder')
                        }
                      } catch (err: any) {
                        showToast('error', `Open logs folder failed: ${err?.message ?? String(err)}`)
                      }
                    }}
                  >
                    <Folder size={14} />
                    Open Logs Folder
                  </Btn>
                  <Btn
                    tone="ghost"
                    onClick={async () => {
                      try {
                        const result = await window.api.logs?.clear?.()
                        if (result?.success) {
                          showToast('success', 'Logs cleared!')
                        } else {
                          showToast('error', result?.error || 'Failed to clear logs')
                        }
                      } catch (err: any) {
                        showToast('error', `Clear logs failed: ${err?.message ?? String(err)}`)
                      }
                    }}
                  >
                    <Trash2 size={14} />
                    Clear Logs
                  </Btn>
                </div>
              </div>

              {/* Performance Settings */}
              <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5 mt-4">
                <div className="text-sm font-semibold mb-4">Performance</div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm">Memory Limit</div>
                      <div className="text-xs text-[var(--muted)]">Max RAM for caching (restart required)</div>
                    </div>
                    <select
                      value={s?.performance?.maxMemoryMB ?? 2048}
                      onChange={async (e) => {
                        await window.api.settings.update?.({ performance: { ...s?.performance, maxMemoryMB: Number(e.target.value) } })
                      }}
                      className="bg-black/40 border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm"
                    >
                      <option value={512}>512 MB (Low)</option>
                      <option value={1024}>1 GB</option>
                      <option value={2048}>2 GB (Default)</option>
                      <option value={4096}>4 GB</option>
                      <option value={8192}>8 GB (High)</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm">Thumbnail Cache</div>
                      <div className="text-xs text-[var(--muted)]">Number of thumbnails to keep in memory</div>
                    </div>
                    <select
                      value={s?.performance?.thumbnailCacheSize ?? 2000}
                      onChange={async (e) => {
                        await window.api.settings.update?.({ performance: { ...s?.performance, thumbnailCacheSize: Number(e.target.value) } })
                      }}
                      className="bg-black/40 border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm"
                    >
                      <option value={500}>500 (Low)</option>
                      <option value={1000}>1,000</option>
                      <option value={2000}>2,000 (Default)</option>
                      <option value={5000}>5,000</option>
                      <option value={10000}>10,000 (High)</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm">Video Concurrency</div>
                      <div className="text-xs text-[var(--muted)]">Max simultaneous video loads</div>
                    </div>
                    <select
                      value={s?.performance?.videoConcurrency ?? 4}
                      onChange={async (e) => {
                        await window.api.settings.update?.({ performance: { ...s?.performance, videoConcurrency: Number(e.target.value) } })
                      }}
                      className="bg-black/40 border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm"
                    >
                      <option value={1}>1 (Low)</option>
                      <option value={2}>2</option>
                      <option value={4}>4 (Default)</option>
                      <option value={8}>8</option>
                      <option value={16}>16 (High)</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm">Low Memory Mode</div>
                      <div className="text-xs text-[var(--muted)]">Reduce memory at cost of performance</div>
                    </div>
                    <ToggleSwitch
                      checked={s?.performance?.lowMemoryMode ?? false}
                      onChange={async (v) => {
                        await window.api.settings.update?.({ performance: { ...s?.performance, lowMemoryMode: v } })
                      }}
                    />
                  </div>
                </div>
                <p className="text-xs text-[var(--muted)] mt-4">
                  Higher values use more RAM but improve performance. Restart required for memory limit changes.
                </p>
              </div>
            </>
          )}

          {/* Services Tab - Privacy */}
          {activeTab === 'services' && (
            <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5">
              <div className="text-sm font-semibold mb-4">Privacy & Security</div>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">Panic Key</div>
                    <div className="text-xs text-[var(--muted)]">Press ESC 3x to minimize</div>
                  </div>
                  <ToggleSwitch
                    checked={privacySettings.panicKeyEnabled ?? true}
                    onChange={async (v) => {
                      await window.api.settings.privacy?.update?.({ panicKeyEnabled: v })
                    }}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">Clear on Exit</div>
                    <div className="text-xs text-[var(--muted)]">Clear history when closing</div>
                  </div>
                  <ToggleSwitch
                    checked={privacySettings.clearOnExit ?? false}
                    onChange={async (v) => {
                      await window.api.settings.privacy?.update?.({ clearOnExit: v })
                    }}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">Incognito Mode</div>
                    <div className="text-xs text-[var(--muted)]">Don't track history</div>
                  </div>
                  <ToggleSwitch
                    checked={privacySettings.incognitoMode ?? false}
                    onChange={async (v) => {
                      await window.api.settings.privacy?.update?.({ incognitoMode: v })
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Blacklist Section - under Services */}
          {activeTab === 'services' && (
            <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5 mt-4">
              <div className="text-sm font-semibold mb-4">Content Blacklist</div>
              <div className="space-y-4">
                {/* Master Toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">Enable Blacklist</div>
                    <div className="text-xs text-[var(--muted)]">Hide content with selected tags</div>
                  </div>
                  <ToggleSwitch
                    checked={s?.blacklist?.enabled ?? true}
                    onChange={async (v) => {
                      await window.api.settings.blacklist?.update?.({ enabled: v })
                    }}
                  />
                </div>

                {s?.blacklist?.enabled && (
                  <>
                    {/* Blacklisted Tags */}
                    <div className="pt-2">
                      <div className="text-sm mb-2">Blacklisted Tags</div>
                      <div className="text-xs text-[var(--muted)] mb-3">
                        Content with these tags won't appear in Library, Goon Wall, or random shuffle
                      </div>

                      {/* Current blacklisted tags */}
                      {(s?.blacklist?.tags?.length ?? 0) > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3">
                          {(s?.blacklist?.tags ?? []).map((tag: string) => (
                            <button
                              key={tag}
                              onClick={async () => {
                                await window.api.settings.blacklist?.removeTag?.(tag)
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500/20 border border-red-500/30 text-red-400 text-xs hover:bg-red-500/30 transition"
                            >
                              <span>{tag}</span>
                              <X size={12} />
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Add tag dropdown */}
                      <div className="flex gap-2">
                        <select
                          className="flex-1 px-3 py-2 rounded-xl bg-black/30 border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)]"
                          onChange={async (e) => {
                            const tag = e.target.value
                            if (tag && !(s?.blacklist?.tags ?? []).includes(tag)) {
                              await window.api.settings.blacklist?.addTag?.(tag)
                            }
                            e.target.value = ''
                          }}
                          defaultValue=""
                        >
                          <option value="" disabled>Add tag to blacklist...</option>
                          {allTags
                            .filter(tag => !(s?.blacklist?.tags ?? []).includes(tag))
                            .sort()
                            .map(tag => (
                              <option key={tag} value={tag}>{tag}</option>
                            ))
                          }
                        </select>
                      </div>
                    </div>

                    {/* Blacklisted count info */}
                    <div className="pt-2 text-xs text-[var(--muted)]">
                      {(s?.blacklist?.tags?.length ?? 0)} tag{(s?.blacklist?.tags?.length ?? 0) !== 1 ? 's' : ''} blacklisted
                      {(s?.blacklist?.mediaIds?.length ?? 0) > 0 && (
                        <>, {s?.blacklist?.mediaIds?.length} specific item{s?.blacklist?.mediaIds?.length !== 1 ? 's' : ''}</>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Cross-Device Access — same HTTP server as Mobile Sync but
              surfaced for PC-to-PC streaming over LAN or Tailscale (#26).
              Lists access URLs categorized by network type + a generator
              for one-time bearer tokens. */}
          {activeTab === 'services' && (
            <CrossDeviceCard />
          )}

          {/* #189 — Cloudflare Tunnel one-click remote access */}
          {activeTab === 'services' && (
            <CloudflareTunnelCard />
          )}

          {/* #190 — ZeroTier orchestration (auto-hides when not installed) */}
          {activeTab === 'services' && (
            <ZeroTierCard />
          )}

          {/* #181 — WebDAV server (mount library as a network drive) */}
          {activeTab === 'services' && (
            <WebDavCard />
          )}

          {/* #200 — Restic offsite backup */}
          {activeTab === 'services' && (
            <ResticBackupCard />
          )}

          {/* #194 — Windows Hello / Touch ID enrollment + biometric gate setting */}
          {activeTab === 'services' && (
            <WindowsHelloCard />
          )}

          {/* #196 — Intiface / Buttplug.io haptic device control */}
          {activeTab === 'services' && (
            <IntifaceCard />
          )}

          {/* #202 — Phillips Hue cinema-mode dimming */}
          {activeTab === 'services' && (
            <HueCard />
          )}

          {/* #222/223/224 — StevenBlack hosts blocklist (auto-NSFW tagging + nuclear panic mode) */}
          {activeTab === 'services' && (
            <HostsBlocklistCard />
          )}

          {/* #185/219 — Home Assistant MQTT integration */}
          {activeTab === 'services' && (
            <HomeAssistantCard />
          )}

          {/* #347/#348/#363 — Self-control: post-nut lockout + edging scoreboard */}
          {activeTab === 'services' && (
            <SelfControlCard />
          )}

          {/* #191 — age-encrypted backups */}
          {activeTab === 'services' && (
            <AgeBackupCard />
          )}

          {/* #134 / #135 / others — Extra detectors install status */}
          {activeTab === 'services' && (
            <ExtraDetectorsCard />
          )}

          {/* v2.7 banner — one-time intro above the new card sections.
              Dismissable to localStorage so it doesn't permanently take
              vertical space once the user is familiar with v2.7. */}
          {activeTab === 'services' && !v27BannerDismissed && (
            <div className="mt-8 mb-4 rounded-2xl border border-fuchsia-500/20 bg-gradient-to-br from-fuchsia-500/10 via-pink-500/5 to-violet-500/10 p-4 relative">
              <button
                onClick={() => setV27BannerDismissed(true)}
                className="absolute top-2 right-2 p-1 rounded text-fuchsia-200/50 hover:text-fuchsia-200 hover:bg-white/10 transition"
                aria-label="Dismiss banner"
                title="Dismiss"
              >
                <X size={12} />
              </button>
              <div className="flex items-start gap-3">
                <div className="size-9 rounded-2xl bg-gradient-to-br from-fuchsia-500 via-pink-500 to-violet-500 grid place-items-center shadow-md shadow-black/40 flex-shrink-0">
                  <Sparkles size={16} className="text-white" />
                </div>
                <div className="flex-1 min-w-0 pr-6">
                  <div className="text-sm font-semibold flex items-center gap-2">
                    v2.7 services
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-fuchsia-500/20 text-fuchsia-200 border border-fuchsia-500/30 uppercase tracking-wider">23 new cards</span>
                  </div>
                  <p className="text-[11px] text-[var(--muted)] mt-1 leading-relaxed">
                    Six themed sections below — Decentralized sharing · Privacy & anonymizing · Social & inbox · AI generation · Tag intelligence · Security & notifications · Content imports. Each card binds to a previously-orphaned IPC bridge, with consistent expand/status-pill UX.
                  </p>
                  <button
                    onClick={() => {
                      // LibraryPage isn't mounted yet from here — stash the
                      // pending tool name in sessionStorage and navigate.
                      // The page drains the key on mount. Same handoff
                      // pattern as CommandPalette uses.
                      sessionStorage.setItem('vault.pendingLibraryTool', 'serviceHealth')
                      window.dispatchEvent(new CustomEvent('navigate-tab', { detail: 'library' }))
                    }}
                    className="mt-2 text-[11px] flex items-center gap-1 px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 text-fuchsia-300 hover:text-fuchsia-200 transition"
                  >
                    <Shield size={11} /> Open Service Health dashboard →
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════
              v2.7 — Decentralized & sharing services
              Preload bridges already exist; these are the UI surfaces.
          ════════════════════════════════════════════════════════════════ */}
          {activeTab === 'services' && (
            <div className="mt-4 mb-2 px-1 flex items-center gap-2">
              <div className="size-1.5 rounded-full bg-fuchsia-400 animate-pulse" />
              <span className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)] font-medium">
                Decentralized & sharing
              </span>
              <div className="flex-1 h-px bg-gradient-to-r from-white/10 via-white/5 to-transparent" />
            </div>
          )}
          {activeTab === 'services' && <IrohShareCard />}
          {activeTab === 'services' && <HyperswarmMeshCard />}
          {activeTab === 'services' && <HeliaIpfsCard />}
          {activeTab === 'services' && <SyncthingCard />}

          {activeTab === 'services' && (
            <div className="mt-8 mb-2 px-1 flex items-center gap-2">
              <div className="size-1.5 rounded-full bg-teal-400 animate-pulse" />
              <span className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)] font-medium">
                Privacy & anonymizing
              </span>
              <div className="flex-1 h-px bg-gradient-to-r from-white/10 via-white/5 to-transparent" />
            </div>
          )}
          {activeTab === 'services' && <VeilidCard />}
          {activeTab === 'services' && <TorOnionCard />}
          {activeTab === 'services' && <WebTransportCard />}
          {activeTab === 'services' && <NostrSignerCard />}

          {activeTab === 'services' && (
            <div className="mt-8 mb-2 px-1 flex items-center gap-2">
              <div className="size-1.5 rounded-full bg-blue-400 animate-pulse" />
              <span className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)] font-medium">
                Social & inbox
              </span>
              <div className="flex-1 h-px bg-gradient-to-r from-white/10 via-white/5 to-transparent" />
            </div>
          )}
          {activeTab === 'services' && <BlueskyLabelerCard />}
          {activeTab === 'services' && <UnifiedPushCard />}
          {activeTab === 'services' && <ImapWatcherCard />}

          {activeTab === 'services' && (
            <div className="mt-8 mb-2 px-1 flex items-center gap-2">
              <div className="size-1.5 rounded-full bg-pink-400 animate-pulse" />
              <span className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)] font-medium">
                AI generation
              </span>
              <div className="flex-1 h-px bg-gradient-to-r from-white/10 via-white/5 to-transparent" />
            </div>
          )}
          {activeTab === 'services' && <VideoDiffusionCard />}

          {activeTab === 'services' && (
            <div className="mt-8 mb-2 px-1 flex items-center gap-2">
              <div className="size-1.5 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)] font-medium">
                Tag intelligence
              </span>
              <div className="flex-1 h-px bg-gradient-to-r from-white/10 via-white/5 to-transparent" />
            </div>
          )}
          {activeTab === 'services' && <TagImplicationsCard />}
          {activeTab === 'services' && <FolderActionsCard />}
          {activeTab === 'services' && <CoomerArchiveCard />}
          {activeTab === 'services' && <AudioEroticaCard />}
          {activeTab === 'services' && <CaptionPoolCard />}
          {activeTab === 'services' && <VaultMlSidecarCard />}
          {activeTab === 'services' && <YtdlpProfilesCard />}

          {activeTab === 'services' && (
            <div className="mt-8 mb-2 px-1 flex items-center gap-2">
              <div className="size-1.5 rounded-full bg-violet-400 animate-pulse" />
              <span className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)] font-medium">
                Security & notifications
              </span>
              <div className="flex-1 h-px bg-gradient-to-r from-white/10 via-white/5 to-transparent" />
            </div>
          )}
          {activeTab === 'services' && <WebAuthnCard />}
          {activeTab === 'services' && <ShamirCard />}
          {activeTab === 'services' && <NtfyCard />}

          {/* Mobile Sync Section - under Services */}
          {activeTab === 'services' && (
            <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5 mt-4">
              <div className="text-sm font-semibold mb-4">Mobile Sync</div>
              <div className="space-y-4">
                {/* Server Toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">Sync Server</div>
                    <div className="text-xs text-[var(--muted)]">
                      {mobileSyncStatus?.running
                        ? `Running on port ${mobileSyncStatus.port}`
                        : 'Start server to connect mobile devices'}
                    </div>
                  </div>
                  <ToggleSwitch
                    checked={mobileSyncStatus?.running ?? false}
                    onChange={toggleMobileSyncServer}
                  />
                </div>

                {/* Server Status when running */}
                {mobileSyncStatus?.running && (
                  <>
                    {/* Server addresses */}
                    <div className="bg-black/30 rounded-xl p-3">
                      <div className="text-xs text-[var(--muted)] mb-2">Connect from your mobile device:</div>
                      <div className="space-y-1">
                        {mobileSyncStatus.addresses.map((addr, i) => (
                          <div key={i} className="text-sm font-mono text-[var(--primary)]">
                            http://{addr}:{mobileSyncStatus.port}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Pairing Code & QR */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <div className="text-sm">Pairing Code</div>
                          <div className="text-xs text-[var(--muted)]">
                            {mobilePairingCode
                              ? 'Scan QR code or enter code manually'
                              : 'Generate a code to pair a new device'}
                          </div>
                        </div>
                        {!mobilePairingCode && (
                          <button
                            onClick={generateMobilePairingCode}
                            className="px-4 py-2 rounded-xl bg-[var(--primary)]/20 text-[var(--primary)] hover:bg-[var(--primary)]/30 transition text-sm font-medium"
                          >
                            Generate Code
                          </button>
                        )}
                      </div>

                      {mobilePairingCode && mobileSyncStatus?.addresses?.[0] && (
                        <div className="flex flex-col items-center gap-4 p-4 bg-black/30 rounded-xl">
                          {/* QR Code */}
                          <div className="bg-white p-3 rounded-xl">
                            <QRCodeSVG
                              value={JSON.stringify({
                                host: mobileSyncStatus.addresses[0],
                                port: mobileSyncStatus.port,
                                code: mobilePairingCode
                              })}
                              size={160}
                              level="M"
                            />
                          </div>

                          {/* Manual Code */}
                          <div className="text-center">
                            <div className="text-xs text-[var(--muted)] mb-1">Or enter code manually:</div>
                            <div className="flex items-center justify-center gap-2">
                              <span className="text-3xl font-mono font-bold tracking-[0.3em] text-[var(--primary)]">
                                {mobilePairingCode}
                              </span>
                            </div>
                          </div>

                          {/* Connection Info */}
                          <div className="text-center">
                            <div className="text-xs text-[var(--muted)]">Server Address:</div>
                            <div className="text-sm font-mono text-[var(--primary)]">
                              {mobileSyncStatus.addresses[0]}:{mobileSyncStatus.port}
                            </div>
                          </div>

                          {/* Cancel Button */}
                          <button
                            onClick={() => setMobilePairingCode(null)}
                            className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition text-sm"
                          >
                            Cancel
                          </button>

                          {/* Timer */}
                          <div className="text-xs text-[var(--muted)]">
                            Code expires in 5 minutes
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Paired Devices */}
                    <div className="pt-2">
                      <div className="text-sm mb-2">Paired Devices</div>
                      {mobilePairedDevices.length === 0 ? (
                        <div className="text-xs text-[var(--muted)]">
                          No devices paired yet
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {mobilePairedDevices.map((device) => (
                            <div
                              key={device.id}
                              className="flex items-center justify-between p-3 bg-black/30 rounded-xl"
                            >
                              <div>
                                <div className="text-sm font-medium">{device.name}</div>
                                <div className="text-xs text-[var(--muted)]">
                                  {device.platform} • Last seen {new Date(device.lastSeen).toLocaleDateString()}
                                </div>
                              </div>
                              <button
                                onClick={() => unpairDevice(device.id)}
                                className="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition text-xs"
                              >
                                Unpair
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* Info when server is off */}
                {!mobileSyncStatus?.running && (
                  <div className="text-xs text-[var(--muted)] bg-black/20 rounded-xl p-3">
                    Enable the sync server to browse and stream your library from the Vault mobile app.
                    Both devices must be on the same local network.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* DeoVR / HereSphere / SkyBox VR catalog server (#119) */}
          {activeTab === 'services' && (
          <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5 mt-4">
            <div className="text-sm font-semibold mb-1">VR Catalog (DeoVR / HereSphere / SkyBox)</div>
            <div className="text-xs text-amber-300/80 mb-4">
              Read-only HTTP endpoint on the LAN. No auth — disable when not actively casting.
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm">Catalog server</div>
                  <div className="text-xs text-[var(--muted)]">
                    {deovrStatus?.running
                      ? `Running on port ${deovrStatus.port}`
                      : 'Start server to expose the library to VR headsets'}
                  </div>
                </div>
                <ToggleSwitch
                  checked={deovrStatus?.running ?? false}
                  onChange={toggleDeovrServer}
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-[var(--muted)] min-w-[60px]">Port</label>
                <input
                  type="number"
                  min={1024}
                  max={65535}
                  value={deovrPort}
                  onChange={(e) => setDeovrPort(Math.max(1024, Math.min(65535, Number(e.target.value) || 9999)))}
                  disabled={deovrStatus?.running}
                  className="w-24 px-2 py-1 text-sm rounded bg-black/30 border border-[var(--border)] tabular-nums disabled:opacity-50"
                />
                {deovrStatus?.running && (
                  <div className="text-xs text-[var(--muted)]">(stop to change)</div>
                )}
              </div>
              {deovrStatus?.running && deovrStatus.addresses.length > 0 && (
                <div className="bg-black/30 rounded-xl p-3">
                  <div className="text-xs text-[var(--muted)] mb-2">Point your VR headset's browser at:</div>
                  <div className="space-y-1">
                    {deovrStatus.addresses.map((addr, i) => (
                      <div key={i} className="text-sm font-mono text-[var(--primary)] break-all">
                        {addr}
                      </div>
                    ))}
                  </div>
                  <div className="text-[10px] text-[var(--muted)] mt-3">
                    In DeoVR / HereSphere, choose "Add server" and paste any of the URLs above.
                    The catalog returns up to 500 videos from your library, sorted by most-recently-added.
                  </div>
                </div>
              )}
              {!deovrStatus?.running && (
                <div className="text-xs text-[var(--muted)] bg-black/20 rounded-xl p-3">
                  Exposes your library as a DeoVR-compatible JSON catalog with HTTP-Range video streaming
                  (required for VR scrubbing). To auto-start on app boot, enable in settings.ai.deovrServerEnabled.
                </div>
              )}
            </div>
          </div>
          )}

        </div>
      </div>
    </div>
  )
}
