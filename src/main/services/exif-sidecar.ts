// File: src/main/services/exif-sidecar.ts
//
// #243 A-19 / #309 E-85 — EXIF + XMP sidecar reader/writer using
// exiftool-vendored. Two surfaces:
//
//   readMetadata(filePath)    — full EXIF/XMP/IPTC dump for the
//                                editor UI.
//   writeMetadata(filePath, t) — write a tag patch. Supports both
//                                in-place embedding (EXIF for JPEG /
//                                XMP for PNG/MP4/MOV) and sidecar
//                                (.xmp next to source).
//
// On exit the singleton exiftool process is shut down. Caller wires
// shutdownExif() from app `will-quit`.

import { exiftool, Tags } from 'exiftool-vendored'
import * as path from 'node:path'
import * as fs from 'node:fs'

let _running = true

export async function readMetadata(filePath: string): Promise<Tags> {
  return exiftool.read(filePath)
}

export async function writeMetadata(
  filePath: string,
  tagPatch: Record<string, string | number | string[] | null>,
  options: { sidecar?: boolean } = {},
): Promise<{ ok: true; sidecarPath?: string } | { ok: false; error: string }> {
  try {
    if (options.sidecar) {
      const sidecarPath = `${filePath}.xmp`
      // exiftool: pass the source file path with -o to write to a new sidecar.
      // exiftool-vendored handles this via the writeArgs option.
      await exiftool.write(filePath, tagPatch as any, {
        writeArgs: ['-overwrite_original', '-tagsFromFile', filePath, '-o', sidecarPath],
      } as any)
      return { ok: true, sidecarPath }
    } else {
      await exiftool.write(filePath, tagPatch as any, { writeArgs: ['-overwrite_original'] } as any)
      return { ok: true }
    }
  } catch (err: any) {
    return { ok: false, error: String(err?.message ?? err) }
  }
}

export async function importFromSidecar(filePath: string): Promise<{ ok: true; tags: Tags } | { ok: false; error: string }> {
  const sidecar = `${filePath}.xmp`
  if (!fs.existsSync(sidecar)) {
    // Try common alternative — same basename with .xmp.
    const alt = path.join(path.dirname(filePath), `${path.parse(filePath).name}.xmp`)
    if (!fs.existsSync(alt)) return { ok: false, error: 'no sidecar found' }
    try {
      const tags = await exiftool.read(alt)
      return { ok: true, tags }
    } catch (err: any) {
      return { ok: false, error: String(err?.message ?? err) }
    }
  }
  try {
    const tags = await exiftool.read(sidecar)
    return { ok: true, tags }
  } catch (err: any) {
    return { ok: false, error: String(err?.message ?? err) }
  }
}

export async function exportToSidecar(filePath: string): Promise<{ ok: true; sidecarPath: string } | { ok: false; error: string }> {
  const sidecarPath = `${filePath}.xmp`
  try {
    await exiftool.write(filePath, {} as any, {
      writeArgs: ['-overwrite_original', '-tagsFromFile', filePath, '-o', sidecarPath],
    } as any)
    return { ok: true, sidecarPath }
  } catch (err: any) {
    return { ok: false, error: String(err?.message ?? err) }
  }
}

export async function shutdownExif(): Promise<void> {
  if (!_running) return
  _running = false
  try { await exiftool.end() } catch { /* ignore */ }
}
