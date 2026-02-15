// ===============================
// File: src/main/vaultProtocol.ts
// Custom vault:// protocol for secure file access
// ===============================
import { app, protocol } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { getCacheDir, getMediaDirs } from './settings'

// Register scheme as privileged BEFORE app ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'vault',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      bypassCSP: true
    }
  }
])

/**
 * Normalize path for comparison - handles Windows/Unix differences
 */
function normalizePath(p: string): string {
  if (!p) return ''
  // Replace all backslashes with forward slashes, lowercase on Windows
  let normalized = p.replace(/\\/g, '/')
  if (process.platform === 'win32') {
    normalized = normalized.toLowerCase()
  }
  // Remove trailing slash
  if (normalized.endsWith('/') && normalized.length > 1) {
    normalized = normalized.slice(0, -1)
  }
  return normalized
}

/**
 * Get all allowed root directories (media dirs + cache dir).
 */
function getAllowedRoots(): string[] {
  const roots: string[] = []

  const cacheDir = getCacheDir()
  if (cacheDir) roots.push(normalizePath(cacheDir))

  for (const dir of getMediaDirs()) {
    if (dir) roots.push(normalizePath(dir))
  }

  return [...new Set(roots)]
}

/**
 * Check if a file path is within one of the allowed roots.
 * NOTE: Reserved for future security validation - not currently integrated
 */
function _isPathAllowed(filePath: string): boolean {
  const normalizedFile = normalizePath(filePath)
  const roots = getAllowedRoots()

  for (const root of roots) {
    // Exact match
    if (normalizedFile === root) return true
    // Is subdirectory
    if (normalizedFile.startsWith(root + '/')) return true
  }

  return false
}

/**
 * Convert a path to a vault:// URL for secure file access
 */
export function toVaultUrl(filePathOrUrl: string): string {
  const s = (filePathOrUrl || '').trim()
  if (!s) return s

  // Already a vault URL
  if (s.toLowerCase().startsWith('vault://')) return s

  // Convert to vault:// URL with encoded path
  const absolutePath = path.resolve(s)
  return `vault://media?path=${encodeURIComponent(absolutePath)}`
}

/**
 * Get MIME type for file extension - helps with codec detection
 */
function getMimeType(filePath: string): string | undefined {
  const ext = path.extname(filePath).toLowerCase()
  const mimeTypes: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mkv': 'video/x-matroska',
    '.mov': 'video/quicktime',
    '.m4v': 'video/x-m4v',
    '.avi': 'video/x-msvideo',
    '.wmv': 'video/x-ms-wmv',
    '.flv': 'video/x-flv',
    '.ts': 'video/mp2t',
    '.mpg': 'video/mpeg',
    '.mpeg': 'video/mpeg',
    '.3gp': 'video/3gpp',
    '.ogv': 'video/ogg',
    '.m2ts': 'video/mp2t',
    '.mts': 'video/mp2t',
    '.vob': 'video/mpeg',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp'
  }
  return mimeTypes[ext]
}

/**
 * Register the vault:// protocol handler.
 * MUST be called after app.whenReady().
 */
export function registerVaultProtocol(): void {
  if (!app.isReady()) {
    throw new Error('registerVaultProtocol must be called after app.whenReady()')
  }

  protocol.handle('vault', async (request) => {
    try {
      const url = new URL(request.url)
      const rawPath = url.searchParams.get('path')

      if (!rawPath) {
        console.error('[vault protocol] No path parameter:', request.url)
        return new Response('Not found', { status: 404 })
      }

      const decoded = decodeURIComponent(rawPath)
      const absolutePath = path.resolve(decoded)

      // Check if file exists and is readable
      let stat: fs.Stats
      try {
        stat = fs.statSync(absolutePath)
        fs.accessSync(absolutePath, fs.constants.R_OK)
      } catch {
        console.error('[vault protocol] File not found or not readable:', absolutePath)
        return new Response('Not found', { status: 404 })
      }

      const mimeType = getMimeType(absolutePath) || 'application/octet-stream'
      const fileSize = stat.size
      const rangeHeader = request.headers.get('Range')

      // Range request — return 206 Partial Content
      if (rangeHeader) {
        const match = rangeHeader.match(/bytes=(\d+)-(\d*)/)
        if (match) {
          const start = parseInt(match[1], 10)
          const end = match[2] ? parseInt(match[2], 10) : fileSize - 1
          const chunkSize = end - start + 1

          const stream = fs.createReadStream(absolutePath, { start, end })
          const readable = new ReadableStream({
            start(controller) {
              stream.on('data', (chunk: Buffer | string) => controller.enqueue(typeof chunk === 'string' ? Buffer.from(chunk) : chunk))
              stream.on('end', () => controller.close())
              stream.on('error', (err) => controller.error(err))
            },
            cancel() { stream.destroy() }
          })

          return new Response(readable, {
            status: 206,
            headers: {
              'Content-Type': mimeType,
              'Content-Range': `bytes ${start}-${end}/${fileSize}`,
              'Content-Length': String(chunkSize),
              'Accept-Ranges': 'bytes',
            }
          })
        }
      }

      // Full file response
      const stream = fs.createReadStream(absolutePath)
      const readable = new ReadableStream({
        start(controller) {
          stream.on('data', (chunk: Buffer | string) => controller.enqueue(typeof chunk === 'string' ? Buffer.from(chunk) : chunk))
          stream.on('end', () => controller.close())
          stream.on('error', (err) => controller.error(err))
        },
        cancel() { stream.destroy() }
      })

      return new Response(readable, {
        status: 200,
        headers: {
          'Content-Type': mimeType,
          'Content-Length': String(fileSize),
          'Accept-Ranges': 'bytes',
        }
      })
    } catch (err) {
      console.error('[vault protocol] Error:', err)
      return new Response('Internal error', { status: 500 })
    }
  })
}
