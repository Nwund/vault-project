// File: src/main/services/cron-scheduler.ts
//
// #318 E-94 — Cron-syntax job scheduler. Users define named jobs:
// each has a cron expression, an action type, and optional args.
// On schedule, the scheduler dispatches the action — either an
// internal IPC channel name (e.g. "ai:reanalyze-batch") or an HTTP
// POST to a webhook URL (for cross-process integrations).
//
// Job store lives in settings.cronJobs. Scheduler runs in main; the
// renderer can list/add/remove via IPCs and watch lastRun via the
// `cron:fired` broadcast.

import { CronExpressionParser } from 'cron-parser'
import { BrowserWindow } from 'electron'
import { getSettings, updateSettings } from '../settings'

export interface CronJob {
  id: string
  name: string
  expression: string   // e.g. "0 3 * * *" (3am daily)
  action:
    | { kind: 'ipc'; channel: string; args?: any }
    | { kind: 'webhook'; url: string; method?: 'GET' | 'POST'; bodyJson?: any }
  enabled: boolean
  lastRunAt?: number
  lastError?: string | null
  nextRunAt?: number
  runCount?: number
}

let tickTimer: NodeJS.Timeout | null = null

function readJobs(): CronJob[] {
  const s = getSettings() as any
  return Array.isArray(s.cronJobs) ? s.cronJobs : []
}

function writeJobs(jobs: CronJob[]): void {
  updateSettings({ cronJobs: jobs } as any)
}

function computeNextRun(expression: string, after: Date = new Date()): number | null {
  try {
    const it = CronExpressionParser.parse(expression, { currentDate: after })
    return it.next().toDate().getTime()
  } catch {
    return null
  }
}

export function validateExpression(expression: string): { ok: boolean; nextRunAt?: number; error?: string } {
  try {
    const it = CronExpressionParser.parse(expression)
    return { ok: true, nextRunAt: it.next().toDate().getTime() }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) }
  }
}

export function listJobs(): CronJob[] {
  return readJobs()
}

export function addJob(args: { name: string; expression: string; action: CronJob['action']; enabled?: boolean }): CronJob {
  const next = computeNextRun(args.expression)
  if (next === null) throw new Error(`Invalid cron expression: ${args.expression}`)
  const job: CronJob = {
    id: `cron-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: args.name,
    expression: args.expression,
    action: args.action,
    enabled: args.enabled ?? true,
    nextRunAt: next,
    runCount: 0,
  }
  writeJobs([...readJobs(), job])
  return job
}

export function updateJob(id: string, patch: Partial<Omit<CronJob, 'id'>>): CronJob | null {
  const jobs = readJobs()
  const idx = jobs.findIndex((j) => j.id === id)
  if (idx < 0) return null
  const merged = { ...jobs[idx], ...patch }
  if (patch.expression && patch.expression !== jobs[idx].expression) {
    const next = computeNextRun(patch.expression)
    if (next === null) throw new Error(`Invalid cron expression: ${patch.expression}`)
    merged.nextRunAt = next
  }
  jobs[idx] = merged
  writeJobs(jobs)
  return merged
}

export function removeJob(id: string): void {
  writeJobs(readJobs().filter((j) => j.id !== id))
}

async function fireJob(job: CronJob): Promise<{ ok: boolean; error?: string }> {
  try {
    if (job.action.kind === 'ipc') {
      // Invoke an existing ipcMain handler. We do this by emitting a
      // synthetic invoke via the WebContents' invoke machinery in the
      // main window. Cleaner: directly call the registered handler
      // via ipcMain's internal map (no public API), or have callers
      // expose a wrapper. We'll broadcast it as an event instead so
      // the renderer can react and call the real IPC from there.
      for (const w of BrowserWindow.getAllWindows()) {
        try { w.webContents.send('cron:fired', { jobId: job.id, channel: job.action.channel, args: job.action.args, ts: Date.now() }) } catch { /* ignore */ }
      }
      return { ok: true }
    }
    if (job.action.kind === 'webhook') {
      const action = job.action  // narrowing for TS
      const method = action.method ?? 'POST'
      const body = action.bodyJson ? JSON.stringify(action.bodyJson) : undefined
      const { net } = await import('electron')
      await new Promise<void>((resolve, reject) => {
        const req = net.request({ method, url: action.url, redirect: 'follow' })
        req.setHeader('Content-Type', 'application/json')
        req.on('error', reject)
        req.on('response', (res: any) => {
          res.on('end', resolve)
          res.on('data', () => { /* drain */ })
        })
        if (body) req.write(body)
        req.end()
      })
      return { ok: true }
    }
    return { ok: false, error: 'Unknown action kind' }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) }
  }
}

export function startScheduler(): void {
  if (tickTimer) return
  tickTimer = setInterval(async () => {
    const now = Date.now()
    const jobs = readJobs()
    let mutated = false
    for (const job of jobs) {
      if (!job.enabled) continue
      if (!job.nextRunAt) { job.nextRunAt = computeNextRun(job.expression, new Date(now)) ?? undefined; mutated = true; continue }
      if (now >= job.nextRunAt) {
        const result = await fireJob(job)
        job.lastRunAt = now
        job.lastError = result.ok ? null : (result.error ?? 'failed')
        job.runCount = (job.runCount ?? 0) + 1
        // Advance nextRunAt past now to avoid drift.
        job.nextRunAt = computeNextRun(job.expression, new Date(now + 1000)) ?? undefined
        mutated = true
      }
    }
    if (mutated) writeJobs(jobs)
  }, 30_000)
  tickTimer.unref?.()
}

export function stopScheduler(): void {
  if (tickTimer) {
    clearInterval(tickTimer)
    tickTimer = null
  }
}
