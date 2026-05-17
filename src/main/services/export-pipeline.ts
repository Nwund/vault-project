// File: src/main/services/export-pipeline.ts
//
// #322 E-98 — Export pipeline. A user-defined recipe that takes a
// smart-query (Beets DSL), runs each matched media item through a
// chain of stages, and (optionally) pushes the staged output to a
// remote via rclone.
//
// Pipeline stages (all optional, all idempotent):
//   1. select(query)               — runs smart-query.ts against DB
//   2. transcode(preset)           — ffmpeg re-encode into stagingDir
//   3. exportSidecar(format)       — .xmp | .nfo | .stash.json
//   4. organize(template)          — rename into stagingDir/{template}
//   5. push(remoteSpec)            — `rclone copy stagingDir remoteSpec`
//
// Stages communicate via an EventEmitter so the UI can stream
// progress. Each item produces a per-item result row (ok / skipped /
// error + outputPath).

import { spawn } from 'node:child_process'
import * as path from 'node:path'
import * as fs from 'node:fs'
import * as os from 'node:os'
import { EventEmitter } from 'node:events'
import type { DB } from '../db'
import { compileQuery } from './smart-query'

export interface TranscodePreset {
  kind: 'ffmpeg-args'
  vcodec: string         // libx264, libx265, libsvtav1, copy
  crf?: number
  scale?: string         // 1920x1080 | -2:1080
  audioBitrate?: string  // 192k
  extension: string      // mp4, mkv, webm
}

export type SidecarFormat = 'xmp' | 'nfo' | 'stash.json'

export interface RemoteSpec {
  /** rclone-style "remote:path/to/folder". */
  spec: string
  /** Override rclone binary path. Default: scan PATH for rclone. */
  binPath?: string
  /** Extra rclone args (e.g. '--bwlimit 4M --transfers 2'). */
  extraArgs?: string[]
}

export interface ExportPipelineRecipe {
  name: string
  query: string                          // smart-query DSL
  stagingDir: string                     // absolute path
  transcode?: TranscodePreset
  sidecar?: SidecarFormat
  /** Tokenized destination name within stagingDir. Supported tokens:
   *  {title} {basename} {ext} {studio} {date:YYYY-MM-DD} {rating}. */
  organize?: string
  push?: RemoteSpec
  /** Hard cap on items processed. Default: unlimited. */
  limit?: number
}

export interface PipelineItemResult {
  mediaId: string
  sourcePath: string
  status: 'ok' | 'skipped' | 'error'
  outputPath?: string
  sidecarPath?: string
  error?: string
}

export interface PipelineRun {
  events: EventEmitter
  /** Resolves once the run is complete; rejects only on fatal infra
   *  errors (eg. stagingDir uncreatable). Per-item errors land in
   *  `results`. */
  promise: Promise<PipelineItemResult[]>
}

function tokenSubstitute(tokenStr: string, row: Record<string, any>): string {
  const now = new Date()
  return tokenStr
    .replace(/\{title\}/g, sanitize(row.title ?? row.filename ?? 'untitled'))
    .replace(/\{basename\}/g, sanitize(path.parse(row.path ?? '').name))
    .replace(/\{ext\}/g, (row.ext ?? path.extname(row.path ?? '').replace(/^\./, '')))
    .replace(/\{studio\}/g, sanitize(row.studio ?? ''))
    .replace(/\{rating\}/g, String(row.rating ?? 0))
    .replace(/\{date:([^}]+)\}/g, (_, fmt) => formatDate(now, fmt))
}

function sanitize(name: string): string {
  return String(name).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim().slice(0, 120)
}

function formatDate(d: Date, fmt: string): string {
  return fmt
    .replace(/YYYY/g, String(d.getFullYear()))
    .replace(/MM/g, String(d.getMonth() + 1).padStart(2, '0'))
    .replace(/DD/g, String(d.getDate()).padStart(2, '0'))
    .replace(/HH/g, String(d.getHours()).padStart(2, '0'))
    .replace(/mm/g, String(d.getMinutes()).padStart(2, '0'))
}

