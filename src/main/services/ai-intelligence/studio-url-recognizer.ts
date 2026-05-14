// File: src/main/services/ai-intelligence/studio-url-recognizer.ts
//
// Source URL → studio metadata recognizer. Ported in spirit from the
// PhoenixAdult Jellyfin plugin's site-handler list. PhoenixAdult ships
// ~150 site adapters; we don't need to reproduce all the scraping
// logic, but we DO want a fast URL-pattern lookup that turns
//   https://www.brazzers.com/scenes/view/id/1234/title
// into
//   { studio: 'brazzers', network: 'mindgeek' }
//
// Used by:
//   - Browse-tab "save with metadata" — when a video comes from a
//     known studio URL, we tag it with `studio:NAME` automatically.
//   - Filename hint augmentation — when a media's path or comment
//     field contains a URL we recognize, prefer the URL match over
//     the filename heuristic match.
//   - The Tier 2 prompt — pass the studio name as a hint so Venice
//     biases titles toward the studio's known content style.

export interface StudioMatch {
  /** Lowercase canonical studio name as the user would tag it. */
  studio: string
  /** Network / parent company (when known) — used for higher-level
   *  grouping in the Library tag tree. */
  network?: string
  /** When the URL points at a SPECIFIC piece of content (scene id /
   *  slug) rather than just the domain. */
  hasIdentifier: boolean
  /** Captured scene id or slug, when extractable. */
  identifier?: string
}

interface StudioPattern {
  /** Hostname (or hostname suffix) to match. */
  host: RegExp
  /** Canonical studio name. */
  studio: string
  /** Parent network. */
  network?: string
  /**
   * Capture pattern run against pathname. Group 1 is the
   * scene-identifier. Optional — without it we still recognize the
   * studio but can't capture an ID.
   */
  idPath?: RegExp
}

