// File: src/main/services/webauthn-vault-unlock.ts
//
// #281 C-57 — WebAuthn / passkey vault unlock. Lets the user
// register a YubiKey / Windows Hello / Touch ID / platform passkey
// as a second factor for unlocking the vault (or — if they prefer —
// as the *primary* unlock factor with no password).
//
// Storage:
//   - settings.webauthnCredentials: per-credential metadata (no
//     secret material — the authenticator holds that)
//   - settings.webauthnChallenge: transient (per-ceremony) blob
//
// Registration flow:
//   renderer → main: webauthn:registerStart → returns options
//   browser → authenticator (platform UI: TouchID / Windows Hello)
//   browser → renderer: attestation response
//   renderer → main: webauthn:registerFinish(response) → stores credential
//
// Auth flow:
//   renderer → main: webauthn:authStart → returns assertion options
//   browser → authenticator → renderer: signed assertion
//   renderer → main: webauthn:authFinish → verifies → returns unlock token

import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse,
} from '@simplewebauthn/server'
import { getSettings, updateSettings } from '../settings'

const RP_NAME = 'Vault'
const RP_ID = 'localhost'  // Electron loads via app://, treated as localhost-equivalent

export interface VaultCredential {
  id: string                  // base64url credentialID
  publicKey: string           // base64url credential public key
  counter: number
  deviceLabel: string         // user-supplied ("Yubikey blue", "Mac TouchID", etc)
  registeredAt: number
}

function readCredentials(): VaultCredential[] {
  const s = getSettings() as any
  return Array.isArray(s.webauthnCredentials) ? s.webauthnCredentials : []
}

function writeCredentials(creds: VaultCredential[]): void {
  updateSettings({ webauthnCredentials: creds } as any)
}

function setChallenge(challenge: string): void {
  updateSettings({ webauthnChallenge: { value: challenge, ts: Date.now() } } as any)
}

function popChallenge(): string | null {
  const s = getSettings() as any
  const ch = s.webauthnChallenge
  if (!ch || typeof ch.value !== 'string') return null
  if (Date.now() - ch.ts > 5 * 60_000) return null  // 5 min expiry
  updateSettings({ webauthnChallenge: null } as any)
  return ch.value
}

export async function registerStart(deviceLabel: string): Promise<{ options: any; deviceLabel: string }> {
  const existing = readCredentials()
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userName: 'vault-user',
    timeout: 60_000,
    attestationType: 'none',
    excludeCredentials: existing.map((c) => ({ id: c.id, type: 'public-key' as const })),
    authenticatorSelection: {
      userVerification: 'preferred',
      requireResidentKey: false,
      residentKey: 'preferred',
    },
  })
  setChallenge(options.challenge)
  return { options, deviceLabel }
}

export async function registerFinish(args: { response: any; deviceLabel: string }): Promise<{ ok: boolean; credentialId?: string; error?: string }> {
  const expected = popChallenge()
  if (!expected) return { ok: false, error: 'Challenge expired — restart registration' }
  try {
    const verification = await verifyRegistrationResponse({
      response: args.response,
      expectedChallenge: expected,
      expectedOrigin: `http://${RP_ID}`,
      expectedRPID: RP_ID,
    })
    if (!verification.verified || !verification.registrationInfo) {
      return { ok: false, error: 'Verification failed' }
    }
    const info = verification.registrationInfo as any
    const credentialID = info.credential?.id ?? info.credentialID
    const credentialPublicKey = info.credential?.publicKey ?? info.credentialPublicKey
    const counter = info.credential?.counter ?? info.counter ?? 0
    const id = typeof credentialID === 'string' ? credentialID : Buffer.from(credentialID).toString('base64url')
    const publicKey = typeof credentialPublicKey === 'string' ? credentialPublicKey : Buffer.from(credentialPublicKey).toString('base64url')
    const cred: VaultCredential = {
      id, publicKey, counter,
      deviceLabel: args.deviceLabel,
      registeredAt: Date.now(),
    }
    writeCredentials([...readCredentials(), cred])
    return { ok: true, credentialId: id }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) }
  }
}

export async function authStart(): Promise<{ options: any }> {
  const creds = readCredentials()
  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    timeout: 60_000,
    userVerification: 'preferred',
    allowCredentials: creds.map((c) => ({ id: c.id, type: 'public-key' as const })),
  })
  setChallenge(options.challenge)
  return { options }
}

export async function authFinish(args: { response: any }): Promise<{ ok: boolean; credentialId?: string; error?: string }> {
  const expected = popChallenge()
  if (!expected) return { ok: false, error: 'Challenge expired — restart authentication' }
  const creds = readCredentials()
  const cred = creds.find((c) => c.id === args.response?.id)
  if (!cred) return { ok: false, error: 'Unknown credential' }
  try {
    const verification = await verifyAuthenticationResponse({
      response: args.response,
      expectedChallenge: expected,
      expectedOrigin: `http://${RP_ID}`,
      expectedRPID: RP_ID,
      credential: {
        id: cred.id,
        publicKey: Buffer.from(cred.publicKey, 'base64url'),
        counter: cred.counter,
      },
    } as any)
    if (!verification.verified) return { ok: false, error: 'Verification failed' }
    // Bump counter to prevent replay.
    const newCounter = (verification.authenticationInfo as any)?.newCounter ?? cred.counter
    writeCredentials(creds.map((c) => c.id === cred.id ? { ...c, counter: newCounter } : c))
    return { ok: true, credentialId: cred.id }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) }
  }
}

export function listCredentials(): Array<{ id: string; deviceLabel: string; registeredAt: number; counter: number }> {
  return readCredentials().map((c) => ({ id: c.id, deviceLabel: c.deviceLabel, registeredAt: c.registeredAt, counter: c.counter }))
}

export function removeCredential(id: string): boolean {
  const before = readCredentials().length
  writeCredentials(readCredentials().filter((c) => c.id !== id))
  return readCredentials().length < before
}
