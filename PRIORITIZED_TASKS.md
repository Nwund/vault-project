# VAULT v2.1.5 — PRIORITIZED TASK LIST
## Merged from Master Plan + Bugfix/Features Document

**Venice AI API Key (for testing):** `VENICE-ADMIN-KEY-MR4aPzWn9SizUynYCAeazVw6jnAeZphb0aG0FC7dJ0`

---

## PRIORITY 1: CRITICAL BUG FIXES
*Things that are broken and blocking normal use*

### 1. AI Tagger — Model Download Fix (#12)
The "Download Missing Models" button doesn't work. Debug IPC handler, network requests, redirects, file permissions, and progress events.

### 2. Sessions — Thumbnail Loading (#2B)
Session thumbnails are broken. Fix thumbnail path resolution, add fallback to first media item's thumbnail.

### 3. Brainwash Mode — Working Thumbnails (#11B)
Same root cause as Sessions thumbnails. Fix thumbnail loading pipeline.

### 4. Settings — Display Options Don't Apply (#14)
Display settings controls don't actually change anything. Audit and connect all toggles/dropdowns to state.

### 5. Goon Wall Effects — Settings Don't Apply (#17)
Effect settings in Settings page don't affect Goon Wall. Sync state between settings and component.

---

## PRIORITY 2: HIGH-IMPACT USABILITY FIXES
*Major UX issues affecting daily use*

### 6. Feed — Windowed Mode Layout (#1A)
Feed view breaks in non-fullscreen mode. Add ResizeObserver, recalculate layout on resize.

### 7. Feed — Mouse Scroll Navigation (#1D)
Feed only works with arrow keys. Add debounced scroll wheel support (400-600ms cooldown).

### 8. Sessions — Windowed UI Update (#2A)
Sessions page has layout issues in windowed mode. Fix overflow/clipping.

### 9. Library — Sorting System (#4)
Add proper sort options with ascending/descending toggle:
- Title (A→Z / Z→A)
- Date Added (newest/oldest)
- Liked/Favorited
- Views
- Duration

### 10. Library — Items Per Page (#13)
Add dropdown: 20, 40, 60, 100, 200, All. Persist selection.

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
- [x] Version updated to 2.1.5
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

---

## QUICK WINS (Can do in <30 min each)
- Feed Hide UI Button (#1B)
- Feed Mouse Scroll (#1D)
- Stats: Collection Size (#3A)
- Stats: GIF Count (#3B)
- Library Items Per Page (#13)

## RECOMMENDED ORDER
Start with Priority 1 (critical bugs), then work through Priority 2 (usability), then tackle Priority 3 features. Save Priority 5-6 for after core app is stable.
