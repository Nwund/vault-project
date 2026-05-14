// File: src/main/services/xyrene/server-launcher.ts
//
// Auto-start the XTTS server (xyrene-portable/xtts-server/server.py).
// The server is a separate Python process that the user could launch
// manually — but Vault treats it as a managed dependency and starts
// it on demand if the install path exists and the server isn't already
// reachable.
//
// Path detection priority:
//   1. settings.xyrene.xttsServerPath   (user override)
//   2. C:\Users\<user>\Documents\Desktop\xyrene-portable\xtts-server   (canonical)
//   3. ~/xyrene-portable/xtts-server                                    (fallback)
//
// The launched process is tracked so we can avoid double-launching and
// can clean up on app quit. We do NOT keep stdout/stderr open after the
// initial ready-wait to avoid leaking file descriptors; the python
// process logs to its own console window which the user can inspect.

import { spawn, ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 8020

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

export function findXttsServerDir(override?: string | null): string | null {
  const candidates = [
    override,
    path.join(os.homedir(), 'Documents', 'Desktop', 'xyrene-portable', 'xtts-server'),
    path.join(os.homedir(), 'xyrene-portable', 'xtts-server'),
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
  // Prefer the venv python (has all the deps); fall back to system python.
  const venvPython = process.platform === 'win32'
    ? path.join(serverDir, 'venv', 'Scripts', 'python.exe')
    : path.join(serverDir, 'venv', 'bin', 'python')
  if (fs.existsSync(venvPython)) return venvPython
  return null
}

/**
 * Spawn the XTTS server in the background. Resolves true when /health
 * starts responding (loading the model can take 15-60s on first run).
 * Resolves false on hard failure (no python, no server.py, spawn error,
 * or health check timing out after maxWaitMs).
 */
export async function startXttsServer(opts?: {
  overrideDir?: string | null
  maxWaitMs?: number
  onLog?: (line: string) => void
}): Promise<boolean> {
  // If a launch is already happening, piggyback on it instead of
  // starting a second python process.
  if (launchInFlight) return launchInFlight

  // Already up? Don't spawn another.
  if (await pingHealth()) return true

  const serverDir = findXttsServerDir(opts?.overrideDir)
  if (!serverDir) {
    console.warn('[XTTS-Launcher] No xyrene-portable/xtts-server directory found')
    return false
  }
  const python = pickPython(serverDir)
  if (!python) {
    console.warn(`[XTTS-Launcher] No venv python at ${serverDir}/venv — run setup_new_pc.bat first`)
    return false
  }

  const maxWaitMs = opts?.maxWaitMs ?? 120000  // first launch can be slow (model load)
  const serverPy = path.join(serverDir, 'server.py')
  console.log(`[XTTS-Launcher] Spawning ${python} ${serverPy}`)

  launchInFlight = (async () => {
    try {
      // detached: false so the process dies if we crash (avoids zombies).
      // windowsHide: false → user gets a console window they can see / kill.
      const proc = spawn(python, [serverPy], {
        cwd: serverDir,
        detached: false,
        windowsHide: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      launchedProcess = proc

      proc.stdout?.on('data', (d: Buffer) => {
        const line = d.toString('utf8').trim()
        if (line) {
          console.log('[XTTS]', line)
          opts?.onLog?.(line)
        }
      })
      proc.stderr?.on('data', (d: Buffer) => {
        const line = d.toString('utf8').trim()
        if (line) {
          console.warn('[XTTS]', line)
          opts?.onLog?.(line)
        }
      })
      proc.on('exit', (code) => {
        console.warn(`[XTTS-Launcher] Server process exited with code ${code}`)
        if (launchedProcess === proc) launchedProcess = null
      })

      // Poll /health until it responds or we hit the deadline.
      const deadline = Date.now() + maxWaitMs
      let ok = false
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 1500))
        ok = await pingHealth()
        if (ok) break
        if (launchedProcess !== proc) {
          // process died during startup — bail out.
          console.warn('[XTTS-Launcher] Server process exited before /health responded')
          return false
        }
      }
      if (ok) {
        console.log('[XTTS-Launcher] Server is ready')
      } else {
        console.warn(`[XTTS-Launcher] Server didn't become ready within ${maxWaitMs}ms`)
      }
      return ok
    } catch (err) {
      console.error('[XTTS-Launcher] Spawn failed:', err)
      return false
    } finally {
      launchInFlight = null
    }
  })()

  return launchInFlight
}

/**
 * Best-effort shutdown of any XTTS server we launched. Skipped if the
 * server was started manually outside Vault.
 */
export function stopXttsServer(): void {
  if (!launchedProcess) return
  try {
    if (process.platform === 'win32') {
      // SIGTERM doesn't always reach python on Windows; use taskkill /T to
      // kill the python process + any child threads cleanly.
      spawn('taskkill', ['/PID', String(launchedProcess.pid), '/T', '/F'], { windowsHide: true })
    } else {
      launchedProcess.kill('SIGTERM')
    }
  } catch (err) {
    console.warn('[XTTS-Launcher] stopXttsServer error:', err)
  }
  launchedProcess = null
}

/** True if Vault is currently managing the server process. */
export function isManagingServer(): boolean {
  return launchedProcess !== null
}
