// File: src/main/ipc-media-import.ts
//
// Standalone home for the media:importBuffer IPC handler. Kept here
// instead of inlined in ipc.ts because adding it pushed the bundled
// main.js byte layout into a position where electron-vite's esmShim
// plugin spliced its CJS-shim header mid-statement (upstream bug,
// see MEMORY.md reference_electron_vite_cjs_shim_bug). Putting the
// handler in its own file changes the bundle layout enough to dodge
// the splice. CRITICAL: do NOT write `import <name> from <quoted>`
// text in any comment or string in this file — that exact pattern
// is what the upstream plugin regex matches, and it will splice
// over whatever string literal happens to land at the wrong offset.
//
// What this does: media:importBuffer (Brainwash clipboard paste,
// drop-blob saves). Writes the buffer to the first media dir with a
// unique pasted_<unix-ms>.<ext> filename, calls the scanner so the
// row exists before we return, broadcasts vault:changed, hands back
// the new MediaRow.

import { IpcMain, BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { getMediaDirs } from './settings'
import { upsertOne } from './scanner'

type DbLike = {
  getMediaByPath: (p: string) => unknown
}

export function registerMediaImportBufferIpc(
  ipcMain: IpcMain,
  db: DbLike,
): void {
  ipcMain.handle(
    'media:importBuffer',
    async (
      _ev,
      args: { buffer: Uint8Array | ArrayBuffer; ext: string; suggestedName?: string },
    ) => {
      try {
        const dirs = getMediaDirs()
        if (!dirs.length) return { ok: false, error: 'No media directories configured' }
        const targetDir = dirs[0]
        const allowedExt = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'])
        const extLower = String(args.ext || 'x').toLowerCase()
        if (!allowedExt.has(extLower)) return { ok: false, error: `Unsupported ext: ${extLower}` }

        const buf =
          args.buffer instanceof Uint8Array
            ? Buffer.from(args.buffer)
            : Buffer.from(new Uint8Array(args.buffer as ArrayBuffer))
        if (buf.length === 0) return { ok: false, error: 'Empty buffer' }
        if (buf.length > 50 * 1024 * 1024) return { ok: false, error: 'Buffer >50MB; refusing to import' }

        // Filename: pasted_<unix-ms>.<ext>. suggestedName intentionally
        // ignored — sanitization would need char-code work and the
        // upstream plugin bug makes ANY string-heavy logic here risky
        // until PR 838 ships.
        const baseName = `pasted_${Date.now()}`
        let targetPath = path.join(targetDir, `${baseName}${extLower}`)
        let counter = 1
        while (fs.existsSync(targetPath)) {
          targetPath = path.join(targetDir, `${baseName}_${counter}${extLower}`)
          counter++
        }
        fs.writeFileSync(targetPath, buf)

        // Inline upsert so the row exists before we return.
        await upsertOne(db as any, targetPath)
        const row = db.getMediaByPath(targetPath)
        if (!row) return { ok: false, error: 'Wrote file but upsert did not produce a row' }

        // Broadcast vault:changed so the rest of the UI re-fetches.
        try {
          for (const w of BrowserWindow.getAllWindows()) {
            try { w.webContents.send('vault:changed') } catch { /* window closed */ }
          }
        } catch { /* ignore */ }
        return { ok: true, mediaId: (row as any).id, path: targetPath, media: row }
      } catch (err: any) {
        return { ok: false, error: err?.message ?? String(err) }
      }
    },
  )
}