// Patterns are ordered from "most specific" (sub-studio first, e.g.
// 'tushyraw' before 'tushy') to "least specific". Hostname matching
// uses RegExp suffix so subdomains are tolerated.
const STUDIO_PATTERNS: StudioPattern[] = [
  // ─── Mindgeek networks ────────────────────────────────────────────
  { host: /\bbrazzers\.com$/i,        studio: 'brazzers',         network: 'mindgeek',
    idPath: /\/scenes?\/view\/id\/(\d+)/i },
  { host: /\brealitykings\.com$/i,    studio: 'realitykings',     network: 'mindgeek' },
  { host: /\bnaughtyamerica\.com$/i,  studio: 'naughty america',  network: 'naughty america' },
  { host: /\bdigitalplayground\.com$/i, studio: 'digital playground', network: 'mindgeek' },
  { host: /\bmofos\.com$/i,           studio: 'mofos',            network: 'mindgeek' },
  { host: /\bbabes\.com$/i,           studio: 'babes',            network: 'mindgeek' },
  { host: /\bbangbros\.com$/i,        studio: 'bangbros' },

  // ─── Vixen Media Group ────────────────────────────────────────────
  { host: /\bblackedraw\.com$/i,      studio: 'blacked raw',      network: 'vixen media group',
    idPath: /\/videos\/(?:[^/]+\/)?(\d+)\b/i },
  { host: /\bblacked\.com$/i,         studio: 'blacked',          network: 'vixen media group' },
  { host: /\btushyraw\.com$/i,        studio: 'tushy raw',        network: 'vixen media group' },
  { host: /\btushy\.com$/i,           studio: 'tushy',            network: 'vixen media group' },
  { host: /\bvixen\.com$/i,           studio: 'vixen',            network: 'vixen media group' },
  { host: /\bdeeper\.com$/i,          studio: 'deeper',           network: 'vixen media group' },
  { host: /\bslayed\.com$/i,          studio: 'slayed',           network: 'vixen media group' },
  { host: /\bmilfy\.com$/i,           studio: 'milfy',            network: 'vixen media group' },
  { host: /\bwicked\.com$/i,          studio: 'wicked',           network: 'wicked pictures' },

  // ─── Adult Time / Gamma network ───────────────────────────────────
  { host: /\badulttime\.com$/i,       studio: 'adult time',       network: 'gamma' },
  { host: /\btransangels\.com$/i,     studio: 'trans angels',     network: 'gamma' },
  { host: /\btranserotica\.com$/i,    studio: 'trans erotica',    network: 'gamma' },
  { host: /\bevilangel\.com$/i,       studio: 'evil angel',       network: 'gamma' },
  { host: /\bgirlsway\.com$/i,        studio: 'girlsway',         network: 'gamma' },
  { host: /\bpuretaboo\.com$/i,       studio: 'pure taboo',       network: 'gamma' },
  { host: /\bgenderx\.com$/i,         studio: 'gender x',         network: 'gamma' },

  // ─── Team Skeet network ───────────────────────────────────────────
  { host: /\bfamilystrokes\.com$/i,   studio: 'family strokes',   network: 'team skeet' },
  { host: /\bsislovesme\.com$/i,      studio: 'sis loves me',     network: 'team skeet' },
  { host: /\bteamskeet\.com$/i,       studio: 'team skeet',       network: 'team skeet' },
  { host: /\bmylf\.com$/i,            studio: 'mylf',             network: 'mylf' },
  { host: /\bbffs\.com$/i,            studio: 'bffs',             network: 'team skeet' },
  { host: /\bthickumz\.com$/i,        studio: 'thickumz',         network: 'team skeet' },
  { host: /\bstepsiblingscaught\.com$/i, studio: 'step siblings caught', network: 'team skeet' },

  // ─── Kink.com (Gamma) + LegalPorno ────────────────────────────────
  { host: /\bkink\.com$/i,            studio: 'kink',             network: 'kink' },
  { host: /\blegalporno\.com$/i,      studio: 'legal porno',      network: 'legal porno' },
  { host: /\banalvids\.com$/i,        studio: 'anal vids',        network: 'legal porno' },

  // ─── Independents / commercial studios ────────────────────────────
  { host: /\bjulesjordan\.com$/i,     studio: 'jules jordan' },
  { host: /\bhardx\.com$/i,           studio: 'hard x' },
  { host: /\bdarkx\.com$/i,           studio: 'dark x' },
  { host: /\belegantangel\.com$/i,    studio: 'elegant angel' },
  { host: /\bnewsensations\.com$/i,   studio: 'new sensations' },
  { host: /\bpornpros\.com$/i,        studio: 'pornpros' },
  { host: /\blethalhardcore\.com$/i,  studio: 'lethal hardcore' },
  { host: /\bsweetsinner\.com$/i,     studio: 'sweet sinner' },
  { host: /\bmilehighmedia\.com$/i,   studio: 'mile high media' },

  // ─── Reality / fake-x sites ───────────────────────────────────────
  { host: /\bfakeagent\.com$/i,       studio: 'fake agent',       network: 'fake hub' },
  { host: /\bfakeagentuk\.com$/i,     studio: 'fake agent uk',    network: 'fake hub' },
  { host: /\bfakehospital\.com$/i,    studio: 'fake hospital',    network: 'fake hub' },
  { host: /\bfaketaxi\.com$/i,        studio: 'fake taxi',        network: 'fake hub' },
  { host: /\bpublicagent\.com$/i,     studio: 'public agent',     network: 'fake hub' },
  { host: /\bczechcasting\.com$/i,    studio: 'czech casting',    network: 'czechav' },
  { host: /\bczechav\.com$/i,         studio: 'czech av',         network: 'czechav' },

  // ─── VR studios ───────────────────────────────────────────────────
  { host: /\bnaughtyamericavr\.com$/i, studio: 'naughty america vr', network: 'naughty america' },
  { host: /\bwankzvr\.com$/i,         studio: 'wankz vr',         network: 'wankz' },
  { host: /\bbadoinkvr\.com$/i,       studio: 'badoink vr',       network: 'badoink' },
  { host: /\bvrhush\.com$/i,          studio: 'vr hush',          network: 'badoink' },
  { host: /\bczechvr\.com$/i,         studio: 'czech vr',         network: 'czechav' },
  { host: /\brealitylovers\.com$/i,   studio: 'reality lovers' },
  { host: /\bsexlikereal\.com$/i,     studio: 'sex like real' },
  { host: /\bvrporn\.com$/i,          studio: 'vr porn' },

  // ─── Tubes (kept low priority — these are aggregators not studios,
  //      but a URL match is still useful for source attribution) ─────
  { host: /\bpornhub\.com$/i,         studio: 'pornhub',          network: 'mindgeek' },
  { host: /\bxvideos\.com$/i,         studio: 'xvideos' },
  { host: /\bxhamster\.com$/i,        studio: 'xhamster' },
  { host: /\bspankbang\.com$/i,       studio: 'spankbang' },
  { host: /\bredtube\.com$/i,         studio: 'redtube',          network: 'mindgeek' },
  { host: /\byouporn\.com$/i,         studio: 'youporn',          network: 'mindgeek' },
  { host: /\beporner\.com$/i,         studio: 'eporner' },
  { host: /\bporntrex\.com$/i,        studio: 'porntrex' },

  // ─── Amateur platforms ────────────────────────────────────────────
  { host: /\bonlyfans\.com$/i,        studio: 'onlyfans' },
  { host: /\bfansly\.com$/i,          studio: 'fansly' },
  { host: /\bmanyvids\.com$/i,        studio: 'manyvids' },
  { host: /\bchaturbate\.com$/i,      studio: 'chaturbate' },
  { host: /\bstripchat\.com$/i,       studio: 'stripchat' },
  { host: /\bmyfreecams\.com$/i,      studio: 'myfreecams' },
  { host: /\bcamsoda\.com$/i,         studio: 'camsoda' },
  { host: /\bcam4\.com$/i,            studio: 'cam4' },
  { host: /\bbongacams\.com$/i,       studio: 'bongacams' },
  { host: /\bflirt4free\.com$/i,      studio: 'flirt4free' },

  // ─── JAV ──────────────────────────────────────────────────────────
  { host: /\bcaribbeancom\.com$/i,    studio: 'caribbeancom',     network: 'jav' },
  { host: /\b1pondo\.tv$/i,           studio: '1pondo',           network: 'jav' },
  { host: /\bheyzo\.com$/i,           studio: 'heyzo',            network: 'jav' },
  { host: /\btokyo-?hot\.com$/i,      studio: 'tokyo hot',        network: 'jav' },
  { host: /\bpacopacomama\.com$/i,    studio: 'pacopacomama',     network: 'jav' },
  { host: /\bdmm\.co\.jp$/i,          studio: 'dmm',              network: 'jav' },
  { host: /\bjavdb\.com$/i,           studio: 'javdb',            network: 'jav' },
]

