// ===============================
// File: src/main/services/ai-intelligence/filename-hints.ts
//
// Phase D — Filename keyword hints. Ported from content_analyzer/analyzer.py:267-340.
//
// We diverged from analyzer.py's design in one important way: it produced a single
// CATEGORY winner via priority resolution. Vault is many-to-many tag-based, so we
// emit a *flat list of hint tags* keyed by the same vocabulary the Tier 2 prompt
// already speaks. The hints are passed to Venice as additional context — the model
// is free to ignore them, but they reduce hallucination on gibberish frames.
// ===============================

export interface FilenameHints {
  /** Lowercase tag names that the filename strongly suggests are present. */
  tags: string[]
  /** Raw matched keywords for debugging / surfacing in the review pane. */
  matchedKeywords: string[]
  /** Heuristic flags the prompt can use to bias analysis. */
  flags: {
    likelyAnimated: boolean
    likelyAudioOnly: boolean
    likelyGay: boolean
    likelyMaleSolo: boolean
    likelyLesbian: boolean
    likelyTrans: boolean
    likelyPov: boolean
    likelyAmateur: boolean
  }
}

/**
 * Map of bucket → keywords. A bucket is a grouping convenient for tag emission;
 * the produced tags are listed below each entry.
 *
 * Order of declaration is roughly priority — earlier buckets fire flags that
 * Tier 2 should weigh more heavily (e.g., Hentai is a content-format flag).
 */
