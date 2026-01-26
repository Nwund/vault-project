// ===============================
// File: src/main/services/tagging/smart-tagger.ts
// Intelligent auto-tagging based on filename analysis and patterns
// ===============================

import * as path from 'path'

export interface TagSuggestion {
  tag: string
  confidence: number // 0-1
  source: 'filename' | 'pattern' | 'category'
}

export interface SmartTagResult {
  filePath: string
  filename: string
  suggestedTags: TagSuggestion[]
  cleanedName: string
  detectedCategories: string[]
}

// Common tag patterns organized by category
const TAG_PATTERNS: Record<string, RegExp[]> = {
  // Body types
  'bbw': [/\bbbw\b/i, /\bbig\s*beautiful/i, /\bplus\s*size/i, /\bchubby\b/i, /\bcurvy\b/i],
  'petite': [/\bpetite\b/i, /\btiny\b/i, /\bsmall\b/i],
  'athletic': [/\bathletic\b/i, /\bfit\b/i, /\bmuscular\b/i, /\btoned\b/i],
  'thick': [/\bthick\b/i, /\bthicc\b/i, /\bpawg\b/i],
  'skinny': [/\bskinny\b/i, /\bslim\b/i],

  // Hair colors
  'blonde': [/\bblonde?\b/i, /\bblondie\b/i],
  'brunette': [/\bbrunette?\b/i, /\bbrown\s*hair/i],
  'redhead': [/\bredhead\b/i, /\bginger\b/i, /\bred\s*hair/i],
  'black-hair': [/\bblack\s*hair/i, /\bebony\s*hair/i],

  // Ethnicities (respectful terms only)
  'asian': [/\basian\b/i, /\bjapanese\b/i, /\bkorean\b/i, /\bchinese\b/i, /\bjav\b/i],
  'latina': [/\blatina?\b/i, /\bhispanic\b/i, /\bmexican\b/i],
  'ebony': [/\bebony\b/i],
  'european': [/\beuropean\b/i, /\beuro\b/i],
  'indian': [/\bindian\b/i, /\bdesi\b/i],

  // Age categories (legal adults only)
  'milf': [/\bmilf\b/i, /\bmom\b/i, /\bmother\b/i, /\bmature\b/i, /\bcougar\b/i],
  'teen': [/\bteen\b/i, /\byoung\b/i, /\b18\b/, /\b19\b/],
  'college': [/\bcollege\b/i, /\buniversity\b/i, /\bstudent\b/i, /\bsorority\b/i],
  'gilf': [/\bgilf\b/i, /\bgranny\b/i, /\bgrandma\b/i],

  // Acts (common categories)
  'blowjob': [/\bblowjob\b/i, /\bbj\b/i, /\boral\b/i, /\bsucking\b/i, /\bdeepthroat/i, /\bthroat/i],
  'anal': [/\banal\b/i, /\bass\s*fuck/i, /\bbutt\s*fuck/i, /\bsodomy/i],
  'creampie': [/\bcreampie\b/i, /\bcum\s*inside/i, /\binternal/i],
  'facial': [/\bfacial\b/i, /\bcum\s*face/i, /\bcum\s*shot/i],
  'cumshot': [/\bcumshot\b/i, /\bcum\s*shot/i, /\bload\b/i],
  'squirt': [/\bsquirt/i, /\bfemale\s*ejac/i],
  'pov': [/\bpov\b/i, /\bpoint\s*of\s*view/i],
  'doggystyle': [/\bdoggy\b/i, /\bfrom\s*behind/i, /\bbent\s*over/i],
  'cowgirl': [/\bcowgirl\b/i, /\briding\b/i, /\breverse\s*cowgirl/i],
  'missionary': [/\bmissionary\b/i],
  'handjob': [/\bhandjob\b/i, /\bhand\s*job/i, /\bjerk/i],
  'footjob': [/\bfootjob\b/i, /\bfoot\s*job/i, /\bfeet\b/i],
  'titfuck': [/\btitfuck\b/i, /\btit\s*fuck/i, /\bpaizuri/i, /\bboobjob/i],
  'masturbation': [/\bmasturbat/i, /\bsolo\b/i, /\bjill/i, /\bfingers?\s*herself/i],
  'threesome': [/\bthreesome\b/i, /\b3some\b/i, /\bffm\b/i, /\bmmf\b/i, /\btrio\b/i],
  'gangbang': [/\bgangbang\b/i, /\bgang\s*bang/i, /\bgroup/i, /\borgy\b/i],
  'lesbian': [/\blesbian\b/i, /\blesbo\b/i, /\bgirl\s*on\s*girl/i, /\bscissors?\b/i],
  'bdsm': [/\bbdsm\b/i, /\bbondage\b/i, /\bdominati/i, /\bsubmissive/i, /\bfemdom/i],
  'rough': [/\brough\b/i, /\bhard\s*fuck/i, /\bpounding/i, /\bintense/i],
  'romantic': [/\bromantic\b/i, /\bpassion/i, /\bsensual\b/i, /\bgentle\b/i, /\blove\s*making/i],

  // Body parts focus
  'big-tits': [/\bbig\s*tits?\b/i, /\bbig\s*boobs?\b/i, /\bbusty\b/i, /\bhuge\s*tits/i, /\bmassive\s*tits/i],
  'small-tits': [/\bsmall\s*tits?\b/i, /\btiny\s*tits/i, /\bflat\s*chest/i, /\ba-cup/i],
  'natural-tits': [/\bnatural\s*tits?\b/i, /\bnatty\b/i, /\breal\s*boobs/i],
  'fake-tits': [/\bfake\s*tits?\b/i, /\bimplants?\b/i, /\baugmented/i, /\bboltons?\b/i],
  'big-ass': [/\bbig\s*ass\b/i, /\bbig\s*booty/i, /\bhuge\s*ass/i, /\bbubble\s*butt/i],

  // Scenarios
  'amateur': [/\bamateur\b/i, /\bhomemade\b/i, /\bhome\s*video/i, /\breal\s*couple/i],
  'professional': [/\bstudio\b/i, /\bprofessional/i, /\bhd\b/i, /\b4k\b/i, /\bproduction/i],
  'casting': [/\bcasting\b/i, /\baudition/i, /\bfirst\s*time/i],
  'massage': [/\bmassage\b/i, /\bnuru\b/i, /\boil/i],
  'office': [/\boffice\b/i, /\bsecretary/i, /\bboss\b/i, /\bworkplace/i],
  'outdoor': [/\boutdoor/i, /\bpublic\b/i, /\bbeach\b/i, /\bpool\b/i, /\bpark\b/i],
  'shower': [/\bshower\b/i, /\bbathroom/i, /\bbathtub/i, /\bwet\b/i],
  'kitchen': [/\bkitchen\b/i],
  'bedroom': [/\bbedroom\b/i, /\bbed\b/i],

  // Clothing/Costumes
  'lingerie': [/\blingerie\b/i, /\bstockings?\b/i, /\bgarter/i, /\bcorset/i],
  'cosplay': [/\bcosplay\b/i, /\bcostume/i, /\broleplay/i],
  'uniform': [/\buniform\b/i, /\bnurse\b/i, /\bschool\s*girl/i, /\bcheerleader/i, /\bmaid\b/i],
  'bikini': [/\bbikini\b/i, /\bswimsuit/i],

  // Quality/Type
  'hd': [/\bhd\b/i, /\bhigh\s*def/i, /\b1080p?\b/i],
  '4k': [/\b4k\b/i, /\b2160p?\b/i, /\bultra\s*hd/i],
  'vr': [/\bvr\b/i, /\bvirtual\s*reality/i],

  // Animation
  'hentai': [/\bhentai\b/i, /\banime\b/i, /\bcartoon/i, /\banimated/i, /\b3d\b/i],
  'sfm': [/\bsfm\b/i, /\bsource\s*film/i, /\bblender/i],
}

