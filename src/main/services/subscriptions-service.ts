// File: src/main/services/subscriptions-service.ts
//
// #101 — Saved Subscriptions with delta sync.
//
// A subscription = (source, query, interval). The service runs each
// subscription at its configured interval, fetches the source via the
// existing booru-client adapter, and pushes any post_id that we
// haven't seen for this subscription before into subscription_inbox.
//
// Inbox entries can be dismissed (auto-hide), saved-to-library (the
// existing Browse "Save to Library" route runs and we mark
// `saved_at`), or expire naturally if not interacted with.
//
// Polling cadence: a single setInterval at 1-minute resolution that
// walks all enabled subscriptions and runs whichever are due. Avoids
// node-cron's heavyweight scheduling for this small per-row count.

import type { DB } from '../db'
import { nanoid } from 'nanoid'

export interface Subscription {
  id: string
  name: string
  source: string
  query: string
  intervalMinutes: number
  lastRunAt: number | null
  lastError: string | null
  enabled: boolean
  createdAt: number
}

export interface SubscriptionInboxItem {
  id: string
  subscriptionId: string
  postId: string
  thumbUrl: string | null
  fullUrl: string | null
  sourcePageUrl: string | null
  discoveredAt: number
  dismissedAt: number | null
  savedAt: number | null
}

// The booru-client fetcher contract we depend on. Provided by the
// adapter layer at runtime so this service doesn't import the heavy
// booru-client module at load time.
export type SubscriptionFetcher = (source: string, query: string) => Promise<Array<{
  postId: string
  thumbUrl?: string | null
  fullUrl?: string | null
  sourcePageUrl?: string | null
}>>

const TICK_INTERVAL_MS = 60_000 // 1 minute

export class SubscriptionsService {
  private timer: NodeJS.Timeout | null = null
  private running = false
  private fetcher: SubscriptionFetcher | null = null
  private onUpdate: (() => void) | null = null

  constructor(private db: DB) {}

  /**
   * Wire up the booru fetcher + a callback to fire whenever new inbox
   * rows land (renderer subscribes via vault:changed broadcast).
   */
  configure(opts: { fetcher: SubscriptionFetcher; onUpdate?: () => void }): void {
    this.fetcher = opts.fetcher
    this.onUpdate = opts.onUpdate ?? null
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => { void this.tick() }, TICK_INTERVAL_MS)
    // Kick once immediately so the user doesn't wait a minute on app boot
    setTimeout(() => { void this.tick() }, 5_000)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  list(): Subscription[] {
    return this.db.raw.prepare(`
      SELECT id, name, source, query, interval_minutes AS intervalMinutes,
             last_run_at AS lastRunAt, last_error AS lastError,
             enabled, created_at AS createdAt
      FROM subscriptions
      ORDER BY created_at DESC
    `).all().map((r: any) => ({
      ...r,
      enabled: Boolean(r.enabled),
    })) as Subscription[]
  }

  create(args: { name: string; source: string; query: string; intervalMinutes?: number }): Subscription {
    const id = `sub-${Date.now()}-${nanoid(6)}`
    const now = Date.now()
    const interval = Math.max(15, args.intervalMinutes ?? 360)
    this.db.raw.prepare(`
      INSERT INTO subscriptions (id, name, source, query, interval_minutes, enabled, created_at)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `).run(id, args.name, args.source, args.query, interval, now)
    return {
      id, name: args.name, source: args.source, query: args.query,
      intervalMinutes: interval, lastRunAt: null, lastError: null,
      enabled: true, createdAt: now,
    }
  }

  update(id: string, patch: Partial<Pick<Subscription, 'name' | 'query' | 'intervalMinutes' | 'enabled'>>): void {
    const sets: string[] = []
    const args: unknown[] = []
    if (patch.name !== undefined) { sets.push('name = ?'); args.push(patch.name) }
    if (patch.query !== undefined) { sets.push('query = ?'); args.push(patch.query) }
    if (patch.intervalMinutes !== undefined) { sets.push('interval_minutes = ?'); args.push(Math.max(15, patch.intervalMinutes)) }
    if (patch.enabled !== undefined) { sets.push('enabled = ?'); args.push(patch.enabled ? 1 : 0) }
    if (sets.length === 0) return
    args.push(id)
    this.db.raw.prepare(`UPDATE subscriptions SET ${sets.join(', ')} WHERE id = ?`).run(...args)
  }

