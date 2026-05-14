# App.tsx split plan — task #48

**File:** `C:\dev\vault\src\renderer\App.tsx`
**Current size (2026-05-10):** 3,310 lines — down from 21,308 at #48 start. **84% reduced.**
**Babel deopt threshold:** 500KB. Confidently under threshold now.
**Fast Refresh status:** working — useToast / useGlobalTasks stay file-local in App.tsx; useContextMenu moved to its own `src/renderer/contexts/ContextMenuContext.tsx`.

## Done (2026-05-10)

Phase A leaves + utility extractions completed earlier (see git history).

Phase B pages — all done:
- AboutPage (163 lines)
- DownloadsPage (369 lines)
- StatsPage (545 lines)

Phase C/D in-flight extractions completed:
- PlaylistPickers (PlaylistPicker + AddToPlaylistPopup → 223 lines)
- ReviewHoverPreview, GIFTile, HardwareEncoderSettings, AdminCards (CrossDeviceCard + TaggerQualityCard), PlaylistThumbs, MediaInfoModal (179 lines)

Phase D medium pages — all done in this session:
- FeedPage + FeedItem (1,314 lines)
- AiTaggerPage (1,636 lines)
- PlaylistsPage (1,689 lines)

Phase E large pages — all done in this session:
- CaptionsPage (2,728 lines)
- SettingsPage (2,968 lines)
- LibraryPage + MediaTile + MediaViewer (3,855 lines combined)
- GoonWallPage + GoonTile + slot manager (1,586 lines)

## Still inline in App.tsx (3,310 lines remaining)

What's left is the App() shell plus types and small helpers:
- App() main component (renders the nav + page switch + provider stack)
- Module-level type definitions: `MediaRow`, `MarkerRow`, `PlaylistRow`, `VaultSettings`, `OptimizeNamesResult`, etc. (could move to types/index.ts)
- File-local contexts/hooks kept inline for Fast Refresh: `useGlobalTasks`, `useToast`, plus the providers `ToastContext` / `GlobalTaskContext` / `ContextMenuOverlay`
- `ContextMenuOverlay`, `ToastContainer`, `GlobalProgressBar` (small inline components used by App shell)

The remaining 3,310 lines is mostly the App shell and providers. Splitting further would require lifting state out of App() — diminishing returns vs. the ~5x perf gain already achieved.

---

## Original plan and history below

**Original size:** 21,297 lines, 46 inline component / function definitions.

---

## Why split

1. **Babel deoptimization** on every build (`[BABEL] Note: The code generator has deoptimised the styling of …App.tsx as it exceeds the max of 500KB`). Slower transformation, more memory.
2. **Editor performance** — many editors choke on a 21k-line file (LSP requests slow, search is sluggish).
3. **Conceptual clarity** — extracting per-page files makes the codebase navigable. Each page is currently 1k–3k lines lost in the noise.
4. **Future code-splitting** — once pages are separate files, lazy-loading them via `React.lazy()` is trivial and shrinks the initial bundle.

## What's there now (inline definitions in App.tsx)

Pages (large):
- `LibraryPage` (~3,013 lines)
- `SettingsPage` (~2,923 lines)
- `CaptionsPage` (~2,504 lines)
- `PlaylistsPage` (~1,639 lines)
- `FeedPage` (~1,046 lines)
- `GoonWallPage` (~1,042 lines)
- `AiTaggerPage` (~1,564 lines)
- `StatsPage` (~500 lines)
- `DownloadsPage` (~365 lines)
- `AboutPage` (~150 lines) ← the smallest, extracted in this commit

Memo'd tiles + cards (medium):
- `MediaTile`, `GoonTile`, `FeedItem`, `CaptionedThumb`
- `TaggerQualityCard`, `CrossDeviceCard`
- `MediaViewer`, `MediaInfoModal`, `PlaylistPicker`
- `ReviewHoverPreview`

Utilities (leaf, easy):
- `cn`, `extractItems`, `toFileUrl`
- `Btn`, `TopBar`, `Dropdown`, `ToggleSwitch`, `AnimatedCounter`, `DurationDisplay`
- `getPersistedFilters`

Hooks (file-local for Fast Refresh):
- `useGlobalTasks`, `useToast`, `useContextMenu` — these were mixed-export hooks blocking Fast Refresh; now file-local. Don't re-export when extracting them — the canonical sources live in `src/renderer/contexts/`.

