# VAULT — Changelog & Development History

This document contains the complete development history of Vault, including all completed tasks, bug fixes, and feature implementations organized by session.

For current development guidance, see **[DEVELOPMENT.md](DEVELOPMENT.md)**.
For per-session work logs (the live ground truth), see **[SESSION_NOTES.md](SESSION_NOTES.md)**.

---

## v2.8.2 — 2026-05-24 — Unified optional-models UI + one-click installers

Consolidates the old two-card optional-models split (ModelFileCard grid in AiTaggerPage Setup + ExtraDetectorsCard in SettingsPage Services) into one panel under AI Tools → Setup, organized by capability rather than file format. Same models, same probes, same install paths — better navigation + one-click install where we know the URL.

### Problems with the old split

- `ai-image` and `deepfake` appeared in BOTH cards with different framings → confusing.
- Two different status payload shapes (`{installed, expectedPath}` vs `{available, ready, loaded}`) → inconsistent row UX.
- Two different install-hint formats.
- The big ExtraDetectorsCard rendered 70% scaffold-only rows (BEATs / PANNs / Wav2Vec2 / X-CLIP / VideoMAE-v2 / InternVideo2 / SOLIDER / NeuralFP / MERT / LongCLIP) inline, drowning the actually-useful ones.

### New `OptionalModelsCard.tsx`

One file under `src/renderer/components/OptionalModelsCard.tsx`. Replaces both `ExtraDetectorsCard.tsx` and `ModelFileCard.tsx` (both deleted). Categories:

- **Vision** — Tier 1 ensemble (bundled), NudeNet, JoyTag, AI-image, Deepfake, LAION aesthetic, Real-ESRGAN
- **Faces & people** — YuNet (bundled), SFace, AdaFace, Person-ReID
- **Text** — PaddleOCR (DB + CRNN)
- **Audio** — whisper.cpp (bundled), WhisperX, Chromaprint, BEATs, PANNs
- **Voice** — F5-TTS sidecar
- **Scaffold (collapsed by default)** — Wav2Vec2 emotion, X-CLIP, VideoMAE-v2, InternVideo2, SOLIDER, NeuralFP, MERT, LongCLIP

Per-row affordances:

- `Install` button — when we know the canonical URL. Streams progress via the new `models:install-progress` event.
- `Setup guide` tag — for Python sidecars (WhisperX, F5-TTS) that need `pip install` + a start.bat.
- `Manual` tag + install hint — when no canonical ONNX exists (e.g. ai-image-detector needs the user to convert a SigLIP HuggingFace fine-tune).
- `BUNDLED` chip — for models that ship with Vault.

Status normalization: a single `normalize(raw)` helper collapses all the legacy payload shapes (`installed | available | ready | loaded`) into one boolean + path/size, so future detectors only need to return one of those shapes.

### New `model-installer.ts` service

New `src/main/services/ai-intelligence/model-installer.ts`. Streaming HTTP download to a `.partial` file, atomic rename on completion, broadcasts `models:install-progress` every ~250ms. Manifest currently covers:

- `joytag` → `joytag.onnx` from `fancyfeast/joytag` on HuggingFace
- `joytag-tags` → `joytag-top-tags.txt` from the same repo
- `realesrgan-x4plus` → `real_esrgan_x4plus.onnx` from a stable mirror

