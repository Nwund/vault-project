# Vault 2.1.0 - Feature Brainstorm & Optimization Plan

## Core Philosophy
**Goal**: Continuous arousal without interruption. Every UI element should enhance, not distract.

---

## PRIORITY 1: Performance Optimizations (Critical for 3900+ files)

### Video Loading Speed
- [ ] **Preload next 3 videos** in Library/Feed instead of just 1
- [ ] **Video pool manager** - Keep 5 video elements ready, recycle instead of create
- [ ] **Progressive thumbnail loading** - Show blur placeholder, then load full
- [ ] **Intersection Observer optimization** - Larger root margin for earlier preload
- [ ] **WebCodecs API** - Hardware-accelerated video decoding where supported
- [ ] **Memory management** - Aggressive cleanup of off-screen video elements

### Database Optimizations
- [ ] **Add indexes** on frequently queried columns (type, addedAt, rating)
- [ ] **Batch stats updates** - Queue view counts, flush every 5 seconds
- [ ] **In-memory cache** for hot data (recently viewed, top rated)
- [ ] **Prepared statement caching** - Reuse compiled queries

### Rendering Optimizations
- [ ] **Virtual scrolling** for Library (only render visible tiles)
- [ ] **CSS containment** - Add `contain: layout paint` to tiles
- [ ] **GPU compositing** - Use `will-change` sparingly on animated elements
- [ ] **Reduce re-renders** - More aggressive memoization

---

## PRIORITY 2: Immersive UI Enhancements

### Distraction-Free Mode
- [ ] **Zen Mode** - Single click hides ALL UI, just content
- [ ] **Auto-hide controls** - Fade out after 3s of no movement
- [ ] **Edge-reveal UI** - Controls only appear when mouse at edges
- [ ] **Minimal HUD** - Option to show only essential info (duration, title)

### Sexy Visual Polish
- [ ] **Liquid transitions** - Smooth morphing between states
- [ ] **Breathing animations** - Subtle pulsing on idle elements
- [ ] **Glass morphism** - Frosted glass effect on overlays
- [ ] **Gradient borders** - Animated gradient outlines on focus
- [ ] **Glow effects** - Soft neon glow on primary actions
- [ ] **Particle cursor** - Trailing sparkles on mouse movement (optional)

### Color & Mood
- [ ] **Dynamic theming** - Colors shift based on content/heat level
- [ ] **Ambient color extraction** - Pull colors from current video thumbnail
- [ ] **Time-of-day themes** - Warmer colors at night automatically
- [ ] **Heat-reactive UI** - Interface becomes more intense at higher heat levels

---

## PRIORITY 3: New Features for Continuous Arousal

### Smart Content Flow
- [ ] **Infinite Goon Mode** - Never-ending auto-advancing content
- [ ] **Mood Detection** - Learn preferences over time, auto-curate
- [ ] **Peak Timing** - Detect when videos get intense, sync shuffles to climax moments
- [x] **Similar Content** - "More like this" (via duplicates-finder.ts + media-relationships.ts)
- [x] **Scene Detection** - Auto-skip intros (via scene-detection.ts service)

### Enhanced Goon Wall
- [ ] **Audio Reactive** - Tiles pulse/flash to audio beats
- [ ] **Sync Mode** - All tiles play in sync (same timestamp)
- [ ] **Focus Mode** - Click tile to enlarge, others shrink/blur
- [ ] **Cascade Shuffle** - Tiles shuffle in wave pattern, not all at once
- [ ] **Subliminal Flashes** - Brief image/text flashes (configurable)

### Edging & Control
- [ ] **Smart Edge Timer** - Learns your average edge time, adapts
- [ ] **Biometric Integration** - Heart rate monitor support (future)
- [ ] **Denial Mode** - Auto-pauses at peak moments
- [ ] **Ruined Orgasm Tracker** - Log and celebrate ruined Os
- [ ] **Gooner Score** - Daily rating based on session intensity

### Social/Sharing (Privacy-First)
- [ ] **Anonymous Stats** - Compare your stats to community averages
- [ ] **Playlist Sharing** - Export/import playlists (no files, just metadata)
- [ ] **Challenge Mode** - Daily/weekly edging challenges

---

## PRIORITY 4: Audio Enhancements

### Immersive Soundscape
- [ ] **Binaural beats** - Pleasure-enhancing frequencies
- [ ] **Heartbeat audio** - Synced to heat level
- [ ] **White noise options** - Rain, static, breathing
- [ ] **Audio ducking** - Lower music when moans play
- [ ] **3D spatial audio** - Sounds move based on cursor position

### Voice Improvements
- [ ] **More variety** - Support user-added voice packs
- [ ] **Intensity escalation** - Moans get more intense with heat
- [ ] **Contextual triggers** - Different sounds for different actions
- [ ] **Voice layering** - Multiple voices overlapping at high heat

---

## PRIORITY 5: Mobile/Touch Considerations (iPhone Prep)

### Touch-First UI
- [ ] **Swipe gestures** - Left/right for next/prev, up to like
- [ ] **Long press menus** - Replace right-click context menus
- [ ] **Haptic feedback** - Vibration on key actions
- [ ] **One-handed mode** - All controls reachable with thumb

### Mobile Performance
- [ ] **Adaptive quality** - Lower resolution on battery
- [ ] **Offline mode** - Cache favorites for offline viewing
- [ ] **Background playback** - Audio continues when app minimized
- [ ] **Picture-in-Picture** - Native PiP support

---

## IMPLEMENTATION PRIORITY ORDER

### Phase 1: Performance (Do First)
1. Virtual scrolling for Library
2. Video preloading improvements
3. Database index optimization
4. Memory management cleanup

### Phase 2: Polish (Do Second)
1. Auto-hide controls
2. Glass morphism overlays
3. Smoother transitions
4. Heat-reactive UI colors

### Phase 3: Features (Do Third)
1. Infinite Goon Mode
2. Focus Mode for Goon Wall
3. Audio reactive visuals
4. Smart edge timer

### Phase 4: Mobile (Future)
1. React Native or Capacitor wrapper
2. Touch gesture system
3. Mobile-optimized layouts

---

## QUICK WINS (Can Implement Today)

1. **Reduce animation delays** - Faster initial load feel
2. **Preload more thumbnails** - Increase IntersectionObserver margin
3. **Simpler transitions** - GPU-accelerated transforms only
4. **Hide scrollbars** - Cleaner look, use overlay scrollbars
5. **Breathing idle animation** - Subtle life to static UI
6. **Better loading states** - Sexy shimmer instead of spinner
7. **Keyboard shortcuts overlay** - Press ? to see all shortcuts
8. **Quick settings panel** - Floating gear for common toggles

---

## METRICS TO TRACK

- Time to first contentful paint
- Time to interactive
- Frame rate during scroll
- Memory usage over time
- Video start latency
- User session duration (our success metric!)

