// File: src/main/services/ai-intelligence/chromaprint-fingerprint.ts
//
// Chromaprint / AcoustID audio fingerprinting (#22). Wraps the
// `fpcalc.exe` binary that computes Chromaprint hashes from audio
// streams. Used by:
//   - Soundpack dedup: collapses 32k OpenNSFW SFX files down to ~16k
//     by merging perceptual duplicates.
//   - Library video dedup: detects re-encodes / re-uploads of the
//     same source content via audio fingerprint match (a video can
//     be visually compressed differently but the audio fingerprint
//     stays stable).
//
// ACTIVATION:
//   1. Download fpcalc from acoustid.org/chromaprint
//   2. Drop fpcalc.exe at C:\dev\vault\resources\bin\fpcalc.exe
//      (or anywhere in PATH).
//   3. Optionally set settings.ai.fpcalcPath = '<custom path>' to
//      override discovery.
//
// USAGE:
//   const fp = await chromaprintFile('C:\\path\\to\\audio.mp3')
//   if (fp) console.log(fp.duration, fp.fingerprint)  // hash string

import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

export interface ChromaprintResult {
  /** Duration in seconds (float). */
  duration: number
  /** Base64-ish chromaprint hash. Use as a key for dedup. */
  fingerprint: string
}

let _fpcalcPath: string | null = null
function findFpcalc(): string | null {
  if (_fpcalcPath !== null) return _fpcalcPath || null
  const isWin = os.platform() === 'win32'
  const exe = isWin ? 'fpcalc.exe' : 'fpcalc'
  const candidates = [
    path.join(process.resourcesPath || '', 'bin', exe),
    path.join(process.cwd(), 'resources', 'bin', exe),
    path.join(process.cwd(), 'bin', exe),
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) { _fpcalcPath = c; return c }
  }
  // Fall through to PATH — return the bare exe name.
  _fpcalcPath = exe
  return _fpcalcPath
}

/** Probe for the AiTaggerPage status card. Returns the resolved path
 *  if fpcalc lives at one of the known bundled locations (definitely
 *  installed) or just the bare exe name when we'll need to fall through
 *  to PATH at run time. The two cases are distinguished by `bundled`. */
export function getFpcalcStatus(): { installed: boolean; bundled: boolean; path: string | null } {
  const isWin = os.platform() === 'win32'
  const exe = isWin ? 'fpcalc.exe' : 'fpcalc'
  const bundledCandidates = [
    path.join(process.resourcesPath || '', 'bin', exe),
    path.join(process.cwd(), 'resources', 'bin', exe),
    path.join(process.cwd(), 'bin', exe),
  ]
  for (const c of bundledCandidates) {
    if (fs.existsSync(c)) {
      return { installed: true, bundled: true, path: c }
    }
  }
  // We don't synchronously probe PATH; report not-bundled and let the
  // user know the fall-through behavior via the install hint.
  return { installed: false, bundled: false, path: null }
}

/**
 * Compute the Chromaprint fingerprint of an audio (or video-with-
 * audio) file. Returns null if fpcalc is missing or the file has
 * no decodable audio stream.
 *
 * 15s timeout — fpcalc on a typical 5-minute MP3 takes ~1s, so 15s
 * is comfortably above the spawn-cost outlier.
 */
export async function chromaprintFile(filePath: string): Promise<ChromaprintResult | null> {
  const bin = findFpcalc()
  if (!bin) return null
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    const proc = spawn(bin, ['-json', filePath], { windowsHide: true })
    const timer = setTimeout(() => {
      try { proc.kill() } catch { /* noop */ }
      resolve(null)
    }, 15_000)
    proc.stdout?.on('data', (d) => { stdout += d.toString() })
    proc.stderr?.on('data', (d) => { stderr += d.toString() })
    proc.on('error', (err) => {
      clearTimeout(timer)
      console.warn(`[Chromaprint] fpcalc spawn failed: ${err.message}. Drop fpcalc.exe at resources/bin/`)
      resolve(null)
    })
    proc.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) {
        if (stderr) console.warn(`[Chromaprint] fpcalc exit ${code}: ${stderr.slice(-200)}`)
        resolve(null)
        return
      }
      try {
        const parsed = JSON.parse(stdout)
        if (typeof parsed.duration === 'number' && typeof parsed.fingerprint === 'string') {
          resolve({ duration: parsed.duration, fingerprint: parsed.fingerprint })
        } else {
          resolve(null)
        }
      } catch {
        resolve(null)
      }
    })
  })
}

/**
 * Hamming-like similarity of two Chromaprint hashes. Returns 0..1
 * (1 = identical). Uses popcount on the bit-array decoded from the
 * base32-ish string. Threshold at 0.85 for "same audio".
 */
export function chromaprintSimilarity(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 1
  // Decode base64-url into bytes.
  const decode = (s: string): Uint8Array => {
    try { return Buffer.from(s, 'base64') } catch { return new Uint8Array() }
  }
  const ab = decode(a), bb = decode(b)
  const minLen = Math.min(ab.length, bb.length)
  if (minLen === 0) return 0
  let differingBits = 0
  for (let i = 0; i < minLen; i++) {
    let x = ab[i] ^ bb[i]
    while (x) { differingBits++; x &= x - 1 }
  }
  const totalBits = minLen * 8
  return 1 - (differingBits / totalBits)
}
