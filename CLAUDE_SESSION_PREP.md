# Vault v2.1.5 - Claude Code Session Prep
**Last Updated:** Feb 12, 2026
**Build Status:** ✅ Compiling (69 modules, 846.95 kB main.js)

---

## RECENT SESSION SUMMARY (Feb 12, 2026)

### What Was Added
11 new backend services with full IPC handlers in `src/main/services/`:

| Service | File | Purpose |
|---------|------|---------|
| Video Bookmarks | `video-bookmarks.ts` | Save timestamps in videos |
| Tag Categories | `tag-categories.ts` | Hierarchical tag organization |
| Media Relationships | `media-relationships.ts` | Link sequel/prequel/series |
| Media Notes | `media-notes.ts` | Personal notes on media |
| Watch Later | `watch-later.ts` | Queue management |
| Tag Aliases | `tag-aliases.ts` | Tag synonyms |
| Rating History | `rating-history.ts` | Track rating changes |
| Custom Filters | `custom-filters.ts` | Saved filter presets |
| Session History | `session-history.ts` | Track viewing sessions |
| Favorite Folders | `favorite-folders.ts` | Quick folder access |
| Duplicates Finder | `duplicates-finder.ts` | Find duplicate files |

### IPC Handlers Added
All services have IPC handlers registered in `src/main/ipc.ts` (now ~6000 lines).

### Not Yet Done
- Frontend UI components for these new services
- Uncommitted changes need to be committed

---

## PRIORITY TASKS FOR NEXT SESSION

### 1. **Commit Recent Work**
```bash
git add src/main/services/*.ts src/main/ipc.ts
git commit -m "Add 11 new backend services for enhanced media management"
```

### 2. **Build Frontend UI for New Services**
The backend services are ready - now need React components:

**High Priority:**
- [ ] **Watch Later Page** - Show queue, drag-to-reorder, quick actions
- [ ] **Bookmarks Panel** - In video player, show/jump to bookmarks
- [ ] **Duplicates Manager** - Modal to review and resolve duplicates
- [ ] **Notes Panel** - In media detail view, add/edit notes

**Medium Priority:**
- [ ] **Tag Categories UI** - In tag manager, show category tree
- [ ] **Media Relationships UI** - In media detail, show related items
- [ ] **Rating History Chart** - In media detail, show rating over time

**Lower Priority:**
- [ ] **Session History Page** - Show past sessions with analytics
- [ ] **Custom Filters Manager** - Create/edit/execute saved filters
- [ ] **Favorite Folders Sidebar** - Quick access in Library

### 3. **Performance Optimizations** (from BRAINSTORM.md)
- [ ] Virtual scrolling improvements
- [ ] Video preloading (3 videos ahead)
- [ ] Database index optimization
- [ ] Memory management cleanup

### 4. **Visual Polish**
- [ ] Heat-reactive UI colors
- [ ] Glass morphism overlays
- [ ] Auto-hide controls after 3s
- [ ] Smoother transitions

---

## KEY FILES TO KNOW

### Backend (Electron Main)
- `src/main/ipc.ts` - All IPC handlers (~6000 lines)
- `src/main/db.ts` - Database connection and queries
- `src/main/settings.ts` - Settings management
- `src/main/services/` - All backend services (now 40+ files)

### Frontend (React Renderer)
- `src/renderer/App.tsx` - Main app shell and routing
- `src/renderer/components/` - UI components
- `src/renderer/hooks/` - Custom React hooks
- `src/renderer/index.css` - Tailwind + custom styles

### Config
- `electron.vite.config.ts` - Build configuration
- `package.json` - Dependencies (v2.1.5)

---

## UNCOMMITTED CHANGES

```
Modified:
 M electron.vite.config.ts
 M package-lock.json
 M package.json
 M src/main/ai.ts
 M src/main/ipc.ts (major changes - 11 new service handlers)
 M src/main/services/audio/voice-line-service.ts
 M src/main/services/license-service.ts
 M src/main/thumbs.ts
 M src/renderer/components/*.tsx
 M src/renderer/hooks/*.ts
 M src/renderer/index.css

New (Untracked):
 ?? src/main/services/video-bookmarks.ts
 ?? src/main/services/tag-categories.ts
 ?? src/main/services/media-relationships.ts
 ?? src/main/services/media-notes.ts
 ?? src/main/services/watch-later.ts
 ?? src/main/services/tag-aliases.ts
 ?? src/main/services/rating-history.ts
 ?? src/main/services/custom-filters.ts
 ?? src/main/services/session-history.ts
 ?? src/main/services/favorite-folders.ts
 ?? src/main/services/duplicates-finder.ts
```

---

## API KEYS

**Venice AI API Key:** `VENICE-ADMIN-KEY-MR4aPzWn9SizUynYCAeazVw6jnAeZphb0aG0FC7dJ0`

---

## ARCHITECTURE NOTES

### Service Pattern
All backend services follow singleton pattern:
```typescript
let instance: ServiceName | null = null
export function getServiceName(db: DB): ServiceName {
  if (!instance) instance = new ServiceName(db)
  return instance
}
```

### IPC Pattern
```typescript
ipcMain.handle('namespace:method', async (_ev, arg1, arg2) => {
  const service = getServiceName(db)
  return service.method(arg1, arg2)
})
```

### Database Tables Created
Recent services created these tables:
- `video_bookmarks` - Bookmarks with timestamps
- `tag_categories` - Hierarchical categories
- `media_relationships` - Links between media
- `media_notes` - User notes with FTS
- `watch_later` - Queue items
- `tag_aliases` - Synonym mappings
- `rating_history` - Rating change log
- `custom_filters` - Saved filter presets
- `viewing_sessions` - Session tracking
- `favorite_folders` - Folder bookmarks
- `media_hashes` - File hashes for dedup

---

## QUICK START COMMANDS

```bash
# Start dev server
npm run dev

# Build for production
npm run build

# Check TypeScript
npx tsc --noEmit

# Clean build
rm -rf out/ dist/ && npm run build
```

---

## NEXT SESSION SUGGESTIONS

1. **Start with commit** - Save the backend work first
2. **Pick 2-3 UI components** - Watch Later and Bookmarks are most valuable
3. **Test on real library** - 3984 files in C:\porn for testing
4. **Performance focus** - Large library reveals bottlenecks

Good luck! 🚀
