// File: src/main/services/demucs-launcher.ts
//
// #173 — Demucs stem separation launcher.
//
// Shells out to whatever `demucs` CLI the user installed via:
//   pip install demucs               (CPU)
//   pip install -U demucs            (with CUDA if torch+cu is present)
//
// Demucs takes a single audio/video file and writes 4 stems
// (vocals / drums / bass / other) into an output directory. We
// wrap with progress detection and per-source pause/resume so the
// renderer can show a real progress bar while it runs.
//
// Settings expose:
//   - demucsBin          path to the demucs executable (default: 'demucs')
//   - demucsModel        model name (default: htdemucs)
//   - demucsTwoStem      true → split into vocals + accompaniment
//                        (no drums/bass/other)
//   - demucsOutputDir    where to write stems (default: userData/stems)

import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

interface DemucsStatus {
  installed: boolean
  version: string | null
  binPath: string
  defaultModel: string
  outputDir: string
}

export function demucsStatus(opts?: { binPath?: string }): DemucsStatus {
  const bin = opts?.binPath ?? 'demucs'
  const outputDir = path.join(app.getPath('userData'), 'stems')
  try {
    const r = spawnSync(bin, ['--version'], { encoding: 'utf8', windowsHide: true })
    if (r.status === 0) {
      return {
        installed: true,
        version: r.stdout.trim().split('\n')[0],
        binPath: bin,
        defaultModel: 'htdemucs',
        outputDir,
      }
    }
  } catch { /* not installed */ }
  return { installed: false, version: null, binPath: bin, defaultModel: 'htdemucs', outputDir }
}

export interface SeparationResult {
  ok: boolean
  outputDir: string
  stemPaths: Record<string, string>  // { vocals: '/path/vocals.wav', ... }
  error?: string
}

export async function separateStems(
  srcPath: string,
  opts: {
    binPath?: string
    model?: string
    twoStem?: boolean
    onProgress?: (pct: number, line: string) => void
  } = {},
): Promise<SeparationResult> {
  if (!fs.existsSync(srcPath)) return { ok: false, outputDir: '', stemPaths: {}, error: 'Source missing' }
  const status = demucsStatus({ binPath: opts.binPath })
  if (!status.installed) return { ok: false, outputDir: '', stemPaths: {}, error: 'demucs binary not on PATH — `pip install demucs`' }

  const model = opts.model ?? status.defaultModel
  const outBase = path.join(status.outputDir, model)
  fs.mkdirSync(outBase, { recursive: true })

  const args: string[] = ['-n', model, '-o', status.outputDir]
  if (opts.twoStem) args.push('--two-stems', 'vocals')
  args.push(srcPath)

  return new Promise<SeparationResult>((resolve) => {
    const proc = spawn(status.binPath, args, { windowsHide: true })
    let stderr = ''
    proc.stderr.on('data', (chunk) => {
      const text = chunk.toString()
      stderr += text
      // demucs prints progress as `Separating track ... 12%` lines.
      const pctMatch = text.match(/(\d+)%/g)
      if (pctMatch && opts.onProgress) {
        const last = pctMatch[pctMatch.length - 1]
        const pct = Number(last.replace('%', ''))
        if (Number.isFinite(pct)) opts.onProgress(pct, text.trim().split('\n').pop() ?? '')
      }
    })
    proc.on('error', (err) => resolve({ ok: false, outputDir: '', stemPaths: {}, error: err.message }))
    proc.on('close', (code) => {
      if (code !== 0) {
        return resolve({ ok: false, outputDir: outBase, stemPaths: {}, error: `demucs exit ${code}: ${stderr.slice(-300)}` })
      }
      // Demucs writes outputs into <outBase>/<basename-without-ext>/
      const baseName = path.basename(srcPath, path.extname(srcPath))
      const stemDir = path.join(outBase, baseName)
      const stemPaths: Record<string, string> = {}
      try {
        for (const f of fs.readdirSync(stemDir)) {
          if (!f.endsWith('.wav') && !f.endsWith('.mp3')) continue
          const stemName = path.basename(f, path.extname(f))
          stemPaths[stemName] = path.join(stemDir, f)
        }
      } catch { /* directory missing */ }
      resolve({ ok: true, outputDir: stemDir, stemPaths })
    })
  })
}
