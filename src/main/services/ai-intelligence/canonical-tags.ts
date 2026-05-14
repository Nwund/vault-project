// ===============================
// File: src/main/services/ai-intelligence/canonical-tags.ts
//
// Canonical adult-tag vocabulary. This is the union of:
//   - Pornhub's public category taxonomy (~80 entries)
//   - The most-common 250 long-tail tags used across major adult sites
//     (xHamster / xVideos / Empornium / private trackers)
//   - Booru-style tags that translate cleanly to live-action
//   - Position / action / kink terms from the content_analyzer port
//
// The list is curated, not scraped — every entry is a tag that the user
// would plausibly want surfaced on a video. We use it for:
//
//   1. Tier 2 prompt vocabulary hint — Venice gets a reference list to
//      draw from instead of inventing odd phrasings.
//   2. Tag normalization — when AI returns a tag that's a near-match for
//      a canonical entry, we coerce it (so "Pussy Licking" → "cunnilingus"
//      and "BBC" → "interracial").
//   3. Tag-suggestion ranking — canonical entries are prioritized over
//      one-off model phrases of the same content.
// ===============================

/**
 * Master canonical list — flat, lowercase, no duplicates.
 *
 * Categorized in code-comment groups for readability; the consumer just
 * gets a Set. Add new entries at the bottom of the relevant category.
 */
