// ===============================
// File: src/main/services/secure-storage.ts
//
// Thin wrapper around Electron's `safeStorage` API for encrypting secrets
// (Venice API key, future cross-device pairing tokens, etc.) at rest.
//
// On Windows this uses DPAPI under the user account; on macOS the system
// Keychain; on Linux libsecret/gnome-keyring/kwallet (with a libsecret
// fallback to a file-derived key when no keyring is configured).
//
// Format:
//   - Encrypted strings are stored as `enc:v1:<base64-of-buffer>` so we can
//     distinguish "this is a ciphertext" from "this is a legacy plaintext"
//     and bump the version prefix later if the wire format changes.
//   - When safeStorage isn't available (rare — e.g. Linux without a keyring
//     and `--password-store=basic` not set), we refuse to encrypt rather
//     than silently storing plaintext — caller falls back to its own
//     handling. Vault prefers "no key stored" over "key stored insecurely".
// ===============================

import { safeStorage } from 'electron'

const PREFIX = 'enc:v1:'

export function isSecureStorageAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

/**
 * Encrypt a plaintext string. Returns the wire-format string ready for
 * persisting in settings.json. Throws if the OS keychain isn't available
 * — callers should catch and decide whether to refuse to save or to fall
 * back to plaintext (we recommend refusing for sensitive values).
 */
export function encryptString(plaintext: string): string {
  if (!plaintext) return ''
  if (!isSecureStorageAvailable()) {
    throw new Error('safeStorage encryption not available on this platform')
  }
  const buf = safeStorage.encryptString(plaintext)
  return PREFIX + buf.toString('base64')
}

/**
 * Decrypt a wire-format string produced by `encryptString`. Returns the
 * plaintext or `null` if the input isn't a valid ciphertext or decryption
 * fails. Plain (un-prefixed) input is returned unchanged so callers can
 * use one read path for both legacy and migrated settings.
 */
export function decryptString(stored: string | null | undefined): string | null {
  if (!stored) return null
  if (!stored.startsWith(PREFIX)) {
    // Legacy plaintext — return as-is so the caller can opt to migrate it.
    return stored
  }
  if (!isSecureStorageAvailable()) {
    return null
  }
  try {
    const b64 = stored.slice(PREFIX.length)
    const buf = Buffer.from(b64, 'base64')
    return safeStorage.decryptString(buf)
  } catch (err) {
    console.warn('[SecureStorage] Failed to decrypt:', err)
    return null
  }
}

export function isCipherText(stored: string | null | undefined): boolean {
  return !!stored && stored.startsWith(PREFIX)
}

/**
 * Last-N preview suitable for masked UI display ("••••••••mcrz"). Never
 * leaks more than the configured tail length even for short keys.
 */
export function maskedPreview(plaintext: string, tail = 4): string {
  if (!plaintext) return ''
  const len = plaintext.length
  if (len <= tail) return '•'.repeat(len)
  return '•'.repeat(Math.min(8, len - tail)) + plaintext.slice(-tail)
}
