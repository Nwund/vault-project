// File: src/main/services/ai-intelligence/tube-url-resolver.ts
//
// "Paste a tube URL → get a direct video URL" service. Used by the
// Browse tab's "Paste URL" feature so the user can fetch a specific
// video they already have a link to.
//
// Routing:
//   - xnxx.com URLs       → RapidAPI /download endpoint (paid)
//   - eporner / redtube   → embed iframe (no resolution needed)
//   - everything else     → return null, caller routes to yt-dlp
//
// API credentials read from settings: RAPIDAPI_KEY + RAPIDAPI_XNXX_HOST.
// Auto-imported from C:\dev\.api-keys.env on first start.

import https from 'node:https'
import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

export interface ResolvedTubeVideo {
  /** Direct MP4 URL (best quality available) for inline playback. */
  videoUrl: string
  /** Lower-quality fallback if the user is on slow connection. */
  videoLowUrl?: string | null
  /** Thumbnail URL. */
  thumbUrl?: string | null
  /** Where this came from (debug/UI display). */
  source: 'xnxx' | 'embed' | 'unknown'
  /** Echo of the original URL the user pasted. */
  sourceUrl: string
}

function isXnxxUrl(url: string): boolean {
  return /(^https?:\/\/)?(www\.)?xnxx\.com\//i.test(url)
}

// Locate the bundled yt-dlp binary. Mirrors url-downloader-service's
// search order so the fallback path stays consistent across the app.
function findYtDlp(): string | null {
  const isWin = os.platform() === 'win32'
  const exe = isWin ? 'yt-dlp.exe' : 'yt-dlp'
  const cwd = process.cwd()
  const candidates = [
    path.join(process.resourcesPath || '', 'bin', exe),
    path.join(cwd, 'resources', 'bin', exe),
    path.join(cwd, 'bin', exe),
  ]
  for (const c of candidates) {
    try { if (fs.existsSync(c)) return c } catch { /* noop */ }
  }
  return exe  // fall through to PATH
}

/**
 * Use yt-dlp to print the direct media URL for a tube URL without
 * downloading. Works on xnxx + ~1000 other sites yt-dlp supports.
 * Returns null on failure (binary missing, extraction failed, URL
 * unsupported). 15s timeout to keep the lightbox snappy.
 */
async function ytdlpExtractUrl(viewUrl: string): Promise<string | null> {
  const bin = findYtDlp()
  if (!bin) {
    console.warn('[TubeResolver] yt-dlp not found — cannot fall back')
    return null
  }
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    const proc = spawn(bin, [
      '--get-url',
      '--no-warnings',
      '--no-playlist',
      // Prefer mp4 progressive; fall back to best video+audio combined.
      '-f', 'best[ext=mp4]/best',
      viewUrl,
    ], { windowsHide: true })
    const timer = setTimeout(() => {
      try { proc.kill() } catch { /* noop */ }
      console.warn('[TubeResolver] yt-dlp timed out after 15s')
      resolve(null)
    }, 15_000)
    proc.stdout?.on('data', (d) => { stdout += d.toString() })
    proc.stderr?.on('data', (d) => { stderr += d.toString() })
    proc.on('error', (err) => {
      clearTimeout(timer)
      console.warn(`[TubeResolver] yt-dlp spawn error: ${err.message}`)
      resolve(null)
    })
    proc.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) {
        console.warn(`[TubeResolver] yt-dlp exited ${code}: ${stderr.slice(-300)}`)
        resolve(null)
        return
      }
      // yt-dlp prints one URL per format requested. First line is the URL.
      const url = stdout.trim().split(/\r?\n/)[0]?.trim()
      if (url && url.startsWith('http')) {
        console.log(`[TubeResolver] yt-dlp URL: ${url.slice(0, 120)}${url.length > 120 ? '...' : ''}`)
        resolve(url)
      } else {
        resolve(null)
      }
    })
  })
}

