// File: scripts/watch-build.mjs
// Auto-watch script that rebuilds and updates win-unpacked on file changes
// Run with: node scripts/watch-build.mjs

import { spawn, exec } from 'child_process'
import { watch } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { existsSync, copyFileSync, mkdirSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')

console.log('\n')
console.log('='.repeat(60))
console.log('   VAULT AUTO-WATCH BUILD')
console.log('   Watching for changes and auto-updating win-unpacked')
console.log('='.repeat(60))
console.log('\n')

// Directories to watch
const watchDirs = [
  join(rootDir, 'src'),
]

// Debounce timer
let buildTimer = null
let isBuilding = false
const DEBOUNCE_MS = 1000

// Build function
async function triggerBuild() {
  if (isBuilding) {
    console.log('[Watch] Build already in progress, skipping...')
    return
  }

  isBuilding = true
  console.log('\n[Watch] Changes detected, rebuilding...\n')

  try {
    // Run the build
    await new Promise((resolve, reject) => {
      const build = spawn('npm', ['run', 'build:dir'], {
        cwd: rootDir,
        shell: true,
        stdio: 'inherit'
      })

      build.on('close', (code) => {
        if (code === 0) {
          resolve()
        } else {
          reject(new Error(`Build failed with code ${code}`))
        }
      })

      build.on('error', reject)
    })

    console.log('\n[Watch] Build complete! win-unpacked updated.')
    console.log('[Watch] You can now run the exe from release/win-unpacked/Vault.exe\n')

  } catch (error) {
    console.error('\n[Watch] Build failed:', error.message)
  } finally {
    isBuilding = false
  }
}

// Debounced build trigger
function debouncedBuild() {
  if (buildTimer) {
    clearTimeout(buildTimer)
  }
  buildTimer = setTimeout(triggerBuild, DEBOUNCE_MS)
}

// Set up watchers
console.log('[Watch] Setting up file watchers...\n')

for (const dir of watchDirs) {
  if (existsSync(dir)) {
    console.log(`[Watch] Watching: ${dir}`)

    watch(dir, { recursive: true }, (eventType, filename) => {
      // Ignore certain files
      if (!filename) return
      if (filename.endsWith('.map')) return
      if (filename.includes('node_modules')) return
      if (filename.startsWith('.')) return

      console.log(`[Watch] File changed: ${filename}`)
      debouncedBuild()
    })
  }
}

console.log('\n[Watch] Ready! Make changes to trigger rebuild.\n')
console.log('Press Ctrl+C to stop.\n')

// Keep process running
process.stdin.resume()

// Handle exit
process.on('SIGINT', () => {
  console.log('\n[Watch] Stopping...')
  process.exit(0)
})
