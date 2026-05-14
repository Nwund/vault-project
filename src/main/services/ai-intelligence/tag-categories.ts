// File: src/main/services/ai-intelligence/tag-categories.ts
//
// Two-level taxonomy on top of canonical-tags. Each canonical tag
// belongs to a Category (broader bucket the user can filter by). Mirrors:
//   - FAP.Organizer's Tag/Category two-level model (ref #6)
//   - cooperdk/nsfw-image-urls's 150-category hierarchy (ref #3)
//   - User's own categorical preferences (from feedback_tag_quality_rules)
//
// Use cases:
//   1. Library picker can render tags grouped by category
//   2. Per-source threshold + auto-protect logic can apply per-category
//   3. "I want everything in `body type` category" search shortcuts

export type TagCategory =
  // Sexual acts (vagal, oral, anal, masturbation, etc.)
  | 'action'
  // Positions (cowgirl, missionary, doggystyle, etc.)
  | 'position'
  // Performer descriptors (age, ethnicity, role, relationship)
  | 'performer'
  // Body type / measurements (petite, curvy, bbw, big tits, etc.)
  | 'body'
  // Hair attributes — NOT colors (long, short, ponytail; colors stay in title)
  | 'hair'
  // Body modifications (tattoo, piercing, shaved, hairy)
  | 'modification'
  // Settings / locations (bedroom, outdoor, public, beach, etc.)
  | 'setting'
  // Clothing / outfit (lingerie, stockings, naked, etc.)
  | 'clothing'
  // Camera / framing (pov, close-up, side-angle, etc.)
  | 'camera'
  // Content format (hentai, animation, 3d, compilation, vintage)
  | 'format'
  // Production context (amateur, professional, webcam, snapchat, etc.)
  | 'production'
  // Group composition (solo, couple, threesome, gangbang, etc.)
  | 'group'
  // Kink / fetish (bdsm, bondage, foot fetish, watersports, etc.)
  | 'kink'
  // Cum types (creampie, facial, cum on tits, etc.)
  | 'cum'
  // Intensity (softcore, moderate, hardcore, intense, extreme)
  | 'intensity'
  // Toys (dildo, vibrator, fleshlight, magic wand, etc.)
  | 'toys'
  // Audio (sound only, asmr, dirty talk, moaning)
  | 'audio'
  // Platform / source (onlyfans, tiktok, snapchat, reddit, etc.)
  | 'platform'
  // Misc / other
  | 'other'

// All categories with display labels + colors. Display order matches
// what the picker UI should render top-to-bottom.
export const CATEGORY_META: Array<{ key: TagCategory; label: string; color: string; description: string }> = [
  { key: 'action',       label: 'Actions',       color: 'rose',    description: 'What is happening — blowjob, anal, cumshot, masturbation' },
  { key: 'position',     label: 'Positions',     color: 'pink',    description: 'How performers are positioned — cowgirl, missionary, doggystyle' },
  { key: 'cum',          label: 'Cum',           color: 'amber',   description: 'Cum-specific tags — creampie, facial, cum on tits' },
  { key: 'group',        label: 'Group',         color: 'fuchsia', description: 'Performer count + composition — solo, couple, threesome' },
  { key: 'performer',    label: 'Performers',    color: 'violet',  description: 'Performer descriptors — age, ethnicity, role, relationship' },
  { key: 'body',         label: 'Body',          color: 'purple',  description: 'Body type + measurements — petite, curvy, bbw, big tits' },
  { key: 'hair',         label: 'Hair',          color: 'indigo',  description: 'Hair attributes (not colors) — long, short, ponytail, braids' },
  { key: 'modification', label: 'Mods',          color: 'blue',    description: 'Body modifications — tattoo, piercing, shaved, hairy' },
  { key: 'clothing',     label: 'Clothing',      color: 'sky',     description: 'Outfit — lingerie, stockings, naked, school uniform' },
  { key: 'kink',         label: 'Kink',          color: 'red',     description: 'Kink / fetish — bdsm, bondage, foot fetish, watersports' },
  { key: 'toys',         label: 'Toys',          color: 'orange',  description: 'Toys — dildo, vibrator, magic wand, fleshlight' },
  { key: 'setting',      label: 'Settings',      color: 'lime',    description: 'Where — bedroom, outdoor, public, beach, shower' },
  { key: 'camera',       label: 'Camera',        color: 'cyan',    description: 'Framing / angle — pov, close-up, wide shot, side-angle' },
  { key: 'format',       label: 'Format',        color: 'teal',    description: 'Content format — hentai, animation, 3d, compilation, vintage' },
  { key: 'production',   label: 'Production',    color: 'emerald', description: 'How produced — amateur, professional, webcam, snapchat, tiktok' },
  { key: 'platform',     label: 'Platform',      color: 'green',   description: 'Source platform — onlyfans, tiktok, reddit, manyvids' },
  { key: 'audio',        label: 'Audio',         color: 'yellow',  description: 'Audio content — sound only, asmr, dirty talk' },
  { key: 'intensity',    label: 'Intensity',     color: 'stone',   description: 'Softcore → extreme scale' },
  { key: 'other',        label: 'Other',         color: 'zinc',    description: 'Doesn\'t fit elsewhere' },
]

