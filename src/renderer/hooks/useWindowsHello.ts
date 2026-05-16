// File: src/renderer/hooks/useWindowsHello.ts
//
// Thin wrapper around the WebAuthn API for Windows Hello / Touch ID /
// platform authenticator presence verification (#194). Returns a
// promise that resolves true on successful biometric/PIN check.
//
// First call provisions a non-discoverable credential keyed to the
// "vault-local" user (no public-key crypto used downstream — Vault
// just needs the user-presence ceremony to gate sensitive actions
// like revealing API keys or disabling incognito).

import { useCallback } from 'react'

const STORAGE_CREDENTIAL_ID = 'vault_webauthn_credential_id'

function bytesToB64(b: ArrayBuffer): string {
  const bytes = new Uint8Array(b)
  let s = ''
  for (const byte of bytes) s += String.fromCharCode(byte)
  return btoa(s)
}
function b64ToBytes(b64: string): Uint8Array {
  const s = atob(b64)
  const bytes = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i)
  return bytes
}

function randomChallenge(): ArrayBuffer {
  const c = new Uint8Array(32)
  crypto.getRandomValues(c)
  return c.buffer
}

export interface WebAuthnState {
  /** True when navigator.credentials + isUserVerifyingPlatformAuthenticatorAvailable is true. */
  available: () => Promise<boolean>
  /** Prompt the user to verify (Windows Hello / Touch ID). Returns true
   *  on success. Provisions a credential transparently on first run. */
  verify: () => Promise<boolean>
  /** Forget the stored credential (logout). */
  forget: () => void
}

export function useWindowsHello(): WebAuthnState {
  const available = useCallback(async () => {
    if (!window.PublicKeyCredential) return false
    try {
      return await (PublicKeyCredential as any).isUserVerifyingPlatformAuthenticatorAvailable?.()
    } catch {
      return false
    }
  }, [])

  const provision = useCallback(async (): Promise<string | null> => {
    if (!window.PublicKeyCredential) return null
    try {
      const cred = await navigator.credentials.create({
        publicKey: {
          challenge: randomChallenge(),
          rp: { name: 'Vault' },
          user: {
            id: new TextEncoder().encode('vault-local-user').buffer,
            name: 'vault-local',
            displayName: 'Vault',
          },
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required',
            residentKey: 'preferred',
          },
          timeout: 60_000,
          attestation: 'none',
        },
      }) as PublicKeyCredential | null
      if (!cred) return null
      const id = bytesToB64(cred.rawId)
      try { localStorage.setItem(STORAGE_CREDENTIAL_ID, id) } catch { /* quota */ }
      return id
    } catch (err) {
      console.warn('[WindowsHello] provision failed:', err)
      return null
    }
  }, [])

  const verify = useCallback(async () => {
    if (!window.PublicKeyCredential) return false
    try {
      let storedId = localStorage.getItem(STORAGE_CREDENTIAL_ID)
      // First-run provisioning if no credential yet.
      if (!storedId) {
        storedId = await provision()
        if (!storedId) return false
        return true  // provision implies user-verification — we're done
      }
      const got = await navigator.credentials.get({
        publicKey: {
          challenge: randomChallenge(),
          allowCredentials: [{
            type: 'public-key',
            id: new Uint8Array(b64ToBytes(storedId)).buffer as ArrayBuffer,
            transports: ['internal'],
          }],
          userVerification: 'required',
          timeout: 60_000,
        },
      })
      return !!got
    } catch (err) {
      console.warn('[WindowsHello] verify failed:', err)
      return false
    }
  }, [provision])

  const forget = useCallback(() => {
    try { localStorage.removeItem(STORAGE_CREDENTIAL_ID) } catch { /* noop */ }
  }, [])

  return { available, verify, forget }
}