  delete(id: string): void {
    const tx = this.db.raw.transaction((subId: string) => {
      this.db.raw.prepare(`DELETE FROM subscription_inbox WHERE subscription_id = ?`).run(subId)
      this.db.raw.prepare(`DELETE FROM subscriptions WHERE id = ?`).run(subId)
    })
    tx(id)
  }

  inbox(opts?: { subscriptionId?: string; pendingOnly?: boolean; limit?: number }): SubscriptionInboxItem[] {
    const limit = opts?.limit ?? 200
    const where: string[] = []
    const args: unknown[] = []
    if (opts?.subscriptionId) { where.push('subscription_id = ?'); args.push(opts.subscriptionId) }
    if (opts?.pendingOnly) where.push('dismissed_at IS NULL AND saved_at IS NULL')
    const sql = `
      SELECT id, subscription_id AS subscriptionId, post_id AS postId,
             thumb_url AS thumbUrl, full_url AS fullUrl,
             source_page_url AS sourcePageUrl,
             discovered_at AS discoveredAt,
             dismissed_at AS dismissedAt,
             saved_at AS savedAt
      FROM subscription_inbox
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY discovered_at DESC
      LIMIT ?
    `
    return this.db.raw.prepare(sql).all(...args, limit) as SubscriptionInboxItem[]
  }

  dismissInbox(id: string): void {
    this.db.raw.prepare(`UPDATE subscription_inbox SET dismissed_at = ? WHERE id = ?`).run(Date.now(), id)
  }

  markSaved(id: string): void {
    this.db.raw.prepare(`UPDATE subscription_inbox SET saved_at = ? WHERE id = ?`).run(Date.now(), id)
  }

  // For the renderer "Run now" affordance.
  async runOne(id: string): Promise<{ added: number; error: string | null }> {
    const sub = this.db.raw.prepare(`
      SELECT id, name, source, query, interval_minutes AS intervalMinutes,
             last_run_at AS lastRunAt, last_error AS lastError,
             enabled, created_at AS createdAt
      FROM subscriptions WHERE id = ?
    `).get(id) as any
    if (!sub) return { added: 0, error: 'Subscription not found' }
    return this.executeSubscription({
      ...sub,
      enabled: Boolean(sub.enabled),
    } as Subscription)
  }

  // ─── internals ────────────────────────────────────────────────────────

  private async tick(): Promise<void> {
    if (this.running) return
    if (!this.fetcher) return
    this.running = true
    try {
      const now = Date.now()
      const due = this.list().filter((s) => {
        if (!s.enabled) return false
        if (!s.lastRunAt) return true
        return now - s.lastRunAt >= s.intervalMinutes * 60_000
      })
      for (const s of due) {
        await this.executeSubscription(s)
      }
    } catch (err: any) {
      console.warn('[Subscriptions] tick failed:', err?.message ?? err)
    } finally {
      this.running = false
    }
  }

  private async executeSubscription(sub: Subscription): Promise<{ added: number; error: string | null }> {
    if (!this.fetcher) return { added: 0, error: 'Fetcher not configured' }
    const now = Date.now()
    try {
      const posts = await this.fetcher(sub.source, sub.query)
      // Insert OR IGNORE so previously-seen posts don't reappear in
      // the inbox; SQLite's UNIQUE (subscription_id, post_id) does
      // the dedup work for us.
      const ins = this.db.raw.prepare(`
        INSERT OR IGNORE INTO subscription_inbox
          (id, subscription_id, post_id, thumb_url, full_url, source_page_url, discovered_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      let added = 0
      const tx = this.db.raw.transaction(() => {
        for (const p of posts) {
          const row = ins.run(
            `inb-${Date.now()}-${nanoid(6)}`,
            sub.id,
            p.postId,
            p.thumbUrl ?? null,
            p.fullUrl ?? null,
            p.sourcePageUrl ?? null,
            now,
          )
          if (row.changes > 0) added++
        }
      })
      tx()
      this.db.raw.prepare(`UPDATE subscriptions SET last_run_at = ?, last_error = NULL WHERE id = ?`)
        .run(now, sub.id)
      if (added > 0) this.onUpdate?.()
      return { added, error: null }
    } catch (err: any) {
      const msg = err?.message ?? String(err)
      this.db.raw.prepare(`UPDATE subscriptions SET last_run_at = ?, last_error = ? WHERE id = ?`)
        .run(now, msg.slice(0, 500), sub.id)
      return { added: 0, error: msg }
    }
  }
}

let _instance: SubscriptionsService | null = null
export function getSubscriptionsService(db: DB): SubscriptionsService {
  if (!_instance) _instance = new SubscriptionsService(db)
  return _instance
}
