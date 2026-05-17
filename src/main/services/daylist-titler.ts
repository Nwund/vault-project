// File: src/main/services/daylist-titler.ts
//
// #288 D-64 — Spotify Daylist auto-retitling. The daily-mix
// (#ai:daily-mix) already picks 6 mood profiles by hour. This
// service generates a fresh evocative *title* every 4 hours by
// mashing the current mood label with a randomized adjective + noun
// from a curated word pool. Persisted to settings.daylistTitle +
// settings.daylistTitleGeneratedAt so the UI shows the same title
// across refreshes within a 4h window.

import { getSettings, updateSettings } from '../settings'

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000

// Word pool tuned to be evocative + horny + slightly absurd, in the
// Spotify Daylist tradition ("midnight cardio cumshots", "afternoon
// edging chamomile", etc). Categories swap based on time of day.

const ADJECTIVES_MORNING = ['lazy', 'dewy', 'soft-focus', 'half-awake', 'first-light', 'rumpled', 'sun-warmed']
const ADJECTIVES_DAY = ['focused', 'efficient', 'productive', 'kettle-boiled', 'casual', 'mid-shift', 'low-stakes']
const ADJECTIVES_AFTERNOON = ['simmering', 'restless', 'between-meetings', 'mid-cycle', 'caffeine-elevated', 'idle-clicking']
const ADJECTIVES_EVENING = ['after-hours', 'unwound', 'feet-up', 'lights-low', 'second-glass', 'curtains-drawn']
const ADJECTIVES_LATENIGHT = ['midnight', 'insomnia-spec', 'two-am', 'mouth-breathing', 'eyes-glazed', 'still-up', 'unrepentant']
const ADJECTIVES_INSOMNIA = ['four-am', 'doomscroll', 'never-sleeping', 'pre-dawn', 'glow-lit', 'wired-tired']

const NOUNS_GENERAL = ['edging', 'goon-mode', 'denial', 'fixation', 'spiral', 'loop', 'kink ladder', 'compulsion', 'discipline', 'release', 'craving', 'hunger', 'patience', 'restraint', 'unraveling', 'meditation']
const NOUNS_INTENSE = ['ruined orgasms', 'forced patience', 'denial chamber', 'climax tax', 'edging marathon', 'discipline loop']
const NOUNS_SOFT = ['daydream', 'idle scroll', 'tease pile', 'warm-up', 'slow build', 'first stretch']

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function adjectivesForHour(h: number): string[] {
  if (h >= 5 && h < 9) return ADJECTIVES_MORNING
  if (h >= 9 && h < 12) return ADJECTIVES_DAY
  if (h >= 12 && h < 17) return ADJECTIVES_AFTERNOON
  if (h >= 17 && h < 21) return ADJECTIVES_EVENING
  if (h >= 21 || h < 2) return ADJECTIVES_LATENIGHT
  return ADJECTIVES_INSOMNIA
}

function nounsForHour(h: number): string[] {
  if (h >= 5 && h < 9) return [...NOUNS_SOFT, ...NOUNS_GENERAL]
  if (h >= 21 || h < 2) return [...NOUNS_GENERAL, ...NOUNS_INTENSE]
  return NOUNS_GENERAL
}

export function generateDaylistTitle(hour?: number): string {
  const h = hour ?? new Date().getHours()
  // 3-part title: <adjective> <adjective> <noun>
  // First adj sets the time-of-day frame; second adj is a bit of
  // chaos; noun anchors it.
  const adj1 = pick(adjectivesForHour(h))
  const adj2 = pick([...ADJECTIVES_DAY, ...ADJECTIVES_AFTERNOON, ...ADJECTIVES_EVENING, ...ADJECTIVES_LATENIGHT])
  const noun = pick(nounsForHour(h))
  return `${adj1} ${adj2} ${noun}`
}

export interface DaylistTitleState {
  title: string
  generatedAt: number
  expiresAt: number
  hourBucket: number
}

export function getOrRefreshDaylistTitle(): DaylistTitleState {
  const s = getSettings() as any
  const now = Date.now()
  const stored = s.daylistTitle && s.daylistTitleGeneratedAt
    ? { title: String(s.daylistTitle), generatedAt: Number(s.daylistTitleGeneratedAt) }
    : null
  if (stored && (now - stored.generatedAt) < FOUR_HOURS_MS) {
    return {
      title: stored.title,
      generatedAt: stored.generatedAt,
      expiresAt: stored.generatedAt + FOUR_HOURS_MS,
      hourBucket: new Date(stored.generatedAt).getHours(),
    }
  }
  const title = generateDaylistTitle()
  updateSettings({ daylistTitle: title, daylistTitleGeneratedAt: now } as any)
  return { title, generatedAt: now, expiresAt: now + FOUR_HOURS_MS, hourBucket: new Date().getHours() }
}

export function forceRegenerateDaylistTitle(): DaylistTitleState {
  const now = Date.now()
  const title = generateDaylistTitle()
  updateSettings({ daylistTitle: title, daylistTitleGeneratedAt: now } as any)
  return { title, generatedAt: now, expiresAt: now + FOUR_HOURS_MS, hourBucket: new Date().getHours() }
}
