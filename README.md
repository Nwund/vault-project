# Vault

Private media library manager for Windows with AI companion, smart tagging, and universal video playback.

## Features

- **Universal Playback** - Plays all video formats (MP4, MKV, AVI, WMV, FLV, MOV, and more) via automatic on-demand transcoding
- **Smart Library** - Auto-scanning, thumbnails, search, tags, playlists, and daylists
- **Goon Wall** - Multi-tile video wall with loudness-based seek and shuffle
- **AI Companion (Diabella)** - Chat, voice lines, video reactions, and smart tagging powered by local AI
- **Stats & Achievements** - View counts, ratings, session tracking, and unlockable achievements

## Download

Get the latest installer from [GitHub Releases](../../releases).

## System Requirements

- Windows 10 or later
- 4 GB RAM minimum (8 GB recommended)
- FFmpeg is bundled — no separate install needed

## Installation

1. Download the `.exe` installer from Releases
2. Run the installer (choose install location if desired)
3. Launch Vault from the desktop or Start Menu shortcut
4. Add your media folders in Settings

## Supported Formats

**Native playback:** MP4, WebM, MOV, M4V, OGV

**Auto-transcoded:** MKV, AVI, WMV, FLV, TS, MPG, MPEG, 3GP, VOB, M2TS, MTS, F4V, ASF, DIVX, RM, RMVB

Images: JPG, PNG, GIF, WebP, BMP

## Development

### Prerequisites

- Node.js 20+
- npm

### Setup

```bash
npm install
npm run dev
```

### Build

```bash
npm run build
```

Produces the installer in `release/`.

### Release

Push a version tag to trigger the CI/CD build:

```bash
git tag v2.0.0
git push origin v2.0.0
```

## Architecture

- **Electron** + **React** + **TypeScript**
- **SQLite** (better-sqlite3) for local database
- **FFmpeg** (bundled via ffmpeg-static) for thumbnails, transcoding, and loudness analysis
- **Tailwind CSS** for styling
- Custom `vault://` protocol for secure file access
