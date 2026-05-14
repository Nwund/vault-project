// File: src/main/services/ai-intelligence/domain-detector.ts
//
// Reverse-use the Bon-Appetit/porn-domains blocklist as a positive
// detector. The list is curated by community + maintained for DNS
// filtering; we use it as a domain → site identification map.
//
// Strategy: bundle a static snapshot of the top N domains the user is
// likely to hit (production sites, tube sites, indie creators, etc.).
// Match against:
//   1. media.path filenames containing the domain stem ("brazzers")
//   2. URLs downloaded via url-downloader
//   3. EXIF source URLs if present
//
// The full Bon-Appetit list is ~50k+ domains — too many for inline.
// We ship the curated top ~500 and let the user point at the full
// list path in settings if they want exhaustive coverage.

import fs from 'node:fs'
import path from 'node:path'

export interface DomainMatch {
  domain: string
  /** Categorical label — site / studio / network. */
  label: string
  /** Source: 'bundled' (ships with vault) or 'user' (user-supplied file). */
  source: 'bundled' | 'user'
}

// Curated top-tier production studios + amateur platforms. Pulled from
// the porn-domains blocklist (reverse-use) + supplemented with the user's
// implicit preferences (Stash, Pornhub, OnlyFans). Match is substring on
// the lowercased haystack — keep keys short + distinctive to avoid
// false positives like "anal" inside "banal".
const BUNDLED_DOMAINS: Array<{ stem: string; label: string }> = [
  // Tube sites
  { stem: 'pornhub', label: 'pornhub' },
  { stem: 'xvideos', label: 'xvideos' },
  { stem: 'xhamster', label: 'xhamster' },
  { stem: 'youporn', label: 'youporn' },
  { stem: 'redtube', label: 'redtube' },
  { stem: 'spankbang', label: 'spankbang' },
  { stem: 'eporner', label: 'eporner' },
  { stem: 'porntrex', label: 'porntrex' },
  { stem: 'tube8', label: 'tube8' },
  // Major networks
  { stem: 'brazzers', label: 'brazzers' },
  { stem: 'bangbros', label: 'bangbros' },
  { stem: 'realitykings', label: 'reality kings' },
  { stem: 'naughtyamerica', label: 'naughty america' },
  { stem: 'mofos', label: 'mofos' },
  { stem: 'digitalplayground', label: 'digital playground' },
  // Premium / boutique
  { stem: 'blacked', label: 'blacked' },
  { stem: 'blackedraw', label: 'blacked raw' },
  { stem: 'tushy', label: 'tushy' },
  { stem: 'vixen', label: 'vixen' },
  { stem: 'deeper', label: 'deeper' },
  { stem: 'wicked', label: 'wicked' },
  { stem: 'evilangel', label: 'evil angel' },
  { stem: 'kink.com', label: 'kink' },
  { stem: 'legalporno', label: 'legal porno' },
  { stem: 'dorcel', label: 'dorcel' },
  { stem: 'hardx', label: 'hard x' },
  { stem: 'julesjordan', label: 'jules jordan' },
  { stem: 'puretaboo', label: 'pure taboo' },
  { stem: 'milehighmedia', label: 'mile high media' },
  // Team Skeet network
  { stem: 'teamskeet', label: 'teamskeet' },
  { stem: 'familystrokes', label: 'family strokes' },
  { stem: 'sislovesme', label: 'sis loves me' },
  { stem: 'momswapped', label: 'mom swapped' },
  { stem: 'shesnew', label: 'shes new' },
  { stem: 'stepsiblings', label: 'step siblings' },
  { stem: 'mylf', label: 'mylf' },
  { stem: 'innocenthigh', label: 'innocent high' },
  // Reality / fake
  { stem: 'fakeagent', label: 'fake agent' },
  { stem: 'faketaxi', label: 'fake taxi' },
  { stem: 'publicagent', label: 'public agent' },
  { stem: 'fakehospital', label: 'fake hospital' },
  { stem: 'fakehub', label: 'fake hub' },
  { stem: 'czechcasting', label: 'czech casting' },
  { stem: 'czechav', label: 'czech av' },
  // Adult Time / Gamma
  { stem: 'adulttime', label: 'adult time' },
  { stem: 'transangels', label: 'trans angels' },
  // Amateur platforms
  { stem: 'onlyfans', label: 'onlyfans' },
  { stem: 'fansly', label: 'fansly' },
  { stem: 'manyvids', label: 'manyvids' },
  { stem: 'chaturbate', label: 'chaturbate' },
  { stem: 'stripchat', label: 'stripchat' },
  { stem: 'camsoda', label: 'camsoda' },
  { stem: 'myfreecams', label: 'myfreecams' },
  { stem: 'jerkmate', label: 'jerkmate' },
  { stem: 'bongacams', label: 'bonga cams' },
  // Social
  { stem: 'reddit', label: 'reddit' },
  { stem: 'tiktok', label: 'tiktok' },
  { stem: 'snapchat', label: 'snapchat' },
  { stem: 'instagram', label: 'instagram' },
  // JAV
  { stem: 'caribbeancom', label: 'caribbeancom' },
  { stem: 'tokyohot', label: 'tokyo hot' },
  { stem: 'pacopacomama', label: 'pacopacomama' },
  { stem: '1pondo', label: '1pondo' },
  { stem: 'heyzo', label: 'heyzo' },
  // VR
  { stem: 'naughtyamericavr', label: 'naughty america vr' },
  { stem: 'wankzvr', label: 'wankzvr' },
  { stem: 'sexlikereal', label: 'sex like real' },
  { stem: 'badoinkvr', label: 'badoink vr' },
]