function isEmbeddableUrl(url: string): boolean {
  return /(eporner\.com|redtube\.com|pornhub\.com|xvideos\.com|spankbang\.com)/i.test(url)
}

function postJson<T>(host: string, urlPath: string, body: any, headers: Record<string, string>): Promise<T> {
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(JSON.stringify(body), 'utf8')
    const req = https.request({
      hostname: host,
      port: 443,
      path: urlPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': payload.length,
        ...headers,
      },
      timeout: 20_000,
    }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => {
        const data = Buffer.concat(chunks).toString('utf8')
        if (!res.statusCode || res.statusCode >= 400) {
          reject(new Error(`${host}${urlPath} → ${res.statusCode}: ${data.slice(0, 200)}`))
          return
        }
        try { resolve(JSON.parse(data) as T) }
        catch { reject(new Error(`Non-JSON response: ${data.slice(0, 200)}`)) }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => req.destroy(new Error(`${host}${urlPath} timed out`)))
    req.write(payload)
    req.end()
  })
}

async function getRapidApiKey(): Promise<{ key: string | null; xnxxHost: string }> {
  try {
    const { getSettings } = await import('../../settings')
    const ai = (getSettings().ai as any) || {}
    return {
      key: ai.rapidApiKey ?? null,
      xnxxHost: ai.rapidApiXnxxHost ?? 'porn-xnxx-api-v2-sale.p.rapidapi.com',
    }
  } catch {
    return { key: null, xnxxHost: 'porn-xnxx-api-v2-sale.p.rapidapi.com' }
  }
}

/**
 * Resolve a user-pasted tube URL into a playable video. Returns null
 * when we can't resolve (caller should fall through to yt-dlp).
 */
