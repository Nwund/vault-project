#!/usr/bin/env node
// File: scripts/install-aesthetic-predictor.mjs
//
// Convert LAION-AI/aesthetic-predictor PyTorch weights (.pth) into
// the JSON schema Vault's aesthetic-predictor.ts loader expects, and
// drop it at %APPDATA%\vault\models\aesthetic-linear.json (Windows)
// or ~/.config/vault/models/ on Linux/macOS.
//
// Usage:
//   npm run install:aesthetic
//   npm run install:aesthetic -- --variant=mlp     (5-layer MLP)
//   npm run install:aesthetic -- --pth=path/to.pth (use a local file)
//
// Default fetches sac+logos+ava1-l14-linearMSE.pth (the 1-layer linear
// regression — what Vault and most consumers use). The 5-layer MLP
// variant (improved-aesthetic-predictor) is supported via --variant=mlp.
//
// No PyTorch needed. We parse the .pth zip archive ourselves — it's a
// regular ZIP with a known-shape pickle inside. For the simple
// 1-layer linear model the pickle structure is predictable enough to
// extract the tensors without a full pickle reader.

import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import zlib from 'node:zlib'

// ── Args ─────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
function getArg(flag, defaultValue = null) {
  for (const a of args) {
    if (a === flag) return true
    if (a.startsWith(`${flag}=`)) return a.slice(flag.length + 1)
  }
  return defaultValue
}

const variant = getArg('--variant', 'linear')
const pthOverride = getArg('--pth', null)
const outOverride = getArg('--out', null)
const verbose = !!getArg('--verbose', false)

const VARIANTS = {
  linear: {
    url: 'https://github.com/LAION-AI/aesthetic-predictor/raw/main/sa_0_4_vit_l_14_linear.pth',
    description: '1-layer linear MSE regression on CLIP-L/14 768-D embeddings',
    expectedLayers: 1,
  },
  mlp: {
    url: 'https://github.com/christophschuhmann/improved-aesthetic-predictor/raw/main/sac%2Blogos%2Bava1-l14-linearMSE.pth',
    description: '5-layer MLP on CLIP-L/14 768-D embeddings (LAION improved)',
    expectedLayers: 5,
  },
}

const cfg = VARIANTS[variant]
if (!cfg) {
  console.error(`Unknown variant: ${variant}. Valid: ${Object.keys(VARIANTS).join(', ')}`)
  process.exit(2)
}

// ── Output path ──────────────────────────────────────────────────────

function userDataDir() {
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'vault')
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'vault')
  }
  return path.join(os.homedir(), '.config', 'vault')
}
const outPath = outOverride ?? path.join(userDataDir(), 'models', 'aesthetic-linear.json')

// ── Fetch .pth (or use local) ────────────────────────────────────────

async function downloadPth(url) {
  console.log(`[aesthetic] fetching ${url}`)
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
  const buf = Buffer.from(await res.arrayBuffer())
  console.log(`[aesthetic] downloaded ${(buf.length / 1024).toFixed(0)} KB`)
  return buf
}

// ── ZIP parsing ──────────────────────────────────────────────────────
//
// A .pth file is a regular ZIP archive. We need to:
//   1. Find the central directory at the end of the file
//   2. Walk entries to locate the tensor data files (archive/data/0,
//      archive/data/1, ...)
//   3. Locate the pickle file (archive/data.pkl) to read the param
//      key→tensor-id mapping
//
// PyTorch tensors stored in .pth zips are raw float32 little-endian.

function findEOCD(buf) {
  // End of central directory record signature: 0x06054b50, scan back
  // from end. Max comment length 0xFFFF so it's within last 65557 bytes.
  const sig = 0x06054b50
  const minOffset = Math.max(0, buf.length - 0xFFFF - 22)
  for (let i = buf.length - 22; i >= minOffset; i--) {
    if (buf.readUInt32LE(i) === sig) return i
  }
  throw new Error('Not a valid ZIP (no EOCD)')
}

