# VAULT v2.1.5 MASTER UPDATE PLAN

## PHASE 1: CRITICAL FIXES (Settings & Core)

### 1.1 Fix Broken Settings Persistence
- [ ] **Playback Settings** - Fix field name mismatches:
  - `autoplay` → `autoplayNext`
  - `loop` → `loopSingle`
  - Add missing: `muteByDefault`, `lowQualityMode`, `defaultResolution`, `lowQualityIntensity`
- [ ] **Privacy Settings** - Add missing fields:
  - `panicKeyEnabled`, `clearOnExit`, `incognitoMode` (wire up properly)
- [ ] **Visual Effects Persistence** - Save to settings:
  - Sparkles, Bokeh, Starfield, Film Grain, Dreamy Haze, Heat Level

### 1.2 Fix UI Elements
- [ ] **Library Volume Slider** - Replace with better UI (buttons? dial? vertical slider?)
- [ ] **Video Quality Settings** - Ensure all sliders/buttons work
- [ ] **Heat Effects Info** - Remove semicolons from listed heat levels
- [ ] **Goon Wall Effect Settings** - Fix all toggles and sliders

### 1.3 Version & Branding
- [ ] Update version to **2.1.5** in package.json
- [ ] Replace placeholder logo with actual Vault icon in top corner

---

## PHASE 2: DELETE/REMOVE

### 2.1 Remove Diabella AI System
- [ ] Delete all Diabella-related code from:
  - `src/main/services/diabella/` (entire folder)
  - Settings interfaces (`DiabellaSettings`)
  - Any UI references
  - Preload API handlers
- [ ] Remove Diabella sounds/voice packs references
- [ ] Clean up any orphaned imports

---

## PHASE 3: VISUAL EFFECTS OVERHAUL

### 3.1 Film Grain - Full Screen Coverage
- [ ] Make film grain overlay cover ENTIRE window, not just content area
- [ ] Ensure z-index is high enough to overlay everything

### 3.2 CRT Curved Screen Overlay
- [ ] Add new overlay that creates concave/curved CRT monitor effect
- [ ] Use CSS/SVG distortion or canvas-based barrel distortion
- [ ] Configurable intensity in settings

### 3.3 GoonWords System Overhaul
- [ ] Bring back floating words on screen
- [ ] Create preset word packs:
  - **Praise**: "Good girl", "So perfect", "Beautiful", "That's it", "Keep going"
  - **Humiliation**: "Pathetic", "Desperate", "Weak", "Addicted", "Helpless"
  - **Insult**: "Slut", "Whore", "Dirty", "Filthy", "Nasty"
  - **Kink**: "Edge", "Deny", "Worship", "Submit", "Obey"
  - **Goon**: "Pump", "Stroke", "Goon", "Throb", "Leak", "Drip"
  - **Mommy**: "Good boy", "Mommy's proud", "Come here", "Let mommy help"
  - **Brat**: "Make me", "Whatever", "Try harder", "Is that all?"
  - **Pervert**: "Freak", "Deviant", "Sicko", "Twisted", "Wrong"
- [ ] Bold thick white font as default
- [ ] Fully customizable in settings:
  - Font family, size, color
  - Frequency, duration
  - Position randomization
  - Enable/disable per preset
- [ ] Theme compatibility

### 3.4 More Overlays
- [ ] Additional overlay effects to add (configurable):
  - VHS tracking lines
  - Color aberration intensity control
  - Screen flicker intensity
  - Bloom/glow effect
  - Vignette intensity control

---

## PHASE 4: NEW FEATURES

### 4.1 Caption/Meme System (New Page)
- [ ] Create new "Captions" page in navigation
- [ ] Caption management:
  - Add/edit/delete captions (locally stored)
  - Caption categories/folders
- [ ] Caption playlists:
  - Apply caption to multiple videos
  - Random caption on random video shuffle mode
- [ ] Display options:
  - Show/hide captions toggle
  - Position (top, bottom, center)
  - Font styling
- [ ] 10-15 example captions (user will provide)

### 4.2 Blacklist System
- [ ] Create blacklist settings page/section
- [ ] Blacklist by tag - select tags to hide
- [ ] Blacklisted videos don't appear in:
  - Library
  - Feed
  - Goon Wall
  - Sessions
  - Random shuffle
- [ ] Quick blacklist button on video player

### 4.3 Cum Countdown
- [ ] Add countdown button (configurable placement)
- [ ] Settings:
  - Countdown duration (10, 30, 60 seconds, custom)
  - Voice selection (TTS for now, custom voice later)
  - Visual countdown display option
- [ ] Sexy TTS female voice countdown
- [ ] Visual effects during countdown (optional)

### 4.4 Categories System (Broader than Tags)
- [ ] Create categories:
  - Manual categories user can create
  - Auto-categories based on tags/analysis