export async function resolveTubeUrl(url: string): Promise<ResolvedTubeVideo | null> {
  const trimmed = url.trim()
  if (!trimmed) return null

  // xnxx → try each subscribed RapidAPI provider in priority order.
  // The same key works across all three; we just need to hit the host
  // + path combination that the user is actually subscribed to.
  // Configured host (from .api-keys.env) goes first; the other two
  // are fallbacks. Each provider has its own path + payload shape.
  if (isXnxxUrl(trimmed)) {
    const { key, xnxxHost } = await getRapidApiKey()
    if (!key) {
      console.warn('[TubeResolver] No RapidAPI key — xnxx URLs can\'t be resolved')
      return null
    }
    type Provider = {
      host: string
      path: string
      payload: (u: string) => Record<string, string>
    }
    // Empirical mapping discovered 2026-05-14 from live attempts:
    // - pornhub-api-xnxx.p.rapidapi.com /api/download → 429 (subscribed, rate-limited) — THE WORKING ONE
    // - porn-xnxx-api.p.rapidapi.com /download → 403 (path doesn't exist; gateway returns 403 for unknown paths)
    // - porn-xnxx-api-v2-sale.p.rapidapi.com /download → 403 (same; despite billing showing active)
    // Order primary first, others kept as fallback in case API endpoint
    // surfaces change. The PornHub trending source SHARES this quota,
    // so 429 here means we have to wait — see retry below.
    const allProviders: Provider[] = [
      {
        host: 'pornhub-api-xnxx.p.rapidapi.com',
        path: '/api/download',
        payload: (u) => ({ url: u }),
      },
      {
        host: 'porn-xnxx-api.p.rapidapi.com',
        path: '/download',
        payload: (u) => ({ video_link: u }),
      },
      {
        host: 'porn-xnxx-api-v2-sale.p.rapidapi.com',
        path: '/download',
        payload: (u) => ({ video_link: u }),
      },
    ]
    // Reorder so the configured host is first, the others stay as fallbacks.
    const providers = xnxxHost
      ? [...allProviders.filter((p) => p.host === xnxxHost), ...allProviders.filter((p) => p.host !== xnxxHost)]
      : allProviders

    const attempts: string[] = []
    for (const prov of providers) {
      const pathToTry = prov.path
      // Up to 3 attempts on 429 with exponential backoff (0.8s, 1.6s,
      // 3.2s). Past that we drop through to the next provider.
      // The PornHub trending source shares quota on the combined host,
      // so 429 is common right after browsing.
      let backoffMs = 800
      let lastError: string | null = null
      for (let attempt429 = 0; attempt429 < 3; attempt429++) {
        try {
          const r = await postJson<any>(
            prov.host,
            pathToTry,
            prov.payload(trimmed),
            {
              'x-rapidapi-host': prov.host,
              'x-rapidapi-key': key,
            }
          )
          // Normalize across the three providers' response shapes:
          //   { video_high, video_low, thumbel } — porn-xnxx-api variants
          //   { hd, sd, thumbnail } — pornhub-api-xnxx combined
          //   { url, quality }      — fallback shape
          const videoUrl: string =
            r?.video_high ?? r?.video_low ??
            r?.hd ?? r?.sd ??
            r?.url ?? ''
          if (!videoUrl) {
            lastError = `ok but no direct URL (keys: ${Object.keys(r ?? {}).slice(0, 6).join(',')})`
            break  // empty-response — different provider's the next move
          }
          console.log(`[TubeResolver] xnxx resolved via ${prov.host}${pathToTry}${attempt429 > 0 ? ` (after ${attempt429} retry)` : ''}`)
          return {
            videoUrl,
            videoLowUrl: r?.video_low ?? r?.sd ?? null,
            thumbUrl: r?.thumbel ?? r?.thumbnail ?? null,
            source: 'xnxx',
            sourceUrl: trimmed,
          }
        } catch (err: any) {
          const msg = String(err?.message ?? err)
          lastError = msg.slice(0, 120)
          // Retry on 429; everything else (403, 404, 5xx) is per-provider terminal.
          if (msg.includes('429') && attempt429 < 2) {
            console.log(`[TubeResolver] ${prov.host} rate-limited, retrying in ${backoffMs}ms (attempt ${attempt429 + 1}/3)`)
            await new Promise((r) => setTimeout(r, backoffMs))
            backoffMs *= 2
            continue
          }
          break  // non-429 or last attempt → fall through to next provider
        }
      }
      if (lastError) attempts.push(`${prov.host}${pathToTry}: ${lastError}`)
    }
    console.warn('[TubeResolver] xnxx resolve failed across all RapidAPI providers:')
    for (const a of attempts) console.warn(`  - ${a}`)
    // Last-resort fallback: yt-dlp natively supports xnxx and extracts
    // direct media URLs without any RapidAPI dependency. Bundled at
    // resources/bin/yt-dlp.exe — call with --get-url to print the URL
    // and exit. ~1-2s spawn cost but works when all paid APIs fail.
    console.log('[TubeResolver] Falling back to yt-dlp for xnxx resolution')
    const ytdlpUrl = await ytdlpExtractUrl(trimmed)
    if (ytdlpUrl) {
      console.log(`[TubeResolver] xnxx resolved via yt-dlp`)
      return {
        videoUrl: ytdlpUrl,
        source: 'xnxx',
        sourceUrl: trimmed,
      }
    }
    return null
  }

  // Embeddable tubes — just use the embed URL pattern directly. No API
  // call needed; the lightbox iframe handles playback.
  if (isEmbeddableUrl(trimmed)) {
    let embedUrl = trimmed
    // Map common watch-page URLs to embed URLs.
    embedUrl = embedUrl
      .replace(/eporner\.com\/video-([A-Za-z0-9]+)\/.*/i, 'eporner.com/embed/$1/')
      .replace(/redtube\.com\/(\d+)/i, 'embed.redtube.com/?id=$1')
      .replace(/pornhub\.com\/view_video\.php\?viewkey=(\w+)/i, 'pornhub.com/embed/$1')
    return {
      videoUrl: embedUrl,
      source: 'embed',
      sourceUrl: trimmed,
    }
  }

  // Unknown — caller falls through to yt-dlp.
  return null
}
