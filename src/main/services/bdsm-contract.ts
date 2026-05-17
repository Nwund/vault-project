// File: src/main/services/bdsm-contract.ts
//
// #368 H-144 — BDSM contract & negotiation form. Persisted single-
// document model living in settings.bdsmContract. The user fills it
// out in the Settings → Self-control → Contract card; Mistress AI
// reads it as additional context (limits, safewords, preferences)
// before issuing commands so the AI never crosses a hard no.
//
// Schema is intentionally human-readable JSON so the user can edit
// it externally if they prefer (and the AI sees friendly field names
// when prompted).

import { getSettings, updateSettings } from '../settings'

export interface BdsmContract {
  // Identity / framing
  submissive: string                 // self-chosen name / honorific
  dominant: string                   // the persona / partner
  scope: string                      // session vs ongoing
  signedAt: string | null            // ISO datetime when last signed
  reviewIntervalDays: number         // contract must be re-signed every N days

  // Limits
  hardLimits: string[]               // never crossed under any circumstance
  softLimits: string[]               // negotiated case-by-case
  trigger_words: string[]            // immediate scene end

  // Safewords
  safewords: {
    yellow: string                   // "slow down / check in"
    red: string                      // "stop everything"
    silent: string                   // gestural / nonverbal equivalent (for gag scenes)
  }

  // Preferences (what the sub wants)
  kinks: {
    enthusiastic: string[]           // top tier — actively want
    interested: string[]             // tier 2 — open to
    curious: string[]                // tier 3 — willing to try once
  }

  // Boundaries
  noMarks: boolean                   // no visible marks (workplace constraint)
  noDamage: boolean                  // no broken skin / lasting injury
  noPublic: boolean                  // no public/in-public-view scenes
  noRecording: boolean               // no video/photo recording
  customBoundaries: string[]

  // After-care preferences
  aftercare: {
    physical: string[]               // hydration, blankets, warmth, etc
    emotional: string[]              // reassurance, cuddles, quiet, etc
    none: boolean                    // some subs prefer immediate solo decompression
  }

  // Free-text fields
  notes: string                      // anything not covered above
  history: string                    // prior experience the dom should know
}

export function getDefaultContract(): BdsmContract {
  return {
    submissive: '',
    dominant: 'Mistress Xyrene',
    scope: 'session-by-session',
    signedAt: null,
    reviewIntervalDays: 90,
    hardLimits: ['breath play', 'blood play', 'permanent marks', 'minors'],
    softLimits: ['humiliation in front of others', 'face-slapping'],
    trigger_words: [],
    safewords: { yellow: 'yellow', red: 'red', silent: 'three taps' },
    kinks: { enthusiastic: [], interested: [], curious: [] },
    noMarks: false,
    noDamage: true,
    noPublic: false,
    noRecording: false,
    customBoundaries: [],
    aftercare: { physical: [], emotional: [], none: false },
    notes: '',
    history: '',
  }
}

export function loadContract(): BdsmContract {
  const s = getSettings() as any
  const stored = s.bdsmContract as Partial<BdsmContract> | undefined
  if (!stored) return getDefaultContract()
  // Merge with defaults so missing fields don't break consumers.
  const defaults = getDefaultContract()
  return {
    ...defaults,
    ...stored,
    safewords: { ...defaults.safewords, ...(stored.safewords ?? {}) },
    kinks: { ...defaults.kinks, ...(stored.kinks ?? {}) },
    aftercare: { ...defaults.aftercare, ...(stored.aftercare ?? {}) },
  }
}

export function saveContract(contract: BdsmContract): void {
  updateSettings({ bdsmContract: contract } as any)
}

export function signContract(): BdsmContract {
  const c = loadContract()
  c.signedAt = new Date().toISOString()
  saveContract(c)
  return c
}

// Used by Mistress persona to bake the contract into the system prompt
// so the AI literally cannot cross hard limits or ignore safewords.
export function buildContractContextBlock(): string {
  const c = loadContract()
  if (!c.signedAt && c.hardLimits.length === 0 && c.softLimits.length === 0) {
    return ''  // unsigned and empty — don't pollute prompt
  }
  const lines: string[] = [
    '',
    '═══════════════════════════════════════════════════════════════════════',
    'NEGOTIATED CONTRACT — DO NOT VIOLATE',
    '═══════════════════════════════════════════════════════════════════════',
  ]
  if (c.hardLimits.length > 0) lines.push(`HARD LIMITS (never): ${c.hardLimits.join(', ')}`)
  if (c.softLimits.length > 0) lines.push(`SOFT LIMITS (negotiated only): ${c.softLimits.join(', ')}`)
  if (c.trigger_words.length > 0) lines.push(`TRIGGER WORDS (immediate scene end if used): ${c.trigger_words.join(', ')}`)
  lines.push(`SAFEWORDS — yellow="${c.safewords.yellow}" red="${c.safewords.red}" silent="${c.safewords.silent}"`)
  if (c.kinks.enthusiastic.length > 0) lines.push(`ACTIVELY WANTS: ${c.kinks.enthusiastic.join(', ')}`)
  const flags: string[] = []
  if (c.noMarks) flags.push('no visible marks')
  if (c.noDamage) flags.push('no broken skin')
  if (c.noPublic) flags.push('no public scenes')
  if (c.noRecording) flags.push('no recording')
  if (flags.length > 0) lines.push(`BOUNDARIES: ${flags.join('; ')}`)
  if (c.customBoundaries.length > 0) lines.push(`CUSTOM BOUNDARIES: ${c.customBoundaries.join('; ')}`)
  lines.push('═══════════════════════════════════════════════════════════════════════')
  return lines.join('\n')
}
