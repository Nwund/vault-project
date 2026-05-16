// File: src/main/services/ai-intelligence/clip-bpe-tokenizer.ts
//
// CLIP's byte-pair-encoding tokenizer. Port of openai/CLIP's
// simple_tokenizer.py — Apache-2.0 licensed reference at
// https://github.com/openai/CLIP/blob/main/clip/simple_tokenizer.py.
//
// Activation: drop bpe_simple_vocab_16e6.txt.gz (also Apache-2.0) at
//   <userData>/models/clip-vocab.txt.gz
// On first call we load + decompress + build the encoder dict + merge
// ranks. Subsequent calls are pure-JS lookups (~10µs per word).
//
// When the vocab isn't installed, getClipTokens() returns null and
// the caller should fall back to its character-code placeholder.

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { app } from 'electron'

const CLIP_VOCAB_FILENAME = 'clip-vocab.txt.gz'
const CONTEXT_LENGTH = 77
const START_TOKEN = 49406
const END_TOKEN = 49407

/** Tokenizer state — populated once on first init. */
interface BpeState {
  encoder: Map<string, number>
  bpeRanks: Map<string, number>
  /** Cache of word → token-ID sequence; bounded by `cacheMax`. */
  cache: Map<string, number[]>
  cacheMax: number
  /** Byte → printable unicode char mapping (CLIP's byte-level pretokenizer). */
  byteEncoder: Map<number, string>
}

let state: BpeState | null = null
let loadAttempted = false

/** Path where the user is expected to drop the bpe vocab. */
export function getClipVocabPath(): string {
  return path.join(app.getPath('userData'), 'models', CLIP_VOCAB_FILENAME)
}

export function isClipBpeAvailable(): boolean {
  try { return fs.existsSync(getClipVocabPath()) } catch { return false }
}

/**
 * CLIP's byte → printable-char mapping. Identical to OpenAI's
 * bytes_to_unicode() helper. Idea: map any byte to a printable
 * unicode char so the BPE algorithm sees text-only input even for
 * arbitrary bytes.
 */
function buildByteEncoder(): Map<number, string> {
  const bs: number[] = []
  for (let b = 33; b <= 126; b++) bs.push(b)
  for (let b = 0xA1; b <= 0xAC; b++) bs.push(b)
  for (let b = 0xAE; b <= 0xFF; b++) bs.push(b)
  const cs = bs.slice()
  let n = 0
  for (let b = 0; b < 256; b++) {
    if (!bs.includes(b)) {
      bs.push(b)
      cs.push(256 + n)
      n++
    }
  }
  const map = new Map<number, string>()
  for (let i = 0; i < bs.length; i++) {
    map.set(bs[i], String.fromCodePoint(cs[i]))
  }
  return map
}

/** Lazy-init the encoder + merge ranks from the gzipped vocab file. */
function ensureLoaded(): BpeState | null {
  if (state) return state
  if (loadAttempted) return null
  loadAttempted = true
  const vocabPath = getClipVocabPath()
  if (!fs.existsSync(vocabPath)) {
    console.warn(`[CLIP BPE] vocab file not found at ${vocabPath} — falling back to character-code placeholder`)
    return null
  }
  try {
    const compressed = fs.readFileSync(vocabPath)
    const raw = zlib.gunzipSync(compressed).toString('utf8')
    const allLines = raw.split('\n')
    // Skip header (first line: "#version: 0.2") + blank lines. The
    // first 256 + 256 entries are byte tokens and byte+"</w>" tokens
    // (NOT in the file — built programmatically). The file contains
    // ~48895 merge pairs.
    const merges: Array<[string, string]> = []
    for (let i = 1; i < allLines.length; i++) {
      const line = allLines[i].trim()
      if (!line) continue
      const parts = line.split(' ')
      if (parts.length < 2) continue
      merges.push([parts[0], parts.slice(1).join(' ')])
      // CLIP truncates merges to 48894 entries in the reference
      // implementation. Stop at 48894 to match exactly.
      if (merges.length >= 48894) break
    }

    // Build encoder: 256 base byte tokens, then 256 with "</w>" suffix,
    // then merged tokens (in order), then two special tokens.
    const byteEncoder = buildByteEncoder()
    const encoder = new Map<string, number>()
    let id = 0
    const byteChars: string[] = []
    for (const ch of byteEncoder.values()) byteChars.push(ch)
    for (const ch of byteChars) encoder.set(ch, id++)
    for (const ch of byteChars) encoder.set(ch + '</w>', id++)
    for (const [a, b] of merges) {
      encoder.set(a + b, id++)
    }
    encoder.set('<|startoftext|>', START_TOKEN)
    encoder.set('<|endoftext|>', END_TOKEN)

    // Build merge ranks: pair-as-"a b" → merge order (lower = earlier).
    const bpeRanks = new Map<string, number>()
    for (let i = 0; i < merges.length; i++) {
      bpeRanks.set(`${merges[i][0]} ${merges[i][1]}`, i)
    }

    state = {
      encoder,
      bpeRanks,
      cache: new Map(),
      cacheMax: 50000,
      byteEncoder,
    }
    console.log(`[CLIP BPE] loaded ${merges.length} merges, vocab size ${encoder.size}`)
    return state
  } catch (err) {
    console.warn('[CLIP BPE] failed to load vocab:', err)
    return null
  }
}