// Tags to exclude (inappropriate, too generic, or weird combinations)
const EXCLUDED_TAGS = new Set([
  // Weird combinations
  'hairy-wife', 'hairy-foot', 'hairy-pussy', 'hairy-ass', 'hairy-legs',
  'foot-pussy', 'pussy-foot', 'ass-foot', 'foot-ass',

  // Generic/meaningless
  'weird', 'ugly', 'random', 'unknown', 'misc', 'other', 'test', 'sample',
  'download', 'free', 'full', 'video', 'movie', 'clip', 'scene',
  'new', 'hot', 'sexy', 'best', 'top', 'latest', 'premium', 'exclusive',

  // Too vague
  'good', 'nice', 'great', 'amazing', 'awesome', 'perfect', 'beautiful',
  'woman', 'girl', 'man', 'guy', 'person', 'people', 'body', 'face',

  // Technical/meta
  'part', 'episode', 'chapter', 'vol', 'volume', 'version', 'edit',
  'compilation', 'collection', 'mix', 'montage', 'pmv',

  // Nonsense combinations
  'pussy-hair', 'hair-pussy', 'ass-hair', 'hair-ass',
  'tits-hair', 'hair-tits', 'boobs-hair', 'hair-boobs',

  // Overly specific body hair tags
  'hairy', 'unshaved', 'bush', 'furry', 'fuzzy',

  // Strange fetish combinations that don't make sense
  'feet-face', 'face-feet', 'hand-foot', 'foot-hand',

  // Numbers and codes
  '1', '2', '3', '4', '5', 'one', 'two', 'three', 'first', 'second',

  // Action words that aren't tags
  'watch', 'see', 'look', 'view', 'enjoy', 'like', 'love',
  'get', 'got', 'have', 'has', 'want', 'need',

  // Common spam words
  'join', 'subscribe', 'follow', 'click', 'link', 'more', 'www', 'http', 'com'
])

