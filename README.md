<p align="center">
  <img src="src/renderer/assets/vault-logo.png" alt="Vault Logo" width="120" height="120">
</p>

<h1 align="center">VAULT</h1>

<p align="center">
  <strong>The Ultimate Private Media Library for Adults</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-2.1.5-blue.svg" alt="Version">
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg" alt="Platform">
  <img src="https://img.shields.io/badge/electron-32.0.0-47848F.svg" alt="Electron">
  <img src="https://img.shields.io/badge/react-18.3.1-61DAFB.svg" alt="React">
  <img src="https://img.shields.io/badge/typescript-5.7-3178C6.svg" alt="TypeScript">
  <img src="https://img.shields.io/badge/license-Private-red.svg" alt="License">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/AI%20Powered-Venice%20AI-ff69b4.svg" alt="AI Powered">
  <img src="https://img.shields.io/badge/DLNA-Streaming-green.svg" alt="DLNA">
  <img src="https://img.shields.io/badge/GPU-Accelerated-orange.svg" alt="GPU Accelerated">
</p>

---

## Overview

**Vault** is a powerful, privacy-focused desktop application for organizing, viewing, and enjoying your adult media collection. Built with Electron and React, it offers a sleek, immersive experience with AI-powered features, customizable visual effects, and comprehensive library management.

### Key Highlights

- **Massive Library Support** - Handles 10,000+ files effortlessly with virtual scrolling
- **AI-Powered Tagging** - 3-tier AI system for automatic content analysis
- **Immersive Visual Effects** - 20+ overlays including CRT, film grain, particles
- **Multiple View Modes** - Library, Feed, Goon Wall, Brainwash, Sessions
- **DLNA Streaming** - Cast to smart TVs and devices
- **Mobile Sync** - Control and browse from your phone
- **Complete Privacy** - All data stays local, panic key support

---

## Features

### Library Management

| Feature | Description |
|---------|-------------|
| **Smart Scanning** | Auto-imports videos, images, GIFs from watched folders |
| **AI Auto-Tagger** | Venice AI + ONNX models analyze and categorize content |
| **Tag Categories** | Hierarchical organization (People, Actions, Style, etc.) |
| **Tag Aliases** | Synonyms automatically resolve to canonical tags |
| **Custom Filters** | Save complex filter combinations for quick access |
| **Duplicate Finder** | Detect exact/similar duplicates by hash, size, or name |
| **Batch Operations** | Bulk tag, rate, delete, or organize media |
| **Watch Later Queue** | Priority-ordered queue with reminders |
| **Smart Playlists** | Auto-updating playlists based on custom rules |

### Viewing Experience

| Feature | Description |
|---------|-------------|
| **Feed Mode** | TikTok-style full-screen swipe navigation (keyboard + mouse + touch) |
| **Goon Wall** | Multi-video grid with sync, cascade shuffle, and transitions |
| **Brainwash Mode** | Caption editor with AI generation, filters, and cropping |
| **Sessions** | Curated playlists with templates and smart rules |
| **Video Bookmarks** | Save timestamps, export as FFmpeg chapters |
| **Scene Markers** | Right-click timeline to mark key moments |
| **Image Zoom** | Scroll wheel zoom with click-drag pan |
| **Floating Player** | Resizable picture-in-picture video player |

### Downloads & Import

| Feature | Description |
|---------|-------------|
| **URL Downloader** | Download from 1000+ sites via yt-dlp integration |
| **Quality Selection** | Choose Best, 1080p, 720p, 480p, or Audio Only |
| **Auto-Import** | Automatically add downloads to library |
| **Drag & Drop** | Drop files directly into library to import |
| **Progress Tracking** | Real-time download progress with thumbnails |

### Visual Effects & Themes

