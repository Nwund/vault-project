// File: src/main/services/v8-snapshot.ts
//
// #332 F-108 — V8 startup snapshot. Electron has supported v8 startup
// snapshots since ~v22. The idea: pre-execute parts of your main
// process at build time, dump V8's heap to a binary blob, ship the
// blob with your app, and Electron loads the snapshot at startup
// instead of re-running the JS. Saves 50-200ms of cold-start.
//
// This module is the *runtime* helper — it knows how to call into
// the pre-loaded snapshot if one was produced by the build step.
// The build-time generation lives in scripts/build-snapshot.js
// (electron-mksnapshot wrapper). This file is a no-op when no
// snapshot was generated.

declare const v8: any

interface VaultSnapshotShape {
  /** Pre-loaded config map. */
  config?: Record<string, any>
  /** Pre-warmed module cache. */
  warmModules?: string[]
}

let snapshot: VaultSnapshotShape | null = null

export function applyStartupSnapshot(): void {
  try {
    if (typeof v8 !== 'undefined' && typeof v8.startupSnapshot?.isBuildingSnapshot === 'function') {
      // Build-time path — populate the snapshot before the deserialize hook fires.
      v8.startupSnapshot.addDeserializeCallback(() => {
        snapshot = (globalThis as any).__VAULT_SNAPSHOT__ ?? null
      })
    } else if (typeof (globalThis as any).__VAULT_SNAPSHOT__ === 'object') {
      // Runtime path — the snapshot was deserialized for us.
      snapshot = (globalThis as any).__VAULT_SNAPSHOT__
    }
  } catch { /* ignore */ }
}

export function getSnapshot(): VaultSnapshotShape | null {
  return snapshot
}