export const CANONICAL_TAGS: ReadonlySet<string> = new Set([
  // ── Site categories (Pornhub-aligned) ──────────────────────────────────
  '60fps', 'amateur', 'anal', 'arab', 'asian', 'babe', 'babysitter', 'bbw',
  'behind the scenes', 'big ass', 'big dick', 'big tits', 'bisexual', 'blonde',
  'blowjob', 'bondage', 'brazilian', 'british', 'brunette', 'cartoon', 'casting',
  'celebrity', 'cfnm', 'chubby', 'college', 'compilation', 'cosplay', 'couple',
  'creampie', 'cuckold', 'cumshot', 'czech', 'double penetration', 'ebony',
  'euro', 'exclusive', 'feet', 'female orgasm', 'femdom', 'fetish', 'fingering',
  'fisting', 'french', 'funny', 'gangbang', 'gay', 'german', 'group', 'handjob',
  'hardcore', 'hd', 'hentai', 'indian', 'interracial', 'italian', 'japanese',
  'korean', 'latina', 'latino', 'lesbian', 'massage', 'masturbation', 'mature',
  'milf', 'old young', 'orgy', 'outdoor', 'parody', 'party', 'pissing', 'pmv',
  'point of view', 'pornstar', 'pov', 'public', 'pussy licking', 'reality',
  // (Pornhub lists hair colors as categories, but the user prefers hair color
  // stays in the title/filename — not as a tag. Intentionally removed:
  // 'blonde', 'brunette', 'redhead'.)
  'rough sex', 'russian', 'school', 'sex toys', 'small tits',
  'smoking', 'solo female', 'solo male', 'squirt', 'step fantasy', 'strap-on',
  'striptease', 'tattooed women', 'teen', 'threesome', 'trans', 'vintage',
  'webcam', 'wife', 'yoga',

  // ── Performer + body descriptors ───────────────────────────────────────
  // User 2026-05-09: "natural breasts" REMOVED — the size descriptor (big
  // tits / small tits / huge tits / flat chest) is what matters. Whether
  // they're natural or fake is a separate axis but most porn-site filtering
  // uses size, not naturalness. "fake breasts" stays for the explicit
  // "implants" filter.
  'big ass', 'big breasts', 'big tits', 'small breasts', 'small tits',
  'fake breasts', 'huge tits', 'huge breasts', 'flat chest',
  'busty', 'petite', 'curvy', 'thicc', 'pawg', 'bbw', 'ssbbw', 'skinny', 'slim',
  'athletic', 'fit', 'muscular', 'toned',
  'tattooed', 'pierced', 'nipple piercing', 'belly piercing', 'tongue piercing',
  'shaved pussy', 'hairy pussy', 'trimmed', 'big lips', 'plump lips',
  // Hair styling (NOT colors — colors are reserved for filename/title only,
  // never tagged. User feedback 2026-05-09: "no hair color tags... those
  // things should be reserved for like titles not tags").
  'long hair', 'short hair', 'twintails', 'pigtails', 'ponytail', 'braids',
  'glasses', 'choker', 'collar',

  // ── Performer identity ─────────────────────────────────────────────────
  // Atomic single-word tags so the picker can combine them at filter time
  // instead of needing compound "solo female" entries (user request 2026-05-09).
  'female', 'male', 'solo', 'duo',
  'milf', 'gilf', 'teen', 'barely legal', 'mature', 'cougar', 'stepmom', 'mom',
  'stepsister', 'sister', 'stepdad', 'dad', 'stepson', 'stepdaughter',
  'aunt', 'uncle', 'cousin', 'niece', 'nephew',
  'wife', 'girlfriend', 'cheating wife', 'cheating gf', 'ex girlfriend',
  'twink', 'bear', 'jock', 'daddy', 'femboy', 'sissy',
  'asian', 'ebony', 'latina', 'white', 'mixed race', 'arab',
  // User specified 2026-05-09: "trans woman → MTF, trans man → FTM".
  // The canonical entry is the abbreviation; SYNONYMS in tier3 maps the
  // long form to it. "trans" stays as a generic when gender-direction unclear.
  'mtf', 'ftm',

  // ── Oral & related actions ─────────────────────────────────────────────
  'blowjob', 'sloppy blowjob', 'sloppy bj', 'two handed blowjob', 'deepthroat',
  'gagging', 'throat fuck', 'face fuck', 'mouth fuck', 'spit', 'drool',
  'cunnilingus', 'pussy eating', 'face sitting', 'queening', 'face riding',
  'rimjob', 'rimming', 'ass licking', 'anilingus', 'ass to mouth', 'atm',
  'a2m', 'oral creampie', 'cum in mouth', 'cim', 'cum swallow', 'swallow',
  'titjob', 'titty fuck', 'paizuri', 'footjob', 'handjob', 'tug', 'edging',

  // ── Penetration & action ───────────────────────────────────────────────
  'vaginal sex', 'pussy fucking', 'pussy pounding', 'rough sex', 'hard fuck',
  'pounding', 'jackhammering', 'balls deep', 'deep penetration', 'gentle sex',
  'passionate sex', 'lovemaking', 'sensual',
  'anal', 'anal sex', 'anal penetration', 'butt fuck', 'sodomy', 'gape',
  'ass to ass', 'anal training', 'anal stretching', 'prolapse',
  'double penetration', 'dp', 'double anal', 'double vaginal', 'airtight',
  'spitroast', 'eiffel tower', 'sandwich',
  'creampie', 'internal cumshot', 'cum dripping', 'cum drip', 'breeding',
  'facial', 'cumshot', 'money shot', 'cum on face', 'cum on tits', 'cum on ass',
  'cum on body', 'cum on belly', 'cum kiss', 'snowball',
  'squirting', 'female ejaculation', 'gushing',
  'multiple orgasms', 'orgasm', 'female orgasm', 'male orgasm', 'mutual orgasm',
  // Solo / partner manual stim. Per user 2026-05-09:
  //   - "fingering" = finger penetration (anyone performing on a vagina).
  //     For solo, combine "solo + female + masturbation + fingering".
  //   - "clit rubbing" = external clit stimulation only, no penetration.
  //     Combine "solo + female + masturbation + clit rubbing".
  //   - The "masturbation" tag covers solo regardless of method; act-tags
  //     ("fingering" / "clit rubbing") layer on top.
  'mutual masturbation', 'fingering', 'g-spot', 'clit play', 'clit rubbing',

  // ── Positions ──────────────────────────────────────────────────────────
  'missionary', 'cowgirl', 'reverse cowgirl', 'doggystyle', 'doggy', 'spooning',
  'standing', 'standing doggy', 'against wall', 'amazon position',
  'piledriver', 'pile driver', 'wheelbarrow', 'flying', 'lotus',
  'face down ass up', 'fdau', 'prone bone', 'side fuck', 'scissors', 'tribbing',
  '69', 'sixty-nine', 'mfm', 'ffm', 'mmf', 'fff', 'mmm',

  // ── Kink / fetish / dynamics ───────────────────────────────────────────
  'bdsm', 'bondage', 'rope bondage', 'shibari', 'suspension', 'tied up',
  'discipline', 'spanking', 'whipping', 'paddling', 'caning',
  'dominance', 'dominant', 'dom', 'master', 'mistress', 'top',
  'submission', 'submissive', 'sub', 'slave', 'pet play', 'puppy play',
  'ddlg', 'mdlb', 'caregiver', 'little',
  'femdom', 'malesub', 'cuckold', 'cuckquean', 'hotwife', 'sissification',
  'feminization', 'forced fem', 'crossdressing',
  'foot fetish', 'foot worship', 'toe sucking', 'foot job',
  'piss', 'pissing', 'golden shower', 'watersports',
  'humiliation', 'degradation', 'name calling', 'verbal humiliation',
  'praise kink', 'orgasm denial', 'edging', 'ruined orgasm', 'tease and deny',
  'gangbang', 'breeding', 'bukkake', 'gokkun', 'cum dump', 'used',
  'roleplay', 'cosplay', 'maid', 'nurse', 'teacher', 'schoolgirl', 'secretary',
  'taboo', 'incest fantasy', 'family fantasy', 'step fantasy',
  'public sex', 'exhibitionism', 'flashing', 'voyeurism', 'caught', 'getting caught',

  // ── Sex toys / props ───────────────────────────────────────────────────
  'dildo', 'vibrator', 'magic wand', 'fleshlight', 'pocket pussy', 'butt plug',
  'anal beads', 'strap-on', 'strap on', 'fucking machine', 'sybian',
  'cock ring', 'sounding rod', 'gag', 'ball gag', 'nipple clamps', 'clamps',
  'collar', 'leash', 'chain', 'restraints', 'cuffs', 'rope',

  // ── Setting / context ──────────────────────────────────────────────────
  // Slimmed 2026-05-09: drop generic room scenes (bedroom/kitchen/living room
  // etc.) — they read as captioner output, not porn-site tags. Keep settings
  // that ARE real porn-site categories.
  'outdoor', 'public', 'beach', 'pool', 'shower', 'car', 'parking lot',
  'hotel room', 'motel', 'rooftop',

  // ── Format / production ────────────────────────────────────────────────
  // (Bare "studio" is junk — see CAPTIONER_NOISE — but "studio production"
  // type contexts get caught upstream. "snapchat" 2026-05-09: user wants
  // this as a tag, with AI watching for Snapchat UI cues in frames.)
  'pov', 'first person', 'amateur', 'homemade', 'home video', 'professional',
  'high production', 'low quality', 'retro', 'vintage', '80s', '90s',
  'pmv', 'hmv', 'compilation', 'highlight reel', 'best of',
  'snapchat', 'tiktok', 'onlyfans', 'webcam', 'live stream', 'selfie',
  // Drawing-style umbrella tags. User 2026-05-09: ONLY these three
  // (hentai already above, animation / 3d added here). All other
  // drawing/animation jargon ("2d", "anime style", "sfm", "cgi", etc.) is
  // junk + redirected via SYNONYMS in tier3 to one of these.
  'animation', '3d',

  // ── Status / aesthetic tags ────────────────────────────────────────────
  'lingerie', 'underwear', 'panties', 'thong', 'bra', 'bralette', 'corset',
  'stockings', 'thigh highs', 'fishnets', 'pantyhose', 'garter belt',
  'high heels', 'stilettos', 'boots', 'latex', 'leather', 'rubber',
  'nylon', 'satin', 'lace',
  'naked', 'nude', 'topless', 'bottomless', 'undressing', 'striptease', 'strip',

  // ── Sound vocabulary (when audio analysis fires) ───────────────────────
  'moaning', 'screaming', 'whimpering', 'dirty talk', 'verbal', 'silent',
  'asmr', 'audio only', 'sound only', 'whispering',

  // ── Era / niche descriptors ────────────────────────────────────────────
  'milking', 'cowgirl', 'hucow', 'lactation', 'pregnant', 'pregnancy',
  'pegging', 'sissy', 'forced bi', 'mmf', 'first time', 'losing virginity',
  'casting couch', 'audition', 'fake casting', 'fake taxi', 'fake agent',
  'reality', 'caught masturbating', 'reluctant', 'consensual non-consent',

  // ── YouPorn / e621 vocab expansion (refs #222 / pOrNtology scrape +
  // conman-e621 furry corpus). Only tags that match Vault's existing
  // lay-term convention go here — clinical / junk vocab from the
  // reference lists is filtered. See feedback_tag_quality_rules.md
  // for the user's preference rules. ──────────────────────────────────
  // Outfits / aesthetics
  'fishnet', 'nylons', 'spandex', 'transparent', 'glamour', 'softcore',
  'flexi', 'contortion', 'catsuit', 'lycra', 'panty fetish',
  // Acts (canonical lay terms; deduped against existing set)
  'deepthroat', 'facefuck', 'jerkoff', 'dicksucking', 'rim job',
  'gloryhole', 'flashing', 'exhibitionism',
  // Composition / context
  'orgy', 'party', 'gangbang', 'double dong', 'double penetration', 'dp',
  'cum swallowing', 'monsterjuggs', 'plumper', 'xxl', 'big tits',
  'small tits', 'midget', 'native', 'oriental',
  // Femdom / D-s
  'femdom', 'worship', 'foot worship', 'bondage', 'cuckold', 'swinger',
  'cfnm', 'bukkake',
  // Roles / scenes
  'roleplay', 'nurse', 'doctor', 'speculum', 'gyno', 'theater', 'dogging',
  'cruising', 'spring break', 'sorority', 'students', 'graduation',
  'naked', 'teenager', 'flexible', 'machine fuck', 'fucking machine',
  'celebrity',
  // Anthro / e621 (furry) — used by the future e621-tagger pass.
  'anthro', 'furry', 'feral', 'kemono', 'fursuit',

  // ── nsfw-image-urls 150-category sampler (ref #214). Underscore-
  // delimited categories from cooperdk's 3M-URL training set. Most
  // overlap with what we have; these are new additions only. ────────
  'aerial view', 'arched back', 'arms behind back', 'arms tied',
  'art', 'artistic', 'athletic body', 'bald',
  'barefoot', 'beach', 'beard', 'biceps',
  'bikini', 'birthday', 'biting lip', 'blowing kiss',
  'body painting', 'bodysuit', 'braids', 'bound',
  'bra and panties', 'bunny ears', 'butterfly tattoo', 'cake',
  'choker', 'cleavage', 'club', 'cocktail',
  'cosplay', 'crop top', 'curly hair', 'cute',
  'dark hair', 'dark skin', 'denim', 'dorm',
  'dress', 'eye contact', 'face down', 'fake nails',
  'flexing', 'flowers', 'food play', 'four girls',
  'french kiss', 'glasses', 'green eyes', 'gym',
  'hair pulling', 'hairbrush', 'hairy', 'happy',
  'hat', 'hawaiian', 'heart', 'hotel',
  'innocent', 'insertion', 'jacket', 'jeans',
  'jewelry', 'kitchen', 'laughing', 'leash',
  'leopard print', 'library', 'lipstick', 'long hair',
  'looking at viewer', 'mask', 'mature', 'mesh',
  'mirror', 'model', 'mouth open', 'multiple girls',
  'museum', 'natural', 'navel', 'nerdy',
  'office', 'oiled', 'on knees', 'open mouth',
  'pale skin', 'park', 'piercing', 'pillow',
  'piano', 'pink', 'pool', 'puffy nipples',
  'red dress', 'red hair', 'red lipstick', 'restaurant',
  'sand', 'school', 'see through', 'selfie',
  'shaved', 'short hair', 'shower', 'side view',
  'skirt', 'sleepy', 'smile', 'snow',
  'soft', 'sports', 'spread legs', 'stairs',
  'stockings only', 'street', 'striped', 'sun',
  'sunglasses', 'sunset', 'sweat', 'swimming pool',
  'tan lines', 'tattoo', 'tea', 'tied up',
  'tight', 'tongue out', 'topless beach', 'tribal',
  'twins', 'umbrella', 'undressed', 'uniform schoolgirl',
  'vase', 'vintage', 'voluptuous', 'water',
  'wedding', 'white skin', 'window', 'wink',
  'wrap', 'yoga', 'yoga pants', 'young adult',
])

