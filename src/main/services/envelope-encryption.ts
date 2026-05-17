// File: src/main/services/envelope-encryption.ts
//
// #193 — Per-file envelope encryption with streaming AES-GCM.
//
// Goal: an OPTIONAL "encrypted vault" folder where media bytes sit on
// disk as AES-256-GCM ciphertext. Even if the disk is mounted by
// someone else, the content stays unreadable without the master key.
//
// Threat model: protects against offline disk access (lost laptop,
// shared workstation, off-site backup leak). NOT against malware
// running as the user inside Vault — that has the same access the app
// does.
//
// Envelope layout per file:
//
//   ┌──────────┬─────────┬──────────┬──────────────────────────────────┐
//   │ magic    │ version │ salt     │ N segments, each:                │
//   │ "VLT1"   │ 1 byte  │ 16 bytes │   [iv 12B][tag 16B][ciphertext]  │
//   └──────────┴─────────┴──────────┴──────────────────────────────────┘
//
//   Master key   ← derived from user passphrase via scrypt(salt)
//   Data key     ← randomly generated per file, encrypted by master key
//                  → stored AT THE TOP of the envelope before segments
//   Segment IV   ← 96-bit; first 64 bits = file nonce, last 32 bits = seg #
//                  (CTR-style; lets the renderer Range-request mid-file
//                   without re-deriving the whole stream).
//
// We use 1 MiB segments — large enough that per-segment AES setup
// overhead is negligible, small enough that a Range request only has
// to decrypt one segment of slack at the seek point.
//
// API:
//   - encryptFile(srcPath, dstPath, passphrase)
//   - decryptFile(srcPath, dstPath, passphrase)
//   - decryptRange(srcPath, passphrase, byteStart, byteEnd) → Buffer
//   - isEnvelope(path) → boolean

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import { createReadStream, createWriteStream, openSync, readSync, closeSync, statSync, existsSync } from 'node:fs'
import { pipeline } from 'node:stream/promises'

const MAGIC = Buffer.from('VLT1', 'ascii')
const VERSION = 1
const SALT_LEN = 16
const KEY_LEN = 32           // AES-256
const IV_LEN = 12            // AES-GCM standard
const TAG_LEN = 16
const WRAPPED_DEK_LEN = 60   // 12B IV + 32B ciphertext + 16B tag
const SEGMENT_PLAINTEXT = 1024 * 1024 // 1 MiB
const SEGMENT_CIPHER = IV_LEN + TAG_LEN + SEGMENT_PLAINTEXT
const HEADER_LEN = MAGIC.length + 1 + SALT_LEN + WRAPPED_DEK_LEN
const SCRYPT_N = 16384
const SCRYPT_R = 8
const SCRYPT_P = 1

function deriveMasterKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P })
}

function makeSegmentIv(fileNonce: Buffer, segmentIndex: number): Buffer {
  // 8-byte file nonce + 4-byte big-endian segment counter = 12 bytes
  const iv = Buffer.alloc(IV_LEN)
  fileNonce.copy(iv, 0, 0, 8)
  iv.writeUInt32BE(segmentIndex, 8)
  return iv
}

export function isEnvelope(filePath: string): boolean {
  try {
    const fd = openSync(filePath, 'r')
    try {
      const buf = Buffer.alloc(MAGIC.length)
      const n = readSync(fd, buf, 0, MAGIC.length, 0)
      if (n < MAGIC.length) return false
      return buf.equals(MAGIC)
    } finally { closeSync(fd) }
  } catch { return false }
}