## Migration order (recommended)

Each phase is a separate session. Do NOT batch — splits like this break in subtle ways and need targeted verification.

### Phase A — leaf utilities (low risk, ~30 min)
1. Extract `cn` → `src/renderer/utils/cn.ts` (shared with PmvEditor + VirtualizedMediaGrid which both have local copies).
2. Extract `extractItems`, `toFileUrl` → `src/renderer/utils/api.ts`.
3. Extract `Btn`, `TopBar`, `Dropdown`, `ToggleSwitch`, `AnimatedCounter`, `DurationDisplay` → `src/renderer/components/ui/*.tsx`.
4. Each extraction: add import to App.tsx + delete the inline definition.

**Estimated savings:** ~400-500 lines.

### Phase B — small pages (low risk, ~1 hour)
1. `AboutPage` → `src/renderer/pages/AboutPage.tsx` ← **DONE in this commit**
2. `DownloadsPage` → `src/renderer/pages/DownloadsPage.tsx`
3. `StatsPage` → `src/renderer/pages/StatsPage.tsx`

**Estimated savings:** ~1,000 lines.

### Phase C — memo'd tiles (medium risk, ~1 hour)
1. `MediaTile`, `GoonTile`, `FeedItem`, `CaptionedThumb`
2. `MediaViewer`, `MediaInfoModal`, `PlaylistPicker`, `AddToPlaylistPopup`
3. `TaggerQualityCard`, `CrossDeviceCard`, `UrlGroup`, `ReviewHoverPreview`

Care: these reference `MediaRow`, `cn`, `toFileUrlCached`, etc. — must be extracted alongside or imported from utils.

**Estimated savings:** ~2,000 lines.

### Phase D — medium pages (~2 hours per page)
- `FeedPage`, `GoonWallPage`, `PlaylistsPage`, `AiTaggerPage`

These reference local helpers + state. Some shared types should move to `src/renderer/types/index.ts` (e.g. `MediaRow`, `ReviewItem`).

### Phase E — large pages (~3-4 hours per page)
- `CaptionsPage`, `SettingsPage`, `LibraryPage`

These are the chunky ones. `LibraryPage` in particular has ~3000 lines of state + handlers + render and is the "primary" page surface. Split carefully.

## Patterns

### Pattern: page file
```ts
// src/renderer/pages/SomePage.tsx
import { useState, useEffect, ... } from 'react'
import { Foo, Bar } from 'lucide-react'
import { cn } from '../utils/cn'
import { useToast } from '../contexts'

export function SomePage(props: { ... }) {
  // ...
}
```

App.tsx changes:
```ts
// Before: function SomePage() { ... }
// After:
import { SomePage } from './pages/SomePage'
```

### Pattern: shared types
Move `MediaRow`, `ReviewItem`, `CaptionPreset`, etc. to `src/renderer/types/index.ts` so multiple page files can import them without circular deps via App.tsx.

### Pattern: state lifting
Some inline pages reference state owned by App or its siblings (e.g. `selectedIds`, `floatingPlayerOpenIds`). Either:
1. Pass as props (preferred for one-way state).
2. Use a context (for cross-cutting state like floating players).

## What NOT to extract yet

- **Hooks that App.tsx currently keeps file-local for Fast Refresh** (`useGlobalTasks`, `useToast`, `useContextMenu`). The Fast Refresh fix relies on App.tsx exporting only one component. If you re-export these hooks, the Fast Refresh issue returns and full page reload comes back on every edit. Use `src/renderer/contexts/` instead.

## Validation per phase

After each phase:
1. `npm run dev` boots without errors.
2. Vite log: no `Could not Fast Refresh` warnings introduced.
3. Each page renders + interactive (open Library, open Settings, open About, etc.).
4. Type check: `npx tsc --noEmit` (currently has many warnings; new errors specifically count).
5. Diff check: lines removed from App.tsx ≈ lines added in new files. No accidental duplication.

## This commit (Phase B step 1)

Extracted `AboutPage` → `src/renderer/pages/AboutPage.tsx`. Includes a local `cn` helper to avoid touching the App-level one yet (Phase A would consolidate). Validates the extraction pattern + reduces App.tsx by ~150 lines.
