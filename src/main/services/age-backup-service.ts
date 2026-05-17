// File: src/main/services/age-backup-service.ts
//
// #191 — age-encrypted backups with hardware-key recipients.
//
// Wraps the `age` CLI (filippo.io/age) for encrypting arbitrary
// files / streams to one or more recipients. Vault doesn't bundle
// age — user installs it via `winget install age` / `brew install
// age` / their package manager and we shell out to whatever's on
// PATH.
//
// Hardware-key recipients: age supports YubiKey-PIV plugin
// (age-plugin-yubikey), which exposes a recipient string like
// "age1yubikey1qg...". Pass those in `recipients` and it Just Works.
//
// Operations exposed:
//   ageStatus()               → { installed, version }
//   ageEncryptFile()          → encrypted .age sibling
//   ageDecryptFile()          → decrypted bytes (or stream)
//
// Decrypt requires the identity (private key) — user supplies path.
// We never persist passphrases / keys; everything is per-call.

import { spawn, spawnSync } from 'node:child_process'
import { createReadStream, createWriteStream, existsSync } from 'node:fs'
import { pipeline } from 'node:stream/promises'

function findAgeBin(): string {
  return process.platform === 'win32' ? 'age.exe' : 'age'
}

export function ageStatus(): { installed: boolean; version: string | null; binPath: string } {
  const bin = findAgeBin()
  try {
    const r = spawnSync(bin, ['--version'], { encoding: 'utf8', windowsHide: true })
    if (r.status === 0) {
      return { installed: true, version: r.stdout.trim().split('\n')[0], binPath: bin }
    }
  } catch { /* not on PATH */ }
  return { installed: false, version: null, binPath: bin }
}

/**
 * Encrypt `srcPath` to `dstPath` using one or more age recipients.
 * Each recipient can be a passphrase-protected key (age1...), an SSH
 * pubkey (ssh-ed25519 ...), or a hardware-key recipient string
 * emitted by age-plugin-yubikey.
 */
export async function ageEncryptFile(opts: {
  srcPath: string
  dstPath: string
  recipients: string[]
}): Promise<{ ok: boolean; error?: string }> {
  if (!existsSync(opts.srcPath)) return { ok: false, error: 'Source file missing' }
  if (opts.recipients.length === 0) return { ok: false, error: 'No recipients supplied' }
  const status = ageStatus()
  if (!status.installed) return { ok: false, error: 'age binary not on PATH — install age first' }

  const args: string[] = ['-o', opts.dstPath]
  for (const r of opts.recipients) {
    args.push('-r', r)
  }
  args.push(opts.srcPath)

  return new Promise((resolve) => {
    const proc = spawn(status.binPath, args, { windowsHide: true })
    let stderr = ''
    proc.stderr.on('data', (d) => { stderr += d.toString() })
    proc.on('error', (err) => resolve({ ok: false, error: err.message }))
    proc.on('close', (code) => {
      if (code === 0) resolve({ ok: true })
      else resolve({ ok: false, error: `age exit ${code}: ${stderr.slice(-300)}` })
    })
  })
}

/**
 * Decrypt `srcPath` using identity file(s). Returns ok+dstPath on
 * success. The identity file format is exactly what age-keygen
 * produces (or an age-plugin-yubikey identity file).
 */
export async function ageDecryptFile(opts: {
  srcPath: string
  dstPath: string
  identityPaths: string[]
}): Promise<{ ok: boolean; error?: string }> {
  if (!existsSync(opts.srcPath)) return { ok: false, error: 'Source file missing' }
  if (opts.identityPaths.length === 0) return { ok: false, error: 'No identity files supplied' }
  const status = ageStatus()
  if (!status.installed) return { ok: false, error: 'age binary not on PATH — install age first' }

  const args: string[] = ['--decrypt', '-o', opts.dstPath]
  for (const id of opts.identityPaths) {
    args.push('-i', id)
  }
  args.push(opts.srcPath)

  return new Promise((resolve) => {
    const proc = spawn(status.binPath, args, { windowsHide: true })
    let stderr = ''
    proc.stderr.on('data', (d) => { stderr += d.toString() })
    proc.on('error', (err) => resolve({ ok: false, error: err.message }))
    proc.on('close', (code) => {
      if (code === 0) resolve({ ok: true })
      else resolve({ ok: false, error: `age exit ${code}: ${stderr.slice(-300)}` })
    })
  })
}

/**
 * Convenience: encrypt the catalog SQLite via age and stream to
 * `dstPath`. Useful for offsite backups where you want to push a
 * single rotating snapshot to S3/B2 and never store the master key
 * on the cloud.
 *
 * No tar/zstd here — caller is expected to point at whatever single
 * file they want encrypted (vault.sqlite3, a tar.zst they already
 * produced via restic-backup-service, etc).
 */
export async function ageEncryptStream(opts: {
  srcPath: string
  dstPath: string
  recipients: string[]
}): Promise<{ ok: boolean; error?: string }> {
  // We delegate to ageEncryptFile — age's CLI handles streaming
  // internally and arg-driven file IO is more robust than piping
  // through stdin/stdout in spawn.
  return ageEncryptFile(opts)
}

// Unused export to keep the streaming API surface available later
// without a breaking change. Pipeline / createWriteStream imports
// stay around for symmetry with the encrypt-from-stream variant.
export const _internal = { pipeline, createReadStream, createWriteStream }