/**
 * Quick lookup utilities. These are the only public API; SYNONYMS are
 * intentionally kept in tier3-tag-matcher for matchType='synonym' hits,
 * while CANONICAL_TAGS here is the full vocabulary set for normalization
 * + prompt injection.
 */

/** Is this string an exact canonical tag? */
export function isCanonicalTag(name: string): boolean {
  return CANONICAL_TAGS.has(String(name).trim().toLowerCase())
}

/**
 * Compact prompt-friendly string of high-signal canonical tags. We only
 * ship the ~120 most-impactful ones in the Tier 2 prompt to keep token
 * cost low. The rest still drive normalization downstream.
 */
const PROMPT_PRIORITY_SUBSET = [
  // Performer identity
  'milf', 'teen', 'mature', 'stepmom', 'stepsister', 'wife', 'cheating gf',
  'asian', 'ebony', 'latina',
  // Body
  'busty', 'petite', 'curvy', 'pawg', 'thicc', 'big ass', 'big tits',
  'small tits', 'natural breasts', 'fake breasts', 'tattooed',
  // (hair color tags removed per user preference — title/filename only)
  // Oral
  'blowjob', 'deepthroat', 'sloppy blowjob', 'face fuck', 'cunnilingus',
  'face sitting', 'rimming', 'ass to mouth',
  // Penetration
  'vaginal sex', 'pussy pounding', 'anal', 'gape', 'double penetration', 'dp',
  'creampie', 'facial', 'cumshot', 'cum on tits', 'squirting',
  // Positions
  'missionary', 'cowgirl', 'reverse cowgirl', 'doggystyle', 'prone bone',
  'standing', '69', 'face down ass up',
  // Group
  'threesome', 'gangbang', 'mfm', 'ffm', 'spitroast',
  // Kink
  'bdsm', 'bondage', 'spanking', 'femdom', 'submissive', 'rough sex',
  'edging', 'praise kink', 'humiliation', 'cuckold', 'taboo',
  // POV/format
  'pov', 'amateur', 'professional', 'public sex', 'voyeur',
  // Setting
  'bedroom', 'bathroom', 'shower', 'kitchen', 'office', 'outdoor', 'car',
  // Toys
  'dildo', 'vibrator', 'magic wand', 'strap-on', 'butt plug', 'fucking machine',
  // Aesthetic
  'lingerie', 'stockings', 'fishnets', 'high heels', 'latex', 'leather',
  // Other niches
  'pissing', 'piss', 'breeding', 'pregnant', 'lactation', 'pegging',
  'first time', 'caught masturbating', 'sissy', 'femboy', 'trans',
]

