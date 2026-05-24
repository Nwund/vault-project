// File: src/main/services/ai-intelligence/model-installer.ts
//
// One-click downloader for optional ONNX models. Used by the AI Tools
// setup cards so users don't have to hunt HuggingFace / GitHub for the
// right file + filename. Pattern matches the existing
// ai:clip-bpe-download IPC: fetch URL -> write to userData/models with
// the EXACT filename the loader expects -> verify size -> return
// {ok, alreadyPresent, sizeBytes, path}.
//
// Adding a new model:
//   1. Confirm the matching loader's expected filename + minimum size.
//   2. Add an entry to MANIFEST below.
//   3. Wire it from the AiTaggerPage ModelFileCard `download` prop.
//
// Models NOT here are intentionally omitted:
//   - WhisperX / F5-TTS sidecars: Python `pip install` flow, not a file.
//   - Chromaprint fpcalc: already has its own dedicated download IPC.
//   - LAION aesthetic-linear.json: needs PyTorch .pth conversion;
//     deferred until we can host a pre-converted JSON.
//   - ai-image-detector.onnx: no canonical community ONNX export
//     exists; user picks a HuggingFace fine-tune + converts.
//   - Scaffold-only detectors (BEATs / PANNs / wav2vec2-emotion /
//     x-clip / videomae-v2 / etc.): wrappers warn-and-return-empty;
//     no point downloading the weights until the wrapper's inference
//     path is filled in.

import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { app, BrowserWindow } from 'electron'

export type ModelId =
  | 'joytag'
  | 'joytag-tags'
  | 'realesrgan-x4plus'

interface DownloadEntry {
  /** Public direct-download URL (no auth, follow-redirects). */
  url: string
  /** Final filename relative to userData/models. */
  filename: string
  /** Bail out as a clearly bogus payload if the download is smaller than this. */
  minBytes: number
  /** Sanity-cap for the download. Catches accidentally fetching a tarball or html error page. */
  maxBytes: number
  /** Optional human-readable description for logs. */
  label: string
}

const MANIFEST: Record<ModelId, DownloadEntry> = {
  // JoyTag photographic-NSFW tagger ONNX export from the author's
  // HuggingFace repo. ~600 MB. Loader expects joytag.onnx.
  joytag: {
    url: 'https://huggingface.co/fancyfeast/joytag/resolve/main/model.onnx',
    filename: 'joytag.onnx',
    minBytes: 100_000_000,    // ~100 MB sanity floor
    maxBytes: 1_500_000_000,  // 1.5 GB ceiling
    label: 'JoyTag ONNX',
  },
  // JoyTag's top-tag vocabulary, one tag per line. ~80 KB.
  // Loader expects joytag-top-tags.txt.
  'joytag-tags': {
    url: 'https://huggingface.co/fancyfeast/joytag/resolve/main/top_tags.txt',
    filename: 'joytag-top-tags.txt',
    minBytes: 5_000,
    maxBytes: 5_000_000,
    label: 'JoyTag tag vocabulary',
  },
  // Real-ESRGAN x4 plus ONNX from the Tencent ARC mirror. Loader
  // expects real_esrgan_x4plus.onnx. ~67 MB.
  'realesrgan-x4plus': {
    url: 'https://huggingface.co/skbhadra/ClearRealityV1/resolve/main/4x-ClearRealityV1.onnx',
    filename: 'real_esrgan_x4plus.onnx',
    minBytes: 10_000_000,
    maxBytes: 500_000_000,
    label: 'Real-ESRGAN x4plus',
  },
}

function getTargetPath(id: ModelId): string {
  const dir = path.join(app.getPath('userData'), 'models')
  return path.join(dir, MANIFEST[id].filename)
}

export function isAlreadyInstalled(id: ModelId): boolean {
  try {
    const p = getTargetPath(id)
    if (!fs.existsSync(p)) return false
    const stat = fs.statSync(p)
    return stat.size >= MANIFEST[id].minBytes
  } catch { return false }
}

export interface InstallResult {
  ok: boolean
  alreadyPresent?: boolean
  sizeBytes?: number
  path?: string
  error?: string
}

/**
 * Streaming download with broadcast progress so the renderer can
 * render a real progress bar instead of just a spinner. Emits
 * 'models:install-progress' { id, downloaded, total } every ~250ms.
 *
 * Progress is best-effort — some HF mirrors don't send a
 * Content-Length header, in which case `total` is null and the UI
 * shows an indeterminate bar.
 */
export async function installModel(id: ModelId): Promise<InstallResult> {
  const entry = MANIFEST[id]
  if (!entry) return { ok: false, error: `Unknown model id: ${id}` }

  const target = getTargetPath(id)
  try {
    await fsp.mkdir(path.dirname(target), { recursive: true })

    if (isAlreadyInstalled(id)) {
      const stat = await fsp.stat(target)
      return { ok: true, alreadyPresent: true, sizeBytes: stat.size, path: target }
    }

    const res = await fetch(entry.url, { redirect: 'follow' })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status} from ${entry.url}` }

    const totalHeader = res.headers.get('content-length')
    const total = totalHeader ? Number.parseInt(totalHeader, 10) : null
    if (total != null && total > entry.maxBytes) {
      return { ok: false, error: `Refusing: server reports ${total} bytes, max ${entry.maxBytes}` }
    }

    // Stream to a .partial file so a failed download doesn't leave a
    // truncated file that looks "installed" to the loader. Rename on
    // success only.
    const partial = target + '.partial'
    const reader = res.body?.getReader()
    if (!reader) return { ok: false, error: 'Response body has no reader' }

    const handle = await fsp.open(partial, 'w')
    let downloaded = 0
    let lastBroadcast = Date.now()
    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        if (!value) continue
        downloaded += value.byteLength
        if (downloaded > entry.maxBytes) {
          throw new Error(`Exceeded max bytes (${entry.maxBytes})`)
        }
        await handle.write(value)
        const now = Date.now()
        if (now - lastBroadcast > 250) {
          lastBroadcast = now
          broadcastProgress(id, downloaded, total)
        }
      }
    } finally {
      await handle.close()
    }

    if (downloaded < entry.minBytes) {
      try { await fsp.unlink(partial) } catch { /* ignore */ }
      return { ok: false, error: `Download too small (${downloaded} < ${entry.minBytes}) — likely a redirect/error page` }
    }

    // Atomic rename — file becomes visible to the loader only when
    // the bytes are fully on disk.
    if (fs.existsSync(target)) {
      try { await fsp.unlink(target) } catch { /* ignore */ }
    }
    await fsp.rename(partial, target)
    broadcastProgress(id, downloaded, total ?? downloaded)
    return { ok: true, alreadyPresent: false, sizeBytes: downloaded, path: target }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) }
  }
}

function broadcastProgress(id: ModelId, downloaded: number, total: number | null): void {
  try {
    for (const w of BrowserWindow.getAllWindows()) {
      try { w.webContents.send('models:install-progress', { id, downloaded, total }) } catch { /* window closed */ }
    }
  } catch { /* no main window */ }
}

/**
 * Install a paired set of models (e.g. JoyTag needs onnx + tag list).
 * Runs sequentially so a failure aborts cleanly. Returns the first
 * failure's result, or the last success's result on full success.
 */
export async function installModelGroup(ids: ModelId[]): Promise<InstallResult> {
  let last: InstallResult = { ok: false, error: 'No ids supplied' }
  let totalBytes = 0
  for (const id of ids) {
    const r = await installModel(id)
    if (!r.ok) return r
    totalBytes += r.sizeBytes ?? 0
    last = r
  }
  return { ...last, sizeBytes: totalBytes }
}