// Patterns for tags that should be removed (regex-based)
const EXCLUDED_TAG_PATTERNS = [
  /^hairy[-_]?\w+$/i,       // hairy-anything
  /^\w+[-_]?hairy$/i,       // anything-hairy
  /^hair[-_]?\w+$/i,        // hair-anything
  /^\w+[-_]?hair$/i,        // anything-hair
  /^\d+$/,                  // pure numbers
  /^[a-z]$/i,               // single letters
  /^[a-z]{1,2}$/i,          // 1-2 letter combos
  /^https?/i,               // URLs
  /^www/i,                  // URLs
  /^\w+\.com$/i,            // domains
  /^@\w+$/,                 // social handles
  /^#\w+$/,                 // hashtags
  /[-_]{2,}/,               // multiple separators
  /^\d+p$/i,                // resolution like 720p
  /^\d+x\d+$/,              // dimensions
]

// Platforms/sites to strip from filenames
const PLATFORM_PATTERNS = [
  /^(https?_?|www_?)/gi,
  /xvideos?[._-]?com?/gi,
  /pornhub[._-]?com?/gi,
  /xnxx[._-]?com?/gi,
  /xhamster[._-]?com?/gi,
  /redtube[._-]?com?/gi,
  /spankbang[._-]?com?/gi,
  /youporn[._-]?com?/gi,
  /tube8[._-]?com?/gi,
  /brazzers[._-]?com?/gi,
  /bangbros[._-]?com?/gi,
  /realitykings[._-]?com?/gi,
  /naughtyamerica[._-]?com?/gi,
  /onlyfans[._-]?com?/gi,
  /fansly[._-]?com?/gi,
  /manyvids[._-]?com?/gi,
  /chaturbate[._-]?com?/gi,
  /telegram[._-]?\d*/gi,
  /join[._-]?us/gi,
  /more[._-]?at/gi,
  /@\w+/g, // Social handles
  /\d{6,}/g, // Long number sequences (IDs)
]

// Quality indicators to strip
const QUALITY_PATTERNS = [
  /[\s._-]*(HD|1080p?|720p?|480p?|4K|UHD|HQ|SD)[\s._-]*/gi,
  /[\s._-]*\d{3,4}x\d{3,4}[\s._-]*/gi, // Resolution like 1920x1080
]

export class SmartTagger {

  // Extract tags from a filename
  analyzeFilename(filePath: string): SmartTagResult {
    const filename = path.basename(filePath, path.extname(filePath))
    const suggestions: TagSuggestion[] = []
    const detectedCategories: string[] = []

    // Clean filename for analysis
    let cleanedName = this.cleanFilename(filename)

    // Analyze against all patterns
    for (const [tag, patterns] of Object.entries(TAG_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(filename) || pattern.test(cleanedName)) {
          // Check for excluded tags
          if (EXCLUDED_TAGS.has(tag)) continue

          // Calculate confidence based on pattern specificity
          const confidence = this.calculateConfidence(pattern, filename)

          suggestions.push({
            tag,
            confidence,
            source: 'pattern'
          })

          if (!detectedCategories.includes(this.getCategory(tag))) {
            detectedCategories.push(this.getCategory(tag))
          }

          break // Only match first pattern per tag
        }
      }
    }

    // Sort by confidence
    suggestions.sort((a, b) => b.confidence - a.confidence)

    // Remove duplicates
    const uniqueTags = new Map<string, TagSuggestion>()
    for (const s of suggestions) {
      if (!uniqueTags.has(s.tag)) {
        uniqueTags.set(s.tag, s)
      }
    }