| Category | Options |
|----------|---------|
| **Overlays** | Film Grain, CRT, Bokeh, Sparkles, Hearts, Rain, Matrix, Aurora, Fire, Neon Drip, TV Border, Glitch, and 15+ more |
| **Dark Themes** | Obsidian, Neon Dreams, Ember, Velvet, Sapphire, Midnight Purple |
| **Light Themes** | Arctic, Linen, Mint Cream, Peach Blossom, Sky Blue, Lavender, Coral |
| **Goon Themes** | Submissive, Dominant, Latex, Bimbo, Hypno |
| **GoonWords** | Floating text with customizable fonts, colors, presets |
| **Accessibility** | Color blind modes, reduced motion, font scaling |

### AI Intelligence (3-Tier System)

```
+-----------------------------------------------------------+
|  TIER 3: Cloud AI (Venice API)                            |
|  - Advanced video analysis with qwen3-vl-235b             |
|  - Multi-frame scene understanding                        |
|  - Intelligent tag generation                             |
|  - AI caption generation for Brainwash                    |
+-----------------------------------------------------------+
|  TIER 2: Local LLM (Ollama)                               |
|  - Privacy-first processing                               |
|  - Tag cleanup and organization                           |
|  - Filename suggestions                                   |
+-----------------------------------------------------------+
|  TIER 1: ONNX Models (Offline)                            |
|  - NSFWJS detection                                       |
|  - WD Tagger classification                               |
|  - Works without internet                                 |
+-----------------------------------------------------------+
```

### Brainwash / Caption Editor

| Feature | Description |
|---------|-------------|
| **17 Text Presets** | Pre-configured caption styles |
| **AI Captions** | Venice AI generates captions in 5 styles |
| **Image Filters** | Pixelate, low quality, saturation, contrast |
| **Cropping** | Canvas-based image cropping |
| **Video Frame Capture** | Capture video frames for captioning |
| **Caption Bars** | Black/white bars with size control |
| **Drag Text** | Position text anywhere on image |
| **Export** | Save as new file or add to library |

### Mobile Sync

| Feature | Description |
|---------|-------------|
| **QR Pairing** | Scan QR code to connect mobile device |
| **Remote Browse** | Browse library from phone browser |
| **Remote Control** | Control playback from mobile |
| **Auto-Discovery** | Devices automatically find server on LAN |

### Gamification

| Feature | Description |
|---------|-------------|
| **50 Achievements** | Unlock achievements for various activities |
| **Daily Challenges** | Complete tasks for XP rewards |
| **Personal Records** | Track your best streaks and stats |
| **Weekly Stats** | Sessions, videos watched, time spent |
| **Streak Protection** | Warnings when streaks are at risk |

### Backend Services (40+)

<details>
<summary><strong>Click to expand full service list</strong></summary>

#### Core Services
- `db.ts` - SQLite database with better-sqlite3
- `scanner.ts` - Media file discovery and import
- `thumbs.ts` - Thumbnail generation with FFmpeg
- `settings.ts` - Persistent configuration
- `transcode.ts` - Video transcoding with queue system

#### Media Services
- `video-bookmarks.ts` - Timestamp bookmarks
- `media-notes.ts` - Personal annotations
- `media-relationships.ts` - Link related content
- `media-info.ts` - Detailed file metadata
- `metadata-extractor.ts` - FFprobe analysis
- `scene-detection.ts` - Chapter detection

#### Organization Services
- `tag-categories.ts` - Hierarchical tags
- `tag-aliases.ts` - Synonym management
- `custom-filters.ts` - Saved filter presets
- `auto-organize.ts` - Rule-based sorting
- `collections.ts` - Media grouping
- `performers.ts` - Performer profiles

#### Discovery Services
- `global-search.ts` - Full-text search
- `similar-content.ts` - Perceptual hashing
- `duplicates-finder.ts` - Duplicate detection
- `smart-playlists.ts` - Dynamic playlists

#### Tracking Services
- `watch-history.ts` - View tracking
- `rating-history.ts` - Rating changes over time
- `session-history.ts` - Viewing sessions
- `analytics.ts` - Usage statistics
- `advanced-stats.ts` - Deep insights