// YAPO-e-plus inspired: per-bucket exclusion keywords. When the
// excluded keyword is present in the filename, the bucket DOESN'T fire
// even if a positive keyword matched. Fixes false positives like
// "floral" matching "oral", "shemale" matching "male", "transformation"
// matching "trans". Maintained alongside the positive keywords so the
// pairing is auditable.
const KEYWORD_BUCKETS: Array<{
  bucket: string
  keywords: string[]
  emitTags: string[]
  excludeIfPresent?: string[]
}> = [
  // ─── Content format ─────────────────────────────────────────────────────────
  {
    bucket: 'animated',
    keywords: [
      'hentai', 'anime', 'cartoon', 'animated', 'drawn', '3d render', 'sfm',
      'blender', 'mlp', 'pony', 'furry', 'rule34', 'r34', 'overwatch',
      'fortnite', 'genshin', 'pokemon', 'digimon', 'dragon ball', 'naruto',
      'one piece', 'jav anime', 'koikatsu', 'honey select', 'illusion'
    ],
    emitTags: ['hentai', 'animated']
  },
  {
    bucket: 'audio-only',
    keywords: [
      'asmr', 'audio only', 'sound only', 'no video', 'moaning', 'wet sounds',
      'fap audio', 'joi audio', 'hypno audio'
    ],
    emitTags: ['sound only', 'audio only']
  },

  // ─── Performer identity ─────────────────────────────────────────────────────
  {
    bucket: 'gay',
    keywords: [
      'gay ', ' gay', 'yaoi', 'm/m', ' mm ', 'male x male', 'bara',
      'muscle worship', 'jock ', 'daddy ', 'men.com', 'sean cody', 'corbin fisher'
    ],
    emitTags: ['gay']
  },
  {
    bucket: 'twink',
    keywords: ['twink', 'femboy', 'sissy', 'trap ', 'crossdress', 'slim boy', 'young male'],
    emitTags: ['twink']
  },
  {
    bucket: 'bear',
    keywords: ['bear ', ' bear', 'chub', 'chubby male', 'hairy male', 'otter ', 'daddy bear'],
    emitTags: ['bear']
  },
  {
    bucket: 'male-solo',
    keywords: [
      'male solo', 'solo male', 'guy jerking', 'cock stroking', 'fleshlight',
      'male masturbat', 'jerking off', 'cum shot solo', 'self suck'
    ],
    emitTags: ['male solo', 'masturbation']
  },
  {
    bucket: 'trans',
    keywords: [
      'trans ', ' trans', 'shemale', 'ladyboy', 'tgirl', 't-girl', 'tranny',
      'futanari', 'futa', 'dickgirl', 'newhalf', ' ts ', 'ts '
    ],
    emitTags: ['trans'],
    // "transformation", "transfer", "transparent", "transport" all
    // contain "trans" but have nothing to do with trans content. Same
    // for "tsundere" / TS as a roleplay genre. Borrowed from YAPO-e-plus.
    excludeIfPresent: [
      'transformation', 'transfer', 'transparent', 'transcript',
      'transport', 'transmission', 'transit', 'transition',
      'tsundere',
    ]
  },
  {
    bucket: 'lesbian',
    keywords: [
      'lesbian', 'yuri', 'f/f', ' ff ', 'girl on girl', 'girls only',
      'tribbing', 'scissor', 'strap on', 'strapon', 'dyke'
    ],
    emitTags: ['lesbian']
  },

  // ─── Group size ────────────────────────────────────────────────────────────
  {
    bucket: 'gangbang',
    keywords: ['gangbang', 'gang bang', 'bukakke', 'bukkake', 'gokkun', 'group sex'],
    emitTags: ['gangbang']
  },
  {
    bucket: 'threesome',
    keywords: ['threesome', 'three way', '3way', '3some', 'ffm', 'mmf', 'mff', 'fmf'],
    emitTags: ['threesome']
  },

  // ─── Actions ───────────────────────────────────────────────────────────────
  {
    bucket: 'anal',
    keywords: ['anal', 'ass fuck', 'butt fuck', 'sodomy', 'gape ', 'atm ', 'a2m', 'ass to mouth'],
    emitTags: ['anal'],
    excludeIfPresent: ['banal', 'canal', 'analysis']
  },
  {
    bucket: 'blowjob',
    keywords: [
      'blowjob', 'bj ', 'suck', 'deepthroat', 'face fuck', 'throat',
      'oral male', 'cock suck', 'dick suck', 'mouth fuck'
    ],
    emitTags: ['blowjob']
  },
  {
    bucket: 'cunnilingus',
    keywords: [
      'cunnilingus', 'pussy lick', 'eat out', 'eating pussy', 'face sitting',
      'oral female', 'licking pussy', 'pussy eating'
    ],
    emitTags: ['cunnilingus']
  },
  {
    bucket: 'creampie',
    keywords: ['creampie', 'cream pie', 'internal cum', 'cum inside', 'breeding'],
    emitTags: ['creampie']
  },
  {
    bucket: 'squirt',
    keywords: ['squirt', 'squirting', 'gush ', 'female ejaculation'],
    emitTags: ['squirt']
  },

  // ─── Context / setting ─────────────────────────────────────────────────────
  {
    bucket: 'bdsm',
    keywords: [
      'bdsm', 'bondage', 'dom ', 'sub ', 'slave', 'master', 'mistress', 'whip',
      'spank', 'paddle', 'collar', 'leash', 'tied', 'bound', 'rope', 'shibari'
    ],
    emitTags: ['bdsm']
  },
  {
    bucket: 'fetish',
    keywords: [
      'fetish', 'foot', 'feet', 'piss', 'pee', 'golden shower', 'latex',
      'leather', 'rubber', 'balloon ', 'food play', 'wax', 'tickle', 'smell'
    ],
    emitTags: ['fetish']
  },
  {
    bucket: 'public',
    keywords: ['public', 'outdoor', 'outside', 'exhibitionist', 'flash', 'caught'],
    emitTags: ['public']
  },
  {
    bucket: 'pov',
    keywords: ['pov', 'point of view', 'first person', 'your view'],
    emitTags: ['pov']
  },
  {
    bucket: 'cosplay',
    keywords: ['cosplay', 'costume', 'roleplay', 'character'],
    emitTags: ['cosplay']
  },
  {
    bucket: 'amateur',
    keywords: ['amateur', 'homemade', 'home made', 'real couple', 'cam ', 'webcam'],
    emitTags: ['amateur']
  },

  // ─── Demographics ──────────────────────────────────────────────────────────
  {
    bucket: 'milf',
    keywords: ['milf', 'mature', 'cougar', 'mom ', 'stepmom', 'older woman'],
    emitTags: ['milf']
  },
  {
    bucket: 'teen',
    keywords: ['teen', '18yo', '18 year', 'young', 'barely legal', 'schoolgirl'],
    emitTags: ['teen']
  },
  {
    bucket: 'asian',
    keywords: ['asian', 'japanese', 'jav', 'korean', 'chinese', 'thai', 'filipina'],
    emitTags: ['asian']
  },
  {
    bucket: 'ebony',
    keywords: ['ebony', 'black girl', 'blacked '],
    emitTags: ['ebony']
  },
  {
    bucket: 'latina',
    keywords: ['latina', 'latin ', 'colombian', 'brazilian', 'mexican'],
    emitTags: ['latina']
  },
  {
    bucket: 'interracial',
    keywords: ['interracial', 'ir ', 'bbc ', 'bwc ', 'blacked'],
    emitTags: ['interracial']
  },
  {
    bucket: 'big-tits',
    keywords: ['big tits', 'big boobs', 'huge tits', 'busty', 'titty'],
    emitTags: ['big breasts']
  },
  {
    bucket: 'big-ass',
    keywords: ['big ass', 'pawg', 'thicc', 'phat ass', 'bubble butt'],
    emitTags: ['big ass']
  }
]

