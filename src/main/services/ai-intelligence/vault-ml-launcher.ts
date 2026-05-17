// File: src/main/services/ai-intelligence/vault-ml-launcher.ts
//
// Auto-start the vault-ml-sidecar (FastAPI process). Mirrors
// joycaption-launcher.ts: detect venv next to server.py, spawn the
// python interpreter, poll /health until ready, keep PID for clean
// shutdown.
//
// Detection order: settings override → ~/vault-ml-sidecar → ~/Documents/Desktop/vault-ml-sidecar → C:\dev\vault-ml-sidecar
//
// Sidecar runs on port 8060 (override via VAULT_ML_PORT env). First
// request triggers lazy load of the requested model (Florence-2 takes
// ~30-60s, DINOv3-L ~15s). Idle eviction keeps VRAM usage in check.

import { spawn, ChildProcess } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import * as http from 'node:http'

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 8060

let launched: ChildProcess | null = null
let launchInFlight: Promise<boolean> | null = null

function ping(timeoutMs = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.request(
      { hostname: DEFAULT_HOST, port: DEFAULT_PORT, path: '/health', method: 'GET', timeout: timeoutMs },
      (res) => { resolve(res.statusCode === 200); res.resume() }
    )
    req.on('error', () => resolve(false))
    req.on('timeout', () => { req.destroy(); resolve(false) })
    req.end()
  })
}

export function findSidecarDir(override?: string | null): string | null {
  const candidates = [
    override,
    path.join(os.homedir(), 'vault-ml-sidecar'),
    path.join(os.homedir(), 'Documents', 'Desktop', 'vault-ml-sidecar'),
    'C:\\dev\\vault-ml-sidecar',
  ].filter((p): p is string => !!p)
  for (const c of candidates) {
    try {
      const serverPy = path.join(c, 'server.py')
      const venv = path.join(c, 'venv')
      if (fs.existsSync(serverPy) && fs.existsSync(venv)) return c
    } catch { /* ignore */ }
  }
  return null
}

function pickPython(serverDir: string): string | null {
  const venvPython = process.platform === 'win32'
    ? path.join(serverDir, 'venv', 'Scripts', 'python.exe')
    : path.join(serverDir, 'venv', 'bin', 'python')
  return fs.existsSync(venvPython) ? venvPython : null
}

export async function ensureVaultMlSidecar(opts?: { overrideDir?: string | null }): Promise<boolean> {
  if (await ping()) return true
  if (launchInFlight) return launchInFlight
  launchInFlight = (async () => {
    try {
      const dir = findSidecarDir(opts?.overrideDir)
      if (!dir) {
        console.warn('[vault-ml] sidecar dir not found — install vault-ml-sidecar first (see C:\\dev\\vault-ml-sidecar\\README.md)')
        return false
      }
      const py = pickPython(dir)
      if (!py) {
        console.warn('[vault-ml] venv python not found at', dir)
        return false
      }
      console.log('[vault-ml] spawning', py, 'server.py @', dir)
      launched = spawn(py, ['server.py'], {
        cwd: dir,
        env: { ...process.env, PYTHONUNBUFFERED: '1' },
        detached: false,
        windowsHide: false,  // user can see / kill the python console
      })
      launched.stdout?.on('data', (d: Buffer) => process.stdout.write(`[vault-ml] ${d}`))
      launched.stderr?.on('data', (d: Buffer) => process.stderr.write(`[vault-ml] ${d}`))
      launched.on('exit', (code) => {
        console.log(`[vault-ml] sidecar exited code=${code}`)
        launched = null
      })
      // Poll up to 60s for /health.
      const deadline = Date.now() + 60_000
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 1000))
        if (await ping(2000)) {
          console.log('[vault-ml] sidecar ready')
          return true
        }
      }
      console.warn('[vault-ml] /health did not respond within 60s')
      return false
    } catch (err) {
      console.error('[vault-ml] launch failed:', err)
      return false
    } finally {
      launchInFlight = null
    }
  })()
  return launchInFlight
}

export async function stopVaultMlSidecar(): Promise<void> {
  if (!launched) return
  try { launched.kill() } catch { /* ignore */ }
  launched = null
}

export function vaultMlStatus(): { dir: string | null; pid: number | null; managed: boolean } {
  const dir = findSidecarDir()
  return { dir, pid: launched?.pid ?? null, managed: !!launched }
}
