// File: scripts/dev.mjs
import { spawn, execSync } from 'node:child_process'
import net from 'node:net'
import process from 'node:process'

const DEFAULT_DEV_URL = 'http://localhost:5173/'
const DEV_PORT = 5173

function withTrailingSlash(url) {
  return url.endsWith('/') ? url : `${url}/`
}

// Probe whether the dev port is held by something else (a previous vault
// instance that didn't clean up, or an unrelated tool). When strictPort
// is true in the vite config, leaving a holder in place makes
// electron-vite throw on startup — the user-visible failure mode for a
// long time was "every tab is blank", which is opaque. Free the port up
// front so the run is deterministic.
async function ensurePortFree(port) {
  // Probe both IPv4 and IPv6 loopback. Vite binds to ::1 by default on
  // Windows, so probing 127.0.0.1 alone misses the holder and lets the
  // strictPort vite startup fail downstream.
  async function isHeld(host) {
    return new Promise((resolve) => {
      const tester = net.createServer()
        .once('error', (err) => resolve(err.code === 'EADDRINUSE'))
        .once('listening', () => tester.close(() => resolve(false)))
        .listen(port, host)
    })
  }
  const inUse = (await isHeld('127.0.0.1')) || (await isHeld('::1'))
  if (!inUse) return
  console.warn(`[dev] Port ${port} is in use; attempting to free it.`)
  if (process.platform === 'win32') {
    try {
      const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' })
      const pids = new Set()
      for (const line of out.split(/\r?\n/)) {
        const m = line.match(/\s+LISTENING\s+(\d+)\s*$/)
        if (m) pids.add(m[1])
      }
      for (const pid of pids) {
        try {
          execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' })
          console.warn(`[dev] Killed pid ${pid} holding port ${port}.`)
        } catch { /* may already be gone */ }
      }
      // Brief settle so the OS actually releases the socket before vite
      // tries to bind. Without this, taskkill returns instantly but the
      // TCP listener can linger for a moment.
      await new Promise((r) => setTimeout(r, 400))
    } catch (err) {
      console.warn(`[dev] Could not locate holder of port ${port}: ${err.message}`)
    }
  }
}

function spawnNpmRun(scriptName, extraEnv = {}) {
  const isWin = process.platform === 'win32'
  const npmCmd = isWin ? 'npm.cmd' : 'npm'

  return spawn(npmCmd, ['run', scriptName], {
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
    shell: isWin, // avoids spawn EINVAL edge-cases in some shells
    windowsHide: false
  })
}

function killChild(child) {
  if (!child || child.killed) return
  try {
    child.kill('SIGTERM')
  } catch {
    // ignore
  }
}

async function main() {
  await ensurePortFree(DEV_PORT)
  const devUrl = withTrailingSlash(process.env.VITE_DEV_SERVER_URL?.trim() || DEFAULT_DEV_URL)
  const child = spawnNpmRun('dev:raw', { VITE_DEV_SERVER_URL: devUrl })

  const shutdown = () => killChild(child)

  process.on('SIGINT', () => {
    shutdown()
    process.exit(130)
  })

  process.on('SIGTERM', () => {
    shutdown()
    process.exit(143)
  })

  child.on('exit', (code) => process.exit(code ?? 0))
  child.on('error', (err) => {
    console.error(err)
    shutdown()
    process.exit(1)
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})