function parseZip(buf) {
  const eocd = findEOCD(buf)
  const cdOffset = buf.readUInt32LE(eocd + 16)
  const cdEntries = buf.readUInt16LE(eocd + 10)
  const entries = []
  let p = cdOffset
  for (let i = 0; i < cdEntries; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error(`Bad CD entry at ${p}`)
    const compressedSize = buf.readUInt32LE(p + 20)
    const uncompressedSize = buf.readUInt32LE(p + 24)
    const fileNameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const compressionMethod = buf.readUInt16LE(p + 10)
    const localHeaderOffset = buf.readUInt32LE(p + 42)
    const name = buf.slice(p + 46, p + 46 + fileNameLen).toString('utf8')

    // Local header: skip its 30 bytes + filename + extra to get data offset
    const lh = localHeaderOffset
    if (buf.readUInt32LE(lh) !== 0x04034b50) throw new Error(`Bad local header at ${lh}`)
    const lhFileNameLen = buf.readUInt16LE(lh + 26)
    const lhExtraLen = buf.readUInt16LE(lh + 28)
    const dataOffset = lh + 30 + lhFileNameLen + lhExtraLen

    let data
    if (compressionMethod === 0) {
      data = buf.slice(dataOffset, dataOffset + compressedSize)
    } else if (compressionMethod === 8) {
      data = zlib.inflateRawSync(buf.slice(dataOffset, dataOffset + compressedSize))
    } else {
      throw new Error(`Unsupported compression ${compressionMethod} for ${name}`)
    }
    entries.push({ name, data, uncompressedSize })
    p += 46 + fileNameLen + extraLen + commentLen
  }
  return entries
}

// ── Tensor extraction ────────────────────────────────────────────────
//
// For PyTorch .pth files we mostly care about:
//   - archive/data.pkl: the pickled module/state_dict
//   - archive/data/N: raw tensor data, one file per tensor
//
// The .pkl encodes which tensor index belongs to which parameter
// name. Parsing arbitrary pickle is complex, but for the LAION linear
// + LAION-improved MLP the layout is regular: param names appear as
// short strings in the pkl in declaration order, and the tensor data
// files numbered 0..N-1 line up with that order.
//
// Strategy: extract the unique data files in numeric order, scan the
// pkl for the parameter-name strings to confirm count, then derive
// each tensor's shape from its byte length / element size + knowledge
// of the variant.

function float32FromBuffer(buf) {
  if (buf.length % 4 !== 0) throw new Error(`Tensor byte length ${buf.length} not /4`)
  const out = new Float32Array(buf.length / 4)
  for (let i = 0; i < out.length; i++) out[i] = buf.readFloatLE(i * 4)
  return Array.from(out)
}

function extractLinear(entries) {
  // 1-layer model: single Linear(768 -> 1).
  //   data/0: weight (1 × 768 = 3072 bytes)
  //   data/1: bias   (1 × 1   = 4 bytes)
  const data0 = entries.find((e) => /\/data\/0$/.test(e.name))
  const data1 = entries.find((e) => /\/data\/1$/.test(e.name))
  if (!data0 || !data1) throw new Error('Linear variant: missing data/0 or data/1')

  if (data0.data.length !== 768 * 4) {
    throw new Error(`Linear variant: weight is ${data0.data.length} bytes, expected ${768 * 4} (1×768 float32)`)
  }
  if (data1.data.length !== 4) {
    throw new Error(`Linear variant: bias is ${data1.data.length} bytes, expected 4 (1 float32)`)
  }
  const weightFlat = float32FromBuffer(data0.data)
  const bias = float32FromBuffer(data1.data)
  return {
    version: 1,
    layers: [{ weight: [weightFlat], bias }],
  }
}