function runProc(bin: string, args: string[]): Promise<{ ok: boolean; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(bin, args, { windowsHide: true })
    let stderr = ''
    proc.stderr?.on('data', (d) => { stderr += d.toString() })
    proc.on('error', () => resolve({ ok: false, stderr }))
    proc.on('close', (code) => resolve({ ok: code === 0, stderr }))
  })
}

async function transcodeItem(
  ffmpegPath: string,
  srcPath: string,
  dstPath: string,
  preset: TranscodePreset,
): Promise<{ ok: boolean; error?: string }> {
  fs.mkdirSync(path.dirname(dstPath), { recursive: true })
  const filters: string[] = []
  if (preset.scale) filters.push(`scale=${preset.scale.replace('x', ':')}`)
  const vfArgs = filters.length ? ['-vf', filters.join(',')] : []
  const codecArgs = preset.vcodec === 'copy'
    ? ['-c:v', 'copy', '-c:a', 'copy']
    : ['-c:v', preset.vcodec,
       ...(preset.crf != null ? ['-crf', String(preset.crf)] : []),
       '-preset', 'medium',
       ...(preset.audioBitrate ? ['-b:a', preset.audioBitrate] : ['-c:a', 'aac'])]
  const args = ['-hide_banner', '-y', '-i', srcPath, ...vfArgs, ...codecArgs, dstPath]
  const r = await runProc(ffmpegPath, args)
  if (r.ok) return { ok: true }
  try { if (fs.existsSync(dstPath)) fs.unlinkSync(dstPath) } catch { /* ignore */ }
  return { ok: false, error: r.stderr.trim().split(/\r?\n/).slice(-3).join('\n') }
}

async function emitSidecar(
  format: SidecarFormat,
  srcPath: string,
  dstDir: string,
  basename: string,
  db: DB,
  mediaId: string,
): Promise<{ ok: boolean; sidecarPath?: string; error?: string }> {
  const sidecarPath = path.join(dstDir, `${basename}.${format}`)
  fs.mkdirSync(dstDir, { recursive: true })
  if (format === 'xmp') {
    const { exportXmpSidecar } = await import('./xmp-export')
    const r = exportXmpSidecar(db, mediaId)
    if (!r.ok || !r.path) return { ok: false, error: r.error ?? 'xmp export failed' }
    try { fs.copyFileSync(r.path, sidecarPath); return { ok: true, sidecarPath } }
    catch (err: any) { return { ok: false, error: String(err?.message ?? err) } }
  }
  if (format === 'nfo') {
    const { exportNfoSidecar } = await import('./nfo-export')
    const r = exportNfoSidecar(db, mediaId)
    if (!r.ok || !r.path) return { ok: false, error: r.error ?? 'nfo export failed' }
    try { fs.copyFileSync(r.path, sidecarPath); return { ok: true, sidecarPath } }
    catch (err: any) { return { ok: false, error: String(err?.message ?? err) } }
  }
  if (format === 'stash.json') {
    const { exportToStashFormat } = await import('./stash-interop')
    const scene = exportToStashFormat(db, mediaId)
    if (!scene) return { ok: false, error: 'stash export returned null' }
    try { fs.writeFileSync(sidecarPath, JSON.stringify(scene, null, 2), 'utf8'); return { ok: true, sidecarPath } }
    catch (err: any) { return { ok: false, error: String(err?.message ?? err) } }
  }
  return { ok: false, error: 'unknown sidecar format' }
}

function resolveRclone(remote: RemoteSpec): string | null {
  if (remote.binPath && fs.existsSync(remote.binPath)) return remote.binPath
  const which = process.platform === 'win32' ? 'where' : 'which'
  try {
    const out = require('node:child_process').execSync(`${which} rclone`, { encoding: 'utf8' }).toString().trim().split(/\r?\n/)[0]
    if (out && fs.existsSync(out)) return out
  } catch { /* not on PATH */ }
  return null
}

