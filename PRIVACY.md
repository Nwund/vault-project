# Privacy Policy

**Last Updated: February 2025**

## Overview

Vault is a desktop application designed with privacy as a core principle. This privacy policy explains how Vault handles your data.

## TL;DR

- **All data stays on YOUR device** - nothing is uploaded anywhere
- **No accounts required** - no registration, no login
- **No analytics or telemetry** - we don't track anything
- **No network activity** unless you explicitly request it (AI features, downloads)
- **You control your data** - easy export and deletion

---

## Data Collection

### What We DON'T Collect

- Personal information (name, email, etc.)
- Device identifiers or fingerprints
- Usage statistics or analytics
- Crash reports or error logs
- Any content from your media library
- IP addresses or location data

### What Is Stored Locally

All of the following data is stored **only on your device** in the application's data folder:

1. **Media Index Database**
   - File paths, filenames, metadata
   - Thumbnails and previews
   - Tags, ratings, and notes you create
   - View history and watch progress
   - Playlists and collections

2. **Application Settings**
   - Your preferences and configurations
   - Theme selections
   - Keyboard shortcuts
   - Feature toggles

3. **Cache Data**
   - Temporary files for performance
   - Transcoded video segments
   - Generated thumbnails

---

## Data Storage

### Location

Data is stored in the standard application data directory:
- **Windows**: `%APPDATA%/vault`
- **macOS**: `~/Library/Application Support/vault`
- **Linux**: `~/.config/vault`

### Security

- Data is stored in SQLite databases
- Sensitive paths are not exposed externally
- Application runs in sandboxed Electron environment
- Context isolation prevents web content from accessing system

---

## Network Activity

Vault only makes network requests when you explicitly enable features:

### Optional Features Requiring Network

1. **AI Analysis (Venice API)**
   - Only when you click "Analyze" or enable auto-tagging
   - Sends video frames to Venice AI (privacy-focused AI provider)
   - You can disable this in Settings

2. **URL Downloads (yt-dlp)**
   - Only when you paste URLs for download
   - Downloads directly from source sites

3. **DLNA/UPnP Streaming**
   - Local network only
   - For casting to smart TVs

4. **Local AI (Ollama)**
   - Connects to local Ollama server only
   - All processing happens on your machine

### What We Never Send

- Your media files
- Your library contents
- Any personal data
- Usage patterns

---

## Data Sharing

**We do not share your data with anyone.**

- No third-party analytics
- No advertising networks
- No data brokers
- No cloud synchronization (unless you enable it)

---

## Your Rights

You have full control over your data:

### Access
- All data is stored in readable formats
- Export functionality available

### Deletion
- Delete all data: remove the application data folder
- Clear watch history: Settings > Privacy
- Reset application: Settings > Advanced > Reset

### Portability
- Database is standard SQLite
- Can be backed up and restored
- Export to JSON available

---

## Children's Privacy

This software is intended for adults only (18+ or the legal age of majority). We do not knowingly process data from minors.

---

## Changes to This Policy

We may update this privacy policy occasionally. Changes will be documented in release notes and this file.

---

## Contact

For privacy concerns, please open an issue on the project repository or contact the maintainers.

---

## Summary

**Your privacy matters.** Vault was built from the ground up to be a local-first, privacy-respecting application. Your media library is your business - we've designed Vault to keep it that way.