    return {
      filePath,
      filename,
      suggestedTags: Array.from(uniqueTags.values()),
      cleanedName,
      detectedCategories
    }
  }

  // Clean up a filename for better readability
  cleanFilename(filename: string): string {
    let cleaned = filename

    // Remove platform/site names
    for (const pattern of PLATFORM_PATTERNS) {
      cleaned = cleaned.replace(pattern, '')
    }

    // Remove quality indicators
    for (const pattern of QUALITY_PATTERNS) {
      cleaned = cleaned.replace(pattern, ' ')
    }

    // Convert separators to spaces
    cleaned = cleaned
      .replace(/[_.-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    // Title case
    cleaned = cleaned
      .split(' ')
      .filter(word => word.length > 0)
      .map(word => {
        // Keep short words lowercase unless they're first
        if (word.length <= 2) return word.toLowerCase()
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      })
      .join(' ')

    return cleaned || filename
  }

  // Generate a clean name suggestion for a file
  suggestCleanName(filePath: string): string {
    const ext = path.extname(filePath)
    const filename = path.basename(filePath, ext)
    return this.cleanFilename(filename) + ext
  }

  // Get all available tag categories
  getCategories(): string[] {
    return [
      'body-type', 'hair-color', 'ethnicity', 'age',
      'act', 'body-part', 'scenario', 'clothing',
      'quality', 'animation'
    ]
  }

  // Get category for a tag
  private getCategory(tag: string): string {
    const categories: Record<string, string[]> = {
      'body-type': ['bbw', 'petite', 'athletic', 'thick', 'skinny'],
      'hair-color': ['blonde', 'brunette', 'redhead', 'black-hair'],
      'ethnicity': ['asian', 'latina', 'ebony', 'european', 'indian'],
      'age': ['milf', 'teen', 'college', 'gilf'],
      'act': ['blowjob', 'anal', 'creampie', 'facial', 'cumshot', 'squirt', 'pov',
              'doggystyle', 'cowgirl', 'missionary', 'handjob', 'footjob', 'titfuck',
              'masturbation', 'threesome', 'gangbang', 'lesbian', 'bdsm', 'rough', 'romantic'],
      'body-part': ['big-tits', 'small-tits', 'natural-tits', 'fake-tits', 'big-ass'],
      'scenario': ['amateur', 'professional', 'casting', 'massage', 'office',
                   'outdoor', 'shower', 'kitchen', 'bedroom'],
      'clothing': ['lingerie', 'cosplay', 'uniform', 'bikini'],
      'quality': ['hd', '4k', 'vr'],
      'animation': ['hentai', 'sfm']
    }

    for (const [cat, tags] of Object.entries(categories)) {
      if (tags.includes(tag)) return cat
    }
    return 'other'
  }

  // Calculate confidence score for a pattern match
  private calculateConfidence(pattern: RegExp, text: string): number {
    const match = text.match(pattern)
    if (!match) return 0

    // Base confidence
    let confidence = 0.7

    // Boost for word boundaries (more specific match)
    if (/\\b/.test(pattern.source)) {
      confidence += 0.1
    }

    // Boost for longer matches
    if (match[0] && match[0].length > 5) {
      confidence += 0.1
    }

    // Boost for match appearing at start of filename
    const startIndex = text.toLowerCase().indexOf(match[0].toLowerCase())
    if (startIndex < 10) {
      confidence += 0.1
    }

    return Math.min(confidence, 1.0)
  }

  // Batch analyze multiple files
  analyzeFiles(filePaths: string[]): SmartTagResult[] {
    return filePaths.map(p => this.analyzeFilename(p))
  }

  // Get suggested tags for a media item, filtering by confidence threshold
  getSuggestedTags(filePath: string, minConfidence: number = 0.6): string[] {
    const result = this.analyzeFilename(filePath)
    return result.suggestedTags
      .filter(s => s.confidence >= minConfidence)
      .map(s => s.tag)
  }

  // Get all known tags
  getAllKnownTags(): string[] {
    return Object.keys(TAG_PATTERNS).filter(t => !EXCLUDED_TAGS.has(t))
  }

  // Check if a tag is valid (not excluded)
  isValidTag(tag: string): boolean {
    const normalized = tag.toLowerCase().trim()

    // Check explicit exclusion list
    if (EXCLUDED_TAGS.has(normalized)) return false

    // Check exclusion patterns
    for (const pattern of EXCLUDED_TAG_PATTERNS) {
      if (pattern.test(normalized)) return false
    }

    // Tag must be at least 2 characters
    if (normalized.length < 2) return false

    // Tag shouldn't be too long (probably garbage)
    if (normalized.length > 30) return false

    return true
  }

  // Clean a list of tags, removing invalid ones
  cleanTags(tags: string[]): { valid: string[]; removed: string[] } {
    const valid: string[] = []
    const removed: string[] = []

    for (const tag of tags) {
      if (this.isValidTag(tag)) {
        valid.push(tag)
      } else {
        removed.push(tag)
      }
    }

    return { valid, removed }
  }

  // Get all tags that should be removed from a media item
  getTagsToRemove(existingTags: string[]): string[] {
    return existingTags.filter(tag => !this.isValidTag(tag))
  }

  // Get excluded tags list
  getExcludedTags(): string[] {
    return Array.from(EXCLUDED_TAGS)
  }
}

// Singleton instance
let smartTaggerInstance: SmartTagger | null = null

export function getSmartTagger(): SmartTagger {
  if (!smartTaggerInstance) {
    smartTaggerInstance = new SmartTagger()
  }
  return smartTaggerInstance
}