/** Strip extension, normalize separators to spaces, lowercase. */
function normalizeFilename(filename: string): string {
  const noExt = filename.replace(/\.[a-zA-Z0-9]{2,4}$/, '')
  return noExt.replace(/[._\-+]+/g, ' ').toLowerCase()
}

/**
 * Scan a filename for known content keywords and return tag hints.
 *
 * The substring match is intentionally simple — no regex, no fuzzy matching.
 * Surrounding spaces in keywords (e.g. `' ts '`) prevent false positives like
 * `transformers` matching `trans` — keep that pattern when adding new ones.
 */
export function extractFilenameHints(filename: string): FilenameHints {
  const norm = ` ${normalizeFilename(filename)} ` // pad with spaces for word boundary
  const tagSet = new Set<string>()
  const matched: string[] = []
  const flags: FilenameHints['flags'] = {
    likelyAnimated: false,
    likelyAudioOnly: false,
    likelyGay: false,
    likelyMaleSolo: false,
    likelyLesbian: false,
    likelyTrans: false,
    likelyPov: false,
    likelyAmateur: false
  }

  for (const { bucket, keywords, emitTags, excludeIfPresent } of KEYWORD_BUCKETS) {
    let bucketHit = false
    for (const kw of keywords) {
      if (norm.includes(kw)) {
        matched.push(kw.trim())
        bucketHit = true
      }
    }
    // YAPO-style exclusion check — bail if any disqualifying word is
    // present, even when a positive keyword matched. Prevents
    // "transformation" → trans, "banal" → anal, "floral" → oral.
    if (bucketHit && excludeIfPresent && excludeIfPresent.length > 0) {
      for (const ex of excludeIfPresent) {
        if (norm.includes(ex)) {
          bucketHit = false
          break
        }
      }
    }
    if (bucketHit) {
      for (const t of emitTags) tagSet.add(t)
      switch (bucket) {
        case 'animated': flags.likelyAnimated = true; break
        case 'audio-only': flags.likelyAudioOnly = true; break
        case 'gay': case 'twink': case 'bear': flags.likelyGay = true; break
        case 'male-solo': flags.likelyMaleSolo = true; break
        case 'lesbian': flags.likelyLesbian = true; break
        case 'trans': flags.likelyTrans = true; break
        case 'pov': flags.likelyPov = true; break
        case 'amateur': flags.likelyAmateur = true; break
      }
    }
  }

  return { tags: Array.from(tagSet), matchedKeywords: matched, flags }
}

/**
 * Render hints into a short text block suitable for injection into the Tier 2
 * Venice prompt. Returns an empty string when no hints fired (most common case
 * for already-clean filenames — we don't pollute the prompt then).
 */
export function renderHintsForPrompt(hints: FilenameHints): string {
  if (hints.tags.length === 0) return ''
  const lines: string[] = []
  lines.push('Filename hints (use as soft prior, not constraint):')
  lines.push(`  matched keywords: ${hints.matchedKeywords.slice(0, 12).join(', ')}`)
  lines.push(`  suggested tags:   ${hints.tags.slice(0, 10).join(', ')}`)
  const activeFlags = Object.entries(hints.flags)
    .filter(([, v]) => v)
    .map(([k]) => k)
  if (activeFlags.length) {
    lines.push(`  flags: ${activeFlags.join(', ')}`)
  }
  return lines.join('\n')
}