export function runPipeline(
  db: DB,
  recipe: ExportPipelineRecipe,
  ffmpegPath: string,
): PipelineRun {
  const events = new EventEmitter()
  const promise = (async () => {
    fs.mkdirSync(recipe.stagingDir, { recursive: true })
    const { sql, params } = compileQuery(recipe.query)
    const rows = db.raw.prepare(
      `SELECT m.*, GROUP_CONCAT(DISTINCT t.name) as tag_csv FROM media m
       LEFT JOIN media_tags mt ON mt.media_id = m.id
       LEFT JOIN tags t ON t.id = mt.tag_id
       WHERE ${sql} GROUP BY m.id
       ${recipe.limit ? `LIMIT ${recipe.limit}` : ''}`,
    ).all(...params) as Array<Record<string, any>>
    events.emit('start', { totalItems: rows.length })
    const results: PipelineItemResult[] = []
    let i = 0
    for (const row of rows) {
      i++
      events.emit('item-start', { index: i, total: rows.length, mediaId: row.id })
      const result: PipelineItemResult = { mediaId: row.id, sourcePath: row.path, status: 'ok' }
      // 1. organize → target basename
      const basename = recipe.organize ? tokenSubstitute(recipe.organize, row) : path.parse(row.path).name
      const ext = recipe.transcode?.extension ?? path.extname(row.path).replace(/^\./, '')
      const outName = `${basename}.${ext}`
      const outPath = path.join(recipe.stagingDir, outName)
      // 2. transcode (or copy)
      if (recipe.transcode) {
        const tr = await transcodeItem(ffmpegPath, row.path, outPath, recipe.transcode)
        if (!tr.ok) { result.status = 'error'; result.error = tr.error; results.push(result); events.emit('item-done', result); continue }
        result.outputPath = outPath
      } else if (path.resolve(row.path) !== path.resolve(outPath)) {
        try { fs.mkdirSync(path.dirname(outPath), { recursive: true }); fs.copyFileSync(row.path, outPath); result.outputPath = outPath }
        catch (err: any) { result.status = 'error'; result.error = String(err?.message ?? err); results.push(result); events.emit('item-done', result); continue }
      } else result.outputPath = outPath
      // 3. sidecar (writes alongside organized file)
      if (recipe.sidecar) {
        const sc = await emitSidecar(recipe.sidecar, row.path, recipe.stagingDir, basename, db, row.id)
        if (sc.ok) result.sidecarPath = sc.sidecarPath
        else result.error = `sidecar: ${sc.error}`
      }
      results.push(result)
      events.emit('item-done', result)
    }
    events.emit('staging-done', { stagingDir: recipe.stagingDir, items: results.length })
    // 4. push
    if (recipe.push) {
      const bin = resolveRclone(recipe.push)
      if (!bin) {
        events.emit('push-skipped', { reason: 'rclone not found on PATH and binPath not set' })
      } else {
        events.emit('push-start', { spec: recipe.push.spec })
        const args = ['copy', recipe.stagingDir, recipe.push.spec, '--progress', ...(recipe.push.extraArgs ?? [])]
        const r = await runProc(bin, args)
        events.emit('push-done', { ok: r.ok, error: r.ok ? undefined : r.stderr.split(/\r?\n/).slice(-5).join('\n') })
      }
    }
    events.emit('complete', { results })
    return results
  })()
  return { events, promise }
}

/** Recipe persistence — single-document store in userData. */

const RECIPES_FILE = path.join(os.homedir(), 'AppData', 'Roaming', 'vault', 'export-recipes.json')

export function listRecipes(): ExportPipelineRecipe[] {
  if (!fs.existsSync(RECIPES_FILE)) return []
  try { return JSON.parse(fs.readFileSync(RECIPES_FILE, 'utf8')) as ExportPipelineRecipe[] }
  catch { return [] }
}

export function saveRecipe(recipe: ExportPipelineRecipe): void {
  const all = listRecipes().filter((r) => r.name !== recipe.name)
  all.push(recipe)
  fs.mkdirSync(path.dirname(RECIPES_FILE), { recursive: true })
  fs.writeFileSync(RECIPES_FILE, JSON.stringify(all, null, 2), 'utf8')
}

export function deleteRecipe(name: string): void {
  const all = listRecipes().filter((r) => r.name !== name)
  fs.writeFileSync(RECIPES_FILE, JSON.stringify(all, null, 2), 'utf8')
}
