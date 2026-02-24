# VAULT v2.5.0 - Development Guide

**Last Updated:** February 23, 2026
**Current Version:** 2.5.0
**Build Status:** Stable

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Quick Start](#quick-start)
4. [Key Files Reference](#key-files-reference)
5. [Feature Status](#feature-status)
6. [Remaining Tasks](#remaining-tasks)
7. [Session Notes](#session-notes)
8. [API Keys & Configuration](#api-keys--configuration)

---

## Project Overview

Vault is a private media library application for discerning adults. It provides:

- **AI-Powered Organization**: 3-tier AI system (ONNX local, Ollama, Venice cloud)
- **Privacy-First**: All data stays local, panic key, incognito mode
- **Rich Viewing Modes**: Library, Feed, Goon Wall, Brainwash, PMV Editor
- **Smart Features**: Auto-tagging, duplicate detection, smart playlists
- **Streaming**: DLNA/UPnP to smart TVs, mobile sync
- **Video Editing**: PMV/HMV editor with BPM sync, GIF creation

### Tech Stack

| Layer | Technology |
|:---:|:---:|
| **Framework** | Electron 32 |
| **Frontend** | React 18.3 + TypeScript 5.7 |
| **Styling** | Tailwind CSS |
| **Database** | SQLite (better-sqlite3) |
| **Media** | FFmpeg + FFprobe |
| **AI** | ONNX Runtime + Venice API + Ollama |
| **Downloads** | yt-dlp |
| **Build** | Electron-Vite |

### Build Stats

- **Main Process**: 73 modules, ~981 KB
- **Preload**: 35 KB
- **Renderer**: ~1.7 MB
- **Components**: 94 React components
- **Services**: 61 backend services
- **Database Tables**: 13 tables across 10 migrations

---

## Architecture

### Main Process (`src/main/`)

```
src/main/
├── main.ts           # App entry, window creation, startup
├── ipc.ts            # IPC handlers (~7,700 lines)
├── db.ts             # Database operations
├── settings.ts       # Settings management
├── scanner.ts        # Media directory scanning
├── thumbs.ts         # Thumbnail generation
├── migrations.ts     # Database migrations (v1-v10)
├── vaultProtocol.ts  # vault:// protocol handler
└── services/         # 61 service modules
    ├── ai/           # AI integration
    ├── ai-intelligence/  # Multi-tier AI processing
    ├── audio/        # Audio processing
    ├── tagging/      # Tagging engines
    └── pmv/          # PMV editor backend
```

### Renderer Process (`src/renderer/`)

```
src/renderer/
├── main.tsx          # React entry point
├── App.tsx           # Main app (~19,700 lines)
├── index.css         # Tailwind + custom styles
├── components/       # 94 UI components
├── contexts/         # React contexts (Toast, GlobalTask)
├── hooks/            # 11 custom hooks
├── types/            # Shared TypeScript types
├── utils/            # Utility functions
└── styles/           # Theme definitions
```

### Key Components

| Category | Components |
|---|---|
| **Media Display** | FloatingVideoPlayer, VirtualizedMediaGrid, ThumbnailStrip |
| **Editing** | PmvEditor, ColorGrading, SmartCrop, SubtitleEditor |
| **AI** | AITagger, SceneDetector, DiscoveryEngine |
| **Organization** | CollectionManager, PlaylistSorter, TagSelector |
| **Search** | QuickSearch, CommandPalette, CustomFiltersManager |
| **Effects** | VisualStimulants, HeatOverlay, ParticlesBackground |

### Custom Hooks

| Hook | Purpose |
|---|---|
| `usePerformance` | Debounce, throttle, lazy loading, URL caching |
| `useVideoPreview` | Video preview on hover with slot limiting |
| `useVideoCleanup` | Memory management for video elements |
| `useKeyboardNavigation` | Global keyboard shortcuts |
| `useConfetti` | Canvas-based particle effects |
| `useAmbienceAudio` | Ambient background audio |
| `useWaveform` | Audio waveform visualization |

---

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Build without packaging (for testing)
npm run build:dir

# Type checking
npx tsc --noEmit
```

### Development URLs

- **Dev Server**: http://localhost:5173
- **Mobile Sync**: http://<local-ip>:8765

---

## Key Files Reference

### Configuration Files

| File | Purpose |
|---|---|
| `package.json` | Dependencies, scripts, build config |
| `electron.vite.config.ts` | Vite/Electron build configuration |
| `tailwind.config.ts` | Tailwind CSS configuration |
| `tsconfig.json` | TypeScript configuration |

### Main Source Files

| File | Lines | Purpose |
|---|---|---|
| `src/renderer/App.tsx` | ~19,700 | Main app UI, pages, state |
| `src/main/ipc.ts` | ~7,700 | All IPC handlers |
| `src/main/db.ts` | ~1,500 | Database operations |
| `src/main/main.ts` | ~380 | App initialization |

### Important Services

| Service | Purpose |
|---|---|
| `ai-intelligence/` | Multi-tier AI processing |
| `transcode.ts` | Video transcoding with HW acceleration |
| `dlna-service.ts` | DLNA/UPnP streaming |
| `url-downloader-service.ts` | yt-dlp integration |
| `duplicates-finder.ts` | SHA-256 duplicate detection |
| `error-logger.ts` | Centralized logging with rotation |

---

## Feature Status

### Fully Complete Features

#### Core Features
- [x] Library browsing with virtualized grid
- [x] Feed mode (TikTok-style navigation)
- [x] Goon Wall (multi-video grid with effects)
- [x] Brainwash mode (caption editor)
- [x] Floating video player with drag/resize
- [x] Smart playlists with rule-based filtering
- [x] Watch Later queue
- [x] Favorites and ratings system

#### AI Intelligence (3-Tier System)
- [x] Tier 1: ONNX local models (NSFWJS, WD Tagger)
- [x] Tier 2: Local LLM via Ollama
- [x] Tier 3: Cloud AI via Venice API
- [x] AI auto-tagging with confidence thresholds
- [x] AI category generation
- [x] AI caption generation

#### Video Editing
- [x] PMV Editor with BPM detection
- [x] Beat markers and auto-cutting
- [x] 16 transition effects
- [x] Beat-synced text overlays
- [x] GIF creation from video clips
- [x] Video cropping (C key)
- [x] A-B loop regions
- [x] Speed ramping

#### Visual Effects
- [x] 20+ overlay effects (hearts, rain, matrix, etc.)
- [x] 15+ themes including 5 goon themes
- [x] CRT/VHS effects with barrel distortion
- [x] Film grain, bokeh, starfield
- [x] GoonWords floating text system
- [x] Heat-reactive UI

#### Organization
- [x] Tag categories and aliases
- [x] Media relationships (sequel/prequel/series)
- [x] Video bookmarks with timestamps
- [x] Media notes with full-text search
- [x] Duplicate finder (hash/size/name matching)
- [x] Custom filters with presets

#### Streaming & Mobile
- [x] DLNA streaming to smart TVs
- [x] Mobile sync with QR pairing
- [x] URL downloader with quality selection
- [x] Picture-in-Picture mode

#### Gamification
- [x] 50+ achievements
- [x] Daily challenges with XP
- [x] Personal records and streaks
- [x] Session tracking and analytics

#### UI/UX
- [x] Command palette (Ctrl+K)
- [x] Keyboard shortcuts help (?)
- [x] Toast notifications
- [x] Undo delete (Ctrl+Z)
- [x] Search history and suggestions
- [x] Settings search
- [x] Welcome tutorial for new users

### Known Issues

1. **DevTools Console Errors**: Autofill.enable warnings (cosmetic, doesn't affect functionality)
2. **App.tsx Size**: File is ~19,700 lines - could benefit from splitting
3. **Type Safety**: Some `as any` casts remain in codebase

---

## Remaining Tasks

### Future Enhancements (v2.5+)

| Feature | Priority | Description |
|---|---|---|
| Plugin System | Medium | Allow third-party extensions |
| Cloud Sync | Low | Sync settings/playlists across devices |
| Watch Parties | Low | Synchronized viewing with remote partner |
| Multi-language | Low | i18n support for UI |
| Unit Tests | Medium | Test coverage for critical paths |

### Code Quality Improvements

- [x] Extract shared types to `src/renderer/types/`
- [x] Extract contexts to `src/renderer/contexts/`
- [x] Add Window.api types to `src/types.d.ts`
- [x] Comprehensive error handling (ErrorBoundary.tsx)
- [x] Loading states (Skeleton.tsx components)
- [x] Database performance indexes (migration v10)
- [ ] Split remaining App.tsx pages into separate files
- [ ] Split ipc.ts into feature-scoped handlers
- [ ] Reduce `as any` type casts
- [ ] Add JSDoc documentation

---

## Session Notes

### February 23, 2026 - Latest Session (v2.5.0)

**Status**: UI/UX improvements complete, all systems functional

**Completed This Session - UI/UX Improvements v2.5.0**:

#### Phase 1 - CSS Quick Wins
- **Button Press Animations**: Added `.btn-press` class with `scale(0.96)` on active, bounce-back easing
- **Skeleton Shimmer Polish**: Wave animation with theme-aware colors, staggered appearance classes

#### Phase 2 - Grid Enhancements
- **Media Card Hover Effects**: Lifted shadow + purple glow, `translateY(-4px)` lift, quick action buttons (Play/Heart) fade in
- **Thumbnail Load Animations**: Ken Burns effect while loading, scale 1.05→1.0 on load complete

#### Phase 3 - New Components
- **ProgressRing Component** (`src/renderer/components/ProgressRing.tsx`): SVG circle progress with gradient stroke, size variants (sm/md/lg), indeterminate mode
- **Tooltip Component** (`src/renderer/components/Tooltip.tsx`): Keyboard shortcut badges, 400ms hover delay, position-aware flipping, scale-in animation

#### Phase 4 - App-Level Polish
- **Page Transitions**: `pageEnter`/`pageExit` keyframes with slide + fade, direction-aware animations
- **Toast Improvements**: Countdown progress bar, stacked toasts with offset, optional action buttons, slide-out animation

#### Phase 5 - Command Palette Enhancement
- **Recent Actions**: Tracks last 8 commands in localStorage, shows when query empty
- **Typeahead Highlighting**: Bold matching characters in search results
- **Stagger Animation**: Results animate in with delay cascade
- **Visual Polish**: Gradient background, refined spacing

**Files Modified**:
```
src/renderer/index.css               # +300 lines of animations/effects
src/renderer/components/VirtualizedMediaGrid.tsx  # Enhanced cards & thumbnails
src/renderer/components/Skeleton.tsx             # New shimmer class
src/renderer/components/CommandPalette.tsx       # Full enhancement
src/renderer/contexts/ToastContext.tsx           # Progress bar, actions
src/renderer/types/index.ts                      # ToastAction type
```

**New Files**:
```
src/renderer/components/ProgressRing.tsx  # SVG progress indicator
src/renderer/components/Tooltip.tsx       # Contextual tooltips
```

### February 21, 2026

**Completed**:
- Created `src/renderer/types/index.ts` with shared TypeScript types
- Created `src/renderer/contexts/` with ToastContext and GlobalTaskContext
- Updated Window.api types in `src/types.d.ts`
- Verified existing error handling (ErrorBoundary.tsx) is comprehensive
- Verified existing loading states (Skeleton.tsx) are comprehensive
- Verified database indexes are optimized (migration v10)
- Consolidated all documentation files
- Updated README to v2.4.0

### Previous Session Highlights

**Feb 17-20, 2026**:
- Native notifications for downloads
- GoonWall stability improvements (slot limiting)
- URL downloader UX (toast notifications, quality selector)

**Feb 15, 2026**: PMV Editor implementation
- Video import with drag-drop
- BPM detection via Web Audio API
- Beat markers and templates

**Feb 12-13, 2026**: Major cleanup session
- 935 lines of dead code removed
- Memory leak fixes (timers, listeners)
- Performance optimizations (memoization, throttling)

---

## API Keys & Configuration

### Venice AI

The Venice AI API is used for Tier 3 cloud AI processing. The API key is stored in settings and can be configured in Settings > AI Tools.

```
API Endpoint: https://api.venice.ai/api/v1
Model: qwen3-vl-235b-a22b
```

### External Dependencies

| Dependency | Path | Purpose |
|---|---|---|
| FFmpeg | Bundled in resources | Video processing |
| FFprobe | Bundled in resources | Media probing |
| yt-dlp | System PATH or WinGet | URL downloads |
| Ollama | Local install (optional) | Tier 2 AI |

### Data Locations

| Data | Location |
|---|---|
| Database | `%APPDATA%/vault/vault.db` |
| Thumbnails | `%APPDATA%/vault/thumbs/` |
| Logs | `%APPDATA%/vault/logs/` |
| Settings | `%APPDATA%/vault/config.json` |

---

## Development Patterns

### Service Pattern

All backend services use singleton pattern:

```typescript
let instance: ServiceName | null = null
export function getServiceName(db: DB): ServiceName {
  if (!instance) instance = new ServiceName(db)
  return instance
}
```

### IPC Pattern

```typescript
ipcMain.handle('namespace:method', async (_ev, arg1, arg2) => {
  const service = getServiceName(db)
  return service.method(arg1, arg2)
})
```

### Performance Patterns

- Use `useMemo` for expensive computations
- Use `useCallback` for stable function references
- Throttle mousemove handlers (50ms)
- Limit concurrent video playback (6 max)
- Use LRU cache for file URLs (2000 entries)

---

## Troubleshooting

### Common Issues

**App won't start**:
- Check Node.js version (18+ required)
- Run `npm install` to ensure dependencies
- Check for port conflicts (5173, 8765)

**Videos not playing**:
- Verify FFmpeg/FFprobe in resources
- Check file permissions
- Try transcoding to proxy format

**AI features not working**:
- Verify Venice API key in settings
- Check network connectivity
- Models download on first use

**Mobile sync not connecting**:
- Verify both devices on same network
- Check firewall settings for port 8765
- Use QR code for pairing

---

*Built with obsession by developers who understand the mission.*
