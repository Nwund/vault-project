<div align="center">

# 🔐 VAULT

### *Your Private Media Sanctuary*

[![Version](https://img.shields.io/badge/v2.7.0-Latest-brightgreen?style=for-the-badge)](https://github.com/Nwund/vault-project/releases)
[![Platform](https://img.shields.io/badge/Windows%20%7C%20macOS%20%7C%20Linux-Platform-blue?style=for-the-badge)](https://github.com/Nwund/vault-project)
[![Electron](https://img.shields.io/badge/Electron-32.0-47848F?style=for-the-badge&logo=electron&logoColor=white)](https://electronjs.org)
[![React](https://img.shields.io/badge/React-19.2-61DAFB?style=for-the-badge&logo=react&logoColor=white)](https://react.dev)
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

## 🆕 v2.7.0 — The integration sweep (2026-05-17)

The largest release since v2.6.0. Every preload bridge that had no UI surface now has one. **32 new components**, **23 new Settings cards**, **6 player overlay buttons**, **8 Library Tools entries**, plus React 19 + React Compiler.

- **Settings → Services tab** gained 23 cards across themed sections: Decentralized (Iroh / Hyperswarm / Helia / Syncthing), Privacy (Veilid / Tor / WebTransport / Nostr), Social (Bluesky labeler / UnifiedPush / IMAP), AI gen (Video Diffusion / VaultMl sidecar), Tag intelligence (Tag implications / Folder actions), Security (WebAuthn / Shamir / ntfy), Content imports (Coomer / AudioErotica / CaptionPool / yt-dlp profiles)
- **Library page** got Stack Mode pager, Quick Look (hold-Q), Color Palette filter chip, Duplicate Triage modal, Animated sub-library facet picker, Sprite-sheet Chapter editor, Export Pipeline recipe builder, SidecarWatcher status badge in TopBar
- **Floating player** gained a right-edge overlay rail with 7 toggles: LUT grade · Subtitles · Scopes · Beats (Cock-Hero) · Heatmap · Quick Look · Capture moment
- **Right-click context menu** added Share via Iroh, Pin to IPFS, Open Export Pipeline, Auto-tease, Deny for, Feature less
- **MediaInfoModal** gained an Obsidian-style backlinks panel
- **AI Tools** added JoyTag + Real-ESRGAN cards + an Audits section (Quality auditor + Clip similarity)
- **MessagePort scrub-thumb fast-path** — ffmpeg-backed disk-cached thumbnails, second-pass scrubbing is near-instant
- **View Transitions API** wrapping page navigation for GPU-accelerated cross-page morph
- **React 19.2 + React Compiler** in annotation mode, 21 v2.7 components opted in
- **Bug fixes**: watch-history `m.rating` SQL error, PlaylistsPage `allMedia.filter` crash, bridge access paths corrected across 9 files

See [CHANGELOG.md](CHANGELOG.md) for the full v2.7.0 notes.

## 🆕 v2.6.1 — Polish patch

- **One-click installs** — CLIP BPE vocab + NudeNet model (Nano / Medium) now install with a single click from AI Tools. No more "open DevTools and drop a file."
- **8 more detector status cards** — SFace, Person ReID, DB+CRNN OCR, LAION aesthetic, deepfake / AI-face, AI-image, WhisperX sidecar, F5-TTS sidecar — all probe their own state and show install path + size in AI Tools.
- **WhisperX auto-start + consumer** — when the WhisperX Python sidecar is configured + opted in, transcripts route through it for word-level + speaker-diarized output instead of whisper.cpp.
- **TS sweep** — `npx tsc --noEmit` clean across the codebase.
- **Booru video CDN fix** — gray-frame playback on xbooru / gelbooru / realbooru / tbib / hypnohub / paheal solved at the network layer via Electron `webRequest.onBeforeSendHeaders` Referer strip.
- **ML wrapper backlog doc** — `docs/ML_WRAPPER_BACKLOG.md` is the single index of every optional ML add-on with status (shipped / functional / scaffold).

See [CHANGELOG.md](CHANGELOG.md) for full v2.6.1 notes.

## 🆕 v2.6.0 — What's new

- **Browse aggregator** — 27-source parallel search across boorus, AI-gen platforms, tube sites, and social feeds (e621, rule34.xxx, Danbooru, AIBooru, Civitai, Gelbooru, Pixiv R-18, RedGifs, PornHub, RedTube, Eporner, xnxx, Bluesky, PullPush/Reddit archive, and more). Multi-select bulk save, custom filename templates, in-library duplicate detection, Vault-tag-blacklist application, source-family tabs, and a filter popover with active-count badge.
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
cd vault-project
npm install --legacy-peer-deps
npx electron-builder install-app-deps

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
│  🌐  TIER 3: Synonym → canonical-tag mapping                │
│      • Maps free-text into Vault's porn-site tag vocab      │
│      • Atomic tags only, deny-listed clinical/anime meta    │
├─────────────────────────────────────────────────────────────┤
│  ☁️  TIER 2: Venice vision LLM (qwen3-vl-235b)              │
│      • Multi-frame scene understanding                      │
│      • Title + description + rich-tag generation            │
│      • Library-wide rejection-pattern soft prior            │
├─────────────────────────────────────────────────────────────┤
│  ⚡  TIER 1: Local ONNX (offline, instant)                  │
│      • Multi-tagger ensemble (WD-Tagger variants + consensus)│
│      • NSFWJS, NudeNet v3, CLIP                             │
│      • 16 ML detector wrappers (face, pose, ReID, audio…)   │
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
| **Frontend** | React 19 + TypeScript + React Compiler |
| **Styling** | Tailwind CSS |
| **Database** | SQLite (better-sqlite3) |
| **Media** | FFmpeg + FFprobe |
| **AI** | ONNX Runtime + Venice vision LLM |
| **Browse** | 27-source booru / tube / social aggregator |
| **Downloads** | yt-dlp (bundled) |

</div>

<br/>

---

<br/>

## 📊 By the Numbers

<div align="center">

| | |
|:---:|:---:|
| **134** Backend Services | **140+** UI Components |
| **19** Database Tables | **23** Migrations |
| **27** Browse Sources | **16** ML Detector Wrappers |
| **23** Services-tab cards | **7** Player overlays |
| **58** Achievements | **20+** Visual Overlays |
| **16** PMV Transitions | **15+** Themes |

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

### v2.6.0 *(Latest)*

**🌐 Browse Aggregator + 🧠 ML Detector Stack + 👤 Performers UI**

- ✨ **Browse Aggregator** - 27 sources parallel-searched: e621, rule34, Danbooru, AIBooru, Civitai, Gelbooru, Pixiv R-18, RedGifs, PornHub, RedTube, Eporner, xnxx, Bluesky, PullPush (Reddit archive), and more
- ✨ **Multi-select + bulk save** with floating action bar and spring animations
- ✨ **Tag autocomplete** from Vault's canonical-tag vocabulary, with ↑↓ Tab Enter keyboard nav
- ✨ **Recent + saved searches** dropdown with star-to-pin
- ✨ **Source family tabs** (Booru / Tube / AI-gen / Social) narrow both the chip list and the fan-out
- ✨ **HLS-aware lightbox** via hls.js + universal yt-dlp fallback for all tube URLs
- ✨ **Filter chips**: rating, min-resolution (720p+/1080p+/4K), min-score, SFW-only, Vault-blacklist
- ✨ **6 ML detectors** - YuNet face + SFace recognition + Person ReID body + MoveNet pose + NudeNet v3 + gender classifier, all folding into the AI tagging queue
- ✨ **Performers page** - SFace face clusters, inline rename auto-applies `performer:NAME` tags
- ✨ **Whisper.cpp transcription** (opt-in) with FTS5-indexed dialogue search
- ✨ **JoyCaption sidecar** for high-quality VLM captioning
- ✨ **8 new achievements** for Browse + Performers + AI usage (First Crate Dig, Browse Explorer, Face Namer, AI Pioneer, Tag Curator, Performer Dossier, Bulk Dropper, Crate Digger)
- ✨ **XMP sidecar export** for Darktable / Lightroom / Immich interop
- ✨ **Stash interop** (`.stash.json` import/export)
- ✨ **Custom filename templates** + in-library duplicate badges + auto-tag `source:browse` on save
- ✨ **Multi-tagger ensemble** - load multiple WD-style tagger ONNX models simultaneously (`wdTaggerVariants` setting); tags merged with consensus boost (+10% on 2-variant agreement, +20% on 3+)
- ✨ **Browse UI condensed** - secondary filters collapsed into a single popover with active-count badge; double-click any source chip to mute it from "All sources" fan-out
- ✨ **PullPush Reddit-archive source** - replaces the gated Reddit Data API entirely (no auth required); NSFW-subreddit-name filter + dead-image URL pattern blocklist + tile auto-hide on load failure
- ✨ **Pixiv referer injection** - Electron `webRequest.onBeforeSendHeaders` interceptor rewrites Referer/Origin for `pximg.net` requests so Pixiv's hotlink-protected CDN serves images in the lightbox
- ✨ **Bluesky AT Protocol auth** - app-password session token, queries the user's PDS instead of the public appview to avoid 403s
- ✨ **xnxx playback** via `yt-dlp` universal fallback when all RapidAPI providers 403; bundled binary, HLS playback via `hls.js`
- ✨ **11 new ML wrappers** scaffolded — InsightFace ArcFace, TransNet V2 shot detection, VideoMAE Kinetics-400 actions, X-CLIP zero-shot video, Chromaprint audio fingerprint, YAMNet 521-class events, LAION CLAP zero-shot audio, Demucs stem separation, WhisperX word-level transcripts (Python sidecar), F5-TTS voice cloning (Python sidecar), JoyTag + idolsankaku-eva02 (via the multi-tagger ensemble). Each has an in-source ACTIVATION block with download URLs and target paths.
- ✨ **6 UI library installs** ready for future integration: `@dnd-kit/*` (reorder/merge UX), `@base-ui-components/react` (a11y primitives), `echarts` + `echarts-for-react` (big-data dashboards), `masonic` (variable-aspect virtualized grid), `photoswipe` (standard lightbox)

### v2.4.0

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
| **v2.7** | JoyTag + idolsankaku second-opinion taggers • InsightFace ArcFace face ID upgrade • TransNet V2 + VideoMAE action labels |
| **v2.8** | WhisperX word-level timestamps • Demucs vocal isolation • LAION CLAP zero-shot audio search |
| **v2.9** | F5-TTS voice cloning UI • Vidstack player core • dnd-kit reorder • ECharts analytics |
| **v3.0** | Plugin system • Cloud sync • Watch parties • Multi-user library |

<br/>

---

<br/>

<div align="center">

## 📥 Get Started

<br/>

[![Download Latest](https://img.shields.io/badge/Download-v2.7.0-success?style=for-the-badge&logo=windows)](https://github.com/Nwund/vault-project/releases/latest)

<br/>

**Requirements:** Node.js 20+ (Node 22 recommended) • npm 10+ • Windows 10+ / macOS 11+ / Linux

<br/>

---

<br/>

*Built with obsession by developers who understand the mission.*

<sub>
🔐 Vault v2.7.0 • 134 backend services • 27 Browse sources • 140+ components • 16 ML detector wrappers • 23 v2.7 Settings cards
</sub>

<br/>
<br/>

</div>