// ─── Studio detection ───────────────────────────────────────────────────────
//
// Ported from content_analyzer/analyzer.py:767-782. Rough heuristic — substring
// match against a known-studios list. Used to enrich title generation
// ("Brazzers — Latina MILF Rides…") and as an additional Venice prompt hint.

const KNOWN_STUDIOS = [
  // Major networks (Mindgeek + similar)
  'brazzers', 'bangbros', 'realitykings', 'naughtyamerica', 'pornhub',
  'xvideos', 'xhamster', 'redtube', 'youporn', 'tube8', 'spankbang',
  'eporner', 'porntrex', 'pornone',
  // Premium / boutique
  'blacked', 'blackedraw', 'tushy', 'tushyraw', 'vixen', 'deeper',
  'wicked', 'evilangel', 'kink', 'legalporno', 'lp', 'private',
  'dorcel', 'marc dorcel', 'hardx', 'julesjordan', 'jules jordan',
  'wickedpictures', 'digitalsin', 'elegantangel', 'newsensations',
  'darkx', 'milehighmedia', 'sweetsinner', 'lethalhardcore',
  // Reality / fake
  'mofos', 'digitalplayground', 'fakeagent', 'faketaxi', 'publicagent',
  'fakehospital', 'fakehub', 'fakeagentuk', 'czechcasting',
  // Team Skeet network
  'teamskeet', 'familystrokes', 'sislovesme', 'momswapped', 'shesnew',
  'stepsiblings', 'oye loca', 'bffs', 'dykedup', 'innocenthigh',
  'mylf', 'mylfx', 'thickumz',
  // Network families
  'sexyhub', 'girlsway', 'twistys', 'milfed', 'mylfdom', 'puretaboo',
  'gamelink', 'pegging girls', 'twistyshard',
  // Adult Time / Gamma / network
  'adulttime', 'adult time', 'transangels', 'transerotica', 'gender x',
  // Reality Kings sub-sites
  'momslickteens', 'monstercurves', 'cumfiesta', 'eurosexparties',
  // Anal specialists
  'analized', 'analmom', 'analsex', 'lethalhardcore', 'pornpros',
  // Asian
  'jav', 'caribbeancom', 'tokyohot', 'tokyo hot', 'pacopacomama',
  '1pondo', 'heyzo', 'dmm',
  // Common amateur platforms
  'onlyfans', 'fansly', 'manyvids', 'chaturbate', 'stripchat', 'cam4',
  'myfreecams', 'camsoda', 'jerkmate', 'flirt4free', 'bongacams',
  // Social
  'reddit', 'pornhub premium', 'snapchat', 'tiktok', 'instagram',
  // Indie creators / studios on the rise
  'lustcinema', 'lust cinema', 'meana wolf', 'sweetlianas',
  'czechav', 'czech vr', 'vrporn', 'vrhush', 'badoinkvr',
  // VR specific
  'naughtyamericavr', 'wankzvr', 'realitylovers', 'sexlikereal',
] as const

export function detectStudio(filename: string): string | null {
  const norm = normalizeFilename(filename)
  for (const studio of KNOWN_STUDIOS) {
    if (norm.includes(studio)) return studio
  }
  return null
}

// ─── Filename weirdness 3-way assessment ────────────────────────────────────
//
// Ported from content_analyzer/analyzer.py:2329-2419. Replaces the original
// binary `isGibberishFilename` with a 3-way decision:
//
//   - 'generate' — name is unusable (hash, UUID, all digits, mostly non-ASCII).
//                  Tier 2 should generate a fresh title from scratch.
//   - 'clean'    — name has meaningful content but is buried under junk
//                  patterns (date prefix/suffix, _copy, _final, vid_12345,
//                  quality markers). The cleaned version is returned alongside;
//                  the caller can skip Venice and just rename.
//   - 'ok'       — name is fine, pass it to Venice as a hint.
//
// The cleaned string for 'clean' action is returned as a hint to Venice OR
// (in the future) used directly to skip Venice when confidence is high enough.

export type FilenameAssessment =
  | { action: 'generate'; reason: string }
  | { action: 'clean'; cleaned: string; original: string }
  | { action: 'ok' }

const JUNK_DETECTION_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /^[\(\[\{]?\d+[\)\]\}]?$/, reason: 'pure number' },
  { re: /^[a-f0-9]{8,}$/i, reason: 'hash-like' },
  { re: /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}/i, reason: 'uuid' },
]