Adding a new auto-installable model is one MANIFEST entry plus a row in `OptionalModelsCard`. No new IPCs needed — both `models:install` and `models:installGroup` (for multi-file installs like JoyTag's onnx + tags) dispatch off the id.

### Deletions

- `src/renderer/components/ModelFileCard.tsx` — 154 lines.
- `src/renderer/components/ExtraDetectorsCard.tsx` — 258 lines.
- `SettingsPage.tsx` no longer imports / renders ExtraDetectorsCard; everything lives in AI Tools now.

### Not done (intentionally deferred)

- **LAION aesthetic-linear.json** installer — needs PyTorch `.pth` → JSON conversion. Will land once we host a pre-converted JSON on a GitHub Release asset.
- **ai-image-detector.onnx** auto-install — no canonical community ONNX export of a SigLIP fine-tune for AI-image detection exists at a stable URL. Row carries detailed hint pointing at `Organika/sdxl-detector` on HF + the conversion path.
- **Deepfake / AdaFace / Person-ReID / PaddleOCR / BEATs / PANNs** — same reason; community ONNX exports are scattered. Rows carry the recommended filename + format + source.

---

## v2.8.1 — 2026-05-24 — Build-fix + AI-review freeze perf patch

Followup to v2.8.0 with three targeted fixes. No new features.

### Build fix — electron-vite CJS-shim splice (upstream PR #838)

`electron-vite@5.0.0`'s `esmShimPlugin` uses a regex to find the last ESM static import in the bundled `main.js` and inserts the CommonJS shim header right after that match. The regex has no negative lookbehind for comment markers, so any `import <thing> from '...'` text inside a JS comment or string literal in the main process source gets matched as if it were a real import. When the matched position lands inside a string, the shim splices mid-line and esbuild dies with "Unterminated string literal" pointing at a chunk-boundary line.

This bit Vault on this session because the v2.8.0 `media:importBuffer` IPC handler had a doc comment containing the literal `import __cjs_mod__ from 'node:module';` as documentation. The plugin matched that, then spliced the actual shim header right over the next string literal in the bundle.

Fix:
- Handler moved from `src/main/ipc.ts` to a dedicated `src/main/ipc-media-import.ts`, registered via `registerMediaImportBufferIpc(ipcMain, db)`. The new file is written with NO `import <name> from <quoted>` patterns in comments or strings — the regex can't match it.
- Removed the `args.suggestedName` sanitizer loop entirely (suggestedName is unused by the only caller, CaptionsPage clipboard paste — empty-string literals there were the splice target on later attempts).
- Filename is now always `pasted_<unix-ms>.<ext>`.
- Upstream PR #838 ("fix: add negative lookbehind for comment in static import regex", stevezhu, Sep 2025) is the real fix and is still open. Bump electron-vite past the merge release once it lands; the workaround can come back out.
- Saved as memory entry `reference_electron_vite_cjs_shim_bug.md` so future sessions don't rediscover this from scratch.

### AI Review "Custom Tag" felt frozen

Two real perf problems in the same flow, plus one unrelated input crash that turned out not to be Vault's fault:

- **Autocomplete walked the full tag DB on every keystroke without breaking early.** The IIFE at `AiTaggerPage.tsx:~4330` (custom-tag input) and `:~4838` (merge-tag picker) only broke the for-loop on `prefix.length >= 6` — substring matches kept scanning every tag in `allTagNames`. With thousands of tags + a single-char query with few prefix hits, this re-ran a full scan on each keystroke, and the resulting 5,000-line AiTaggerPage re-render starved the main thread. Added a hard break once both prefix + substr have enough to render the visible 6, and capped substr inserts at 6.
- **`approveEdited` wrote tag links one-by-one without a transaction.** Each `INSERT OR IGNORE INTO media_tags` fsync'd individually. Approving a 20-tag item was ~200ms before; ~5ms now that the inserts are wrapped in a single `this.rawDb.transaction(...)`.
- The user-reported "mouse and keyboard stopped working" turned out to be an OS-level WUDFHost / USB driver crash, not Vault. Saved as memory entry `reference_usb_input_crash.md` — recovery is Ctrl+Alt+Del → Restart; check Event Viewer for the offending driver.

### React 19 fetchPriority casing

CaptionsPage `<img>` tags spread `{ fetchpriority: 'low' }` (lowercase) — DOM accepts it but React 19 logs a dev warning. Switched to camelCase `fetchPriority`.

---

## v2.8.0 — 2026-05-23 — UX & perf polish

A ~50-item polish + perf release. Headline numbers: **53 features / fixes
shipped**, **~30 new keyboard shortcuts**, **1 new visibility-gated
polling hook** applied to 10 cards. Two user-reported bugs fixed
(Voice Intake "always Stopped" status + theme text not following
custom themes). Three previously-deferred items closed (paste image
from clipboard, sessions End-all bus, FVP skip-intro overlay).

### Critical bug fixes

- **Voice Intake status was permanently wrong** — `getIntakeStatus()` in
  `src/main/services/xyrene/voice-intake.ts` returned `{watching,
  folder, inFlight}`, but the renderer card at
  `src/renderer/components/XyreneSettings.tsx` reads 8 fields
  (`running`, `cleanupMode`, `queueDepth`, `processedCount`,
  `failedCount`, `lastError`, `voiceSamplesDir`, plus `folder`). Result:
  the card always rendered "○ Stopped" with "undefined done · undefined
  failed" even while actively processing files. Now returns the full
  shape; added `bumpIntakeCounters()` so the one-shot "Process file…"
  IPC also lands in the counters. Saved as a memory entry so this
  category of "renderer-card status-shape mismatch" gets caught next
  time.
- **Theme text colors ignored non-light themes** — the `text-white` /
  `text-zinc-*` / `text-gray-*` / `text-slate-*` reactive overrides
  were scoped to `[data-theme-mode="light"]`. Hardcoded Tailwind text
  classes inside any dark or custom-dark theme stayed literal `#fff`
  regardless of the user's `--text`. Hoisted the text remaps to
  `:root` so they apply in every theme. Backgrounds + borders stay in
  the light-only block (default dark theme look untouched).

### Voice Intake follow-ups

- One-shot `xyrene:intakeProcess` IPC now returns `voiceFilename` so the
  renderer toast can name the cached file.
- XyreneSettings only polls `xyreneListVoices` (which probes XTTS) while
  the watcher is running — the 4s tick was hitting a non-running XTTS
  server when xyrene-portable isn't installed and contributing to slow
  Settings loads.

### Library

- **Quick-filter pills**: `Untagged` (NOT EXISTS subquery on
  `media_tags`), `Recent 24h` (sinceMs filter), `<5 min` / `5–20 min` /
  `>20 min` duration buckets. New `media:search` params:
  `untaggedOnly`, `sinceMs`, `durationBucket` — with matching count
  query so the `N items` badge stays accurate.
- **Selection-bar bulk actions**: `+Tag` / `-Tag` (loops
  `tags.addToMedia` / `removeFromMedia`), `AI re-tag` (routes through
  `ai:requeue-specific`), `Generate Thumbs` (loops
  `media:generateThumb`), `Open` (spawns up to 4 floating players,
  caps at 4 to not drown the screen).
- **Keyboard nav**: vim `gg` (double-tap) → first, `G` → last,
  `PageUp` / `PageDown` swap pages, `/` focuses search, `d` / `Delete`
  soft-deletes the focused tile (confirm dialog → `media:bulkDelete`).
  Focused-tile keys: `l` toggles like, `s` cycles rating 0→5, `i`
  opens MediaInfoModal via new `vault:open-info-modal` window event.
- **TopBar subtitle** shows `N items · X GB` from `vault:getStats`, or
  `N selected · of total` when in selection mode.
- **Shuffle pill** no longer wipes `typeFilter` when toggled (was
  silently turning "shuffle Videos" into "shuffle everything").
- **Sidebar nav** gained a library-count badge next to Library nav
  (formatted as `12,345` or `42.7k`).
- **Home dashboard**: Random Pick excludes Continue Watching items so
  it surfaces something fresh instead of resuming what was just
  playing.

### Floating Video Player

- **`Ctrl+S` saves the current frame** as PNG (pauses, names
  `<safe>_<sec>s.png`, downloads via Blob URL).
- **`r` rotates** the video 90° clockwise (per-instance state, CSS
  transform).
- **`q` and `Ctrl+W` close** the player.
- **`Shift+Q` closes ALL floating players** via new
  `vault:close-all-floating-players` window event (LibraryPage owns
  the `openIds` state and listens for it).
- **`[` / `]` adjust playback rate** by 10% (capped 0.25–4); rate
  persists across opens via `vault.floatingPlayer.rate` localStorage.
  Floating speed badge top-right when rate ≠ 1×.
- **`Shift+S` / `Shift+E`** set explicit A-B loop start / end without
  toggling (vs the existing 3-way bare `a` key).
- **Pause-on-blur** (default ON, `vault.floatingPlayer.pauseOnBlur`).
  No auto-resume on refocus.
- **Skip-intro overlay** — bottom-right pill appears 5–25s into a
  video, jumps to `vault.floatingPlayer.introSkipSec` (default 30s).
  Per-media latch; auto-hides on short clips.
- **Error overlay** gained a Retry button (force-transcode re-fetch).

### AI Tools

- **Bare `a` approves / `x` rejects** the focused review item +
  auto-advances to next (matches the existing Shift+Enter approve
  flow). Number keys `1`-`4` swap setup / queue / review / tools tabs.
- **Approve ≥85%** bulk button — only approves items with
  `nsfw_confidence >= 0.85`. `bulkApprove` IPC + service method
  extended with optional `minConfidence`.
- **Queue ETA** line under the stats row: `~25s/item × pending`.
- **API key reveal toggles** on both Venice + TpDB inputs.

### Sessions

- **`1`-`5` swap sub-tabs** (Live / Devices / Game / Coach / History).
- **Top-right End Session button** dispatches new
  `sessions:end-all` window event + closes any open analytics session.
  Live tiles (Climax Verifier, Stroke Tempo, HR band, Lockout) each
  register a listener and stop themselves.

### Browse

- **`sortBy` persists** across sessions (default / score / newest).
- **vim `gg` / `G`** jump to top / bottom of grid.

### GoonWall

- **`p` pauses (or resumes) all tile videos** by walking the DOM.
- **`1`-`9` set tile count** (clamped to 30).

### Performers

- **`j`/`k`** cluster navigation with keyboard-focus ring + smooth
  `scrollIntoView`. Respects current filter + search + sort.
- **Sort dropdown** — by size (mediaCount DESC) / by name / recent.

### Playlists

- **Cmd/Ctrl+N** focuses the new-playlist input (+ selects existing text).
- Playlist search field.

### Brainwash

- **Clipboard paste imports the image** into your library. New
  `media:importBuffer` IPC takes raw bytes + ext, writes to first
  media dir with unique `pasted_YYYYMMDDHHMMSS.<ext>` name, upserts
  the row inline, broadcasts `vault:changed`, returns the new
  MediaRow. CaptionsPage paste listener routes the first image item
  and sets `selectedMedia` immediately.
- **`Tab` ping-pongs top↔bottom text inputs** without traversing the
  variable chips in between.

### Toast

- **"Logs" button** on error toasts — opens the logs folder via
  `logs:getLogFilePath` + `shell.openPath`.
- **"Dismiss all (N)"** button when 3+ toasts stacked.
- Toast container dims to 40% opacity during Zen mode (errors still
  visible, less attention-yanking).

### Settings

- **Open userData Folder** + **Reload from Disk** buttons (Data tab).
  New `settings:reload` IPC re-broadcasts `settings:changed` so every
  card re-pulls.

### Command palette

- 5 new entries: Pause AI Queue, Resume AI Queue, Reload Settings from
  Disk, Open Logs Folder, Close All Floating Players.

### Keyboard shortcuts overlay

- Updated Library + new Floating Player sections to document the
  ~15 new keys added this release.

### Perf — `useVisibilityInterval` hook

New `src/renderer/hooks/useVisibilityInterval.ts` — drop-in
`setInterval` replacement that pauses while `document.hidden` and
re-fires once when visibility returns. Migrated 10 polling sites:

| Card | Cadence |
|---|---|
| QueueDashboardCard | 2s |
| sessions/DevicesView | 2s |
| sessions/LiveSessionView | 5s |
| AdminCards.CrossDeviceCard | 5s |
| SidecarWatcherBadge | 5s |
| network/VaultMlSidecarCard | 8s |
| HomeAssistantCard | 10s |
| ExtraDetectorsCard | 30s |
| SubscriptionsBellButton | 60s |
| App-level untagged-count | 30s |

App-level AI status poll backs off from 5s → 30s while document is
hidden (6× IPC chatter reduction) rather than fully pausing — keeps
the sidebar badge from going stale by 10+ min when you alt-tab back.

### Memory & docs

- New memory entry `feedback_vault_intake_status_shape.md` documenting
  the renderer-card status-shape mismatch class of bug.
- README v2.8.0 section + version badge.

---

## v2.7.1 — 2026-05-20 — Polish, cohesion, dead-code purge

Followup to v2.7.0. No new features; instead, a deep cohesion + cleanup
pass uncovered and fixed a long list of broken UX, dead imports, and
glue gaps. Headline numbers: **~24,000 lines of dead code removed**,
**64 unused files deleted**, **45 broken or partial buttons wired
end-to-end**, **one critical silent toast bug fixed**.

### Critical bug: useToast was a no-op for most components

`useToast` imported from `src/renderer/contexts/` resolved to a
ToastContext whose `ToastProvider` was never mounted anywhere. Every
component outside the App.tsx subtree (FloatingVideoPlayer,
ExportPipelineModal, DupTriageModal, AdminCards, every network card)
called `showToast(...)` against an empty default context — silently
no-op. Fixed by mounting `ToastProvider` + `ToastContainer` in
`main.tsx` wrapping the whole tree; App.tsx's local-mirror toast
context was deleted and routed through the canonical one.

### Stub tool dialogs now actually do things

Four Library tool dialogs were full UIs that toasted "Success" on
submit and produced no output. Wired all four to real ffmpeg
backends via a new `mediaTools:*` IPC namespace:

- **MediaExporter** (`mediaTools:export`) — format/quality/resolution/fps/trim
- **MediaMerger** (`mediaTools:merge`) — concat demuxer for N inputs
- **MediaRotator** (`mediaTools:rotate`) — 0/90/180/270 + flip H/V
- **WatermarkAdder** (`mediaTools:watermark`) — text or image overlay

Plus more individual stub fixes:

- **KeyframeExtractor** — was structurally impossible (passed
  `React.createRef()` with no video). Replaced with
  ServerKeyframeExtractor that runs ffmpeg server-side.
- **ThumbnailSelector** — new `thumbs:setCustom` IPC actually saves.
- **AITagger.onApplyTags** — calls `tags.addToMedia` for each tag.
- **AutoPlaylist.onSave** — actually creates the playlist.
- **SubtitleEditor.onChange** — writes real `.srt` sidecars.
- **WatchProgress remove** — `watchHistory:removeEntry` actually deletes.

### Cohesion glue (35 broadcasts + handoffs)

`vault:changed` broadcasts added to 35 DB-mutating handlers across
media metadata, captions, viewPresets, customFilters, tagCategories,
relationships, bookmarks, notes, studios, triage, trash, thumb regen,
and export pipeline completion. preload's new `onBoth()` helper
bridges the IPC channel AND a renderer window CustomEvent so
renderer-side state changes propagate. TagCategoriesManager,
BookmarksPanel, MediaNotesPanel now cascade-refresh.

Five context menu tool actions (Edit Metadata, AI Auto-Tag, Scene
Detection, Extract Keyframes, Export/Convert) failed silently from
any page other than /library; now use sessionStorage handoff +
navigate. Same pattern fixed `vault-add-url-download` (Rule34 → Downloads).

Other dead-letter events wired: `navigate-tab` global handler,
`vault:seekActivePlayer` → FloatingVideoPlayer, `vault:toggle-info-pane`
(I-key) → MediaInfoModal, DupTriage decision → AI re-tag,
ExportPipeline completion → vault:changed.

### Dead code purge: 64 files removed

54 dead components, 14 dead hooks, 4 dead main services, 10 dead
Diabella stub IPC handlers (returned `{ error: 'disabled' }` since
v2.1.5). Notable: StreaksAchievements had its own achievement tree
that never matched the backend's checkAndUnlockAchievements list;
backend is now single source of truth via goon.getAchievements().

### Reusable infrastructure

- New **`<ModalShell>`** captures the shared modal pattern. 12
  modals now use it.
- New **`<ConfirmDialog>`** + `useConfirm()` replaced all 14
  `window.confirm()` calls with a styled, promise-based dialog.
- New **`useLocalStorage`** hook centralizes the try/catch +
  JSON-parse pattern.

### Type + style cleanup

22 `(window.api as any)` casts removed. All `border-zinc-700` swept
to `var(--border)` across 82 files. All inline `/1024/1024` math
replaced with `formatBytes()`. All ad-hoc spring transitions migrated
to named `SPRINGS.*` tokens. All `setPage()` direct calls routed
through `navigateTo()` for View Transitions consistency. Stale
v2.3.0 comments updated. Version strings updated to v2.7.0 in
AboutPage default, export-service HTML footer, booru User-Agent.

### UX polish

Empty state CTAs added to FeedPage and PerformersPage. Emoji icons
(📅, 🎬, ⚠️, 🔒) replaced with Lucide components (Film, AlertTriangle,
Lock) for consistent rendering. Shift+F focus mode hotkey is now
documented in the actual user-visible help modal (was previously
missing despite being globally bound). DownloadsPage status colors
use theme variables. SessionsPage tab pill nav wraps to 2 lines
instead of overflowing at narrow window widths.

### Performance

Scanner SQLITE_BUSY_SNAPSHOT spam fixed via immediate-mode
transactions. AI Review schema-cache stale workaround caches the
parallel sqlite connection. Bundle size: index.js dropped from
2880 KB → 2877 KB.

---

## v2.7.0 — 2026-05-17 — The integration sweep: 160 backlog items wired through to UI

The largest release since v2.6.0. The 160-item v2.7 research backlog (#220–#385) shipped as backend services + utilities + hooks throughout May 16; this release turns all of it into user-facing UI. **32 new components**, **23 new Settings cards**, **6 player overlay buttons**, **8 Library Tools entries**, **React 19 + React Compiler**, a new MessagePort fast-path for scrub-thumbs, and View Transitions API across page swaps.

### Settings → Services tab gained 23 new cards across 6 themed sections

**Decentralized & sharing** — IrohShareCard (#265), HyperswarmMeshCard (#266), HeliaIpfsCard (#267), SyncthingCard (#269)

**Privacy & anonymizing** — VeilidCard (#268), TorOnionCard (#283), WebTransportCard (#276), NostrSignerCard (#282)

**Social & inbox** — BlueskyLabelerCard (#273), UnifiedPushCard (#275), ImapWatcherCard (#313)

**AI generation** — VideoDiffusionCard (#377), VaultMlSidecarCard (Florence-2 / DINOv3 / Demucs / CodeFormer / MusicGen)

**Tag intelligence** — TagImplicationsCard (#317), FolderActionsCard (#321)

**Security & notifications** — WebAuthnCard (#281), ShamirCard (#284), NtfyCard (#274)

**Content imports** — CoomerArchiveCard (#384), AudioEroticaCard (#367), CaptionPoolCard (#365), YtdlpProfilesCard (#307)

All share a `NetworkServiceCard` shell with a status pill, expand/collapse animation, and accent-ring vocabulary so the Services tab reads as one design language. Each card binds to a previously-orphaned `window.api.tags.*` preload bridge.

### Library page got 8 new Tools entries + a sidecar status pill + a color filter

- **Stack Mode** (#296) — TikTok-style vertical-swipe pager over the current results. Swipe / wheel / arrows to navigate, Enter to open, Esc to close.
- **Quick Look** (#291) — hold Q on a focused tile for a centered enlarged preview. Release to close.
- **Color Palette filter** (#286) — 16-swatch popover above the grid; pick a color, library intersects with palette-matching media. Includes one-click "Index all" with progress.
- **Duplicate Triage** (#349/#354) — modal that pulls pending duplicate pairs from the `dup_triage` queue. Side-by-side A/B picker with Keep A / Keep B / Keep both / Delete both.
- **Animated sub-library** (#378) — facet pill picker (All animated / Hentai / Anime / Furry / Cartoon) with classifier-driven results.
- **Sprite-sheet Chapters** (#316) — chapter editor that generates an N-cell sprite sheet, lets you click cells to mark chapter starts, names each pick, resolves to a chapter array with copy-JSON.
- **Export Pipeline** (#322) — smart-query → transcode → sidecar → rclone recipe builder with saved presets and live-streaming progress.
- **SidecarWatcherBadge** (#323) — status pill in the TopBar showing watched-roots count + start/stop/add-root popover.

### Player overlay rail — 7 toggleable overlays

The `FloatingVideoPlayer` gained a right-edge button strip:

- **LUT grade** (#228) — pick a `.cube` LUT file, apply in real-time via WebGL2 3D-texture with strength slider
- **Subtitles** (#239) — load `.ass`/`.srt`/`.vtt` via libass-wasm
- **Scopes** (#226) — vectorscope + RGB parade pinned to bottom-left at 30 fps
- **Beats (Cock-Hero)** (#352) — BPM-detect from audio, render pulse rings synced to the beat with intensity-arc HUD
- **Heatmap** (#369) — body-part heatmap timeline strip; click any segment to seek
- **Quick Look** flash — visual focus ring overlay
- **Capture moment** (#244) — saves the current frame as a WebP into `<userData>/moments/`

### Right-click context menu — 6 new v2.7 entries

Share via Iroh · Pin to IPFS · Open Export Pipeline · Auto-tease this video · Deny this for… · Feature less / suggest less

### MediaInfoModal — Obsidian-style backlinks panel (#297)

Below the existing notes section, a `BacklinksPanel` shows references grouped by source (playlist / performer / studio / platform / wikilink / bookmark / tag) with per-source accent colors and thumb previews.

### AI Tools page — 2 ModelFileCards + Audits section

- **JoyTag** + **Real-ESRGAN Upscaler** added to the existing detector grid
- New "Audits & analysis" section:
  - **QualityAuditCard** (#324) — ffprobe + heuristic findings with severity-coded warnings
  - **ClipSimilarityCard** (#230) — CLIP cosine "more like this" with threshold slider + thumb grid

### App-level

- **View Transitions API** (#337) — `navigateTo()` now wraps page swaps in `document.startViewTransition()` for GPU-accelerated cross-page morph on Chrome 111+/Safari 18+. Graceful fallback on older browsers.
- **MessagePort scrub-thumb fast-path** (#331) — `ThumbnailStrip` and a new `useScrubThumbs` hook open a direct MessagePort to the main process. Main shells `ffmpeg -ss <T> -frames:v 1 -vf scale=160:-2 -q:v 5` per thumbnail, 1-second bucketed, disk-cached at `<userData>/thumbs/scrub/`. Second-pass scrubbing over the same video is near-instant. Falls back to in-renderer video-seek when the MessagePort path isn't available.

### Main process — auto-start hooks

- **Sidecar watcher** auto-starts on boot when `library.mediaDirs` is non-empty (opt-out via `library.sidecarWatcherAutoStart`)
- **IMAP watcher** + **Bluesky labeler** auto-resume blocks (opt-in via `network.imapAutoStart` / `network.bskyLabelerAutoStart` with saved port)

### React 19 + React Compiler

- Bumped `react`, `react-dom`, `@types/react`, `@types/react-dom` from 18.3 → 19.2.6
- Re-enabled `babel-plugin-react-compiler` in `electron.vite.config.ts` (`compilationMode: 'annotation'`)
- **21 new v2.7 components** opted in via `'use memo'` directive for auto-memoization
- 56 React-19 breaking-change TS errors fixed in 3 categories: `JSX.Element` → `React.JSX.Element`, `useRef<T>()` → `useRef<T | undefined>(undefined)`, `RefObject<T>` widened to `RefObject<T | null>`

### Bug fixes

- **Watch-history boot error** — `[Watch] listWithMedia error: no such column: m.rating` resolved by adding a LEFT JOIN on `media_stats`. Watch-history-fed UI surfaces (RecentlyViewedStrip, WatchHistoryTimeline) populate properly now.
- **PlaylistsPage crash** — `allMedia.filter is not a function` when adding media to a playlist. Tolerant unwrap of the `{items,total}` paginated shape.
- **Bridge-path correctness** — bulk-fixed 9 files where v2.7 IPC bridges were called via `window.api.media.X` or `window.api.X`; the bridges live at `window.api.tags.X` (preload nesting). TS didn't catch this because of `as any` casts on `window.api`.

### TS clean

`npx tsc --noEmit` is at 0 errors across the entire codebase under React 19.2.6.

### Code-splitting + perf (post-integration)

After the integration sweep, aggressive code-splitting cut the **main renderer bundle from 5,478 KB → 2,858 KB (−48%)**:

- 6 v2.7 modals deferred (ExportPipelineModal, StackModeOverlay, DupTriageModal, SubLibraryModal, SpriteSheetChapterEditor, ServiceHealthDashboard) — 75 KB total
- 10 top-level pages deferred (Rule34Page 1,247 KB · SettingsPage 548 KB · AiTaggerPage 249 KB · CaptionsPage 200 KB · PlaylistsPage 77 KB · PerformersPage 62 KB · FeedPage 52 KB · StatsPage 33 KB · DownloadsPage 17 KB · GoonWallPage ~50 KB). LibraryPage + SessionsPage + HomeDashboard stay eager.
- WhatsNewModal also lazy-loaded (8 KB) since it's a once-per-version splash.
- Page-switch wrapped in a single `<React.Suspense fallback={spinner}>` boundary in `App.tsx` showing a centered "Loading page…" spinner while a chunk loads.
- **Nav prefetch-on-hover** — sidebar nav buttons fire `void import('./pages/...')` on `onMouseEnter` so the chunk is in Vite's cache by the time the user clicks. First-click latency on a never-visited tab is now ~0.
- **Modal prefetch-on-hover** — same pattern applied to the 6 v2.7 Tools-dropdown entries.
- `GoonWallPage.resetGoonSlots()` extracted into a dynamic-import inside the cleanup callback so the module isn't pulled into the main bundle just for one helper call.

---

## v2.6.1 — 2026-05-15 — Polish pass: one-click installs, more detector cards, WhisperX wiring

Patch release on top of v2.6.0. No new top-level surfaces — just lower
friction for the optional ML stack, more thorough detector status visibility,
and the first consumer for WhisperX.

### One-click installs
- **CLIP BPE vocab** — `ai:clip-bpe-download` IPC fetches the Apache-2.0
  vocab from openai/CLIP raw GitHub straight to
  `<userData>/models/clip-vocab.txt.gz`. Install button surfaces in a new
  CLIP BPE setup card in AI Tools. Idempotent, ~1.4 MB.
- **NudeNet** — `ai:nudenet-download` fetches the v3.4.2 release model
  (`320n.onnx` nano ~3 MB or `640m.onnx` medium ~14 MB). Two buttons in
  the existing NudeNet card. Idempotent.

### More detector status cards
- New reusable `ModelFileCard` component (`src/renderer/components/`).
- 8 additional cards in AI Tools' "More optional detectors" section:
  SFace face recognition, Person ReID, DB + CRNN OCR, LAION aesthetic
  predictor, deepfake / AI-face detector, AI-image (full-frame)
  detector, WhisperX sidecar, F5-TTS sidecar. All probe via existing
  `ai:*-status` IPCs and show install path + size + Re-check.

### Sidecar auto-start
- WhisperX (port 8031) and F5-TTS (port 8021) launchers now auto-spawn
  at app boot when `settings.ai.whisperxAutoStart` / `f5ttsAutoStart`
  are set + the start script path is configured. Same pattern as the
  XTTS / JoyCaption auto-start blocks in `main.ts`.
- Side-effect-free probes (`isWhisperXReady` / `isF5TtsReady`) so
  status checks don't accidentally spawn the sidecar.

### WhisperX consumer
- `transcribeAudio()` now prefers WhisperX when its sidecar is up
  (auto-started at boot). Returns flat `.text` for existing callers
  plus a rich `segments[]` field with word-level + speaker-diarized
  data for downstream consumers (SFX-on-word triggers, diarized
  speaker UI). Falls back to whisper.cpp when WhisperX is offline.

### TS sweep
- `npx tsc --noEmit` is now clean across the whole codebase.
  - Fixed: `<video referrerPolicy>` (invalid HTML attribute) — replaced
    with main-process `webRequest.onBeforeSendHeaders` strip-Referer
    overrides for booru video CDNs (xbooru / gelbooru / realbooru / tbib /
    hypnohub / paheal). This is the proper fix for the "gray video frame,
    0-byte fetch" bug on cross-origin booru CDN playback.
  - Added `BooruPost.hash?: string` to the renderer-side interface.
  - Explicit `BooruPost` types on two prev.map / .filter arrow params.
  - `getTagLabels(variantId?: string)` for per-variant WD-Tagger vocabs.

### Documentation
- New `docs/ML_WRAPPER_BACKLOG.md` — single index of every optional ML
  wrapper with status (shipped / functional / scaffold) and a one-line
  activation summary. Scaffold wrappers (transnet / xclip / clap /
  demucs) gain a `STATUS: scaffold` marker at the top of the file.
- DEVELOPMENT.md and README.md fully refreshed for v2.6.x truth
  (accurate stats, current Tier 1/2/3 description, full credential
  matrix, current dependencies + ports).

---

## v2.6.0 — 2026-05-14 — Browse aggregator + ML detector stack + Performers UI + xnxx HLS playback

The largest single release since v2.0. Three brand-new surfaces, full ML detector pipeline, and a robust xnxx playback story.

### Three new surfaces

#### 1. Browse aggregator (`src/renderer/pages/Rule34Page.tsx`)
- **26 sources** parallel-fetched: e621, rule34.xxx, safebooru, yande.re, konachan, tbib, xbooru, hypnohub, Danbooru, AIBooru, e926, Gelbooru, realbooru, paheal, Pixiv R-18, Bluesky, Reddit, plus tubes (Eporner, RedTube, PornHub, xnxx, RedGifs, Spankbang, Erome, Motherless) and Civitai (AI-gen).
- **Multi-select + bulk save** with floating action bar (Motion spring entrance/exit).
- **Tag autocomplete** lazily-loaded from Vault's canonical-tags vocabulary; ↑↓ Tab Enter to navigate.
- **Recent + saved searches** dropdown with star-to-pin.
- **Filters**: rating (Safe / Questionable / Explicit), min-resolution (720p+ / 1080p+ / 4K), min-score (50+ / 200+ / 1k+), SFW-only, Vault-tag-blacklist application.
- **Source family tabs** (All / Booru / Tube / AI-gen / Social) narrow both the chip list and the fan-out.
- **Per-source health dots** + retry / mute per error + auto-skip exhausted sources on subsequent pages.
- **HLS-aware lightbox** via `hls.js` with `yt-dlp` universal fallback for tube URLs (resolves xnxx without RapidAPI).
- **Pre-resolved neighbor URLs** (±1, ±2) so arrow nav is instant.
- **Right-click menu** for SauceNAO / iqdb / TraceMoe / Yandex / Google Lens reverse image search + Copy URL + Open original + More like this + Hide this post + Tag wiki.
- **Custom filename template** (`{source}`, `{id}`, `{topTags3}`, `{ext}`, `{date}` placeholders).
- **Save destination picker** (when multiple media dirs configured).
- **Auto-tag `source:browse` + `source:<source_booru>`** on every saved post so Library can filter by origin.
- **In-library badge** via the new `media:allHashes` IPC.
- **HTML5 drag** for external drop targets (browser, file manager).
- **Density toggle** (Compact / Comfortable / Large grid).
- **Infinite-scroll sentinel** at the bottom of the grid for hands-free pagination.

#### 2. ML detector stack (`src/main/services/ai-intelligence/`)
- **YuNet face detection** + **SFace face recognition** → 128-D embeddings clustered via cosine similarity (≥0.45) into `face_clusters` + `face_embeddings` tables.
- **Person ReID** → 768-D body embeddings linked to face_clusters via shared frame_idx.
- **MoveNet pose detection** → performer count + body-orientation tags.
- **NudeNet v3** → 18-class body-part detection.
- **Gender classifier** (Intel age-gender or HF ViT, auto-detected).
- **whisper.cpp transcription** → opt-in via `settings.ai.whisperEnabled` → FTS5-indexed transcript table for dialogue search.
- **JoyCaption sidecar** → high-quality VLM captioning when launched manually.
- **LAION aesthetic predictor** → 0-10 score using existing CLIP embeddings; drop weights JSON to activate.
- **Multi-frame video fingerprint** (5-frame pHash).
- **Filename ML classifier** → bag-of-tokens learner from approved-media filenames.
- **Chapter + subtitle extractor** → free metadata from MKV/MP4 (chapter markers as scene boundaries; embedded subs as transcript priors).
- **TPDB / StashDB face importers** → bootstrap face_clusters from external performer databases.

#### 3. Performers UI (`src/renderer/pages/PerformersPage.tsx`)
- Face cluster grid with face thumbnails (CSS-cropped to bbox).
- Inline rename auto-applies `performer:NAME` to every cluster member.
- Merge mode (click source → click target → confirm) + delete + view-cluster modal.

### Schema additions
Migrations v17–v23 added:
- `face_clusters` (id, name, centroid_b64, sample_count, representative_media_id, representative_bbox)
- `face_embeddings` (per-frame 128-D SFace embedding)
- `body_embeddings` (per-frame 768-D Person ReID embedding, linked to face_cluster_id)
- `media.multi_phash` column
- `ai_analysis_results` column repairs (`review_status`, `approved_tag_ids`, `approved_title`, `reviewed_at`, `rich_tags`, `rejection_history`, `suggested_filename`)
- `media_transcripts` + FTS5 index for dialogue search
- `media_clip_embeddings` for natural-language search

### Dependencies added
- `hls.js ^1.6.16` (HLS-aware video playback for tube content)
- `motion ^12.38.0` (formerly framer-motion; spring animations)
- `@phosphor-icons/react ^2.1.10` (secondary icon set)

### Other improvements
- `media:allHashes` IPC for in-library duplicate detection.
- XMP sidecar export (Darktable / Lightroom / Immich interop).
- Stash interop (`.stash.json` import/export).
- Tag merger UI + tagger quality dashboard.
- Library-wide rejection patterns (per-video + library-wide priors).
- Multi-frame Venice consensus voting + per-tag agreement chips in Review.
- xnxx three-host fallback chain + 429 retry-with-backoff + yt-dlp universal fallback.
- Portable-install support: `.api-keys.env` is now picked up from the Vault folder as well as `C:\dev\` and `~/.vault-api-keys.env`.

### Known limitations
- xnxx `/download` RapidAPI endpoint returns 403 on all three subscribed hosts because the path is wrong — yt-dlp fallback handles playback.
- App.tsx is still >21k lines (Babel deopts at build; runtime unaffected).
- Eighteen ML / UI library tasks remain pending (JoyTag, idolsankaku-eva02, ArcFace, TransNet V2, VideoMAE, X-CLIP, YAMNet, CLAP, Demucs, Chromaprint, WhisperX, F5-TTS, Vidstack, dnd-kit, Base UI, ECharts, masonic, PhotoSwipe) — each needs a dedicated session and a model download / package install.

---

## 2026-05-10 — AI tagger pipeline buildout + cross-device + Spotify daylist + App.tsx split POC

Day-2 shipment closing all 81 formal tasks. Builds on yesterday's foundation.

### AI tagger — final pipeline shape
- **content_analyzer audit doc** at `docs/CONTENT_ANALYZER_AUDIT.md` — port verdicts for 12 prior-art features.
- **Filename signal layer** — 150-keyword catalog → tag hints; studio detection (Brazzers/Vixen/etc); 3-way filename assessment (`generate` / `clean` / `ok`); duration bucket sentence injected into Venice prompt.
- **Multi-frame consensus voting** — per-tag `frameCount/totalFrames` + per-video consensus stats. Review UI shows agreement chips (12/12 green, 3/12 amber).
- **Tagger Quality dashboard** in AI Tools → Utilities — library-wide consensus + most-disagreed tags + one-click re-analyze.
- **Library-wide rejection patterns** — aggregates `rejection_history` across all videos, injects as soft prior into every Tier 2 call. Was per-video only.
- **Library server-side pagination** — `media:search` returns `{items, total}`. Library fetches 60-row pages instead of 30k-row whole result.

### Spotify-style daylist (#47)
- New `ai:daily-mix` IPC with 6 hour-bucket mood profiles (Morning Soft / Daytime Casual / Afternoon Mix / Primetime / Late Night / Insomnia Hour). Sessions sidebar gradient button → materializes as a real playlist named after the current mood.

### Cross-device access (#26)
- Reused the existing mobile-sync HTTP server (range streaming + bearer auth already there).
- Tailscale detection (100.64.0.0/10 + interface names) + LAN detection + bearer token generator.
- New Cross-Device Access card in Settings → Services with categorized URL groups.

### PMV editor polish (#20)
- Video cards now have hover-preview (matches Brainwash + Library + Review pattern). 1.5s clips × 4, 600ms hover delay.

### App.tsx split (#48)
- Migration plan at `docs/APP_TSX_SPLIT_PLAN.md` — 5 phases covering ~45 inline components.
- `AboutPage` extracted to `src/renderer/pages/AboutPage.tsx` as POC. App.tsx down 21,308 → 21,150 lines.

### Fast Refresh round 2
- After yesterday's `useContextMenu` un-export, the warning moved to `useGlobalTasks` and `useToast`. Both file-local now. The one external consumer (UrlDownloaderPanel) re-routed to `../contexts` (canonical source). App.tsx hot-reloads cleanly.

---

## 2026-05-09 — Major Xyrene + Sound Engine + Voice Commands Release

Largest single-day shipment in the project so far: **65 of 75 tracked tasks completed**.

### AI tagger pipeline
- Multi-frame analysis with dynamic intro/outro tolerance + scene-change detection.
- Smallest-first queue order with stage-weighted + queue-weighted progress bars.
- Atomic tag system with porn-site vocabulary (`canonical-tags.ts` is ground truth).
- Tag co-suggestions and 1→N redirects (e.g. `teen girl` → `teen` + `female`).
- Cleanup-migration IPC that preserves user curation when renaming tags.
- Title + description regeneration buttons in the Review queue.
- Rejection feedback loop — auto-requeues with prior-attempt context for divergent re-analysis.
- Venice API key encrypted via Electron `safeStorage` with masked UI.

### Xyrene watch-along + sound engine (the major arc)
- Watch-With-Xyrene voice mode — vision frames → Venice commentary → XTTS synth, primary-player-gated.
- Sound library expanded to 18 categories with per-slot enable toggle.
- Per-curated-sound loudness analysis (ffmpeg `volumedetect` → sidecar JSON, intensity 0-1).
- Pattern engine (`RhythmPattern[]`) — replaces metronomic loop with realistic masturbation rhythm patterns.
- Plap-priority sampling + vibrator vs fingering mutex.
- Reusable `XyreneSoundEngine` class (preview / continuous modes) + `useXyreneSoundEngine` hook.
- Phase progression driven by video position (intro / body / build / climax / cooldown).
- Cloned-voice climax overlay — XTTS synth in selected voice on top of sample bursts.
- Voice picker for cloned voices (XTTS server `/voices` + per-voice synth preview).
- Voice commands via Chrome's `webkitSpeechRecognition` (no external STT server) — pause/play/next/prev/forward/rewind/louder/quieter/climax/shush/talk-to-me.
- Editable brain (5 sex-only categories) + bootstrap from xyrene-portable bibles + auto-append session learnings + recent-learnings log panel.
- "Goon bud" tone refactor in system prompt.

### UX polish
- Library Tools dropdown reorganized + opaque (`bg-zinc-950` + `text-white`).
- More-Tools popup in FloatingVideoPlayer portaled to body to escape overflow clipping.
- Vertical volume slider with pointer capture (replaces buggy horizontal `<input type="range">`).
- HUD-aware button positioning (xy + engine pills slide with title bar visibility).
- Feed: drip-loads next 50 when within 50 of buffer end. 500-video memory cap.
- GoonWall: preload slider lifted from 200-cap to `videos.length`. "All (N)" shortcut.
- Brainwash: GIF Maker tab merged into "Media Maker"; Templates panel Create New + AI Generate.
- Sessions: "Suggest from collection" — Venice picks 5 themed playlists from your tag distribution.
- Thumbnails: `thumbnail=120` filter fallback when timestamp captures fail; rebuild-missing IPC + Command Palette entry.

### Infrastructure
- userData path drift bug fixed in `main.ts` — was sending writes into `vault/GPUCache/vault/`. One-time startup migration pulls polluted subtrees back.
- Vite Fast Refresh works on App.tsx (un-exported `useContextMenu` to remove mixed-export warning).
- Bootstrap protocol (`CLAUDE.md` + `SESSION_NOTES.md`) live for cross-session continuity.
- Vault folder consolidated to single canonical `C:\dev\vault` path.

### Open follow-ups (not started this session)
- #19 audit content_analyzer Python tool (research)
- #20 PMV editor overhaul (4000-line file, multi-session)
- #21 scale to 10s of thousands of videos (server-pagination + count-query split)
- #26 cross-device collection access (Phase 2 Tailscale, needs auth + sync design)
- #47 Spotify-style daylist (deferred)
- #48 split App.tsx into per-page files (huge mechanical refactor)

### Known issues
- Venice API key was lost in the userData migration (safeStorage tied to OS state) — must be re-entered at Settings → AI.
- App.tsx `[BABEL] code generator deoptimised` warning fires on every build (build-time only, runtime unaffected; #48 is the fix).

---

## All Priority 1-6 Tasks: COMPLETE

All previously listed priority tasks have been completed as of v2.4.0. See the session notes below for details on when each was implemented.

### 11. Video Quality Settings (#19)
Ensure quality selector works, switches between proxy/original, persists across all player views.

---

## PRIORITY 3: IMPORTANT NEW FEATURES
*Features that add significant value*

### 12. Stats Page Enhancements (#3 + Master Plan 6.2)
- Total collection size (GB/TB)
- GIF count (separate from images)
- Total play duration
- Category breakdowns
- Time-based graphs

### 13. Image & GIF Zoom (#5)
Scroll wheel zoom, click-drag pan, double-click toggle, zoom level indicator.

### 14. Scene Markers (#10)
- Right-click timeline to create markers
- Show markers as dots on scrubber
- Auto-playlist of marked media

### 15. Feed — Settings Panel (#1C)
Gear button with resolution, playback speed, overlay toggles.

### 16. Feed — Hide UI Button (#1B)
Eye icon to hide all overlays, keyboard shortcut H.

### 17. Categories System (Master Plan 4.4)
- Auto-categories from AI analysis
- Female/Male/Trans, Solo/Couple/Group, etc.
- Category-based filtering

---

## PRIORITY 4: ENHANCEMENT FEATURES
*Nice-to-haves that improve experience*

### 18. Wall View Mode — Library (#9)
Masonry layout, zero gaps, auto-playing previews on all tiles, StashDB-style.

### 19. Duplicate Detection System (#6)
- Perceptual hashing during scan
- Similarity matching (Hamming distance)
- Duplicate review UI with keep/delete

### 20. Goon Words — Customization (#18)
Font selection, size, color, glow/shadow, animation style, timing, frequency, blacklist, custom words.

### 21. Brainwash Mode — Media Editor (#11C)
Drag-and-drop reorder, quick add/remove, preview, filter/search, shuffle toggle.

### 22. Brainwash Mode — Working Settings (#11A)
Audit all settings (transition speed, media sources, effects, audio) and connect them.

### 23. CRT Effect Improvements (#16)
- Actual barrel distortion/fisheye warp
- RGB subpixel simulation
- Color bleed/chromatic aberration
- Screen flicker

---

## PRIORITY 5: ADVANCED FEATURES
*Complex features requiring more implementation time*

### 24. Hardware Accelerated Transcoding (#7)
Detect NVENC, QSV, VAAPI, RKMPP. Store detection results. Settings UI for encoder selection.

### 25. DLNA Streaming (#8)
Implement UPnP/DLNA media server. Advertise on local network. Serve media to smart TVs/devices.

### 26. Ambient Overlays — More Options (#15 + Master Plan 3.4)
Add: Hearts, Smoke/Fog, Neon drip, Hypno spiral, Rain on glass, Scanlines, Vignette pulse, Glitch, Haze/Heat, Bubbles, Confetti burst, Matrix rain. Each with toggle and opacity slider.

---

## PRIORITY 6: POLISH & OPTIMIZATION
*Final touches before release*

### 27. Sessions Revamp (Master Plan 6.1)
Complete UI redesign, better playlist management, drag-and-drop, session templates.

### 28. Achievements Expansion (Master Plan 8.x)
Audit existing achievements, fix broken triggers, add new achievements for library milestones, viewing streaks, feature discovery.

### 29. Error Handling (Master Plan 7.1)
Replace silent catch blocks with proper error handling, user-friendly messages, toast notifications.

### 30. Control Audit (Master Plan 7.2)
Verify ALL sliders, toggles, dropdowns, and buttons function and persist correctly.

---

## COMPLETED (This Session)
- [x] AI Intelligence System (Tier 1/2/3 + UI)
- [x] Cum Countdown feature
- [x] Captions/Meme system
- [x] Blacklist system
- [x] GoonWords preset packs
- [x] Version updated to 2.4.0
- [x] Diabella removed

### Priority 1 (All Complete):
- [x] AI Tagger Model Download - Fixed URLs and ONNX format
- [x] Sessions Thumbnails - Fixed vault:// URL format + fallback generation
- [x] Brainwash Thumbnails - Same fix as Sessions
- [x] Settings Display Options - Added CSS property application
- [x] Goon Wall Effects - Added settings loading and visual effects

### Priority 2 (Complete):
- [x] Feed Mouse Scroll (#7) - Already implemented with 400ms debounce
- [x] Sessions Windowed UI (#8) - Fixed hardcoded height to flex-1
- [x] Library Sorting (#9) - Added ascending/descending toggle with arrow button
- [x] Library Items Per Page (#10) - Added 20/40/60/100/200/All dropdown
- [x] Video Quality Settings (#11) - Already implemented in FloatingVideoPlayer
- [x] Feed Windowed Mode Layout (#6) - Added min-h-0, h-full to main, ResizeObserver, container-based edge detection

### Priority 3 (Complete):
- [x] Stats Page Enhancements (#12) - Added total size, GIF count, total video duration
- [x] Image & GIF Zoom (#13) - Scroll wheel zoom, click-drag pan, double-click toggle, zoom indicator
- [x] Feed Hide UI Button (#16) - Eye icon + Shift+H shortcut, click anywhere to restore
- [x] Feed Settings Panel (#15) - Gear button with playback speed, auto-advance toggle, mute toggle
- [x] Scene Markers (#14) - Right-click timeline to add, dots on progress bar, click to jump
- [x] Categories System (#17) - AI generates category:* tags (gender, subject, body type, content rating), Library sidebar shows category filters

### Priority 4 (Complete):
- [x] Wall View Mode (#18) - Added 'wall' layout option with zero gaps, square tiles, no rounded corners
- [x] GoonWords Customization (#20) - Font family, colors, frequency, duration, rotation, custom words
- [x] Brainwash Mode Settings (#22) - Settings already connected and working, verified all toggles
- [x] CRT Effect Improvements (#23) - Added RGB subpixels, chromatic aberration, screen flicker with UI controls
- [x] Duplicate Detection (#19) - Added "Duplicates" button in Library toolbar with modal showing identical files by SHA-256 hash, bulk delete option

### Priority 5 (Complete):
- [x] Hardware Accelerated Transcoding (#24) - GPU detection (NVENC, QSV, VAAPI, AMF), Settings UI, auto-fallback
- [x] DLNA Streaming (#25) - Full DLNA/UPnP TV streaming with device discovery, local media server, playback controls
- [x] Ambient Overlays (#26) - Added 6 new effects: Hearts, Rain, Glitch, Bubbles, Matrix Rain, Confetti

### Priority 6 (Complete):
- [x] Sessions Revamp (#27) - Playlist thumbnails, stats display, session templates, keyboard hints
- [x] Achievements Expansion (#28) - Added 15 new achievements for feature discovery and social/sharing
- [x] Error Handling (#29) - Added toast notifications to playlist operations, profile operations, settings resets, and AI tagger
- [x] Control Audit (#30) - Verified all settings controls are properly connected with persistence
- [x] UI Polish - Improved empty states with keyboard hints and better messaging

### Additional Completions (This Session):
- [x] Touch/Mobile Support - Swipe navigation in Feed, double-tap to like with heart animation
- [x] Command Palette (Ctrl+K) - VS Code-style quick actions with search, keyboard navigation
- [x] Backend Improvements - Naming conventions, thumbnail quality options

### Theme & Overlay Enhancements (Latest):
- [x] 8 New Light Themes - Arctic, Linen, Mint Cream, Peach Blossom, Sky Blue, Lavender Mist, Sage, Coral Reef
- [x] 15 New Overlay Effects - Smoke, Lightning, Aurora, Fireflies, Snow, Lens Flare, Water Ripple, Kaleidoscope, Pulse Ring, Fire Embers, Prismatic Rainbow, Scanline Sweep, Plasma Wave, Neon Drip, Static Noise
- [x] Enhanced Dark Themes - Obsidian, Neon Dreams, Ember, Velvet, Sapphire now more vibrant with richer colors and better glows
- [x] All overlays integrated into ArousalEffectsConfig for easy use
- [x] 5 New Goon Themes - Submissive (devoted), Dominant (powerful), Latex (fetish), Bimbo (brainless), Hypno (trance)

### Backend Services (Feb 12, 2026 Session):
- [x] **Video Bookmarks** (`video-bookmarks.ts`) - Save timestamps in videos, quick bookmark, export to FFmpeg chapters, navigate bookmarks
- [x] **Tag Categories** (`tag-categories.ts`) - Hierarchical tag organization, 8 system categories, auto-categorize, tree structure
- [x] **Media Relationships** (`media-relationships.ts`) - Link related media (sequel/prequel/series/duplicates), suggest relationships
- [x] **Media Notes** (`media-notes.ts`) - Personal notes on media, full-text search, pinned notes, color coding
- [x] **Watch Later Queue** (`watch-later.ts`) - Watch queue management, priority ordering, reminders, shuffle, pop next
- [x] **Tag Aliases** (`tag-aliases.ts`) - Tag synonyms, auto-resolve aliases, suggest aliases, import common aliases
- [x] **Rating History** (`rating-history.ts`) - Track rating changes over time, trends, rising/falling stars, undo, analytics
- [x] **Custom Filters** (`custom-filters.ts`) - Saved filter presets, 8 built-in presets, execute with sorting, quick access
- [x] **Session History** (`session-history.ts`) - Track viewing sessions, analytics, tag trends, frequently viewed together
- [x] **Favorite Folders** (`favorite-folders.ts`) - Quick folder access, subfolders, stats, validation, most accessed
- [x] **Duplicates Finder** (`duplicates-finder.ts`) - Find duplicate files by exact hash/size/name, auto-resolve, suggest keep

**Build Stats:** 69 modules transformed, main.js 846.95 kB

### Frontend UI Components (Feb 12, 2026 Session - Continued):
- [x] **WatchLaterPanel** (`WatchLaterPanel.tsx`) - Full queue management UI with drag-to-reorder, play next, shuffle, bulk add
- [x] **BookmarksPanel** (`BookmarksPanel.tsx`) - Video timestamp bookmarks with quick add, custom add, color coding, timeline preview, export
- [x] **MediaNotesPanel** (`MediaNotesPanel.tsx`) - Personal notes panel with colors, pinning, editing, timestamps
- [x] **DuplicatesModal** (`DuplicatesModal.tsx`) - Advanced duplicate finder UI with scan by size/name/hash, selective delete
- [x] **RelatedMediaPanel** (`RelatedMediaPanel.tsx`) - Show related media with AI suggestions, relationship types, navigation
- [x] **App Integration** - Watch Later toolbar button, context menu option, keyboard shortcuts (W to add, L to open panel)
- [x] **FloatingVideoPlayer Enhancement** - B key creates quick bookmark at current timestamp
- [x] **Keyboard Shortcuts Help** - Added W/L/B shortcuts to help modal

### Home Dashboard Enhancements (Latest Session):
- [x] **HomeDashboard** (`HomeDashboard.tsx`) - Full home dashboard with 7 sections
- [x] **Time-based Greeting** - Dynamic greeting based on time of day (Morning/Afternoon/Evening/Night)
- [x] **Quick Stats Card** - Library overview showing total media, videos, images, favorites, watch time
- [x] **Quick Actions Bar** - Random Pick, Browse Library, Quick Resume buttons
- [x] **Continue Watching** - Resume where you left off with progress bars
- [x] **Recommendations** - AI-powered content suggestions
- [x] **Favorites Section** - Quick access to liked content with heart badges
- [x] **Watch Later Section** - Queued content with priority badges
- [x] **Most Watched Section** - Popular content by view count
- [x] **Recently Added Section** - New content in your library

### Feed Enhancements (Latest Session):
- [x] **Toast Feedback** - B (Bookmark) and W (Watch Later) shortcuts now show toast notifications
- [x] **Button Toast Feedback** - Side action buttons for Bookmark and Watch Later now show toasts
- [x] **Keyboard Shortcuts Help** - Updated help modal with Feed B/W shortcuts

### Command Palette Enhancements (Latest Session):
- [x] **Play Random Video (R)** - Instantly play a random video from library
- [x] **Open Watch Later (L)** - Quick access to watch later queue
- [x] **Toggle Fullscreen (F11)** - System fullscreen toggle

### Backend Additions (Latest Session):
- [x] **getMostViewed** - Watch history method to get most viewed media
- [x] **watch:get-most-viewed IPC** - IPC handler for frontend access

### Video Player Enhancements (Latest Session):
- [x] **Picture-in-Picture** - Browser native PiP mode (P key), allows video to float outside app
- [x] **A-B Loop** - Loop a specific section of video (A key to set points, visual indicator on timeline)
- [x] **Playback Speed Control** - Speed menu + keyboard shortcuts ([ / ] keys), shows current speed
- [x] **Visual Feedback** - Loop region shown on progress bar, speed indicator badge
- [x] **Theater Mode** - Expanded view (T key), 90% viewport, disables drag/resize

### Library Enhancements (Latest Session):
- [x] **Play Shuffled Button** - Quick action to open Feed with random videos

**Build Stats:** 69 modules transformed, main.js 847.82 kB, renderer 1.51 MB

### Latest Session (Feb 12, 2026 - Continued):
- [x] **Light Mode UI Improvements** - CSS reactive styles for light themes ensuring visibility
- [x] **Quick Actions Sidebar** - Bottom-left sidebar section with theme cycling, AI tools, hidden features
- [x] **Keybinds Editor Popup** - Modal showing all keyboard shortcuts grouped by category
- [x] **Challenges → Stats Navigation** - Challenges button now navigates to Stats page
- [x] **Video Preview Sizing Fix** - Preview matches thumbnail exactly (object-cover/contain based on layout)
- [x] **CRT TV Border Overlay** - Custom TV border SVG stays in front of all effects (z-index 99995)
- [x] **CRT Glitch GIF Overlays** - Animated GIFs render behind TV border (z-index 99975)
- [x] **Thumbnail Loading GIF** - Animated loading placeholder for unloaded thumbnails
- [x] **Thumbnail Cache Optimization** - Increased URL cache to 2000 entries, batch preload to 50
- [x] **Library Mosaic Overflow Fix** - Removed overflow-hidden that caused video clipping

---

## PENDING TASKS (From This Session)

### High Priority - Bugs:
- [x] **Library Mosaic Layout** - Uses CSS Grid with gridAutoFlow: 'row' for proper ordering
- [x] **GoonWall Stuttering** - Fixed with requestAnimationFrame instead of setInterval for audio fading
- [x] **Brainwash Tab Slow/Broken** - Fixed with IntersectionObserver for lazy loading thumbnails

### Medium Priority - Features:
- [x] **Video Cropping** - Added crop mode (C key), drag handles, presets (5%/10%/15%), CSS clip-path
- [x] **RAM Allocation Setting** - Added PerformanceSettings with memory limit, thumbnail cache, video concurrency
- [x] **Ambient Music/Moans Playback** - Created useAmbienceAudio hook with track categories and looping
- [x] **Windowed Sessions UI Polish** - Responsive sidebar, wrapping controls, responsive modals

### Lower Priority:
- [x] **AI Tools Pending Review Broken** - Fixed SQL column names (mediaId/tagId instead of media_id/tag_id)

---

## PERFORMANCE & STABILITY (Feb 12-13, 2026 Session)

### Memory Leak Fixes:
- [x] **Random Climax Timer Leak** - Changed from `let timerId` to `useRef` for proper cleanup of recursive setTimeout
- [x] **Toast Auto-dismiss Timer Leak** - Added `toastTimersRef` Map to track and cleanup toast timers on manual dismiss
- [x] **Video Preview canplay Listener Leak** - Added `canPlayHandlerRef` to track listener and cleanup in stopPreview/unmount
- [x] **useConfetti Timer Leaks** - Added `pendingTimeoutsRef`/`pendingIntervalsRef` Sets with tracked `scheduleTimeout()`/`scheduleInterval()` helpers
- [x] **useAmbienceAudio Interval Leak** - Fixed unreachable return statement, added `loadCheckIntervalRef` for proper cleanup

### Code Deduplication (Reduced Bloat):
- [x] **Shared Formatters** - Created `src/renderer/utils/formatters.ts` with consolidated `formatDuration()` and `formatBytes()`
- [x] **Shared URL Cache** - Created `src/renderer/utils/urlCache.ts` with consolidated `toFileUrlCached()` and cache management
- [x] **FloatingVideoPlayer** - Removed duplicate urlCache and formatDuration, now uses shared utilities
- [x] **VirtualizedMediaGrid** - Removed duplicate formatDuration and formatBytes, now uses shared utilities
- [x] **HomeDashboard** - Removed duplicate thumbCache and formatDuration, now uses shared utilities
- [x] **App.tsx** - Removed duplicate formatDuration and formatBytes definitions

### Error Handling Improvements:
- [x] **GIF Maker Video Selection** - Added try-catch for URL loading errors
- [x] **Settings Folder Handlers** - Added try-catch for add/remove/choose operations
- [x] **Thumbnail Quality Setting** - Added try-catch for settings update
- [x] **Like Button** - Added loading state to prevent spam-clicking with rollback on error
- [x] **AI Analyze** - Added mount checks for async state updates
- [x] **Context Menu Actions** - Added stopPropagation and error handling
- [x] **Toast Dismissal** - Added stopPropagation
- [x] **Protected Tag Handlers** - Added try-catch

**Build Stats:** TypeScript clean, renderer 1.67 MB JS, build time ~5.8s

### Accessibility Improvements (Feb 13, 2026):
- [x] **Icon-Only Button Accessibility** - Added title/aria-label attributes to all icon-only buttons across:
  - HomeDashboard: scroll left/right buttons
  - RelatedMediaPanel: add form, accept suggestion, play, remove buttons
  - MediaNotesPanel: add form, save, cancel, edit, delete buttons
  - BookmarksPanel: collapse button
  - WatchLaterPanel: close button
  - TagSelector: remove tag button
  - DuplicatesModal: close and checkbox selection buttons
  - App.tsx: task dismiss and notification dismiss buttons

### Code Cleanup & Dead Code Removal (Feb 13, 2026):
- [x] **Removed unused imports from App.tsx** - Removed `fisherYatesShuffle`, `randomPick` from shuffle utils; removed `playGreeting`, `playSoundFromCategory`, `hasSounds` from soundPlayer utils
- [x] **Deleted unused hook files** - Removed `usePhysicsSimulation.ts` and `useVideoPreloader.ts` (not imported anywhere)
- [x] **Cleaned hooks/index.ts** - Removed usePhysicsSimulation export
- [x] **Removed local formatter redefinitions** - Removed duplicate `formatDuration()` and `formatBytes()` from App.tsx (using imported versions)
- [x] **Cleaned formatters.ts** - Removed unused `formatRelativeTime()` and `truncate()` functions
- [x] **Cleaned usePerformance.ts** - Removed 8 unused functions: `useVideoDecoder`, `clearFileUrlCache`, `preloadFileUrls`, `getPooledVideo`, `returnVideoToPool`, `preloadVideo`, `requestIdleCallback`, `cancelIdleCallback`

### Performance Optimizations (Feb 13, 2026):
- [x] **TagSelector memoization** - Added `useMemo` to `filteredTags` and `exactMatch` computations to avoid unnecessary recalculations
- [x] **Throttled mousemove handlers** - Added 50ms throttling to 3 edge detection handlers in App.tsx (Zen mode, GoonWall, FloatingVideoPlayer) to reduce state updates
- [x] **Code deduplication** - BookmarksPanel and DuplicatesModal now use shared `formatDuration` and `formatBytes` from utils/formatters.ts
- [x] **Fixed biased shuffle** - Replaced `sort(() => Math.random() - 0.5)` with proper `shuffleTake()` for quick tags randomization
- [x] **VirtualizedMediaGrid memoization** - Wrapped grid dimension calculations in `useMemo` to avoid recalculation on every render

### Error Handling Improvements (Feb 13, 2026):
- [x] **BookmarksPanel** - Added try-catch to `goToNext()` and `goToPrevious()` navigation functions
- [x] **WatchLaterPanel** - Added try-catch to all async handlers: `handleRemove`, `handlePlayNext`, `handleShuffle`, `handleBumpPriority`, `handleClearQueue`, `handleAddSelected`, `handleDragEnd` (with revert on failure)
- [x] **DuplicatesModal** - Wrapped `shell:showItemInFolder` call in try-catch with error logging
- [x] **useVideoPreview** - Added error logging for video.play() failures (filtering out expected errors), added video load error event handler
- [x] **useAmbienceAudio** - Added error logging to onerror handlers and audio.play() failures with URL context

---

## QUICK WINS (Can do in <30 min each)
- Feed Hide UI Button (#1B)
- Feed Mouse Scroll (#1D)
- Stats: Collection Size (#3A)
- Stats: GIF Count (#3B)
- Library Items Per Page (#13)

## RECOMMENDED ORDER
Start with Priority 1 (critical bugs), then work through Priority 2 (usability), then tackle Priority 3 features. Save Priority 5-6 for after core app is stable.

---

## NOTES FOR NEXT SESSION (Feb 13, 2026)

### Summary of Completed Work This Session:
1. **Removed unused code** - Deleted unused imports from App.tsx, deleted 2 unused hook files (usePhysicsSimulation.ts, useVideoPreloader.ts)
2. **Performance** - Added memoization to TagSelector, throttled 3 mousemove handlers
3. **Error handling** - Added try-catch to BookmarksPanel, WatchLaterPanel, DuplicatesModal async operations
4. **Accessibility** - Added title/aria-label to icon-only buttons (from previous session, documented now)

### Remaining Audit Findings (Medium/Low Priority):
1. ~~**Promise.all pattern** - HomeDashboard loadContinueWatching could use Promise.allSettled instead of try-catch per item~~ (Current pattern is fine - filters null results)
2. **User-visible error feedback** - Most catch blocks still only log to console; requires ToastContext/Provider refactor to expose showToast globally
3. ~~**TagSelector creation error** - The catch block doesn't prevent addTag from being called after error~~ (VERIFIED: code is correct, catch prevents execution)
4. ~~**RelatedMediaPanel cascading errors** - loadRelated still runs after failed delete~~ (VERIFIED: loadRelated is inside try block)
5. ~~**useVideoPreview** - Missing error logging for video.play() failures~~ (FIXED)
6. ~~**useAmbienceAudio** - onerror handlers don't log which track failed~~ (FIXED)

### Potential Future Optimizations:
1. ~~**Remove unused exports from shuffle.ts** - `fisherYatesShuffle` and `randomPick` are no longer imported anywhere~~ (DONE - removed)
2. **Consolidate URL caching** - usePerformance.ts and urlCache.ts both have toFileUrlCached implementations (uses different APIs: thumbs.getUrl vs fs.toFileUrl)
3. **Remove unused exports from soundPlayer.ts** - Several functions are exported but only used internally (kept for potential future use)

### Remaining Performance Audit Findings (Lower Priority):
1. **Multiple sort operations in App.tsx** (lines 3495-3592) - Could be memoized or moved to backend
2. ~~**Missing memoization on availableTags filters** (lines 13513, 13540) - Settings page tag filters~~ (Low impact - modal opens infrequently)
3. **toLowerCase in search suggestions** - Pre-lowercase tag names for faster filtering
4. ~~**Inline style objects in HomeDashboard** - Could defeat memoization~~ (Low impact with HorizontalSection memoized)
5. ~~**HorizontalSection not memoized** - Could add React.memo~~ (DONE - Added React.memo wrapper)
6. ~~**Canvas setup in VisualStimulants** - Potential memory leak on resize listener~~ (VERIFIED - proper removeEventListener cleanup)
7. ~~**Expensive Map/Set operations in DuplicatesModal** - Could use immer or more efficient updates~~ (Standard React immutable pattern, small collections, user-action triggered)

### Build Status:
- TypeScript: Clean (no errors)
- All changes verified working
- Dev server HMR picking up all changes

### Files Changed This Session:
- `src/renderer/App.tsx` - Removed unused imports, throttled mousemove handlers, fixed biased shuffle, removed duplicate formatters
- `src/renderer/hooks/index.ts` - Removed usePhysicsSimulation export
- `src/renderer/hooks/useVideoPreview.ts` - Added error logging
- `src/renderer/hooks/useAmbienceAudio.ts` - Added error logging
- `src/renderer/hooks/usePerformance.ts` - Removed 8 unused functions (~75 lines)
- `src/renderer/utils/shuffle.ts` - Removed unused functions
- `src/renderer/utils/formatters.ts` - Removed unused functions (~25 lines)
- `src/renderer/components/TagSelector.tsx` - Added useMemo for performance
- `src/renderer/components/BookmarksPanel.tsx` - Added try-catch
- `src/renderer/components/WatchLaterPanel.tsx` - Added try-catch
- `src/renderer/components/DuplicatesModal.tsx` - Added try-catch
- `src/renderer/components/VirtualizedMediaGrid.tsx` - Added useMemo for grid calculations
- Deleted: `src/renderer/hooks/usePhysicsSimulation.ts`, `src/renderer/hooks/useVideoPreloader.ts`

---

## CONTINUATION SESSION (Feb 13, 2026)

### GIF Support Improvements:
- [x] **Dedicated GIF Thumbnail Handler** - Created `makeGifThumb()` in thumbs.ts with dual-approach fallback:
  - First attempts video-style frame extraction (gets animated frame)
  - Falls back to static image extraction if video method fails
  - Tries multiple timestamps (30%, 10%, first frame) to avoid blank frames
- [x] **Updated main.ts job handler** - Added 'gif' type to media:analyze job, routes GIFs to dedicated handler
- [x] **Updated ipc.ts** - media:generateThumb now uses makeGifThumb for GIF files

### Bug Fixes:
- [x] **TypeScript Error Fix** - Fixed implicit 'any' type on catch parameter at App.tsx:12141 (added `: unknown` type annotation)

### Performance:
- [x] **HorizontalSection React.memo** - Added React.memo wrapper to HomeDashboard HorizontalSection component

### Verification:
- [x] **VisualStimulants cleanup** - Verified canvas resize listeners have proper removeEventListener cleanup
- [x] **TypeScript build** - Clean compilation with no errors

### Code Cleanup:
- [x] **Removed unused imports from App.tsx** - isGoonTheme, useVideoPool, videoPool, RelatedMediaPanel, BookmarksPanel, THEME_LIST
- [x] **Removed unused type** - PlaylistItemRow type alias
- [x] **Removed unused ref** - startRef in AnimatedCounter
- [x] **Removed unused const** - THEMES array
- [x] **Removed unused state** - contentHeight (only contentWidth needed for responsive layout)
- [x] **Identified dead code** - ~20 unused variables/components remain (MediaViewer, GIFTile, PlaylistItemThumb, etc.) - kept for potential future use

### Main Process Cleanup:
- [x] **media-compare.ts** - Removed unused `fs` import
- [x] **notifications.ts** - Removed unused `nativeImage` import
- [x] **performers.ts** - Removed unused `path` and `fs` imports
- [x] **quick-actions.ts** - Removed unused `path` import
- [x] **file-watcher.ts** - Removed unused `key` variable in deduplication loop
- [x] **processing-queue.ts** - Prefixed unused `concurrency` variable (reserved for future)
- [x] **tier1-onnx-tagger.ts** - Prefixed unused `category` loop variable
- [x] **video-analyzer.ts** - Prefixed unused `startTime` variable (reserved for timing)
- [x] **vaultProtocol.ts** - Prefixed unused `isPathAllowed` function (reserved for security)
- [x] **ipc.ts** - Removed unused `EncoderInfo` type import, prefixed unused GIF options

### Files Changed:
- `src/main/thumbs.ts` - Added makeGifThumb function
- `src/main/main.ts` - Added 'gif' type to media:analyze job handler
- `src/main/ipc.ts` - Updated media:generateThumb, removed unused imports
- `src/main/services/media-compare.ts` - Removed unused imports
- `src/main/services/notifications.ts` - Removed unused imports
- `src/main/services/performers.ts` - Removed unused imports
- `src/main/services/quick-actions.ts` - Removed unused imports
- `src/main/services/file-watcher.ts` - Cleaned up deduplication
- `src/main/services/ai-intelligence/processing-queue.ts` - Cleaned up unused vars
- `src/main/services/ai-intelligence/tier1-onnx-tagger.ts` - Cleaned up unused vars
- `src/main/services/ai/video-analyzer.ts` - Cleaned up unused vars
- `src/main/vaultProtocol.ts` - Cleaned up unused function
- `src/renderer/App.tsx` - Fixed TypeScript error, removed unused imports/variables/state
- `src/renderer/components/BookmarksPanel.tsx` - Removed unused React import
- `src/renderer/components/DuplicatesModal.tsx` - Removed unused React import
- `src/renderer/components/MediaNotesPanel.tsx` - Removed unused React/Search imports
- `src/renderer/components/TagSelector.tsx` - Removed unused Search import
- `src/renderer/components/WatchLaterPanel.tsx` - Removed unused ChevronDown/BellOff imports
- `src/renderer/components/RelatedMediaPanel.tsx` - Removed unused React import
- `src/renderer/components/ParticlesBackground.tsx` - Removed unused useState import
- `src/renderer/components/HeatOverlay.tsx` - Removed unused incrementHeat/decrementHeat functions
- `src/renderer/components/FloatingVideoPlayer.tsx` - Removed unused positionInitialized ref
- `src/renderer/components/HomeDashboard.tsx` - Removed unused Target import
- `src/renderer/components/VisualStimulants.tsx` - Removed unused curvatureAmount variable
- `src/renderer/DiagnosticsOverlay.tsx` - Removed unused React import
- `src/renderer/hooks/useAmbienceAudio.ts` - Removed unused trackIndexRef
- `src/renderer/hooks/useUiSounds.ts` - Removed unused lastHoverTime/HOVER_COOLDOWN
- `src/renderer/hooks/useVideoCleanup.ts` - Prefixed unused loop variable

---

## PMV EDITOR IMPLEMENTATION (Feb 15, 2026)

### Phase 1 - COMPLETE:
- [x] **PMV Editor Tab** - Added to sidebar with Clapperboard icon (between Brainwash and AI Tools)
- [x] **Video Import Panel** - Left sidebar with:
  - Drag-and-drop video import from file system
  - Thumbnail generation for each video
  - Duration and resolution display
  - Reorder videos via drag-and-drop
  - Remove individual videos
  - Max 15 videos limit
- [x] **Video Preview** - Right panel with:
  - Native HTML5 video player
  - Click video in list to preview
- [x] **Music/Waveform Panel** - Bottom panel with:
  - Music file import (MP3, WAV, FLAC, M4A, OGG, AAC)
  - Web Audio API waveform visualization
  - Click-to-seek on waveform
  - Play/pause controls
  - Duration display
- [x] **BPM Detection** - Auto-detects tempo using:
  - Peak detection algorithm with low-pass filter
  - Energy envelope calculation
  - Rounds to common BPM values (60-200 range)
  - Manual override with re-detect button
  - Confidence indicator

### Files Created:
- `src/renderer/components/PmvEditor.tsx` (~500 lines) - Main editor component
- `src/renderer/hooks/useWaveform.ts` (~230 lines) - Waveform visualization hook
- `src/renderer/utils/bpm-detector.ts` (~130 lines) - Client-side BPM detection
- `src/main/services/pmv/bpm-detector.ts` (~200 lines) - Server-side BPM (for future FFmpeg fallback)

### IPC Handlers Added:
- `pmv:selectMusic` - Open file picker for audio
- `pmv:selectVideos` - Multi-select picker for videos
- `pmv:getVideoInfo` - Get duration/resolution via ffprobe
- `pmv:getVideoThumb` - Generate temp thumbnail
- `pmv:getAudioInfo` - Get audio duration

### Phase 2 - TODO (Timeline & Beat Markers):
- [ ] **Timeline component** - Visual timeline at bottom showing all clips
- [ ] **Beat markers** - Auto-generated beat markers from BPM on timeline
- [ ] **Clip placement** - Drag videos to timeline, snap to beat markers
- [ ] **Clip trimming** - Set in/out points for each video clip
- [ ] **Beat sync modes** - Cut on beat, transition on beat, etc.
- [ ] **Preview sync** - Preview with music + video together

### Phase 3 - TODO (Transitions & Effects):
- [ ] **Transition types** - Cut, fade, dissolve, wipe
- [ ] **Beat-synced transitions** - Auto-transitions on beats
- [ ] **Visual effects** - Flash, zoom pulse, color effects
- [ ] **Text overlays** - Beat-synced text appearance

### Phase 4 - TODO (Export & Polish):
- [ ] **FFmpeg export** - Render final PMV to video file
- [ ] **Export presets** - Quality/format options
- [ ] **Project save/load** - Save PMV projects as JSON
- [ ] **Import from library** - Add videos from Vault library (not just file system)
- [ ] **Undo/redo** - History stack for all edits

### Architecture Notes for Next Session:
- Waveform uses Web Audio API `decodeAudioData()` in renderer
- BPM detection is purely client-side (no FFmpeg needed for Phase 1)
- Video thumbnails are temp files in system temp directory
- State is local to component (no persistence yet)
- Ready for Phase 2: Timeline would be horizontal component below preview

---

## LATEST SESSION (Feb 17, 2026)

### Native Notifications:
- [x] **Download Complete Notifications** - Native OS notifications when URL downloads finish
  - Added `downloadComplete` setting to NotificationsService
  - Added `downloadComplete()` and `downloadFailed()` methods
  - Notification shows source (desktop/mobile) and video title
  - Clicking notification opens URL Downloader panel
- [x] **Notification Click Actions** - IPC handler for `openUrlDownloader` action callback

### URL Downloader UX Improvements:
- [x] **Toast Notifications** - Replaced all alert() calls with toast notifications
- [x] **Escape Key** - Press Escape to close downloader panel
- [x] **Auto-focus** - URL input auto-focuses when panel opens

### Desktop Wall Mode Fix (GoonWall):
- [x] **Video Slot Limiting** - MAX_WALL_VIDEOS = 6 simultaneous videos to prevent memory overload
- [x] **Continuous Playback** - Changed from clip cycling to continuous looped playback (no stuttering from constant seeking)
- [x] **Staggered Loading** - Videos load with random 0-500ms delays to prevent bandwidth spikes
- [x] **Pause/Resume** - Videos pause when offscreen and resume when visible (not restart)
- [x] **Queue System** - Videos queue up and start when slots become available

### Mobile Wall Mode Fix (vault-mobile):
- [x] **Video Limit** - MAX_MOBILE_VIDEOS = 4 simultaneous videos (mobile devices have less resources)
- [x] **Staggered Loading** - Each tile waits 150ms longer than previous (0ms, 150ms, 300ms...)
- [x] **Load Before Play** - Videos wait for `onLoad` event before starting playback
- [x] **Placeholder UI** - Shows loading spinner while waiting to load

### Files Changed:
- `src/main/services/notifications.ts` - Added download notification methods
- `src/main/ipc.ts` - Added notification triggers and action handlers
- `src/preload/index.ts` - Added onOpenRequested subscription
- `src/renderer/App.tsx` - Added IPC subscription for notification clicks
- `src/renderer/components/UrlDownloaderPanel.tsx` - Toast notifications, escape key, auto-focus
- `src/renderer/hooks/useVideoPreview.ts` - Wall mode with slot limiting, continuous playback
- `vault-mobile/app/(tabs)/wall.tsx` - Mobile video limiting and staggered loading

---

## SESSION: Feb 21, 2026 - Version 2.4.0

### Changes Made:

1. **Autofill DevTools Fix** - Enhanced disable-features flags to better suppress Autofill.enable console errors
   - Added Autofill, AutofillCreditCardAuthentication to disable-features
   - Added disable-blink-features for AutofillAddress, AutofillCreditCard

2. **GoonWall Stability Improvements** - Reduced video stuttering
   - More conservative max video limits (6 tiles: 4 videos, 9 tiles: 5, etc.)
   - Added gentle playback recovery on visibility change
   - Added mouseenter recovery for paused videos
   - Prevents aggressive fighting with browser resource management

3. **Database Performance** - Added migration v10 with additional indexes
   - idx_media_hashSha256 for duplicate detection
   - idx_media_dimensions for dimension filtering
   - idx_media_stats_mediaId for faster joins
   - idx_media_tags_mediaId for tag lookups

4. **Version Bump** - Updated to v2.4.0

### Verified Features (Already Complete):
- GIF Maker in Brainwash - Full UI with video selection, time range, FPS, quality, save
- PMV Editor - All phases complete (video import, BPM detection, beat markers, effects, export)
- All Priority 1-6 tasks from previous sessions

### Files Changed:
- `package.json` - Version bump to 2.4.0
- `src/main/main.ts` - Enhanced Autofill disable flags
- `src/main/migrations.ts` - Added v10 with performance indexes
- `src/renderer/App.tsx` - GoonWall slot limits and recovery improvements

### Build Status: SUCCESS
- TypeScript: 0 errors
- Dev server running with HMR