export async function encryptFile(srcPath: string, dstPath: string, passphrase: string): Promise<void> {
  if (!existsSync(srcPath)) throw new Error(`Source missing: ${srcPath}`)
  const salt = randomBytes(SALT_LEN)
  const masterKey = deriveMasterKey(passphrase, salt)
  const dataKey = randomBytes(KEY_LEN)

  // Wrap the data key with the master key (single-shot AES-GCM).
  const wrapIv = randomBytes(IV_LEN)
  const wrapCipher = createCipheriv('aes-256-gcm', masterKey, wrapIv)
  const wrappedKey = Buffer.concat([wrapCipher.update(dataKey), wrapCipher.final()])
  const wrapTag = wrapCipher.getAuthTag()
  const wrappedDek = Buffer.concat([wrapIv, wrappedKey, wrapTag])
  if (wrappedDek.length !== WRAPPED_DEK_LEN) {
    throw new Error(`wrapped DEK length mismatch: got ${wrappedDek.length}, expected ${WRAPPED_DEK_LEN}`)
  }

  const fileNonce = randomBytes(8)
  const out = createWriteStream(dstPath)
  out.write(MAGIC)
  out.write(Buffer.from([VERSION]))
  out.write(salt)
  out.write(wrappedDek)
  out.write(fileNonce) // 8 bytes — encodes into per-segment IVs

  await pipeline(
    createReadStream(srcPath, { highWaterMark: SEGMENT_PLAINTEXT }),
    async function* (source) {
      let segIdx = 0
      let pending = Buffer.alloc(0)
      const emit = (chunk: Buffer) => {
        const iv = makeSegmentIv(fileNonce, segIdx++)
        const c = createCipheriv('aes-256-gcm', dataKey, iv)
        const ct = Buffer.concat([c.update(chunk), c.final()])
        const tag = c.getAuthTag()
        return Buffer.concat([iv, tag, ct])
      }
      for await (const data of source) {
        pending = Buffer.concat([pending, data as Buffer])
        while (pending.length >= SEGMENT_PLAINTEXT) {
          yield emit(pending.subarray(0, SEGMENT_PLAINTEXT))
          pending = pending.subarray(SEGMENT_PLAINTEXT)
        }
      }
      if (pending.length > 0) yield emit(pending)
    },
    out,
  )
}

interface EnvelopeHeader {
  salt: Buffer
  dataKey: Buffer
  fileNonce: Buffer
  segmentsStartOffset: number
}