/** Light whitespace + punctuation cleanup before tokenization. */
function basicClean(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** CLIP's pretokenizer regex — matches contractions, words, numbers,
 *  punctuation, whitespace. */
const PRETOKENIZE_RE = /<\|startoftext\|>|<\|endoftext\|>|'s|'t|'re|'ve|'m|'ll|'d|[\p{L}]+|[\p{N}]|[^\s\p{L}\p{N}]+/gu

/**
 * BPE merge for a single word. Treats the word as a sequence of
 * symbols (initially each char + "</w>" on the last char) and
 * iteratively merges the lowest-rank pair until none apply.
 */
function bpe(word: string, s: BpeState): string[] {
  // Build initial symbol sequence: each char as its own symbol, last
  // char gets "</w>" suffix.
  // Note: subword caching happens at the encodeClipText layer (token-IDs
  // for the same byte-encoded word). bpe() itself stays cache-free so
  // its return type stays subword-strings.
  if (word.length === 0) return []
  const chars: string[] = Array.from(word)
  chars[chars.length - 1] = chars[chars.length - 1] + '</w>'

  let pairs = getPairs(chars)
  if (pairs.length === 0) return chars

  while (true) {
    // Find the pair with the lowest rank.
    let bestRank = Infinity
    let bestPair: [string, string] | null = null
    for (const [a, b] of pairs) {
      const rank = s.bpeRanks.get(`${a} ${b}`)
      if (rank !== undefined && rank < bestRank) {
        bestRank = rank
        bestPair = [a, b]
      }
    }
    if (!bestPair) break

    // Merge every non-overlapping occurrence of bestPair in chars.
    const merged: string[] = []
    let i = 0
    while (i < chars.length) {
      if (i < chars.length - 1 && chars[i] === bestPair[0] && chars[i + 1] === bestPair[1]) {
        merged.push(bestPair[0] + bestPair[1])
        i += 2
      } else {
        merged.push(chars[i])
        i += 1
      }
    }
    chars.length = 0
    chars.push(...merged)
    if (chars.length === 1) break
    pairs = getPairs(chars)
  }
  return chars
}

function getPairs(symbols: string[]): Array<[string, string]> {
  const pairs: Array<[string, string]> = []
  for (let i = 0; i < symbols.length - 1; i++) {
    pairs.push([symbols[i], symbols[i + 1]])
  }
  return pairs
}

/**
 * Encode text to a fixed-length token ID sequence (with START / END
 * markers and zero-padding to CONTEXT_LENGTH). Returns null when the
 * BPE vocab isn't loaded so the caller can fall back.
 */
export function encodeClipText(text: string): BigInt64Array | null {
  const s = ensureLoaded()
  if (!s) return null

  const cleaned = basicClean(text)
  const tokens: number[] = [START_TOKEN]

  const matches = cleaned.matchAll(PRETOKENIZE_RE)
  for (const m of matches) {
    const word = m[0]
    // CLIP byte-encodes each character: each utf-8 byte → printable
    // unicode char from byteEncoder. The resulting "word" is what BPE
    // operates on.
    const bytes = Buffer.from(word, 'utf8')
    let bytesEncoded = ''
    for (const b of bytes) {
      const ch = s.byteEncoder.get(b)
      if (ch) bytesEncoded += ch
    }
    if (!bytesEncoded) continue

    // Cache key: the byte-encoded word (post-pretokenize).
    let subwords: string[]
    const cached = s.cache.get(bytesEncoded)
    if (cached) {
      tokens.push(...cached)
      continue
    }
    subwords = bpe(bytesEncoded, s)
    const ids = subwords.map((sw) => s.encoder.get(sw)).filter((id): id is number => id !== undefined)
    if (s.cache.size < s.cacheMax) s.cache.set(bytesEncoded, ids)
    tokens.push(...ids)
  }

  tokens.push(END_TOKEN)
  // Truncate or pad to CONTEXT_LENGTH. END token stays at the last
  // non-pad slot when we have to truncate.
  const final = new BigInt64Array(CONTEXT_LENGTH)
  if (tokens.length > CONTEXT_LENGTH) {
    for (let i = 0; i < CONTEXT_LENGTH - 1; i++) final[i] = BigInt(tokens[i])
    final[CONTEXT_LENGTH - 1] = BigInt(END_TOKEN)
  } else {
    for (let i = 0; i < tokens.length; i++) final[i] = BigInt(tokens[i])
    // Remaining slots stay zero (CLIP pads with 0).
  }
  return final
}

/** Probe used in setup UI — tells the user whether real BPE is active. */
export function getClipBpeStatus(): { available: boolean; expectedPath: string; vocabSize: number | null } {
  const expectedPath = getClipVocabPath()
  const available = isClipBpeAvailable()
  const s = available ? ensureLoaded() : null
  return {
    available,
    expectedPath,
    vocabSize: s ? s.encoder.size : null,
  }
}