const JUNK_CLEAN_PATTERNS: Array<{ re: RegExp; replace: string }> = [
  { re: /[-_]?\d{4}[-_]\d{2}[-_]\d{2}([-_T]\d{2}[-_:]?\d{2}[-_:]?\d{2})?/gi, replace: '' },  // dates / iso timestamps
  { re: /[-_]?\d{8,}/g, replace: '' },                                                        // long numerics
  { re: /\s*\(\d+\)/g, replace: '' },                                                         // (1)
  { re: /\s*\[\d+\]/g, replace: '' },                                                         // [1]
  { re: /[-_](copy|final|edit|v\d+)\d*/gi, replace: '' },                                     // _copy / _final / _v2
  { re: /^(vid|video|clip|mov|img|movie|pmv)[-_]+/i, replace: '' },                           // junk prefixes
  { re: /[-_]+(hd|sd|fhd|uhd|4k|8k|720p?|1080p?|2160p?|480p?|360p?)([-_]|$)/gi, replace: ' ' },// quality markers
  { re: /[-_]+$|^[-_]+/g, replace: '' },                                                       // leading / trailing seps
]

export function assessFilename(filename: string): FilenameAssessment {
  const stem = filename.replace(/\.[^.]+$/, '')

  // Hard 'generate' patterns first.
  for (const { re, reason } of JUNK_DETECTION_PATTERNS) {
    if (re.test(stem)) return { action: 'generate', reason }
  }

  // Very short non-alpha names → generate.
  if (stem.length <= 3 && !stem.match(/^[a-z]+$/i)) {
    return { action: 'generate', reason: 'too short' }
  }

  // Mostly non-ASCII (>70% non-English chars) — not enough signal to clean.
  const asciiAlnum = (stem.match(/[a-z0-9]/gi) || []).length
  if (stem.length > 5 && asciiAlnum / stem.length < 0.3) {
    return { action: 'generate', reason: 'non-ascii' }
  }

  // Try the cleanup catalog. If anything strips, return 'clean' with the result.
  let cleaned = stem
  let stripped = false
  for (const { re, replace } of JUNK_CLEAN_PATTERNS) {
    const before = cleaned
    cleaned = cleaned.replace(re, replace)
    if (cleaned !== before) stripped = true
  }
  // Collapse separator runs and titlecase for a friendly result.
  cleaned = cleaned.replace(/[-_\s]+/g, ' ').trim()

  if (stripped && cleaned.length >= 3) {
    // Title-case-ish: capitalize words; preserve all-caps abbreviations.
    cleaned = cleaned
      .split(/\s+/)
      .map((w) => (w === w.toUpperCase() && w.length <= 4 ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
      .join(' ')
    return { action: 'clean', cleaned, original: stem }
  }

  // ≥60% digits with no ≥3-letter run → generate.
  const digitCount = (stem.match(/\d/g) || []).length
  const hasWord = /[a-z]{3,}/i.test(stem)
  if (digitCount / stem.length > 0.6 && !hasWord) {
    return { action: 'generate', reason: 'mostly digits' }
  }

  return { action: 'ok' }
}

// ─── Duration bucket hint ───────────────────────────────────────────────────
//
// Ported from content_analyzer/analyzer.py:580-607. Tells Venice what kind of
// content it's looking at by length so it doesn't try to summarize a 35-minute
// compilation as a single scene.

export function describeDurationBucket(durationSec: number | null | undefined): string | null {
  if (!durationSec || durationSec <= 0) return null
  if (durationSec < 15) return `Very short clip (${durationSec.toFixed(0)}s) — single moment, not a scene.`
  if (durationSec < 60) return `Short clip (${durationSec.toFixed(0)}s) — likely a highlight or excerpt.`
  if (durationSec < 300) return `Medium clip (${(durationSec / 60).toFixed(1)} min) — single scene or focused excerpt.`
  if (durationSec < 1200) return `Long video (${(durationSec / 60).toFixed(0)} min) — full scene with multiple positions.`
  if (durationSec < 1800) return `Full-length scene (${(durationSec / 60).toFixed(0)} min).`
  return `Very long video (${(durationSec / 60).toFixed(0)} min) — likely a compilation. Don't try to summarize as a single scene; describe the dominant content.`
}