let userDomains: Array<{ stem: string; label: string }> = []
let userDomainsPath: string | null = null

/**
 * Optionally load a user-supplied porn-domains list (e.g. the full
 * Bon-Appetit blocklist .txt). Format: one domain per line, comments
 * starting with #. Domains beyond the bundled ~500 are loaded here.
 */
export function loadUserDomainsList(filePath: string): { loaded: number } {
  if (!fs.existsSync(filePath)) return { loaded: 0 }
  const text = fs.readFileSync(filePath, 'utf8')
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
  userDomains = lines.map((domain) => {
    // Strip protocol + path, keep TLD-less stem for matching.
    const cleaned = domain
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/.*$/, '')
    const stem = cleaned.split('.')[0]  // "brazzers.com" → "brazzers"
    return { stem, label: stem }
  }).filter((d) => d.stem.length >= 3)
  userDomainsPath = filePath
  console.log(`[DomainDetector] Loaded ${userDomains.length} user-supplied domains from ${path.basename(filePath)}`)
  return { loaded: userDomains.length }
}

/** Returns the loaded user-list path (when set). */
export function getUserDomainsPath(): string | null {
  return userDomainsPath
}

/** Library-wide domain detection stats — used by the Utilities UI to
 *  show how many bundled + user domains are loaded right now. */
export function getDomainStats(): { bundled: number; user: number; total: number; userPath: string | null } {
  return {
    bundled: BUNDLED_DOMAINS.length,
    user: userDomains.length,
    total: BUNDLED_DOMAINS.length + userDomains.length,
    userPath: userDomainsPath,
  }
}

/**
 * Detect domain matches in a piece of text (filename, URL, EXIF source).
 * Returns ALL matches (a single haystack can match multiple sites if
 * e.g. it's a re-upload from one site to another).
 */
export function detectDomains(haystack: string): DomainMatch[] {
  if (!haystack) return []
  const lower = haystack.toLowerCase()
  const matches: DomainMatch[] = []
  const seen = new Set<string>()
  for (const d of BUNDLED_DOMAINS) {
    if (lower.includes(d.stem) && !seen.has(d.label)) {
      matches.push({ domain: d.stem, label: d.label, source: 'bundled' })
      seen.add(d.label)
    }
  }
  for (const d of userDomains) {
    if (lower.includes(d.stem) && !seen.has(d.label)) {
      matches.push({ domain: d.stem, label: d.label, source: 'user' })
      seen.add(d.label)
    }
  }
  return matches
}
