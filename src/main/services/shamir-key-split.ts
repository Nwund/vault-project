// File: src/main/services/shamir-key-split.ts
//
// #284 C-60 — Shamir Secret Sharing for the SQLCipher (or any other
// vault-held) encryption key. Splits a secret into N shares; any K
// shares can reconstruct it (where K ≤ N is the recovery threshold).
//
// Use case: user wants their vault key recoverable even if their
// primary device dies. They generate 5 shares (K=3), give one each
// to trusted people / store in different locations. Any 3 can come
// back together to recover the key.
//
// Pure backend service — caller (Settings card) prompts user for
// share-count + threshold, then exports each share as either a
// base32 string for paper backup or a downloadable .share file.

// @ts-ignore — no @types/shamirs-secret-sharing package; runtime API is { split, combine }
import sss from 'shamirs-secret-sharing'

export interface SplitOptions {
  shares: number       // total share count (e.g. 5)
  threshold: number    // K — minimum shares needed to recover (e.g. 3)
}

export interface SplitResult {
  shares: string[]     // base64-encoded share strings
  threshold: number
  totalShares: number
}

export function splitSecret(secret: string, opts: SplitOptions): SplitResult {
  if (opts.threshold < 1 || opts.threshold > opts.shares) {
    throw new Error(`Invalid threshold ${opts.threshold} for ${opts.shares} shares`)
  }
  if (opts.shares < 2 || opts.shares > 255) {
    throw new Error(`Share count must be 2..255 (got ${opts.shares})`)
  }
  const buf = Buffer.from(secret, 'utf8')
  const shares = sss.split(buf, { shares: opts.shares, threshold: opts.threshold }) as Buffer[]
  return {
    shares: shares.map((s) => s.toString('base64')),
    threshold: opts.threshold,
    totalShares: opts.shares,
  }
}

export function combineShares(shareStrings: string[]): string {
  if (shareStrings.length < 2) throw new Error('Need at least 2 shares')
  const buffers = shareStrings.map((s) => Buffer.from(s, 'base64'))
  const combined = sss.combine(buffers) as Buffer
  return combined.toString('utf8')
}

// Convenience: encode a share as a paper-friendly base32 string with
// 4-char groups. Easier to write down by hand than base64.
export function shareToBase32(shareBase64: string): string {
  const buf = Buffer.from(shareBase64, 'base64')
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = 0
  let value = 0
  let out = ''
  for (let i = 0; i < buf.length; i++) {
    value = (value << 8) | buf[i]
    bits += 8
    while (bits >= 5) {
      bits -= 5
      out += alphabet[(value >> bits) & 0x1f]
    }
  }
  if (bits > 0) out += alphabet[(value << (5 - bits)) & 0x1f]
  // 4-char groups for readability.
  return out.match(/.{1,4}/g)?.join('-') ?? out
}

export function shareFromBase32(input: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, '')
  let bits = 0
  let value = 0
  const bytes: number[] = []
  for (const ch of clean) {
    const idx = alphabet.indexOf(ch)
    if (idx < 0) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      bits -= 8
      bytes.push((value >> bits) & 0xff)
    }
  }
  return Buffer.from(bytes).toString('base64')
}