- [ ] Suggested categories:
  - Female, Male, Trans
  - Solo, Couple, Group
  - Masturbation, Oral, Penetration
  - Cartoon/Hentai, Real, 3D/CGI
  - Amateur, Professional
  - POV, Third Person
- [ ] AI auto-categorization of videos
- [ ] Category-based filtering/browsing

---

## PHASE 5: AI FEATURES (Keep & Improve)

### 5.1 AI Features to Keep
- [ ] **AI Auto-Tagger** - Improve and ensure working
- [ ] **AI Tag Creator** - Generate new tags from content
- [ ] **AI Category Creator** - Auto-assign categories
- [ ] **AI Caption Generator** - For meme creation
- [ ] **AI Video Analyzer** - Process smallest → largest

### 5.2 AI Progress System
- [ ] Global progress bar for AI operations
- [ ] Show current operation status
- [ ] Queue system for multiple operations
- [ ] Background processing
- [ ] Pause/resume/cancel options

---

## PHASE 6: UI OVERHAUL

### 6.1 Sessions Page Revamp
- [ ] Complete UI redesign
- [ ] Better playlist management
- [ ] Improved drag-and-drop
- [ ] Session templates
- [ ] Quick session creation
- [ ] Session statistics

### 6.2 Stats Page Enhancement
- [ ] Verify all stats work correctly
- [ ] Add GIF-specific statistics (separate from images)
- [ ] More detailed breakdowns:
  - By category
  - By tag
  - Time-based graphs
  - Session history
  - Viewing patterns

### 6.3 Settings Organization
- [ ] **Add Sound Settings Tab**:
  - Master volume
  - UI sounds toggle
  - Ambience toggle/volume/track
- [ ] **Expand Playback Settings**:
  - More video controls
  - Default behaviors
  - Quality preferences
- [ ] **Expand Privacy Settings**:
  - More privacy options
  - Data management
  - History controls
- [ ] **New Effects Settings**:
  - All overlay controls
  - GoonWords configuration
  - CRT effects

---

## PHASE 7: POLISH & OPTIMIZATION

### 7.1 Error Handling
- [ ] Replace all silent `catch {}` with proper error handling
- [ ] User-friendly error messages
- [ ] Toast notifications for failures

### 7.2 Every Control Must Work
- [ ] Audit ALL sliders - verify they function
- [ ] Audit ALL toggles - verify they persist
- [ ] Audit ALL dropdowns - verify they save
- [ ] Audit ALL buttons - verify they do something

### 7.3 Performance
- [ ] Remove Diabella code (reduces bloat)
- [ ] Optimize AI operations
- [ ] Lazy load where possible

---

## PHASE 8: ACHIEVEMENTS EXPANSION

### 8.1 Current Achievements Audit
- [ ] List all existing achievements
- [ ] Verify all are earnable
- [ ] Fix any broken achievement triggers

### 8.2 New Achievements
- [ ] Add more achievements for:
  - Library milestones
  - Viewing streaks
  - Feature discovery
  - Session completion
  - Caption creation
  - Category exploration

---

## TASK PRIORITY ORDER

### Immediate (Do First)
1. Fix settings persistence (1.1)
2. Delete Diabella (2.1)
3. Update version to 2.1.5 (1.3)
4. Fix broken UI elements (1.2)

### High Priority
5. Film grain full screen (3.1)
6. CRT curved overlay (3.2)
7. GoonWords presets (3.3)
8. Blacklist system (4.2)

### Medium Priority
9. Caption/Meme system (4.1)
10. Categories system (4.4)
11. Sessions revamp (6.1)
12. Stats page fix (6.2)

### Lower Priority (But Important)
13. Cum countdown (4.3)
14. AI progress system (5.2)
15. More overlays (3.4)
16. Achievements (8.x)
17. Final polish (7.x)

---

## FILES TO MODIFY

### Main Files
- `src/renderer/App.tsx` - Main UI, settings, pages
- `src/main/settings.ts` - Settings interfaces
- `src/preload/index.ts` - API exposure
- `src/main/ipc.ts` - IPC handlers
- `package.json` - Version update

### Components
- `src/renderer/components/VisualStimulants.tsx` - Overlays
- `src/renderer/components/FloatingVideoPlayer.tsx` - Video player
- `src/renderer/components/VirtualizedMediaGrid.tsx` - Library grid

### To Delete
- `src/main/services/diabella/` - Entire folder
- Any Diabella references throughout codebase

### To Create
- Caption system components
- Blacklist system
- Categories system
- GoonWords preset system
- CRT overlay component

---

## ESTIMATED SCOPE

- **Files to modify**: 15-20
- **Files to delete**: 5-10 (Diabella)
- **New files to create**: 8-12
- **Settings fields to add**: 20+
- **New UI components**: 10+

This is a MAJOR update. Let's tackle it systematically!