#### Utility Services
- `watch-later.ts` - Queue management
- `favorite-folders.ts` - Quick access
- `view-presets.ts` - Layout saves
- `quick-actions.ts` - Keyboard shortcuts
- `keyboard-shortcuts.ts` - Custom bindings
- `notifications.ts` - System alerts
- `error-logger.ts` - Persistent error logging

#### Media Processing
- `export-service.ts` - Media export
- `import-service.ts` - Bulk import
- `backup-restore.ts` - Data backup
- `batch-operations.ts` - Bulk actions
- `media-compare.ts` - Side-by-side view
- `url-downloader-service.ts` - yt-dlp integration

#### Integration Services
- `dlna-service.ts` - TV streaming
- `mobile-sync.ts` - Phone connectivity
- `file-watcher.ts` - Auto-scan folders
- `scheduled-tasks.ts` - Background jobs

#### AI Services
- `ai-intelligence/` - 3-tier AI system
- `tagging/smart-tagger.ts` - AI tagging
- `tagging/hybrid-tagger.ts` - Combined approach
- `ai/video-analyzer.ts` - Content analysis

#### Audio Services
- `audio/voice-line-service.ts` - Voice playback
- `audio/sound-organizer.ts` - Sound management
- `slideshow.ts` - Ambient soundscapes

</details>

---

## Installation

### Requirements
- **Node.js** 18+
- **npm** 9+
- **FFmpeg** (auto-downloaded or system install)
- **yt-dlp** (optional, for URL downloads)
- **Windows 10+** / **macOS 11+** / **Linux** (Ubuntu 20.04+)

### Development Setup

```bash
# Clone repository
git clone https://github.com/Nwund/vault-project.git
cd vault-project

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

### Build Outputs
- **Windows**: `release/vault-setup.exe` (NSIS installer)
- **macOS**: `release/vault.dmg`
- **Linux**: `release/vault.AppImage`

---

## Configuration

### Media Directories
Add folders in **Settings > Library > Media Directories**. Vault watches these for new content.

### AI Setup

**Venice AI (Recommended)**
1. Get API key from [Venice AI](https://venice.ai)
2. Enter in **Settings > AI > Venice API Key**

**Ollama (Local)**
1. Install [Ollama](https://ollama.ai)
2. Pull a vision model: `ollama pull llava`
3. Enable in **Settings > AI > Use Ollama**

### URL Downloader Setup
1. Install yt-dlp via your package manager:
   - Windows: `winget install yt-dlp`
   - macOS: `brew install yt-dlp`
   - Linux: `pip install yt-dlp`
2. Vault auto-detects yt-dlp from common install locations

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Space` | Play/Pause |
| `Left/Right` | Previous/Next or Seek |
| `Up/Down` | Volume or Navigate |
| `F` | Fullscreen |
| `M` | Mute |
| `L` | Like/Favorite |
| `B` | Add Bookmark |
| `H` | Hide UI |
| `D` | URL Downloader |
| `?` | Show All Shortcuts |
| `Ctrl+K` | Command Palette |
| `Ctrl+Z` | Undo Delete |
| `Escape` | Panic Key (instant hide) |

---

## Architecture

```
vault/
├── src/
│   ├── main/           # Electron main process
│   │   ├── services/   # 40+ backend services
│   │   ├── ipc.ts      # IPC handlers (~6500 lines)
│   │   ├── db.ts       # SQLite database
│   │   └── index.ts    # Main entry
│   ├── renderer/       # React frontend
│   │   ├── components/ # UI components
│   │   ├── hooks/      # Custom hooks
│   │   └── App.tsx     # Main app (~18000 lines)
│   └── preload/        # Preload scripts
├── electron.vite.config.ts
└── package.json
```

### Tech Stack

| Layer | Technology |
|-------|------------|
| **Framework** | Electron 32 |
| **Frontend** | React 18.3 + TypeScript 5.7 |
| **Styling** | Tailwind CSS 3.4 |
| **Database** | SQLite (better-sqlite3) |
| **Build** | electron-vite 5.0 |
| **Media** | FFmpeg + FFprobe |
| **AI** | ONNX Runtime + Venice API + Ollama |
| **Downloads** | yt-dlp |

