// File: src/main/services/sqlcipher-migrator.ts
//
// #192 — SQLCipher migration helper.
//
// Vault ships with `better-sqlite3` (no encryption). The real
// SQLCipher path is `better-sqlite3-multiple-ciphers` — a drop-in
// fork with the same API + SQLCipher support — but switching
// requires:
//
//   1. Installing the new native dep (rebuilds for Electron's ABI)
//   2. Re-keying the existing vault.sqlite3 via PRAGMA key + ATTACH +
//      sqlcipher_export
//   3. Replacing the runtime import in src/main/db.ts
//
// This file ships the SAFE Phase-1 piece: a feasibility checker +
// dry-run migrator that produces an encrypted COPY of vault.sqlite3
// alongside the existing file, leaving the original untouched. Users
// verify the copy opens with their passphrase before flipping the
// runtime over.
//
// Phase 2 (deferred): swap better-sqlite3 → multiple-ciphers in
// package.json + db.ts. Needs a npm install + Electron rebuild +
// app restart, so we don't try to do it from inside a running
// process. Documented in the returned `migrationSteps` field.

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

export interface SqlcipherFeasibility {
  /** True iff better-sqlite3-multiple-ciphers is installable on this
   *  Electron ABI + Node version. We only verify the npm registry
   *  has it; we don't actually install. */
  packageAvailable: boolean
  /** True iff the package is already installed in node_modules. */
  packageInstalled: boolean
  /** Path to the unencrypted catalog Vault is currently using. */
  catalogPath: string
  /** Size in bytes of the catalog — for showing "this will take
   *  ~X seconds to re-encrypt" in the UI. */
  catalogSizeBytes: number
  /** Step-by-step instructions the renderer can show as a checklist. */
  migrationSteps: string[]
}

export function checkSqlcipherFeasibility(): SqlcipherFeasibility {
  const catalogPath = path.join(app.getPath('userData'), 'db', 'vault.sqlite3')
  let catalogSizeBytes = 0
  try { catalogSizeBytes = fs.statSync(catalogPath).size } catch { /* missing or fresh install */ }
  const installed = isPackageInstalled('better-sqlite3-multiple-ciphers')
  const available = installed || isPackageOnRegistry('better-sqlite3-multiple-ciphers')
  return {
    packageAvailable: available,
    packageInstalled: installed,
    catalogPath,
    catalogSizeBytes,
    migrationSteps: [
      '1. Quit Vault',
      '2. Run: npm install better-sqlite3-multiple-ciphers',
      '3. Run: npx electron-builder install-app-deps  (rebuilds native bindings for Electron)',
      '4. In src/main/db.ts swap the better-sqlite3 import to better-sqlite3-multiple-ciphers (Database default export, same call signature).',
      '5. After Database() construction, call db.pragma(`key = "<your passphrase>"`)',
      '6. Run the dry-run migrator (this file: sqlcipher:dryRun IPC) to produce an encrypted copy at vault.sqlite3.enc',
      '7. Verify the copy opens with your passphrase via sqlite3 CLI:',
      '   PRAGMA key = "<your passphrase>"; SELECT COUNT(*) FROM media;',
      '8. Replace vault.sqlite3 with vault.sqlite3.enc (back up the original first)',
      '9. Relaunch Vault — settings.security.encryptedCatalog = true unlocks the key prompt at boot',
    ],
  }
}

function isPackageInstalled(name: string): boolean {
  try {
    const pkgPath = path.join(process.cwd(), 'node_modules', name, 'package.json')
    return fs.existsSync(pkgPath)
  } catch { return false }
}

function isPackageOnRegistry(name: string): boolean {
  try {
    const r = spawnSync('npm', ['view', name, 'version'], {
      encoding: 'utf8', windowsHide: true, timeout: 10_000, shell: true,
    })
    return r.status === 0 && r.stdout.trim().length > 0
  } catch { return false }
}

export interface DryRunResult {
  ok: boolean
  encryptedCopyPath?: string
  copySizeBytes?: number
  durationMs?: number
  error?: string
}

/**
 * Dry-run migration. Produces an encrypted COPY of the catalog
 * at vault.sqlite3.enc using the supplied passphrase, leaving the
 * original untouched. Only succeeds when the multi-ciphers package
 * is already installed.
 *
 * The renderer flow: Settings → Security → SQLCipher Migration shows
 * the feasibility check, prompts for a passphrase, runs this, shows
 * "dry-run succeeded — vault.sqlite3.enc is N bytes" so the user can
 * verify before doing the manual cut-over in step 8.
 */
export async function dryRunMigration(passphrase: string): Promise<DryRunResult> {
  if (!passphrase || passphrase.length < 8) {
    return { ok: false, error: 'Passphrase must be at least 8 characters' }
  }
  if (!isPackageInstalled('better-sqlite3-multiple-ciphers')) {
    return { ok: false, error: 'better-sqlite3-multiple-ciphers not installed — see migrationSteps' }
  }
  const catalogPath = path.join(app.getPath('userData'), 'db', 'vault.sqlite3')
  const encPath = `${catalogPath}.enc`
  try { fs.unlinkSync(encPath) } catch { /* fresh slate */ }

  const start = Date.now()
  try {
    // Lazy-require so the build doesn't fail when the package is
    // missing (we surface the missing-dep error via the existing
    // feasibility check).
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Database = require('better-sqlite3-multiple-ciphers') as any
    const src = new Database(catalogPath, { readonly: true })
    // Attach the encrypted destination + use sqlcipher_export to
    // copy all schema + data in one shot.
    const escaped = passphrase.replace(/'/g, "''")
    src.exec(`
      ATTACH DATABASE '${encPath.replace(/'/g, "''")}' AS encrypted KEY '${escaped}';
      SELECT sqlcipher_export('encrypted');
      DETACH DATABASE encrypted;
    `)
    src.close()
    const size = fs.statSync(encPath).size
    return {
      ok: true,
      encryptedCopyPath: encPath,
      copySizeBytes: size,
      durationMs: Date.now() - start,
    }
  } catch (err: any) {
    try { fs.unlinkSync(encPath) } catch { /* noop */ }
    return { ok: false, error: err?.message ?? String(err) }
  }
}
