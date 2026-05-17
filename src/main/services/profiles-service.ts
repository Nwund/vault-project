// File: src/main/services/profiles-service.ts
//
// #195 — Multi-user profiles with shared catalog.
//
// Phase 1 (this implementation):
//   - profiles table + CRUD + active-profile tracking
//   - watch_sessions.profile_id stamping (new rows tagged with the
//     active profile id; existing rows assumed to be the default user)
//
// Phase 2 (deferred to a follow-up): scope ALL per-user queries
// (watch history reads, recommender inputs, "today's mix") by the
// active profile so each user really does see their own state.
//
// Active profile id is persisted in the existing settings.json so it
// survives restarts and reads cheaply from any code path.

import type { DB } from '../db'
import { nanoid } from 'nanoid'

export interface Profile {
  id: string
  name: string
  color: string | null
  avatarPath: string | null
  createdAt: number
  updatedAt: number
}

export class ProfilesService {
  private activeId = 'default'

  constructor(private db: DB) {
    // Resolve initial active id lazily on first list/get call to avoid
    // a circular dep with settings.ts at import time.
  }

  async initActive(): Promise<void> {
    try {
      const { getSettings } = await import('../settings')
      const s = (getSettings() as any).activeProfileId
      if (typeof s === 'string' && s) this.activeId = s
    } catch { /* fall back to 'default' */ }
  }

  list(): Profile[] {
    return this.db.raw.prepare(`
      SELECT id, name, color, avatar_path AS avatarPath,
             created_at AS createdAt, updated_at AS updatedAt
      FROM profiles
      ORDER BY created_at ASC
    `).all() as Profile[]
  }

  create(args: { name: string; color?: string; avatarPath?: string }): Profile {
    const id = `prof-${Date.now()}-${nanoid(5)}`
    const now = Date.now()
    this.db.raw.prepare(`
      INSERT INTO profiles (id, name, color, avatar_path, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, args.name, args.color ?? null, args.avatarPath ?? null, now, now)
    return { id, name: args.name, color: args.color ?? null, avatarPath: args.avatarPath ?? null, createdAt: now, updatedAt: now }
  }

  update(id: string, patch: Partial<{ name: string; color: string | null; avatarPath: string | null }>): void {
    const sets: string[] = []
    const args: unknown[] = []
    if (patch.name !== undefined) { sets.push('name = ?'); args.push(patch.name) }
    if (patch.color !== undefined) { sets.push('color = ?'); args.push(patch.color) }
    if (patch.avatarPath !== undefined) { sets.push('avatar_path = ?'); args.push(patch.avatarPath) }
    if (sets.length === 0) return
    sets.push('updated_at = ?')
    args.push(Date.now())
    args.push(id)
    this.db.raw.prepare(`UPDATE profiles SET ${sets.join(', ')} WHERE id = ?`).run(...args)
  }

  delete(id: string): void {
    if (id === 'default') throw new Error('Cannot delete the default profile')
    // Re-tag this profile's watch sessions to the default profile so
    // we don't orphan history if the user re-creates a profile later.
    this.db.raw.prepare(`UPDATE watch_sessions SET profile_id = 'default' WHERE profile_id = ?`).run(id)
    this.db.raw.prepare(`DELETE FROM profiles WHERE id = ?`).run(id)
    if (this.activeId === id) this.setActive('default')
  }

  getActive(): string { return this.activeId }

  async setActive(id: string): Promise<void> {
    // Validate the profile exists before pinning it.
    const exists = this.db.raw.prepare(`SELECT 1 FROM profiles WHERE id = ?`).get(id)
    if (!exists) throw new Error(`Profile not found: ${id}`)
    this.activeId = id
    try {
      const { updateSettings } = await import('../settings')
      updateSettings({ activeProfileId: id } as any)
    } catch (err) {
      console.warn('[Profiles] failed to persist activeProfileId:', err)
    }
  }
}

let _instance: ProfilesService | null = null
export function getProfilesService(db: DB): ProfilesService {
  if (!_instance) _instance = new ProfilesService(db)
  return _instance
}