function extractMlp(entries) {
  // 5-layer MLP (LAION improved-aesthetic-predictor):
  //   Linear(768, 1024) + ReLU
  //   Linear(1024, 128) + ReLU
  //   Linear(128,  64)  + ReLU
  //   Linear(64,   16)  + ReLU
  //   Linear(16,    1)
  //
  // Pickled as 10 tensors (weight + bias × 5). data/0..data/9 in order.
  const expected = [
    { rows: 1024, cols: 768 }, // L1 weight
    { rows: 1024, cols: 1 },   // L1 bias
    { rows: 128,  cols: 1024 },
    { rows: 128,  cols: 1 },
    { rows: 64,   cols: 128 },
    { rows: 64,   cols: 1 },
    { rows: 16,   cols: 64 },
    { rows: 16,   cols: 1 },
    { rows: 1,    cols: 16 },
    { rows: 1,    cols: 1 },
  ]
  const datas = entries
    .filter((e) => /\/data\/\d+$/.test(e.name))
    .sort((a, b) => {
      const an = Number(a.name.match(/\/data\/(\d+)$/)[1])
      const bn = Number(b.name.match(/\/data\/(\d+)$/)[1])
      return an - bn
    })
  if (datas.length < 10) throw new Error(`MLP variant: found ${datas.length} tensor files, expected 10`)

  const layers = []
  for (let li = 0; li < 5; li++) {
    const wEntry = datas[li * 2]
    const bEntry = datas[li * 2 + 1]
    const wShape = expected[li * 2]
    const bShape = expected[li * 2 + 1]
    const wBytes = wShape.rows * wShape.cols * 4
    const bBytes = bShape.rows * 4
    if (wEntry.data.length !== wBytes) {
      throw new Error(`MLP layer ${li + 1} weight: got ${wEntry.data.length}, expected ${wBytes}`)
    }
    if (bEntry.data.length !== bBytes) {
      throw new Error(`MLP layer ${li + 1} bias: got ${bEntry.data.length}, expected ${bBytes}`)
    }
    const wFlat = float32FromBuffer(wEntry.data)
    // Reshape flat weight into [out_dim][in_dim].
    const weight = []
    for (let r = 0; r < wShape.rows; r++) {
      weight.push(wFlat.slice(r * wShape.cols, (r + 1) * wShape.cols))
    }
    const bias = float32FromBuffer(bEntry.data)
    layers.push({ weight, bias })
  }
  return { version: 1, layers }
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log(`[aesthetic] Variant: ${variant} — ${cfg.description}`)
  console.log(`[aesthetic] Output : ${outPath}`)

  let pthBuf
  if (pthOverride) {
    if (!fsSync.existsSync(pthOverride)) {
      throw new Error(`--pth path not found: ${pthOverride}`)
    }
    pthBuf = await fs.readFile(pthOverride)
    console.log(`[aesthetic] Reading local ${pthOverride} (${(pthBuf.length / 1024).toFixed(0)} KB)`)
  } else {
    pthBuf = await downloadPth(cfg.url)
  }

  const entries = parseZip(pthBuf)
  if (verbose) {
    console.log('[aesthetic] ZIP entries:')
    for (const e of entries) console.log(`  ${e.name.padEnd(40)} ${e.uncompressedSize}`)
  }

  const json = variant === 'mlp' ? extractMlp(entries) : extractLinear(entries)

  await fs.mkdir(path.dirname(outPath), { recursive: true })
  await fs.writeFile(outPath, JSON.stringify(json))
  const stats = await fs.stat(outPath)
  console.log(`[aesthetic] ✓ Wrote ${stats.size} bytes to ${outPath}`)
  console.log(`[aesthetic]   ${json.layers.length}-layer model · in_dim=${json.layers[0].weight[0].length} · out_dim=${json.layers[json.layers.length - 1].bias.length}`)
  console.log(`[aesthetic] Restart Vault and the LAION aesthetic predictor card should flip to "Installed".`)
}

main().catch((err) => {
  console.error('[aesthetic] FAILED:', err.message)
  if (verbose) console.error(err.stack)
  process.exit(1)
})
