// File: scripts/dev.mjs
import { spawn } from 'node:child_process'
import process from 'node:process'

const DEFAULT_DEV_URL = 'http://localhost:5173/'

function withTrailingSlash(url) {
  return url.endsWith('/') ? url : `${url}/`
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