function readHeader(filePath: string, passphrase: string): EnvelopeHeader {
  const fd = openSync(filePath, 'r')
  try {
    const headBuf = Buffer.alloc(HEADER_LEN + 8) // header + 8B file nonce
    const n = readSync(fd, headBuf, 0, headBuf.length, 0)
    if (n < headBuf.length) throw new Error('Truncated envelope header')
    if (!headBuf.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Not a Vault envelope')
    if (headBuf[MAGIC.length] !== VERSION) throw new Error(`Unsupported envelope version ${headBuf[MAGIC.length]}`)
    const salt = headBuf.subarray(MAGIC.length + 1, MAGIC.length + 1 + SALT_LEN)
    const wrappedDek = headBuf.subarray(MAGIC.length + 1 + SALT_LEN, HEADER_LEN)
    const fileNonce = headBuf.subarray(HEADER_LEN, HEADER_LEN + 8)
    const masterKey = deriveMasterKey(passphrase, salt)
    const wrapIv = wrappedDek.subarray(0, IV_LEN)
    const wrapCt = wrappedDek.subarray(IV_LEN, IV_LEN + KEY_LEN)
    const wrapTag = wrappedDek.subarray(IV_LEN + KEY_LEN)
    const wrapDec = createDecipheriv('aes-256-gcm', masterKey, wrapIv)
    wrapDec.setAuthTag(wrapTag)
    const dataKey = Buffer.concat([wrapDec.update(wrapCt), wrapDec.final()])
    return { salt, dataKey, fileNonce, segmentsStartOffset: HEADER_LEN + 8 }
  } finally { closeSync(fd) }
}

export async function decryptFile(srcPath: string, dstPath: string, passphrase: string): Promise<void> {
  const header = readHeader(srcPath, passphrase)
  const stat = statSync(srcPath)
  const out = createWriteStream(dstPath)
  await pipeline(
    createReadStream(srcPath, {
      start: header.segmentsStartOffset,
      end: stat.size - 1,
      highWaterMark: SEGMENT_CIPHER,
    }),
    async function* (source) {
      let segIdx = 0
      let pending = Buffer.alloc(0)
      for await (const data of source) {
        pending = Buffer.concat([pending, data as Buffer])
        while (pending.length >= SEGMENT_CIPHER) {
          yield decryptSegment(pending.subarray(0, SEGMENT_CIPHER), header.dataKey, header.fileNonce, segIdx++)
          pending = pending.subarray(SEGMENT_CIPHER)
        }
      }
      if (pending.length > IV_LEN + TAG_LEN) {
        yield decryptSegment(pending, header.dataKey, header.fileNonce, segIdx++)
      }
    },
    out,
  )
}

function decryptSegment(segCipher: Buffer, dataKey: Buffer, fileNonce: Buffer, segIdx: number): Buffer {
  const iv = segCipher.subarray(0, IV_LEN)
  const tag = segCipher.subarray(IV_LEN, IV_LEN + TAG_LEN)
  const ct = segCipher.subarray(IV_LEN + TAG_LEN)
  // Sanity: the IV stored on disk must match what we'd derive for
  // this segment index — otherwise the envelope has been tampered
  // with (segments swapped).
  const expectedIv = makeSegmentIv(fileNonce, segIdx)
  if (!iv.equals(expectedIv)) {
    throw new Error(`Envelope segment IV mismatch at segment ${segIdx}`)
  }
  const d = createDecipheriv('aes-256-gcm', dataKey, iv)
  d.setAuthTag(tag)
  return Buffer.concat([d.update(ct), d.final()])
}

/**
 * Range-aware decrypt. Returns plaintext bytes [byteStart, byteEnd)
 * by computing which segments cover that range, decrypting those
 * segments only, and trimming to the requested boundaries.
 *
 * Critical for the vaultProtocol Range support — without this every
 * HTML5 <video> seek would have to re-stream the entire file.
 */
export async function decryptRange(
  srcPath: string,
  passphrase: string,
  byteStart: number,
  byteEnd: number,
): Promise<Buffer> {
  const header = readHeader(srcPath, passphrase)
  const segStart = Math.floor(byteStart / SEGMENT_PLAINTEXT)
  const segEnd = Math.floor((byteEnd - 1) / SEGMENT_PLAINTEXT)
  const out: Buffer[] = []
  const stat = statSync(srcPath)
  for (let s = segStart; s <= segEnd; s++) {
    const segOffsetInFile = header.segmentsStartOffset + s * SEGMENT_CIPHER
    if (segOffsetInFile >= stat.size) break
    const segLen = Math.min(SEGMENT_CIPHER, stat.size - segOffsetInFile)
    const fd = openSync(srcPath, 'r')
    let buf: Buffer
    try {
      buf = Buffer.alloc(segLen)
      readSync(fd, buf, 0, segLen, segOffsetInFile)
    } finally { closeSync(fd) }
    out.push(decryptSegment(buf, header.dataKey, header.fileNonce, s))
  }
  // Trim to the exact requested boundaries within the assembled
  // plaintext (we may have decoded one extra segment on each side).
  const assembled = Buffer.concat(out)
  const startInAssembled = byteStart - segStart * SEGMENT_PLAINTEXT
  const length = byteEnd - byteStart
  return assembled.subarray(startInAssembled, startInAssembled + length)
}

/**
 * Plaintext-size lookup. Critical for the renderer's Range header
 * negotiation — we need to report the *plaintext* Content-Length so
 * <video> seeks land in the right byte.
 */
export function plaintextSize(srcPath: string, passphrase: string): number {
  const header = readHeader(srcPath, passphrase) // throws if wrong key
  const stat = statSync(srcPath)
  const segmentRegion = stat.size - header.segmentsStartOffset
  if (segmentRegion <= 0) return 0
  const fullSegments = Math.floor(segmentRegion / SEGMENT_CIPHER)
  const remainder = segmentRegion - fullSegments * SEGMENT_CIPHER
  // Final partial segment is `remainder - IV - tag` bytes of plaintext.
  const tailPlaintext = remainder > IV_LEN + TAG_LEN ? remainder - IV_LEN - TAG_LEN : 0
  return fullSegments * SEGMENT_PLAINTEXT + tailPlaintext
}