/**
 * Recognize a studio from a source URL. Returns null when no pattern
 * matches the hostname. Use the result to:
 *   - tag the media with `studio:<name>`
 *   - tag with `network:<network>` when known
 *   - pin Venice's title-style toward the studio's house style
 */
export function recognizeStudioFromUrl(url: string): StudioMatch | null {
  if (!url || typeof url !== 'string') return null
  let host: string
  let pathname: string
  try {
    const u = new URL(url)
    host = u.hostname.replace(/^www\./, '')
    pathname = u.pathname
  } catch {
    return null
  }
  for (const p of STUDIO_PATTERNS) {
    if (!p.host.test(host)) continue
    let identifier: string | undefined
    if (p.idPath) {
      const m = p.idPath.exec(pathname)
      if (m) identifier = m[1]
    }
    return {
      studio: p.studio,
      network: p.network,
      hasIdentifier: !!identifier,
      identifier,
    }
  }
  return null
}

/**
 * Render a studio match as tag names ready to apply via
 * `addTagToMedia`. Always prefixes with `studio:` / `network:` so the
 * Library tag tree groups them cleanly.
 */
export function studioMatchToTagNames(match: StudioMatch): string[] {
  const out: string[] = [`studio:${match.studio}`]
  if (match.network && match.network !== match.studio) {
    out.push(`network:${match.network}`)
  }
  return out
}

/** Convenience: scan a free-form string for embedded URLs (e.g. an
 *  AI description or a media's `comment` field) and return the FIRST
 *  studio match. Useful for backfilling old media that didn't capture
 *  a source URL at scan time. */
export function recognizeStudioInText(text: string): StudioMatch | null {
  if (!text) return null
  const urlRe = /\bhttps?:\/\/[^\s<>"']+/gi
  let m: RegExpExecArray | null
  while ((m = urlRe.exec(text)) !== null) {
    const match = recognizeStudioFromUrl(m[0])
    if (match) return match
  }
  return null
}

/** Diagnostic: how many studio patterns are configured. Surface in
 *  the Setup tab so users can see Vault recognizes ~80+ studios out
 *  of the box. */
export function getStudioPatternCount(): number {
  return STUDIO_PATTERNS.length
}
