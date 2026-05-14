// File: src/main/services/ai-intelligence/joycaption-launcher.ts
//
// Auto-start the JoyCaption Python sidecar (joycaption-sidecar/server.py).
// Mirrors src/main/services/xyrene/server-launcher.ts: detect a venv next
// to server.py, spawn the python interpreter, poll /health until ready,
// keep a reference to the process for clean shutdown.
//
// Auto-detection order (override → home → vault data → C:\dev convenience).
// Identical to joycaption-client.findJoyCaptionSidecar() — duplicated here
// so the launcher doesn't import the client module (avoids the circular
// "client → launcher → client" path).

import { spawn, ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 8030

let launchedProcess: ChildProcess | null = null
let launchInFlight: Promise<boolean> | null = null

function pingHealth(timeoutMs = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.request(
      { hostname: DEFAULT_HOST, port: DEFAULT_PORT, path: '/health', method: 'GET', timeout: timeoutMs },
      (res) => {
        resolve(res.statusCode === 200)
        res.resume()
      }
    )
    req.on('error', () => resolve(false))
    req.on('timeout', () => { req.destroy(); resolve(false) })
    req.end()
  })
}

export function findJoyCaptionSidecarDir(override?: string | null): string | null {
  const candidates = [
    override,
    path.join(os.homedir(), 'joycaption-sidecar'),
    path.join(os.homedir(), 'Documents', 'Desktop', 'joycaption-sidecar'),
    'C:\\dev\\joycaption-sidecar',
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
  if (fs.existsSync(venvPython)) return venvPython
  return null
}

/**
 * Spawn the JoyCaption sidecar in the background. Resolves true when
 * /health responds (model load can take 30-120s for bf16, 60-300s for
 * 4-bit). False on hard failure (no python, spawn error, /health timeout).
 *
 * Mode picks which entry script:
 *   - 'bf16' (default) — server.py launched directly, ~17GB VRAM
 *   - '4bit'           — set env JOYCAPTION_4BIT=1 so server.py loads
 *                        the quantized weights, ~6-8GB VRAM
 *
 * The sidecar runs in a console window the user can see / kill (matches
 * the XTTS launcher behavior). Vault tracks the PID for clean shutdown
 * on app quit.
 */
export async function startJoyCaptionSidecar(opts?: {
  overrideDir?: string | null
  mode?: 'bf16' | '4bit'
  maxWaitMs?: number
  onLog?: (line: string) => void
}): Promise<boolean> {
  if (launchInFlight) return launchInFlight
  // Already up? Skip spawn.
  if (await pingHealth()) return true

  const serverDir = findJoyCaptionSidecarDir(opts?.overrideDir)
  if (!serverDir) {
    console.warn('[JoyCaption-Launcher] No joycaption-sidecar directory found')
    return false
  }
  const python = pickPython(serverDir)
  if (!python) {
    console.warn(`[JoyCaption-Launcher] No venv python at ${serverDir}/venv — run setup.bat first`)
    return false
  }

  const maxWaitMs = opts?.maxWaitMs ?? 180_000  // model load can be slow
  const serverPy = path.join(serverDir, 'server.py')
  const mode = opts?.mode ?? 'bf16'
  console.log(`[JoyCaption-Launcher] Spawning ${python} ${serverPy} (mode=${mode})`)

  // server.py reads --quantize-4bit as a CLI flag (see joycaption-sidecar's
  // server.py argparse). Env vars aren't read upstream — pass the flag.
  const args = mode === '4bit' ? [serverPy, '--quantize-4bit'] : [serverPy]
  launchInFlight = (async () => {
    try {
      const proc = spawn(python, args, {
        cwd: serverDir,
        detached: false,
        windowsHide: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      launchedProcess = proc

      proc.stdout?.on('data', (d: Buffer) => {
        const line = d.toString('utf8').trim()
        if (line) {
          console.log('[JoyCaption]', line)
          opts?.onLog?.(line)
        }
      })
      proc.stderr?.on('data', (d: Buffer) => {
        const line = d.toString('utf8').trim()
        if (line) {
          console.warn('[JoyCaption]', line)
          opts?.onLog?.(line)
        }
      })
      proc.on('exit', (code) => {
        console.warn(`[JoyCaption-Launcher] Sidecar process exited with code ${code}`)
        if (launchedProcess === proc) launchedProcess = null
      })

      const deadline = Date.now() + maxWaitMs
      let ok = false
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 2000))
        ok = await pingHealth()
        if (ok) break
        if (launchedProcess !== proc) {
          console.warn('[JoyCaption-Launcher] Sidecar process died before /health responded')
          return false
        }
      }
      if (ok) {
        console.log('[JoyCaption-Launcher] Sidecar is ready')
      } else {
        console.warn(`[JoyCaption-Launcher] Sidecar didn't become ready within ${maxWaitMs}ms`)
      }
      return ok
    } catch (err) {
      console.error('[JoyCaption-Launcher] Spawn failed:', err)
      return false
    } finally {
      launchInFlight = null
    }
  })()

  return launchInFlight
}

/** Best-effort shutdown of a sidecar Vault launched. No-op if the user
 *  started the sidecar manually (out-of-band processes are left alone). */
export function stopJoyCaptionSidecar(): void {
  if (!launchedProcess) return
  try {
    if (process.platform === 'win32') {
      // taskkill /T also kills child threads python may have spun up.
      spawn('taskkill', ['/PID', String(launchedProcess.pid), '/T', '/F'], { windowsHide: true })
    } else {
      launchedProcess.kill('SIGTERM')
    }
  } catch (err) {
    console.warn('[JoyCaption-Launcher] stop error:', err)
  }
  launchedProcess = null
}

/** True if Vault is currently managing the sidecar process. */
export function isManagingSidecar(): boolean {
  return launchedProcess !== null
}
