<div align="center">

# 🔐 VAULT

### *Your Private Media Sanctuary*

[![Version](https://img.shields.io/badge/v2.6.0-Latest-brightgreen?style=for-the-badge)](https://github.com/Nwund/vault-project/releases)
[![Platform](https://img.shields.io/badge/Windows%20%7C%20macOS%20%7C%20Linux-Platform-blue?style=for-the-badge)](https://github.com/Nwund/vault-project)
[![Electron](https://img.shields.io/badge/Electron-32.0-47848F?style=for-the-badge&logo=electron&logoColor=white)](https://electronjs.org)
[![React](https://img.shields.io/badge/React-18.3-61DAFB?style=for-the-badge&logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://typescriptlang.org)

<br/>

**The ultimate private media library for discerning adults.**<br/>
*AI-powered • Privacy-first • Beautifully designed*

<br/>

[**⬇️ Download**](https://github.com/Nwund/vault-project/releases) · [**📖 Documentation**](#features) · [**🚀 Quick Start**](#quick-start)

<br/>

---

<br/>

<img src="https://img.shields.io/badge/AI%20Powered-Venice%20%2B%20ONNX-ff69b4?style=flat-square" alt="AI">
<img src="https://img.shields.io/badge/DLNA-Smart%20TV%20Streaming-success?style=flat-square" alt="DLNA">
<img src="https://img.shields.io/badge/Mobile-Sync%20%26%20Control-orange?style=flat-square" alt="Mobile">
<img src="https://img.shields.io/badge/GPU-Accelerated-purple?style=flat-square" alt="GPU">

</div>

<br/>

## 🆕 v2.6.0 — What's new

- **Browse aggregator** — 26-source parallel search across boorus, AI-gen platforms, tube sites, and social feeds (e621, rule34.xxx, Danbooru, AIBooru, Civitai, Gelbooru, Pixiv R-18, RedGifs, PornHub, RedTube, Eporner, xnxx, Bluesky, Reddit, and more). Multi-select bulk save, custom filename templates, in-library duplicate detection, Vault-tag-blacklist application, and source-family tabs.
- **ML detector stack** — six ONNX models wired into the AI tagging queue: YuNet face detection, SFace face recognition (with face_clusters table), Person ReID body embeddings, MoveNet pose detection, NudeNet v3 body-part detection, and a gender classifier. Plus whisper.cpp transcription, JoyCaption sidecar, and LAION aesthetic predictor.
- **Performers page** — face-cluster grid driven by SFace. Name a cluster once and every video featuring that face auto-gets a `performer:NAME` tag.
- **HLS-aware video lightbox** — xnxx + other tube playback now works via `hls.js` with yt-dlp as the universal fallback resolver.
- **Tag autocomplete** — Vault's canonical-tags vocabulary now drives in-place autocomplete in the Browse search bar.
- **Migrations v17 → v23** — face_clusters, face_embeddings, body_embeddings, multi-frame pHash, ai_analysis_results repairs, whisper transcripts (FTS5), CLIP embeddings.

See [CHANGELOG.md](CHANGELOG.md) for the full v2.6.0 release notes.

---

## ✨ Why Vault?

<table>
<tr>
<td width="50%">

### 🎯 **Built for Privacy**
Your collection stays on YOUR machine. No cloud uploads, no tracking, no telemetry. Panic key instantly hides everything.

</td>
<td width="50%">

### 🧠 **AI That Understands**
3-tier AI system auto-tags content, generates captions, and learns your preferences. Works offline too.

</td>
</tr>
<tr>
<td width="50%">

### 🎨 **Immersive Experience**
20+ visual overlays, 15+ themes, multiple view modes. From focused browsing to immersive walls.

</td>
<td width="50%">

### 📱 **Everywhere Access**
Stream to smart TVs via DLNA. Control from your phone. Your library, your way.

</td>
</tr>
</table>

<br/>

---

<br/>

## 🖼️ Screenshots

<div align="center">

| Library View | Goon Wall | Brainwash Editor |
|:---:|:---:|:---:|
| *Organize thousands of files* | *Multi-video immersive grid* | *AI captions & filters* |

| Feed Mode | PMV Editor | Mobile Sync |
|:---:|:---:|:---:|
| *TikTok-style navigation* | *Beat-synced video creation* | *Control from your phone* |

</div>

<br/>

---

<br/>

## 🚀 Quick Start

```bash
# Clone & Install
git clone https://github.com/Nwund/vault-project.git
cd vault-project && npm install

# Launch
npm run dev
```

**That's it!** Add your media folders in Settings and start exploring.

<br/>

---

<br/>

## 🎬 Features

### 📚 Library Management

| | Feature | Description |
|:---:|---|---|
| 🔍 | **Smart Scanning** | Auto-imports from watched folders |
| 🤖 | **AI Auto-Tagger** | Venice AI + ONNX analyzes content |
| 🏷️ | **Tag Categories** | Hierarchical organization system |
| 🔗 | **Tag Aliases** | Synonyms auto-resolve |
| 💾 | **Custom Filters** | Save complex filter combos |
| 👯 | **Duplicate Finder** | Hash, size, or name matching |
| ⚡ | **Batch Operations** | Bulk tag, rate, delete, organize |
| 📋 | **Watch Later** | Priority queue with reminders |

<br/>

### 🎥 Viewing Modes

<table>
<tr>
<td align="center" width="20%">
<h3>📖</h3>
<b>Library</b><br/>
<sub>Grid browsing with filters</sub>
</td>
<td align="center" width="20%">
<h3>📱</h3>
<b>Feed</b><br/>
<sub>TikTok-style swipe</sub>
</td>
<td align="center" width="20%">
<h3>🧱</h3>
<b>Goon Wall</b><br/>
<sub>Multi-video grid</sub>
</td>
<td align="center" width="20%">
<h3>🧠</h3>
<b>Brainwash</b><br/>
<sub>Caption editor</sub>
</td>
<td align="center" width="20%">
<h3>🎵</h3>
<b>PMV Editor</b><br/>
<sub>Beat-synced edits</sub>
</td>
</tr>
</table>

<br/>

### 🤖 AI Intelligence (3-Tier System)

```
┌─────────────────────────────────────────────────────────────┐
│  ☁️  TIER 3: Cloud AI (Venice API)                          │
│      • Advanced video analysis with qwen3-vl-235b           │
│      • Multi-frame scene understanding                      │
│      • Intelligent tag & caption generation                 │
├─────────────────────────────────────────────────────────────┤
│  🏠  TIER 2: Local LLM (Ollama)                             │
│      • Privacy-first processing                             │
│      • Tag cleanup and organization                         │
│      • Offline-capable with vision models                   │
├─────────────────────────────────────────────────────────────┤
│  ⚡  TIER 1: ONNX Models (Instant)                          │
│      • NSFWJS detection                                     │
│      • WD Tagger classification                             │
│      • Works completely offline                             │
└─────────────────────────────────────────────────────────────┘
```

<br/>

### 🎨 Visual Experience

| 🌈 Themes | 💫 Overlays | 🎭 Effects |
|---|---|---|
| Obsidian, Neon Dreams, Ember | Film Grain, CRT, Matrix Rain | Vignette, Chromatic, Glitch |
| Velvet, Sapphire, Midnight | Bokeh, Hearts, Aurora | Thermal, Dreamy, VHS |
| Arctic, Mint, Peach Blossom | Sparkles, Fire, Neon Drip | Pixelate, Strobe, Shake |
| *+ Goon themes: Hypno, Latex* | *20+ total overlays* | *15+ PMV transitions* |

<br/>

### 🎬 PMV/HMV Editor

Create professional-quality beat-synced videos:

- **🎵 BPM Detection** - Auto-detect beats from any audio
- **✂️ Smart Cuts** - 6 built-in templates (Classic, Hypno, Romantic...)
- **🔀 16 Transitions** - Flash, Glitch, Zoom, VHS, Pixelate...
- **📝 Beat Text** - Synced text overlays with 6 animation styles
- **🔊 Audio Burner** - Extract audio from any video

<br/>

### 📲 Mobile & Streaming

| Feature | Description |
|:---:|---|
| 📺 **DLNA Streaming** | Cast to smart TVs with full queue control |
| 📱 **Mobile Sync** | Browse & control from your phone |
| 🔗 **QR Pairing** | Instant device connection |
| 🎮 **Remote Control** | Playback controls from anywhere |

<br/>

### 🏆 Gamification

> *Turn your sessions into achievements*

- **50 Achievements** to unlock
- **Daily Challenges** for XP rewards
- **Personal Records** & streaks
- **Weekly Stats** tracking
- **Streak Protection** warnings

<br/>

---

<br/>

## 🛠️ Tech Stack

<div align="center">

| Layer | Technology |
|:---:|:---:|
| **Framework** | Electron 32 |
| **Frontend** | React 18 + TypeScript |
| **Styling** | Tailwind CSS |
| **Database** | SQLite (better-sqlite3) |
| **Media** | FFmpeg + FFprobe |
| **AI** | ONNX Runtime + Venice + Ollama |
| **Downloads** | yt-dlp |

</div>

<br/>

---

<br/>

## 📊 By the Numbers

<div align="center">

| | |
|:---:|:---:|
| **40+** Backend Services | **65+** UI Components |
| **25+** Database Tables | **20+** Visual Overlays |
| **50+** Achievements | **16** PMV Transitions |
| **15+** Themes | **3** AI Tiers |

</div>

<br/>

---

<br/>

## ⌨️ Keyboard Shortcuts

| Key | Action | | Key | Action |
|:---:|---|---|:---:|---|
| `Space` | Play/Pause | | `L` | Like/Favorite |
| `←` `→` | Navigate/Seek | | `B` | Bookmark |
| `↑` `↓` | Volume/Scroll | | `D` | Downloader |
| `F` | Fullscreen | | `Ctrl+K` | Command Palette |
| `M` | Mute | | `Ctrl+Z` | Undo Delete |
| `H` | Hide UI | | `Esc` | **Panic Key** |

<br/>

---

<br/>

## 🔒 Privacy & Security

<table>
<tr>
<td align="center">💾<br/><b>100% Local</b><br/><sub>All data on your machine</sub></td>
<td align="center">🚫<br/><b>No Telemetry</b><br/><sub>Zero data collection</sub></td>
<td align="center">🚨<br/><b>Panic Key</b><br/><sub>Instant hide (Esc)</sub></td>
</tr>
<tr>
<td align="center">👻<br/><b>Incognito Mode</b><br/><sub>No history recording</sub></td>
<td align="center">🔐<br/><b>Encrypted Backup</b><br/><sub>Secure data export</sub></td>
<td align="center">🛡️<br/><b>Context Isolation</b><br/><sub>Secure Electron config</sub></td>
</tr>
</table>

<br/>

---

<br/>

## 📝 Recent Updates

### v2.4.0 *(Latest)*

**🚀 Stability, Performance & Polish Release**

- ✨ **GoonWall Stability** - Improved video slot limiting and playback recovery
- ✨ **URL Downloader UX** - Quality selector, auto-import, toast notifications
- ✨ **Native Notifications** - OS notifications when downloads complete
- ✨ **Database Performance** - New indexes for faster duplicate detection and filtering
- ✨ **Memory Optimizations** - Fixed timer/listener leaks, improved cleanup
- ✨ **Code Quality** - Removed 935 lines of dead code, improved type safety
- ✨ **PMV Editor Polish** - Live preview, improved BPM detection
- ✨ **GIF Thumbnails** - Better GIF thumbnail generation with fallbacks

### v2.3.0

**🎬 30 Professional Video Editing & Media Management Components**

- ✨ **Scene Detector** - AI-powered scene detection with frame analysis
- ✨ **Video Chapters** - Chapter navigation with custom markers and thumbnails
- ✨ **Color Grading** - Professional color grading with 5 cinematic presets
- ✨ **Loop Region** - A/B loop region selector with saved loops
- ✨ **Bookmark Manager** - Video timestamp bookmarks with notes/categories
- ✨ **Subtitle Editor** - Full subtitle editor with SRT import/export
- ✨ **Thumbnail Strip** - Video timeline with hover thumbnail preview
- ✨ **Audio Visualizer** - Real-time visualization (bars, wave, circular, spectrum)
- ✨ **PiP Controller** - Picture-in-Picture with position presets
- ✨ **Keyframe Extractor** - Extract keyframes at configurable intervals
- ✨ **Video Filters** - Real-time filters (vivid, warm, cool, noir, vintage, dreamy)
- ✨ **Split Screen** - Multi-video split screen player (2-6 videos)
- ✨ **Smart Crop** - AI-assisted cropping with aspect ratio presets
- ✨ **Metadata Editor** - Advanced metadata editor with custom fields
- ✨ **Playlist Sorter** - Advanced sorting with drag-reorder
- ✨ **Watch Progress** - Continue watching tracker with progress bars
- ✨ **Media Exporter** - Export with format conversion (mp4, webm, mkv, gif)
- ✨ **AI Tagger** - AI-powered auto-tagging with confidence thresholds
- ✨ **Thumbnail Selector** - Select/generate custom thumbnails from any frame
- ✨ **Related Media** - Smart related media suggestions
- ✨ **Media Timeline** - Timeline view by date (day/week/month)
- ✨ **Quick Note** - Quick notes with colors, pinning, and timestamps
- ✨ **View Mode Selector** - 7 view modes (grid, list, masonry, timeline, carousel...)
- ✨ **Auto Playlist** - Auto-generated playlists based on behavior
- ✨ **Media Merger** - Merge multiple videos with transitions
- ✨ **Media Rotator** - Rotate and flip with undo history
- ✨ **Watermark Adder** - Add text/image watermarks with 9 positions
- ✨ **Speed Ramp** - Variable speed ramping with graph editor
- ✨ **Media Queue** - Playback queue with shuffle and repeat modes
- ✨ **Aspect Ratio Switcher** - Quick aspect ratio switching with zoom/pan

<details>
<summary><b>Previous Versions</b></summary>

### v2.2.0

**🎯 35 New Components for Ultimate Experience**

- ✨ **Command Palette** - Spotlight-style launcher (Ctrl+K)
- ✨ **Watch History Timeline** - Visual timeline with session groupings
- ✨ **Content Queue** - Smart queue with drag-reorder and shuffle
- ✨ **Discovery Engine** - AI-powered suggestions that learn preferences
- ✨ **Edge Mode** - Timer-based intensity sessions with 5 presets
- ✨ **Immersive Mode** - Distraction-free fullscreen with gesture controls
- ✨ **Quick Actions Panel** - Floating panel with Alt+key shortcuts
- ✨ **Session Summary** - Post-session stats and insights
- ✨ **Smart Playlist Builder** - Visual rule-based playlist creation
- ✨ **Ambient Mode** - Dynamic lighting from video frame colors
- ✨ **Video Preloader** - Smooth transitions with smart preloading
- ✨ **Streaks & Achievements** - Gamification with 50+ achievements
- ✨ **Gesture Controls** - Touch/swipe controls for mobile-like navigation
- ✨ **Theater Mode Controller** - Enhanced theater mode settings
- ✨ **Slideshow Controller** - Advanced slideshow with 8+ transitions
- ✨ **Quick Rating** - Star rating with hover preview
- ✨ **Playback Speed Control** - Speed selector with custom presets
- ✨ **Media Info Overlay** - Detailed media metadata panel
- ✨ **Search History** - Search suggestions with recent history
- ✨ **Playlist Quick Add** - Quick add to playlists with search
- ✨ **Tag Autocomplete** - Smart tag input with suggestions
- ✨ **Screenshot Capture** - Capture frames with format/scale options
- ✨ **Hotkey Help** - Full keyboard shortcut reference (press ?)
- ✨ **Context Menu** - Right-click menus with submenus
- ✨ **Media Preview** - Hover preview with video scrubbing
- ✨ **Batch Actions** - Bulk operations with confirmation dialogs
- ✨ **Import Progress** - Import queue with progress tracking
- ✨ **Folder Watcher** - Watch folder management with status
- ✨ **Volume Normalizer** - Audio normalization with compressor/limiter
- ✨ **Media Comparison** - Side-by-side comparison with sync playback
- ✨ **Duplicate Finder** - Find duplicates with hash comparison
- ✨ **Media Stats** - Analytics dashboard with trends
- ✨ **Quick Search** - Instant search with keyboard navigation
- ✨ **Performer Tagger** - Actor tagging with AI suggestions
- ✨ **Collection Manager** - Hierarchical collections with drag-drop

### v2.1.7
- Floating Labels - Draggable text anywhere on images
- Vignette Effect - Cinematic borders with slider control
- Beat-Synced Text - PMV text overlays synced to music
- 9 New Transitions - VHS, Spin, Blur, Pixelate, Wipe...
- 6 New Effects - Chromatic, Strobe, Thermal, Dreamy...
- Home Dashboard - Today's Picks, Trending, Unwatched sections
- Series Modal - View and play full series in order

### v2.1.6
- Audio Burner in PMV Editor
- GoonWall auto-shuffle control
- Climax point toggle

### v2.1.5
- Smart Playlists
- Venice AI Captions
- Welcome Tutorial
- Video Frame Capture
- Image Cropping
- Settings Search

</details>

<br/>

---

<br/>

## 🗺️ Roadmap

| Version | Features |
|:---:|---|
| **v2.5** | Plugin System • Cloud Sync • Watch Parties • Multi-language |
| **v3.0** | AI Scene Intelligence • Multi-user • Cloud Library • Mobile App |

<br/>

---

<br/>

<div align="center">

## 📥 Get Started

<br/>

[![Download Latest](https://img.shields.io/badge/Download-v2.4.0-success?style=for-the-badge&logo=windows)](https://github.com/Nwund/vault-project/releases/latest)

<br/>

**Requirements:** Node.js 18+ • npm 9+ • Windows 10+ / macOS 11+ / Linux

<br/>

---

<br/>

*Built with obsession by developers who understand the mission.*

<sub>
🔐 Vault v2.4.0 • 61 services • 73 modules • 94 components
</sub>

<br/>
<br/>

</div>
