// File: src/main/services/smb-share-helper.ts
//
// #182 — SMB / CIFS share helper.
//
// No pure-Node SMB *server* lib is currently well-maintained, so we
// route through the OS's native SMB implementation instead:
//   - Windows: `net share` (built in, ships with every Windows install)
//   - macOS:   `sharing` CLI + System Preferences toggle
//   - Linux:   `smbpasswd` + samba.conf (user-administered)
//
// This service:
//   1. Detects the host platform.
//   2. Lists existing shares so the renderer can show "Vault library
//      already shared as \\PC\VaultLibrary" status.
//   3. Offers to CREATE a new share for the user's first media dir.
//      Requires admin elevation on Windows — we surface a clear error
//      when the call fails because of insufficient privileges.
//   4. Offers REMOVE for shares we own.
//
// Network-binding caveat: Vault binds the existing HTTP cross-device
// server to private/Tailscale interfaces only. SMB doesn't get the
// same interface filtering for free — users should rely on Windows
// Firewall rules + a non-public network profile to prevent LAN-wide
// exposure.

import { spawnSync } from 'node:child_process'

export interface SmbShareEntry {
  name: string
  path: string
  description: string
  /** True when we (probably) created this entry — i.e. name starts
   *  with "Vault" so the renderer doesn't offer to remove user shares. */
  ownedByVault: boolean
}

export interface SmbStatus {
  platform: NodeJS.Platform
  supported: boolean
  shares: SmbShareEntry[]
  /** Free-text reason when supported=false. */
  reason: string | null
}

export function getSmbStatus(): SmbStatus {
  if (process.platform === 'win32') {
    const shares = listWindowsShares()
    return { platform: process.platform, supported: true, shares, reason: null }
  }
  if (process.platform === 'darwin') {
    return {
      platform: process.platform,
      supported: false,
      shares: [],
      reason: 'macOS: enable File Sharing in System Settings → General → Sharing, then add your media folder there. Vault cannot toggle this for you because the API requires user authentication.',
    }
  }
  if (process.platform === 'linux') {
    return {
      platform: process.platform,
      supported: false,
      shares: [],
      reason: 'Linux: install samba and add a [VaultLibrary] block to /etc/samba/smb.conf. Vault cannot edit system config files automatically.',
    }
  }
  return {
    platform: process.platform,
    supported: false,
    shares: [],
    reason: `Unsupported platform: ${process.platform}`,
  }
}

function listWindowsShares(): SmbShareEntry[] {
  try {
    const r = spawnSync('net', ['share'], { encoding: 'utf8', windowsHide: true })
    if (r.status !== 0) return []
    const lines = r.stdout.split('\n').slice(4) // skip header
    const out: SmbShareEntry[] = []
    for (const raw of lines) {
      const line = raw.trim()
      if (!line || line.startsWith('-') || line.startsWith('The command')) continue
      // Format: <name>  <path>  <description> (whitespace-separated, variable widths)
      const parts = line.split(/\s{2,}/)
      if (parts.length < 2) continue
      const name = parts[0].trim()
      const path = parts[1].trim()
      const description = (parts[2] ?? '').trim()
      if (!name || name === 'Share name' || name.endsWith('$')) continue // skip admin shares
      out.push({
        name,
        path,
        description,
        ownedByVault: /^vault/i.test(name),
      })
    }
    return out
  } catch {
    return []
  }
}

/**
 * Create a Windows SMB share. Requires admin rights — when not
 * elevated, `net share` returns "System error 5: Access is denied"
 * and we surface that to the renderer so the user can re-launch
 * Vault as admin if they want this.
 */
export function createWindowsShare(opts: {
  name: string
  path: string
  description?: string
  readOnly?: boolean
}): { ok: boolean; error?: string } {
  if (process.platform !== 'win32') return { ok: false, error: 'Only supported on Windows' }
  const desc = opts.description ?? 'Vault media library'
  const grant = opts.readOnly !== false ? '/grant:everyone,READ' : '/grant:everyone,FULL'
  const args = ['share', `${opts.name}=${opts.path}`, grant, `/remark:${desc}`]
  const r = spawnSync('net', args, { encoding: 'utf8', windowsHide: true })
  if (r.status === 0) return { ok: true }
  const err = (r.stderr || r.stdout || '').trim().split('\n').pop() || `net share exit ${r.status}`
  return {
    ok: false,
    error: err.includes('System error 5')
      ? 'Access denied — Windows requires Administrator to create SMB shares. Re-launch Vault as admin (right-click → Run as administrator).'
      : err,
  }
}

export function removeWindowsShare(name: string): { ok: boolean; error?: string } {
  if (process.platform !== 'win32') return { ok: false, error: 'Only supported on Windows' }
  const r = spawnSync('net', ['share', name, '/delete', '/y'], { encoding: 'utf8', windowsHide: true })
  if (r.status === 0) return { ok: true }
  const err = (r.stderr || r.stdout || '').trim().split('\n').pop() || `net share exit ${r.status}`
  return {
    ok: false,
    error: err.includes('System error 5')
      ? 'Access denied — Windows requires Administrator to remove SMB shares.'
      : err,
  }
}