export function getCanonicalPromptVocabulary(): string {
  return PROMPT_PRIORITY_SUBSET.join(', ')
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPOUND-TO-ATOMS DECOMPOSITION
//
// User preference (2026-05-09): tags should be atomic where possible so the
// picker can combine them. "facial close up" should emit "facial" + "close up"
// as separate tags; selecting both gives the same result as one compound tag.
//
// We DON'T blindly split every multi-word tag, because a few are real
// porn-site canonical compounds whose meaning is non-decomposable
// ("step mom", "double penetration", "face fuck"). Those stay whole.
// Everything else: emit the full normalized form AND any atomic canonical
// words found inside it.
// ─────────────────────────────────────────────────────────────────────────────
const NON_DECOMPOSABLE_COMPOUNDS = new Set([
  'step mom', 'step sister', 'step dad', 'step son', 'step daughter',
  'step fantasy', 'cheating wife', 'cheating gf', 'ex girlfriend',
  'double penetration', 'face fuck', 'face sitting', 'face riding',
  'cum dump', 'cum kiss', 'cum dripping',
  'reverse cowgirl', 'prone bone', 'face down ass up',
  'old young', 'first time', 'losing virginity', 'rough sex', 'gentle sex',
  'casting couch', 'fake taxi', 'fake casting', 'fake agent',
  'cock ring', 'magic wand', 'butt plug', 'fucking machine',
  'point of view', 'home video', 'pet play', 'puppy play',
  'high heels', 'thigh highs', 'garter belt',
])

// Atomic words worth surfacing as their own tags when found inside a compound.
// These are NOT all of CANONICAL_TAGS — only the ones that work well solo
// (e.g. "facial" alone is a valid tag; "fantasy" alone isn't).
const ATOMIC_WORDS = new Set([
  // Actions / events
  'facial', 'creampie', 'cumshot', 'blowjob', 'handjob', 'footjob', 'titjob',
  'rimjob', 'rimming', 'deepthroat', 'gagging', 'spit', 'drool', 'swallow',
  'fingering', 'masturbation', 'pegging', 'fisting', 'pissing', 'breeding',
  'edging', 'squirting', 'gangbang', 'orgy', 'bukkake',
  'anal', 'oral', 'vaginal',
  // Positions
  'missionary', 'cowgirl', 'doggystyle', 'spooning', 'standing', '69',
  'piledriver',
  // Performer atoms
  'female', 'male', 'solo', 'duo', 'milf', 'teen', 'mature', 'wife',
  'asian', 'ebony', 'latina', 'arab', 'pornstar', 'amateur', 'lesbian', 'gay',
  'trans', 'femboy', 'sissy',
  // Body atoms
  'busty', 'petite', 'curvy', 'pawg', 'thicc', 'bbw', 'tattooed', 'pierced',
  'pregnant',
  // Modifiers people pick atomically
  'rough', 'gentle', 'sloppy', 'wet', 'public', 'outdoor', 'pov',
  'bondage', 'spanking', 'humiliation', 'dominant', 'submissive',
  // Format
  'compilation', 'pmv', 'hmv', 'hentai', 'cosplay', 'roleplay',
  // Clothing/aesthetic
  'lingerie', 'stockings', 'fishnets', 'latex', 'leather', 'naked', 'nude',
  // Photography modifiers — close-up is a real porn-site tag (the user
  // combines "close up" + "facial" in the picker to filter for "facial
  // close up" content). "wide shot" / "medium shot" stay banned (filter
  // by isJunkTag).
  'close up', 'closeup', 'close-up',
  // Context modifiers people pair with other tags ("public solo",
  // "public bbc", "amateur homemade").
  'public', 'amateur', 'professional',
])

// ─────────────────────────────────────────────────────────────────────────────
// CO-SUGGESTIONS
//
// User 2026-05-09: when AI tags X, suggest related Y/Z. The picker should
// surface implied atoms so a "solo + masturbation" detection also surfaces
// the gender + likely act tags. Two flavors:
//
//   1. SUGGEST_PROMPT_HINTS — sent to Venice in the per-frame prompt so the
//      model is reminded that "if you see masturbation, also consider
//      female/fingering/clit rubbing".
//   2. SUGGEST_AUTO_ATOMS — Tier 3 auto-adds these as low-confidence
//      suggestions (NOT auto-applied) when the seed tag is matched. The
//      user reviews them in the suggestion column.
//
// Don't over-suggest — only seed→atoms relationships strong enough that
// a porn-site tagger would tag the seed with the suggested atom 70%+ of
// the time. Padding the suggestion list with weak correlations just
// creates review noise.
// ─────────────────────────────────────────────────────────────────────────────
export const TAG_COSUGGESTIONS: ReadonlyMap<string, ReadonlyArray<string>> = new Map([
  // Solo female masturbation cluster — user's worked example 2026-05-09.
  ['masturbation', ['solo']],
  ['solo female', ['female', 'solo', 'masturbation']],
  ['fingering', ['masturbation']],
  ['clit rubbing', ['masturbation', 'clit play']],
  ['squirting', ['orgasm']],

  // Couple / partnered acts imply the partnership atoms.
  ['vaginal sex', ['penetration']],
  ['anal sex', ['penetration', 'anal']],
  ['blowjob', ['oral']],
  ['cunnilingus', ['oral']],
  ['rimming', ['oral']],
  ['69', ['oral', 'mutual']],

  // Position implies penetration mode.
  ['missionary', ['vaginal sex']],
  ['cowgirl', ['vaginal sex']],
  ['reverse cowgirl', ['vaginal sex']],
  ['doggystyle', ['vaginal sex']],
  ['prone bone', ['vaginal sex']],
  ['amazon', ['vaginal sex']],

  // Group configs imply count atoms.
  ['threesome', ['group']],
  ['gangbang', ['group']],
  ['mfm', ['threesome']],
  ['ffm', ['threesome']],
  ['mmf', ['threesome']],
  ['fff', ['threesome', 'lesbian']],
  ['orgy', ['group']],

  // Drawing modes always imply the drawing axis.
  ['hentai', ['animation']],
  ['3d', ['animation']],

  // Format / source cues
  ['snapchat', ['amateur']],
  ['tiktok', ['amateur']],
  ['onlyfans', ['amateur']],
  ['webcam', ['amateur']],

  // Aesthetic clusters
  ['lingerie', ['underwear']],
  ['stockings', ['lingerie']],
  ['fishnets', ['lingerie']],
  ['latex', ['fetish']],
  ['leather', ['fetish']],

  // Kink / dynamic implications
  ['bondage', ['bdsm']],
  ['rope bondage', ['bondage', 'bdsm']],
  ['shibari', ['bondage', 'bdsm']],
  ['spanking', ['bdsm']],
  ['femdom', ['female dominant']],
  ['cuckold', ['cheating']],

  // Body / performer descriptors
  ['pawg', ['big ass', 'white']],
  ['bbw', ['curvy']],
  ['milf', ['mature']],
  ['stepmom', ['milf', 'taboo']],
  ['stepsister', ['teen', 'taboo']],
])

/**
 * Returns implied atoms for a given canonical tag, or [] if none. Used by
 * Tier 3 to add suggestion entries and by Tier 2 to seed prompt hints.
 */
export function getCoSuggestions(name: string): readonly string[] {
  return TAG_COSUGGESTIONS.get(String(name).trim().toLowerCase()) ?? []
}

/**
 * Given a normalized canonical name, return the set of atomic tags it
 * decomposes into.
 *
 * Behavior:
 *  - If in NON_DECOMPOSABLE_COMPOUNDS → return [t] only.
 *  - Else find atomic constituents (multi-word atoms first, then single
 *    words).
 *  - If the found atoms COVER every word of the compound, drop the
 *    compound and return JUST the atoms — user prefers atoms only when
 *    the compound is fully separable. ("facial close up" → ["facial",
 *    "close up"], not ["facial close up", "facial", "close up"].)
 *  - Otherwise return [compound, ...atoms] so the compound stays
 *    available as a tag too (e.g. "spread legs" stays whole because
 *    "spread"/"legs" aren't atomic).
 *
 * Examples:
 *   "facial close up" → ["facial", "close up"]      (fully covered)
 *   "step mom"        → ["step mom"]                (non-decomposable)
 *   "sloppy blowjob"  → ["sloppy", "blowjob"]       (fully covered)
 *   "spread legs"     → ["spread legs"]             (not atomized)
 */
export function decomposeToAtoms(name: string): string[] {
  const t = String(name).trim().toLowerCase()
  if (!t) return []
  if (NON_DECOMPOSABLE_COMPOUNDS.has(t)) return [t]

  const atoms: string[] = []
  const seen = new Set<string>()
  // Track which positions in the source string have been covered by an atom.
  const tokens = t.split(/\s+/)
  const covered = new Array(tokens.length).fill(false)

  // Multi-word atoms first ("close up") so they claim adjacent tokens.
  for (const atom of ATOMIC_WORDS) {
    if (atom === t || !atom.includes(' ')) continue
    const atomTokens = atom.split(/\s+/)
    // Find a position in tokens where atomTokens occurs in sequence.
    for (let i = 0; i + atomTokens.length <= tokens.length; i++) {
      let match = true
      for (let j = 0; j < atomTokens.length; j++) {
        if (tokens[i + j] !== atomTokens[j]) { match = false; break }
      }
      if (match) {
        if (!seen.has(atom)) { atoms.push(atom); seen.add(atom) }
        for (let j = 0; j < atomTokens.length; j++) covered[i + j] = true
      }
    }
  }
  // Single-word atoms by token position.
  for (let i = 0; i < tokens.length; i++) {
    if (covered[i]) continue
    const w = tokens[i]
    if (ATOMIC_WORDS.has(w)) {
      if (!seen.has(w)) { atoms.push(w); seen.add(w) }
      covered[i] = true
    }
  }

  const fullyCovered = covered.every(Boolean) && atoms.length > 0

  if (fullyCovered) {
    // Atoms replace the compound entirely — user's atomic-tag preference.
    return atoms
  }

  // Partial / no atomic decomposition — keep the compound so the tag still
  // exists, with atoms appended for filterability.
  return atoms.length > 0 ? [t, ...atoms] : [t]
}

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORY MAP
//
// Maps each canonical tag → a UI-facing category bucket. Categories match the
// groups the AI Review pane already renders (action / position / performer /
// body / intensity / context / setting / other), plus a few more specific
// buckets (kink, format, clothing, toy, audio) the renderer can collapse into
// "other" if it doesn't have a dedicated row for them.
//
// We declare each category as an array of names (so the source-of-truth is
// readable) and build an O(1) lookup Map at module init.
// ─────────────────────────────────────────────────────────────────────────────
export type CanonicalCategory =
  | 'action'
  | 'position'
  | 'performer'
  | 'body'
  | 'hair'
  | 'kink'
  | 'setting'
  | 'format'
  | 'clothing'
  | 'toy'
  | 'audio'
  | 'intensity'
  | 'other'

const CATEGORIZED_TAGS: Record<CanonicalCategory, string[]> = {
  action: [
    'blowjob', 'sloppy blowjob', 'sloppy bj', 'two handed blowjob', 'deepthroat',
    'gagging', 'throat fuck', 'face fuck', 'mouth fuck', 'spit', 'drool',
    'cunnilingus', 'pussy eating', 'face sitting', 'queening', 'face riding',
    'rimjob', 'rimming', 'ass licking', 'anilingus', 'ass to mouth', 'atm', 'a2m',
    'oral creampie', 'cum in mouth', 'cim', 'cum swallow', 'swallow',
    'titjob', 'titty fuck', 'paizuri', 'footjob', 'handjob', 'tug', 'edging',
    'vaginal sex', 'pussy fucking', 'pussy pounding', 'pounding', 'jackhammering',
    'balls deep', 'deep penetration',
    'anal', 'anal sex', 'anal penetration', 'butt fuck', 'sodomy', 'gape',
    'ass to ass', 'anal training', 'anal stretching', 'prolapse',
    'double penetration', 'dp', 'double anal', 'double vaginal', 'airtight',
    'creampie', 'internal cumshot', 'cum dripping', 'cum drip', 'breeding',
    'facial', 'cumshot', 'money shot', 'cum on face', 'cum on tits', 'cum on ass',
    'cum on body', 'cum on belly', 'cum kiss', 'snowball',
    'squirting', 'squirt', 'female ejaculation', 'gushing',
    'multiple orgasms', 'orgasm', 'female orgasm', 'male orgasm', 'mutual orgasm',
    'mutual masturbation', 'fingering', 'g-spot', 'clit play', 'masturbation',
    'pussy licking', 'milking', 'lactation', 'pegging', 'fisting', 'pissing', 'piss',
    'gangbang', 'orgy', 'bukkake', 'gokkun', 'cum dump',
  ],
  position: [
    'missionary', 'cowgirl', 'reverse cowgirl', 'doggystyle', 'doggy', 'spooning',
    'standing', 'standing doggy', 'against wall', 'amazon position',
    'piledriver', 'pile driver', 'wheelbarrow', 'flying', 'lotus',
    'face down ass up', 'fdau', 'prone bone', 'side fuck', 'scissors', 'tribbing',
    '69', 'sixty-nine', 'spitroast', 'eiffel tower', 'sandwich',
    'mfm', 'ffm', 'mmf', 'fff', 'mmm',
  ],
  performer: [
    'female', 'male', 'solo', 'duo',
    'milf', 'gilf', 'teen', 'barely legal', 'mature', 'cougar',
    'stepmom', 'mom', 'stepsister', 'sister', 'stepdad', 'dad',
    'stepson', 'stepdaughter', 'aunt', 'uncle', 'cousin', 'niece', 'nephew',
    'wife', 'girlfriend', 'cheating wife', 'cheating gf', 'ex girlfriend',
    'twink', 'bear', 'jock', 'daddy', 'femboy', 'sissy',
    'asian', 'ebony', 'latina', 'white', 'mixed race', 'arab',
    'brazilian', 'british', 'czech', 'french', 'german', 'indian', 'italian',
    'japanese', 'korean', 'russian', 'latino', 'euro', 'pornstar',
    'amateur', 'celebrity', 'babe', 'babysitter', 'college', 'school',
    'schoolgirl', 'maid', 'nurse', 'teacher', 'secretary',
    'solo female', 'solo male', 'couple', 'lesbian', 'gay', 'bisexual',
    'trans', 'hotwife', 'cuckquean',
  ],
  body: [
    'big ass', 'big breasts', 'big tits', 'small breasts', 'small tits',
    'natural breasts', 'fake breasts', 'huge tits', 'huge breasts', 'flat chest',
    'busty', 'petite', 'curvy', 'thicc', 'pawg', 'bbw', 'ssbbw', 'chubby',
    'skinny', 'slim', 'athletic', 'fit', 'muscular', 'toned',
    'tattooed', 'tattooed women', 'pierced', 'nipple piercing', 'belly piercing',
    'tongue piercing', 'shaved pussy', 'hairy pussy', 'trimmed', 'big lips',
    'plump lips', 'big dick', 'feet', 'pregnant', 'pregnancy',
  ],
  // Hair colors intentionally excluded — see user preference 2026-05-09.
  // Only hair STYLING is here (length, ties, etc.).
  hair: [
    'long hair', 'short hair', 'twintails', 'pigtails', 'ponytail', 'braids',
  ],
  kink: [
    'bdsm', 'bondage', 'rope bondage', 'shibari', 'suspension', 'tied up',
    'discipline', 'spanking', 'whipping', 'paddling', 'caning',
    'dominance', 'dominant', 'dom', 'master', 'mistress', 'top',
    'submission', 'submissive', 'sub', 'slave', 'pet play', 'puppy play',
    'ddlg', 'mdlb', 'caregiver', 'little',
    'femdom', 'malesub', 'cuckold', 'sissification',
    'feminization', 'forced fem', 'crossdressing',
    'foot fetish', 'foot worship', 'toe sucking', 'foot job',
    'golden shower', 'watersports',
    'humiliation', 'degradation', 'name calling', 'verbal humiliation',
    'praise kink', 'orgasm denial', 'ruined orgasm', 'tease and deny',
    'roleplay', 'cosplay', 'taboo', 'incest fantasy', 'family fantasy', 'step fantasy',
    'public sex', 'exhibitionism', 'flashing', 'voyeurism', 'voyeur', 'caught',
    'getting caught', 'caught masturbating', 'reluctant', 'consensual non-consent',
    'first time', 'losing virginity', 'forced bi', 'used', 'fetish',
    'hucow', 'cfnm',
  ],
  setting: [
    'outdoor', 'public', 'beach', 'pool', 'shower', 'car', 'parking lot',
    'hotel room', 'motel', 'rooftop', 'massage', 'webcam', 'casting',
    'casting couch', 'audition', 'fake casting', 'fake taxi', 'fake agent',
    'reality', 'home video', 'homemade', 'studio', 'party',
  ],
  format: [
    'pov', 'first person', 'point of view', 'professional', 'high production',
    'low quality', 'retro', 'vintage', '80s', '90s',
    'pmv', 'hmv', 'compilation', 'highlight reel', 'best of', 'hd', '60fps',
    'cartoon', 'hentai', 'parody', 'behind the scenes', 'exclusive',
    'asmr', 'audio only', 'sound only',
  ],
  clothing: [
    'lingerie', 'underwear', 'panties', 'thong', 'bra', 'bralette', 'corset',
    'stockings', 'thigh highs', 'fishnets', 'pantyhose', 'garter belt',
    'high heels', 'stilettos', 'boots', 'latex', 'leather', 'rubber',
    'nylon', 'satin', 'lace', 'glasses', 'choker', 'collar',
    'naked', 'nude', 'topless', 'bottomless', 'undressing', 'striptease', 'strip',
    'smoking', 'yoga',
  ],
  toy: [
    'dildo', 'vibrator', 'magic wand', 'fleshlight', 'pocket pussy', 'butt plug',
    'anal beads', 'strap-on', 'strap on', 'fucking machine', 'sybian',
    'cock ring', 'sounding rod', 'gag', 'ball gag', 'nipple clamps', 'clamps',
    'leash', 'chain', 'restraints', 'cuffs', 'rope', 'sex toys',
  ],
  audio: [
    'moaning', 'screaming', 'whimpering', 'dirty talk', 'verbal', 'silent',
    'whispering',
  ],
  intensity: [
    'rough sex', 'hard fuck', 'gentle sex', 'passionate sex', 'lovemaking',
    'sensual', 'hardcore', 'funny',
  ],
  other: [
    'group', 'old young', 'interracial', 'wife', 'mature',
  ],
}

const CATEGORY_LOOKUP: Map<string, CanonicalCategory> = (() => {
  const m = new Map<string, CanonicalCategory>()
  // Build with priority order so a tag listed in two arrays gets the FIRST one.
  // Order matters here — action > position > performer > body > hair > kink >
  // setting > format > clothing > toy > audio > intensity > other.
  const order: CanonicalCategory[] = [
    'action', 'position', 'performer', 'body', 'hair', 'kink',
    'setting', 'format', 'clothing', 'toy', 'audio', 'intensity', 'other',
  ]
  for (const cat of order) {
    for (const name of CATEGORIZED_TAGS[cat]) {
      const key = name.trim().toLowerCase()
      if (!m.has(key)) m.set(key, cat)
    }
  }
  return m
})()

/**
 * Best-effort category lookup for a tag name. Returns the canonical category
 * if the name is in our vocabulary, otherwise null. Use this when inserting
 * a new tag row to populate `tags.category` so the AI Review pane and tag-bar
 * grouping can bucket it without needing to re-classify on every render.
 */
export function getCanonicalCategory(name: string): CanonicalCategory | null {
  const key = String(name).trim().toLowerCase()
  if (CATEGORY_LOOKUP.has(key)) return CATEGORY_LOOKUP.get(key)!

  // If the raw name isn't categorized, try the normalized form — handles
  // cases where Tier 3 created a tag from a slight variant the model emitted
  // before normalizeToCanonical() got applied (e.g. legacy rows pre-canonical).
  const normalized = normalizeToCanonical(key)
  if (normalized !== key && CATEGORY_LOOKUP.has(normalized)) {
    return CATEGORY_LOOKUP.get(normalized)!
  }
  return null
}

/**
 * Best-effort normalization. Given an arbitrary AI tag string, return the
 * closest canonical tag if there's a confident match, otherwise return the
 * original. Doesn't mutate — caller decides whether to swap.
 *
 * Matching priority:
 *   0. Strip key:value prefixes ("category:solo" → "solo")
 *   1. Strip hedge prefixes ("implied X" → "X") — Venice adds these when
 *      it's uncertain; they're useless as tags.
 *   2. Exact canonical (after lowercasing)
 *   3. Strip common suffixes (` sex`, ` position`, ` style`)
 *   4. Match a canonical that appears as a substring (when the AI
 *      returned a longer phrase like "blowjob with eye contact")
 */
/**
 * Critical synonyms applied INSIDE normalizeToCanonical so every path
 * that touches the function (Tier 2 output processing, library
 * cleanup, browse-tag normalize, AI-tagger Tier 3) sees the redirect.
 *
 * The full SYNONYMS map lives in tier3-tag-matcher.ts, but the most
 * commonly-misemitted clinical / typo / wrong-form terms are mirrored
 * here so a misuse anywhere in the pipeline gets corrected even when
 * tier3's lookup isn't part of the call chain.
 *
 * Format: { raw_term → canonical }
 */
const CRITICAL_SYNONYMS: Record<string, string> = {
  // Clinical → porn-site vocab. User has flagged repeatedly.
  fellatio: 'blowjob',
  fellatio_giving: 'blowjob',
  'oral sex': 'blowjob',
  'oral copulation': 'blowjob',
  'vaginal sex': 'sex',
  vaginal: 'sex',
  'anal sex': 'anal',
  'anal intercourse': 'anal',
  coitus: 'sex',
  copulation: 'sex',
  intercourse: 'sex',
  cunnilingus: 'pussylick',
  // Typo blacklist redirects (extends tier3 SYNONYMS so they're
  // canonicalized even when tier3 isn't in the call chain).
  felatio: 'blowjob',
  felattio: 'blowjob',
  fellation: 'blowjob',
  blowjop: 'blowjob',
  blowjpb: 'blowjob',
  cunilingus: 'pussylick',
  cunnilingis: 'pussylick',
  // "trans woman/man" → mtf/ftm (per user 2026-05-09). Bare "trans"
  // stays in CAPTIONER_NOISE so it gets dropped, not aliased.
  'trans woman': 'mtf',
  transwoman: 'mtf',
  'm to f': 'mtf',
  'male to female': 'mtf',
  'trans man': 'ftm',
  transman: 'ftm',
  'f to m': 'ftm',
  'female to male': 'ftm',
}

export function normalizeToCanonical(name: string): string {
  const orig = String(name).trim()
  let lower = orig.toLowerCase()

  // Strip "category:", "tag:", "meta:", "type:" prefixes — Venice (and some
  // booru-trained models) emit these structured prefixes that are useless
  // for the user's tag library.
  lower = lower.replace(/^(category|tag|meta|type|sub|attr|attribute):\s*/i, '').trim()

  // Strip hedge prefixes ("implied", "possible", "potential") that the model
  // adds when it's uncertain — these don't read like real porn-site tags.
  lower = lower.replace(/^(implied|possible|potential|maybe|likely|appears? to be)\s+/i, '').trim()

  // Critical synonyms — apply BEFORE canonical check so the redirected
  // form gets recognized as canonical and bypasses the rest of the
  // normalize path. This is what catches "fellatio" → "blowjob" even
  // when tier3-tag-matcher's reverse-synonym map isn't in the chain.
  if (CRITICAL_SYNONYMS[lower]) return CRITICAL_SYNONYMS[lower]

  if (CANONICAL_TAGS.has(lower)) return lower

  const stripped = lower
    .replace(/\s+(sex|position|style|kink|fetish)$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (stripped !== lower) {
    if (CRITICAL_SYNONYMS[stripped]) return CRITICAL_SYNONYMS[stripped]
    if (CANONICAL_TAGS.has(stripped)) return stripped
  }

  // Substring match — only when the canonical is at least 4 chars to avoid
  // matching "ass" inside "passenger".
  for (const canon of CANONICAL_TAGS) {
    if (canon.length >= 4 && lower.includes(canon)) return canon
  }

  return lower
}

// ─────────────────────────────────────────────────────────────────────────────
// JUNK FILTER
//
// Patterns that should never become a tag, regardless of model confidence.
// These come from real Venice misfires:
//   - "checkered pillow", "potted plant", "white sheets" — captioner-style
//     scene observations that aren't useful as porn-library tags.
//   - "implied X" — already stripped by normalizeToCanonical, but if the
//     stripped version isn't canonical AND isn't an action/body/setting, it's
//     hedge noise.
//   - Common typos the model emits ("felatio", "blowjop", etc.) that we'd
//     rather drop than try to fuzzy-match.
// ─────────────────────────────────────────────────────────────────────────────
const FURNITURE_NOISE = new Set([
  'pillow', 'pillows', 'cushion', 'cushions', 'blanket', 'blankets',
  'sheet', 'sheets', 'bedsheet', 'bedsheets', 'mattress', 'comforter',
  'curtain', 'curtains', 'rug', 'carpet', 'floor', 'wall', 'ceiling',
  'window', 'door', 'doorway', 'lamp', 'lamps', 'lampshade', 'light',
  'lights', 'lighting', 'plant', 'plants', 'potted plant', 'flower', 'flowers',
  'vase', 'picture', 'painting', 'mirror', 'shelf', 'shelves',
  'chair', 'chairs', 'couch', 'sofa', 'armchair', 'stool', 'desk', 'table',
  'nightstand', 'dresser', 'cabinet', 'drawer', 'television', 'tv',
  'laptop', 'computer', 'phone', 'smartphone', 'remote', 'book', 'books',
  'cup', 'mug', 'glass', 'bottle', 'plate', 'food', 'drink',
  // Scene/room captioner outputs — porn sites don't tag rooms; user prefers
  // these stripped (2026-05-09 feedback).
  'bedroom', 'bathroom', 'kitchen', 'living room', 'dining room',
  'office', 'classroom', 'library', 'church', 'forest',
  'public bathroom', 'gym', 'locker room', 'in car', 'backseat',
  'alley', 'park', 'bedside', 'hallway', 'stairs', 'staircase', 'balcony',
  'patio', 'garage', 'basement', 'attic', 'closet', 'pantry',
])

// Race/identity terms that must NEVER be matched as "color + thing" — these
// are valid porn tags on their own and the color-noun regex below would
// otherwise eat them.
const PROTECTED_RACE_TERMS = new Set(['white', 'black', 'asian', 'ebony', 'latina', 'latino', 'arab'])

const PATTERN_NOISE: RegExp[] = [
  // Color + furniture noise: "white sheets", "red pillow", "blue carpet"
  /^(white|black|red|blue|green|pink|yellow|purple|grey|gray|brown|orange|tan|beige)\s+(sheets|pillow|cushion|blanket|wall|background|floor|carpet|rug|curtain|light)/i,
  // Color + clothing combos like "red jacket", "blue shirt", "black dress" —
  // these aren't porn tags, they're scene description. Specific enough to
  // not eat canonical tags like "black stockings" (which we'd rather not
  // tag either, but the user keeps "stockings" as a separate canonical).
  // Round 5: added "top" / "tee" / "leggings" / "tights" / "blouse" /
  // "cardigan" / "underwear" / etc. so "blue top" / "gray leggings" land here.
  /^(white|red|blue|green|pink|yellow|purple|grey|gray|brown|orange|tan|beige|navy|maroon|olive|cream|teal)\s+(jacket|shirt|tshirt|t-shirt|tee|tank\s*top|tank|hoodie|sweater|sweatshirt|coat|blazer|cardigan|jeans|denim|pants|trousers|skirt|dress|gown|robe|bathrobe|towel|cap|hat|beanie|scarf|tie|boots?|shoes?|sneakers?|heels?|sandals?|panties|bra|underwear|lingerie|leggings|tights|stockings|socks|gloves|top|crop\s*top)/i,
  // Bare "X setting" — captioner suffix. "outdoor setting" → drop;
  // canonical "outdoor" is what survives. Same for indoor / bathroom /
  // kitchen / studio / public / urban / etc.
  /\s+setting$/i,
  // "lying on X" / "sitting on X" / "standing on X" — frame-pose captions.
  /^(lying|laying|sitting|standing|kneeling|leaning)\s+on\b/i,
  // Time-of-day phrases ("late afternoon", "early morning sunlight" etc.)
  /\b(daytime|nighttime|midnight|sunrise|sunset|dawn|dusk|noon)\b/i,
  /^(early|late|mid)\s+(morning|afternoon|evening|night)/i,
  /^(checkered|striped|patterned|polka dot|floral|plaid)\s+/i,
  /^(natural|soft|bright|dim|warm|cool|harsh)\s+light(ing)?$/i,
  /^[a-z]+\s+texture$/i,
  /^[a-z]+ed$/i, // catches one-word participles like "checkered" alone
  // Film-grammar shot terms when they appear as a suffix/prefix
  // ("medium shot of ass", "wide shot scene"). NOT close-up — user keeps
  // close-up forms as valid porn-site tags.
  /\b(medium|wide|long|establishing|overhead|low\s+angle|high\s+angle)\s+shots?\b/i,
  // Legacy "category:foo" / "tag:foo" / "meta:foo" prefix — these are stale
  // pre-atomic-tag entries from older Tier 1 output. The cleanup pass
  // deletes them (the same name without prefix is in canonical).
  /^(category|tag|meta|type|sub|attr|attribute):/i,
]

// Single-word hair-color tags. User prefers hair color in titles, never tags.
const HAIR_COLOR_REJECT = new Set([
  'blonde', 'brunette', 'redhead', 'red head', 'red-head',
  'black hair', 'brown hair', 'blonde hair', 'red hair',
  'gray hair', 'grey hair', 'silver hair', 'white hair',
  'pink hair', 'blue hair', 'purple hair', 'green hair',
  'dyed hair', 'bleached hair',
])

const TYPO_BLACKLIST = new Set([
  'felatio', 'felattio', 'fellation', 'blowjop', 'blowjpb',
  'cunilingus', 'cunnilingis', 'rimjab',
  'doggie', 'doggie style',
])

// Generic captioner-output tags that aren't real porn-site tags. The user
// flagged these in live review (2026-05-09): "medium shot", "implied X"
// hedge tags, generic professional/amateur on animated content, etc. These
// are NOT canonical and have no place in the picker.
const CAPTIONER_NOISE = new Set([
  // Film-grammar shot terms (NOT close-up — user keeps that).
  'medium shot', 'wide shot', 'long shot', 'establishing shot',
  'overhead shot', 'low angle shot', 'high angle shot',
  // Hedge / clinical — Venice slips into clinical / hedging vocabulary on
  // anime frames in particular. None of these read as porn-site tags.
  // NOTE: fellatio / oral sex / anal sex / vaginal sex are NOT in this
  // set — they get redirected to porn-site equivalents (fellatio →
  // blowjob, anal sex → anal, etc.) via CRITICAL_SYNONYMS in
  // normalizeToCanonical. Adding them here would drop them instead of
  // redirecting.
  'clitoral stimulation', 'genital contact', 'sexual intercourse',
  'vaginal intercourse', 'penile penetration',
  // Generic "trans" without direction — user wants only mtf/ftm with
  // visible indicators. Bare "trans" / "transgender" tag is junk.
  // (User has repeatedly flagged: the tagger sees all women as trans.
  //  The Tier 2 prompt forbids trans without indicators, but the model
  //  ignores. Junk-filtering at normalize is the last line of defense.)
  'trans', 'transgender', 'shemale', 'futa', 'futanari',
  'trans woman', 'trans man',
  // Drawing-style noise — user wants ONLY "hentai", "animation", "3d" as
  // the drawing-mode tags. Everything else is jargon. NOTE: "anime" alone
  // is also junk — synonym maps it to "hentai" in tier3-tag-matcher.
  'anime', '3d render', '3d cgi', 'cgi', 'cg', 'sfm', 'blender', 'render',
  'western cartoon', 'cartoon', 'drawn', 'drawing', 'illustration',
  'artwork', '2d', '2d anime', 'anime style', 'manga style', 'sketch',
  'comic',
  // Body-type junk — user prefers pawg / bbw / thicc. The literal phrase
  // "plus size" never appears as a porn-site tag. "natural breasts" removed
  // because size descriptors (big tits / small tits) carry the actual signal.
  'plus size', 'plus-size', 'plus sized', 'natural breasts',
  // Verb-form captioner output: "enjoying", "looking", "smiling", etc. on
  // their own without a subject are scene description, not tags. User added
  // "asking for help", "spontaneous", "enjoyment" in 2026-05-09 review.
  'enjoying', 'enjoyment', 'looking', 'smiling', 'laughing', 'kissing',
  'embracing', 'hugging', 'cuddling', 'asking for help', 'asking',
  'spontaneous', 'private',
  // Single-word color/light artifacts the user keeps seeing
  'dark', 'bright', 'warm', 'cool', 'dim', 'shadowed',
  'studio lighting', 'natural lighting',
  // Bare scene/location words that aren't porn-site categories.
  // User 2026-05-09: "studio" / "uniform" / "kneeling" / "street" / "bedroom
  // setting" alone are captions of a frame, not categories. Specific tags
  // like "schoolgirl uniform" / "kneeling oral" / "street blowjob" are fine
  // (they're real porn-site tags) but the bare adjective isn't.
  // (User round 5: dropped "street blowjob" too — they prefer "public blowjob"
  // / "outdoor blowjob". synonym in tier3 redirects it.)
  'studio', 'uniform', 'kneeling', 'street', 'bedroom setting',
  'street blowjob', 'street sex',
  // 1girl / 1boy / Nx booru meta — user 2026-05-09: "if i wanted only 1
  // girl i would select solo and female". These tags add no info our
  // atomic solo/female tags don't already carry.
  '1girl', '2girls', '3girls', '1boy', '2boys', '3boys',

  // Round 5 (2026-05-09 follow-up): user did cleanup, still saw these.
  // ── Synonyms of canonical that should redirect, not double up ─────────
  'self-pleasure', 'self pleasure', 'self stimulation',
  // ── "X play" — vibrator play, dildo play, toy play, sex toy play.
  //    Real porn-site tag is just "vibrator" / "dildo"; user combines
  //    those with "masturbation" / "missionary" etc. in the picker.
  'vibrator play', 'vibrator mplay', 'dildo play', 'toy play', 'sex toy play',
  // ── "X setting" — captioner suffix; the bare canonical is what survives.
  'outdoor setting', 'indoor setting', 'bathroom setting', 'kitchen setting',
  'studio setting', 'public setting',
  // ── Frame-pose descriptions — Venice slips into "lying on bed",
  //    "sitting on couch" etc. on setup shots. These describe ONE frame,
  //    not the video.
  'lying on bed', 'lying down', 'lying', 'sitting on bed', 'sitting on couch',
  'sitting on chair', 'sitting',
  // ── Time of day — never a porn-site tag.
  'daytime', 'nighttime', 'morning', 'evening', 'noon', 'midnight',
  'dusk', 'dawn', 'sunset', 'sunrise', 'afternoon',
  // ── Meta person tags.
  'real person', 'real people', 'real life person', 'human', 'humans',
  'person', 'people',
  // ── Clinical pleasure words — porn sites don't tag "oral pleasure", they
  //    tag "blowjob" / "cunnilingus" / "rimming" specifically.
  'oral pleasure', 'genital pleasure', 'sexual pleasure', 'pleasure',
  // ── Compound user-clothing pairs the model emits ("teen girl",
  //    "young woman"). User 2026-05-09: combine atoms instead — "teen" +
  //    "female", not "teen girl". synonym maps these.
  'teen girl', 'teen woman', 'teen boy', 'teen man',
  'young woman', 'young man', 'young girl', 'young boy',
  'older woman', 'older man',
  // ── Bare clothing words that aren't in the user's allowlist (only
  //    panties/lingerie/leggings/stockings/etc are acceptable). Drop
  //    everyday clothing as scene description.
  'top', 'crop top', 'tank top', 'tube top',
  't-shirt', 'tshirt', 'tee shirt', 'tee',
  'shirt', 'blouse', 'sweater', 'sweatshirt', 'hoodie',
  'jacket', 'coat', 'blazer', 'cardigan',
  'dress', 'gown', 'robe', 'bathrobe',
  'skirt', 'mini skirt', 'maxi skirt',
  'pants', 'trousers', 'jeans', 'denim', 'shorts',
  'socks', 'tights', 'gloves', 'scarf', 'tie', 'belt', 'cap', 'hat', 'beanie',
  'shoes', 'sneakers', 'sandals',
  // (Bare "facial close up" — not added here, decomposeToAtoms now drops
  // covered compounds for new scans, and the migration pass below will
  // redirect existing rows to atoms.)
  // ("public", "amateur", "professional", "close-up" / "close up" / "closeup"
  // intentionally NOT in this list — user 2026-05-09: those are real
  // porn-site tags they want to keep.)
])

/**
 * Returns true if a tag name should be rejected outright. Run AFTER
 * normalizeToCanonical so we're checking the cleaned form.
 *
 * Rule of thumb: if a porn site wouldn't list it as a category/tag, it
 * shouldn't be in the user's library either. Captioner-style observations
 * about furniture/lighting/colors don't help the user find videos later.
 */
export function isJunkTag(name: string): boolean {
  const t = String(name).trim().toLowerCase()
  if (!t) return true
  if (t.length < 2) return true

  // Hair colors: ALWAYS reject, even if they're in canonical (legacy) — user
  // explicitly asked for these to live in titles only, not tags.
  if (HAIR_COLOR_REJECT.has(t)) return true

  // "text focus" on its own is WD-Tagger / captioner noise on people frames
  // (the model fires it whenever any text element is visible — UI overlays,
  // logos, etc.). Reject regardless of canonical status.
  if (t === 'text focus' || t === 'text' || t === 'speech bubble') return true

  // Canonical wins — never reject a known-good tag (after the always-reject
  // patterns above).
  if (CANONICAL_TAGS.has(t)) return false

  if (FURNITURE_NOISE.has(t)) return true
  if (TYPO_BLACKLIST.has(t)) return true
  if (CAPTIONER_NOISE.has(t)) return true
  for (const re of PATTERN_NOISE) if (re.test(t)) return true

  // Hedge prefixes — "implied X", "possible X", "appears to be X" — slipped
  // through normalize when the stripped form isn't canonical. If the original
  // tag started with a hedge word, reject it outright.
  if (/^(implied|possible|potential|maybe|likely|appears? to be)\s+/i.test(t)) return true

  // Pure single-word adjectives that aren't in canonical and don't have a
  // sex modifier — almost always captioner noise. Length check avoids
  // over-rejecting short canonical tags like "pov".
  if (t.length > 3 && !t.includes(' ') && /^[a-z]+ed$/.test(t)) return true

  return false
}