---

## Database Schema

<details>
<summary><strong>Click to expand table list</strong></summary>

### Core Tables
- `media` - Main media items
- `tags` - Tag definitions
- `media_tags` - Media-tag relationships
- `playlists` - Playlist definitions (with smart playlist support)
- `playlist_items` - Playlist contents

### Stats & History
- `media_stats` - Play counts, ratings
- `watch_history` - View history
- `rating_history` - Rating changes
- `viewing_sessions` - Session tracking
- `search_history` - Search queries

### Organization
- `tag_categories` - Category hierarchy
- `tag_aliases` - Synonym mappings
- `media_relationships` - Content links
- `media_notes` - User notes
- `collections` - Media groups
- `performers` - Performer profiles

### Features
- `video_bookmarks` - Timestamp markers
- `custom_filters` - Saved filters
- `watch_later` - Queue items
- `favorite_folders` - Quick access
- `smart_playlists` - Dynamic lists
- `scheduled_tasks` - Background jobs
- `caption_templates` - Brainwash presets

### AI & Processing
- `media_hashes` - Perceptual hashes
- `ai_cache` - Analysis cache
- `ai_analysis_results` - AI tagging results
- `ai_review_queue` - Pending reviews

</details>

---

## Recent Updates (v2.1.5)

### New Features
- **Downloads Page** - Full navigation tab for URL downloads
- **Smart Playlists** - Auto-updating playlists with custom rules
- **Venice AI Captions** - AI-generated captions in Brainwash
- **Welcome Tutorial** - 5-step guided tour for new users
- **Video Frame Capture** - Capture frames from videos in Brainwash
- **Image Cropping** - Canvas-based crop tool in Brainwash
- **Drag-Drop Text** - Position caption text anywhere on image
- **Settings Search** - Find settings by keyword
- **Streak Protection** - Warnings when losing your streak
- **Personal Records** - Track your best stats

### Improvements
- **Feed Mousewheel** - Smooth scroll navigation with trackpad support
- **GoonWall Stability** - Playback slot limiter prevents stuttering
- **Startup Performance** - Deferred loading for faster window display
- **Error Logging** - Persistent logs in userData/logs
- **Thumbnail Cache** - Configurable memory cache size (500-10000)
- **Light Mode** - Improved UI for light themes
- **Accessibility** - Color blind modes, screen reader support

### Bug Fixes
- Fixed React hooks order error in Feed page
- Fixed yt-dlp detection for WinGet/Scoop/Chocolatey
- Fixed GPU cache access errors on startup
- Fixed duplicate caption template prevention
- Fixed dev server port conflicts

---

## Roadmap

### v2.2.0 (Next)
- [ ] GIF Creation from video clips
- [ ] PMV/HMV Editor with BPM sync
- [ ] Video cropping feature
- [ ] AI scene detection
- [ ] Enhanced mobile companion

### v3.0.0 (Future)
- [ ] Cloud sync (encrypted metadata)
- [ ] Plugin system
- [ ] Watch parties (synchronized viewing)
- [ ] Multi-language support

---

## Privacy & Security

- **100% Local** - All data stored on your machine
- **No Telemetry** - Zero data collection
- **Panic Key** - Instant hide with Escape
- **Incognito Mode** - No history recording
- **Encrypted Backup** - Secure data export
- **Context Isolation** - Secure Electron configuration

---

## Stats

```
Version:     2.1.5
Modules:     71
Bundle:      952 KB
Services:    40+
IPC Lines:   ~6500
App.tsx:     ~18000 lines
DB Tables:   25+
Themes:      15+
Overlays:    20+
Achievements: 50
```

---

## Contributing

This is a private project. For access or collaboration inquiries, contact the repository owner.

---

## License

Private and proprietary. All rights reserved.

---

<p align="center">
  <strong>Built with obsession by developers who understand the mission.</strong>
</p>

<p align="center">
  <sub>Vault v2.1.5 | 71 modules | 952 KB bundle | 40+ services</sub>
</p>