// Canonical tag → category. Built from the canonical-tags.ts vocabulary
// plus the nsfw-image-urls 150-category mapping. Missing tags default
// to 'other' (the renderer treats this as the catch-all bucket).
const TAG_TO_CATEGORY: Record<string, TagCategory> = {
  // === ACTION ===
  'blowjob': 'action', 'sloppy blowjob': 'action', 'sloppy bj': 'action',
  'two handed blowjob': 'action', 'deepthroat': 'action', 'gagging': 'action',
  'throat fuck': 'action', 'face fuck': 'action', 'mouth fuck': 'action',
  'cunnilingus': 'action', 'pussy eating': 'action', 'rimjob': 'action',
  'rimming': 'action', 'anilingus': 'action', 'titjob': 'action',
  'titty fuck': 'action', 'paizuri': 'action', 'footjob': 'action',
  'handjob': 'action', 'tug': 'action', 'edging': 'action',
  'pussy fucking': 'action', 'pussy pounding': 'action', 'hard fuck': 'action',
  'pounding': 'action', 'jackhammering': 'action', 'balls deep': 'action',
  'deep penetration': 'action', 'gentle sex': 'action', 'passionate sex': 'action',
  'lovemaking': 'action', 'anal': 'action', 'anal penetration': 'action',
  'butt fuck': 'action', 'sodomy': 'action', 'gape': 'action',
  'fingering': 'action', 'masturbation': 'action', 'squirt': 'action',
  'squirting': 'action', 'spit': 'action', 'drool': 'action',
  'fisting': 'action', 'pegging': 'action', 'stroking': 'action',
  'jerking': 'action',
  // === POSITIONS ===
  'missionary': 'position', 'cowgirl': 'position', 'reverse cowgirl': 'position',
  'doggystyle': 'position', 'prone bone': 'position', 'spooning': 'position',
  '69': 'position', '69 position': 'position', 'standing': 'position',
  'amazon': 'position', 'piledriver': 'position', 'face sitting': 'position',
  'queening': 'position', 'face riding': 'position', 'bent over': 'position',
  'wheelbarrow': 'position', 'kneeling': 'position', 'sitting': 'position',
  'squatting': 'position', 'laying down': 'position', 'on top': 'position',
  'against wall': 'position', 'lap sitting': 'position',
  // === CUM ===
  'cumshot': 'cum', 'creampie': 'cum', 'facial': 'cum', 'cum on face': 'cum',
  'cum on tits': 'cum', 'cum in mouth': 'cum', 'cum swallow': 'cum',
  'swallow': 'cum', 'oral creampie': 'cum', 'cim': 'cum',
  'anal creampie': 'cum', 'bukkake': 'cum',
  // === GROUP ===
  'solo': 'group', 'duo': 'group', 'couple': 'group', 'threesome': 'group',
  'foursome': 'group', 'orgy': 'group', 'gangbang': 'group',
  'mfm': 'group', 'mff': 'group', 'mmf': 'group', 'ffm': 'group',
  'fff': 'group', 'mmm': 'group',
  // === PERFORMER ===
  'female': 'performer', 'male': 'performer', 'teen': 'performer',
  'barely legal': 'performer', 'milf': 'performer', 'mature': 'performer',
  'cougar': 'performer', 'gilf': 'performer', 'granny': 'performer',
  'stepmom': 'performer', 'mom': 'performer', 'stepsister': 'performer',
  'sister': 'performer', 'stepdad': 'performer', 'dad': 'performer',
  'stepson': 'performer', 'stepdaughter': 'performer',
  'aunt': 'performer', 'uncle': 'performer', 'cousin': 'performer',
  'wife': 'performer', 'girlfriend': 'performer', 'cheating wife': 'performer',
  'cheating gf': 'performer', 'ex girlfriend': 'performer',
  'twink': 'performer', 'bear': 'performer', 'jock': 'performer',
  'daddy': 'performer', 'femboy': 'performer', 'sissy': 'performer',
  'asian': 'performer', 'ebony': 'performer', 'latina': 'performer',
  'white': 'performer', 'arab': 'performer', 'mixed race': 'performer',
  'indian': 'performer', 'japanese': 'performer', 'korean': 'performer',
  'mtf': 'performer', 'ftm': 'performer', 'trans': 'performer',
  // === BODY ===
  'big ass': 'body', 'big tits': 'body', 'small tits': 'body',
  'huge tits': 'body', 'huge breasts': 'body', 'flat chest': 'body',
  'fake breasts': 'body', 'busty': 'body', 'petite': 'body',
  'curvy': 'body', 'thicc': 'body', 'pawg': 'body', 'bbw': 'body',
  'ssbbw': 'body', 'skinny': 'body', 'slim': 'body', 'athletic': 'body',
  'fit': 'body', 'muscular': 'body', 'toned': 'body', 'pregnant': 'body',
  // === HAIR ===
  'long hair': 'hair', 'short hair': 'hair', 'twintails': 'hair',
  'pigtails': 'hair', 'ponytail': 'hair', 'braids': 'hair',
  // === MODIFICATION ===
  'tattooed': 'modification', 'pierced': 'modification',
  'nipple piercing': 'modification', 'belly piercing': 'modification',
  'tongue piercing': 'modification', 'shaved pussy': 'modification',
  'hairy pussy': 'modification', 'trimmed': 'modification',
  // === CLOTHING ===
  'lingerie': 'clothing', 'stockings': 'clothing', 'heels': 'clothing',
  'nude': 'clothing', 'naked': 'clothing', 'fully nude': 'clothing',
  'clothed': 'clothing', 'dressed': 'clothing', 'underwear': 'clothing',
  'panties': 'clothing', 'bra': 'clothing', 'school uniform': 'clothing',
  'maid outfit': 'clothing', 'nurse outfit': 'clothing',
  'cosplay': 'clothing', 'catsuit': 'clothing', 'leather': 'clothing',
  'latex': 'clothing', 'fishnet': 'clothing', 'spandex': 'clothing',
  // === KINK ===
  'bdsm': 'kink', 'bondage': 'kink', 'foot fetish': 'kink',
  'feet': 'kink', 'femdom': 'kink', 'cuckold': 'kink',
  'choking': 'kink', 'spanking': 'kink', 'slapping': 'kink',
  'chastity': 'kink', 'collar': 'kink', 'leash': 'kink',
  'gag': 'kink', 'blindfolded': 'kink', 'handcuffed': 'kink',
  'pain': 'kink', 'rough sex': 'kink', 'gloryhole': 'kink',
  'public sex': 'kink', 'voyeur': 'kink', 'exhibitionism': 'kink',
  'pissing': 'kink', 'piss': 'kink', 'watersports': 'kink',
  // === TOYS ===
  'dildo': 'toys', 'vibrator': 'toys', 'magic wand': 'toys',
  'fleshlight': 'toys', 'anal beads': 'toys', 'butt plug': 'toys',
  'sex toys': 'toys', 'strap-on': 'toys', 'strapon': 'toys',
  // === SETTING ===
  'bedroom': 'setting', 'bathroom': 'setting', 'shower': 'setting',
  'kitchen': 'setting', 'outdoor': 'setting', 'public': 'setting',
  'beach': 'setting', 'pool': 'setting', 'car': 'setting',
  'office': 'setting', 'hotel': 'setting', 'gym': 'setting',
  'school': 'setting', 'college': 'setting',
  // === CAMERA ===
  'pov': 'camera', 'point of view': 'camera', 'fpov': 'camera',
  'mpov': 'camera', 'close up': 'camera', 'closeup': 'camera',
  'wide shot': 'camera', 'side angle': 'camera', 'overhead': 'camera',
  'first person': 'camera', 'selfie': 'camera',
  // === FORMAT ===
  'hentai': 'format', 'animation': 'format', '3d': 'format',
  'compilation': 'format', 'vintage': 'format', '60fps': 'format',
  'hd': 'format', 'pmv': 'format', 'hmv': 'format',
  // === PRODUCTION ===
  'amateur': 'production', 'professional': 'production',
  'webcam': 'production', 'home video': 'production', 'homemade': 'production',
  'casting': 'production', 'audition': 'production',
  // === PLATFORM ===
  'onlyfans': 'platform', 'tiktok': 'platform', 'snapchat': 'platform',
  'reddit': 'platform', 'manyvids': 'platform', 'chaturbate': 'platform',
  'instagram': 'platform', 'twitter': 'platform', 'discord': 'platform',
  // === AUDIO ===
  'sound only': 'audio', 'audio only': 'audio', 'no audio': 'audio',
  'silent': 'audio', 'asmr': 'audio', 'dirty talk': 'audio',
  'moaning': 'audio',
  // === INTENSITY ===
  'softcore': 'intensity', 'moderate': 'intensity', 'hardcore': 'intensity',
  'intense': 'intensity', 'extreme': 'intensity',
}

export function categoryOf(tagName: string): TagCategory {
  return TAG_TO_CATEGORY[tagName.toLowerCase().trim()] ?? 'other'
}

/**
 * Group a list of tag names into category buckets. Empty buckets are
 * omitted. Used by the Library picker + AI Review pane to render tags
 * by category instead of as a flat list.
 */
export function groupByCategory<T extends { name: string }>(tags: T[]): Map<TagCategory, T[]> {
  const out = new Map<TagCategory, T[]>()
  for (const t of tags) {
    const cat = categoryOf(t.name)
    if (!out.has(cat)) out.set(cat, [])
    out.get(cat)!.push(t)
  }
  return out
}

/**
 * For a category, return all known canonical tags belonging to it.
 * Useful for "show me all tags in `body type`" filter shortcuts.
 */
export function tagsInCategory(cat: TagCategory): string[] {
  const out: string[] = []
  for (const [tag, c] of Object.entries(TAG_TO_CATEGORY)) {
    if (c === cat) out.push(tag)
  }
  return out
}
