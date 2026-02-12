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
  <img src="https://img.shields.io/badge/electron-28.0.0-47848F.svg" alt="Electron">
  <img src="https://img.shields.io/badge/react-18.2.0-61DAFB.svg" alt="React">
  <img src="https://img.shields.io/badge/typescript-5.0-3178C6.svg" alt="TypeScript">
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

- **Massive Library Support** - Handles 10,000+ files effortlessly
- **AI-Powered Tagging** - Automatic content analysis and categorization
- **Immersive Visual Effects** - 20+ overlays including CRT, film grain, particles
- **Multiple View Modes** - Library, Feed, Goon Wall, Brainwash, Sessions
- **DLNA Streaming** - Cast to smart TVs and devices
- **Complete Privacy** - All data stays local, panic key support

---

## Features

### Library Management

| Feature | Description |
|---------|-------------|
| **Smart Scanning** | Auto-imports videos, images, GIFs from watched folders |
| **AI Auto-Tagger** | Venice AI analyzes content and generates relevant tags |
| **Tag Categories** | Hierarchical organization (People, Actions, Style, etc.) |
| **Tag Aliases** | Synonyms automatically resolve to canonical tags |
| **Custom Filters** | Save complex filter combinations for quick access |
| **Duplicate Finder** | Detect exact/similar duplicates by hash, size, or name |
| **Batch Operations** | Bulk tag, rate, delete, or organize media |
| **Watch Later Queue** | Priority-ordered queue with reminders |

### Viewing Experience

| Feature | Description |
|---------|-------------|
| **Feed Mode** | Full-screen swipe navigation (keyboard + mouse + touch) |
| **Goon Wall** | Multi-video grid with sync and cascade shuffle |
| **Brainwash Mode** | Hypnotic slideshow with subliminal effects |
| **Sessions** | Curated playlists with templates |
| **Video Bookmarks** | Save timestamps, export as FFmpeg chapters |
| **Scene Markers** | Right-click timeline to mark key moments |
| **Image Zoom** | Scroll wheel zoom with click-drag pan |

### Visual Effects & Themes

| Category | Options |
|----------|---------|
| **Overlays** | Film Grain, CRT, Bokeh, Sparkles, Hearts, Rain, Matrix, Aurora, Fire, Neon Drip, and 15+ more |
| **Dark Themes** | Obsidian, Neon Dreams, Ember, Velvet, Sapphire, Midnight Purple |
| **Light Themes** | Arctic, Linen, Mint Cream, Peach Blossom, Sky Blue, Lavender, Coral |
| **Goon Themes** | Submissive, Dominant, Latex, Bimbo, Hypno |
| **GoonWords** | Floating text with customizable fonts, colors, presets |

### AI Intelligence (3-Tier System)

```
+-----------------------------------------------------------+
|  TIER 3: Cloud AI (Venice API)                            |
|  - Advanced video analysis                                |
|  - Multi-frame scene understanding                        |
|  - Intelligent tag generation                             |
+-----------------------------------------------------------+
|  TIER 2: Local LLM (Ollama)                               |
|  - Privacy-first processing                               |
|  - Tag cleanup and organization                           |
|  - Filename suggestions                                   |
+-----------------------------------------------------------+
|  TIER 1: ONNX Models (Offline)                            |
|  - NSFW detection                                         |
|  - Content classification                                 |
|  - Works without internet                                 |
+-----------------------------------------------------------+
```

### Backend Services (40+)

<details>
<summary><strong>Click to expand full service list</strong></summary>

#### Core Services
- `db.ts` - SQLite database with better-sqlite3
- `scanner.ts` - Media file discovery and import
- `thumbs.ts` - Thumbnail generation with FFmpeg
- `settings.ts` - Persistent configuration

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

#### Media Processing
- `export-service.ts` - Media export
- `import-service.ts` - Bulk import
- `backup-restore.ts` - Data backup
- `batch-operations.ts` - Bulk actions
- `media-compare.ts` - Side-by-side view

#### Integration Services
- `dlna-service.ts` - TV streaming
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
- **Windows**: `dist/vault-setup.exe` (NSIS installer)
- **macOS**: `dist/vault.dmg`
- **Linux**: `dist/vault.AppImage`

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

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Space` | Play/Pause |
| `Left/Right` | Previous/Next |
| `Up/Down` | Volume |
| `F` | Fullscreen |
| `M` | Mute |
| `L` | Like/Favorite |
| `B` | Add Bookmark |
| `H` | Hide UI |
| `Ctrl+K` | Command Palette |
| `Escape` | Panic Key (instant hide) |

---

## Architecture

```
vault/
├── src/
│   ├── main/           # Electron main process
│   │   ├── services/   # 40+ backend services
│   │   ├── ipc.ts      # IPC handlers (~6000 lines)
│   │   ├── db.ts       # SQLite database
│   │   └── index.ts    # Main entry
│   ├── renderer/       # React frontend
│   │   ├── components/ # UI components
│   │   ├── hooks/      # Custom hooks
│   │   └── App.tsx     # Main app
│   └── preload/        # Preload scripts
├── electron.vite.config.ts
└── package.json
```

### Tech Stack

| Layer | Technology |
|-------|------------|
| **Framework** | Electron 28 |
| **Frontend** | React 18 + TypeScript |
| **Styling** | Tailwind CSS |
| **Database** | SQLite (better-sqlite3) |
| **Build** | electron-vite |
| **Media** | FFmpeg + FFprobe |
| **AI** | ONNX Runtime + Venice API + Ollama |

---

## Database Schema

<details>
<summary><strong>Click to expand table list</strong></summary>

### Core Tables
- `media` - Main media items
- `tags` - Tag definitions
- `media_tags` - Media-tag relationships
- `playlists` - Playlist definitions
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

### AI & Processing
- `media_hashes` - Perceptual hashes
- `ai_cache` - Analysis cache

</details>

---

## Roadmap

### v2.1.5 (Current)
- [x] 11 new backend services
- [x] AI Intelligence 3-tier system
- [x] 20+ visual overlays
- [x] DLNA streaming
- [x] Command palette
- [x] Touch/swipe support

### v2.2.0 (Next)
- [ ] Frontend UI for new services
- [ ] Watch Later page
- [ ] Bookmarks panel in player
- [ ] Duplicates manager modal
- [ ] Performance optimizations

### v3.0.0 (Future)
- [ ] Mobile app (React Native)
- [ ] Cloud sync (encrypted)
- [ ] Plugin system
- [ ] Community presets

---

## Privacy & Security

- **100% Local** - All data stored on your machine
- **No Telemetry** - Zero data collection
- **Panic Key** - Instant hide with Escape
- **Incognito Mode** - No history recording
- **Encrypted Backup** - Secure data export

---

## Stats

```
Version:     2.1.5
Modules:     69
Bundle:      846 KB
Services:    40+
IPC Lines:   ~6000
DB Tables:   25+
Themes:      15+
Overlays:    20+
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
  <sub>Vault v2.1.5 | 69 modules | 846 KB bundle | 40+ services</sub>
</p>
