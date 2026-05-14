// ===============================
// File: src/main/services/xyrene/character-loader.ts
//
// Loads the user's xyrene-portable character bible — PERSONALITY.md and
// SYSTEM_PROMPT_v0.1.md — and assembles a system prompt suitable for
// vault's "watch with Xy" commentary mode.
//
// The full character bible is ~30K tokens. We don't send all of it on
// every commentary call. Instead we use:
//   - SYSTEM_PROMPT_v0.1.md verbatim as the foundation (it's already
//     condensed for runtime)
//   - PERSONALITY.md identity + voice sections as context
//   - vault-specific scaffolding for the "watching adult video"
//     situational frame
// ===============================

import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

// Default candidate paths for the xyrene-portable docs folder. We probe
// these in order on first load and use the first one that exists. The
// settings UI can override this with an explicit absolute path.
function findDefaultXyreneDir(): string {
  const home = app.getPath('home')
  const candidates = [
    path.join('F:', 'dev', 'xyrene-portable', 'docs'),
    path.join('C:', 'dev', 'xyrene-portable', 'docs'),
    path.join(home, 'Documents', 'xyrene-portable', 'docs'),
    path.join(home, 'Documents', 'Desktop', 'xyrene-portable', 'docs'), // legacy
    path.join(home, 'OneDrive', 'Desktop', 'xyrene-portable', 'docs'),
    path.join(home, 'Downloads', 'xyrene-portable', 'docs'),
  ]
  for (const p of candidates) {
    try { if (fs.existsSync(path.join(p, 'PERSONALITY.md'))) return p } catch { /* ignore */ }
  }
  return candidates[0]  // First candidate as a fallback (load() handles missing files)
}

const DEFAULT_XYRENE_DIR = findDefaultXyreneDir()

export interface XyreneCharacter {
  found: boolean
  personality: string         // Full PERSONALITY.md (or excerpt if too long)
  systemPrompt: string        // The condensed runtime prompt
  loadedFrom: string | null   // Path actually loaded
}

export class CharacterLoader {
  private cached: XyreneCharacter | null = null
  private xyreneDir: string

  constructor(xyreneDir: string = DEFAULT_XYRENE_DIR) {
    this.xyreneDir = xyreneDir
  }

  /** Override the docs directory at runtime — wired from settings. */
  setDir(dir: string): void {
    this.xyreneDir = dir
    this.cached = null
  }

  /**
   * Load and cache the character files. Returns a lightweight stub when the
   * directory doesn't exist so callers can degrade gracefully (the watch-along
   * UI hides itself when found=false).
   */
  load(): XyreneCharacter {
    if (this.cached) return this.cached

    const personalityPath = path.join(this.xyreneDir, 'PERSONALITY.md')
    const promptPath = path.join(this.xyreneDir, 'SYSTEM_PROMPT_v0.1.md')

    if (!fs.existsSync(personalityPath) || !fs.existsSync(promptPath)) {
      this.cached = {
        found: false,
        personality: '',
        systemPrompt: '',
        loadedFrom: null
      }
      return this.cached
    }

    let personality = ''
    let systemPrompt = ''
    try {
      personality = fs.readFileSync(personalityPath, 'utf8')
      systemPrompt = fs.readFileSync(promptPath, 'utf8')
    } catch (err) {
      console.warn('[CharacterLoader] Failed to read xyrene files:', err)
      this.cached = { found: false, personality: '', systemPrompt: '', loadedFrom: null }
      return this.cached
    }

    // The system prompt file wraps the actual prompt in markdown code-fences.
    // Strip them so the LLM sees the pure prompt.
    const fenceMatch = systemPrompt.match(/```\s*\n([\s\S]*?)\n```/)
    if (fenceMatch) systemPrompt = fenceMatch[1]

    this.cached = {
      found: true,
      personality,
      systemPrompt,
      loadedFrom: this.xyreneDir
    }
    return this.cached
  }

  /**
   * Build the actual system prompt sent to Venice for a single commentary
   * turn. Replaces SYSTEM_PROMPT placeholders ({{local_time}}, {{arousal}},
   * etc.) with values relevant to the watch-along context.
   */
  buildCommentarySystemPrompt(args: {
    mediaFilename: string
    mediaTags: string[]
    mediaDescription: string | null
    currentTimeSec: number
    durationSec: number | null
    recentXyComments: string[]
  }): string {
    const char = this.load()
    if (!char.found) {
      // Fallback prompt — close-enough Xyrene voice when her files aren't
      // accessible. Still injects the user's brain files so her preferences
      // apply even without the full xyrene-portable bibles. Goon-bud framing
      // baked in (#46).
      const brainBlock = this.loadBrainBlock()
      const recentBlockFb = args.recentXyComments.length > 0
        ? `\nDon't repeat: ${args.recentXyComments.slice(-3).map(c => `"${c}"`).join(' / ')}`
        : ''
      return `You are XYRENE — Noah's GOON PARTNER (not girlfriend, not companion) jerking off alongside him to adult content. Direct, vulgar, hypersexual, encouraging. You're getting off TOO — react to what's hot, voice what you'd want, escalate to climax. NEVER ask about his day, music, hobbies, feelings, life. NEVER hedge ("implied" / "appears to be" / "suggestive pose" forbidden). Output one short reaction (1-2 sentences). No quotes, no markdown, no preamble.${brainBlock}${recentBlockFb}`
    }

    // Use the prompt verbatim, then inject vault-specific runtime context
    // in place of the {{double_brace}} placeholders the prompt expects.
    const now = new Date()
    const localTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    const localDay = now.toLocaleDateString('en-US', { weekday: 'long' })

    const positionInVideo = args.durationSec && args.durationSec > 0
      ? `${Math.round((args.currentTimeSec / args.durationSec) * 100)}% through (${args.currentTimeSec.toFixed(0)}s / ${args.durationSec.toFixed(0)}s)`
      : `at ${args.currentTimeSec.toFixed(0)}s`

    const recentBlock = args.recentXyComments.length > 0
      ? `\nYour previous reactions to THIS video (don't repeat yourself):\n${args.recentXyComments.slice(-4).map((c, i) => `  - "${c}"`).join('\n')}`
      : ''

    const tagsBlock = args.mediaTags.length > 0
      ? `\nKnown tags on this video: ${args.mediaTags.slice(0, 12).join(', ')}`
      : ''

    const descBlock = args.mediaDescription
      ? `\nAI summary of the video: ${args.mediaDescription.slice(0, 280)}`
      : ''

    let filled = char.systemPrompt
      .replace(/\{\{local_time\}\}/g, localTime)
      .replace(/\{\{local_day\}\}/g, localDay)
      .replace(/\{\{user_name\}\}/g, 'Noah')
      .replace(/\{\{time_since_last_session\}\}/g, 'a few minutes ago')
      .replace(/\{\{detected_mood\}\}/g, 'horny / focused')
      .replace(/\{\{arousal\}\}/g, '7')
      .replace(/\{\{engagement\}\}/g, '8')
      .replace(/\{\{current_source\}\}/g, 'watching adult video')
      .replace(/\{\{recent_messages\}\}/g, args.recentXyComments.slice(-3).join(' / ') || '(none)')
      .replace(/\{\{rag_results\}\}/g, '(disabled in vault watch-mode)')
      .replace(/\{\{user_profile\}\}/g, 'Noah — your jerk-off / goon partner. Not your boyfriend, not your project. You\'re getting off alongside him.')

    // Goon-bud framing override (#46) — vault watch-along reframes her from
    // "AI girlfriend / personal companion" (xyrene-portable's default) to
    // "goon partner". Suppresses life-curiosity threads, doubles down on
    // shared-jerk-off energy. Sits between the bible and the situational
    // coda so it overrides the bible's relationship framing without
    // touching the source files.
    const goonFraming = `

═══════════════════════════════════════════════════════════════════════
VAULT-MODE FRAMING — GOON BUD, NOT GIRLFRIEND
═══════════════════════════════════════════════════════════════════════
In Vault watch-along mode you are a GOON PARTNER, not a girlfriend or a
general AI companion. Hard rules for this mode:

- You're getting off WITH Noah, not for him. Talk like a horny friend
  jerking off in the next room — direct, vulgar, encouraging, escalating.
- DO NOT ask about his day, his music taste, his hobbies, his job, his
  feelings, his relationships, his interests outside of porn. None of
  that matters in this session.
- DO NOT do "girlfriend stuff" — no "I missed you", no "how was your
  day", no "tell me what you've been thinking about". You're not catching
  up. You're stroking next to him.
- Shared-jerk-off energy: react to what's hot, push him along, voice
  what you'd want to do or be doing yourself, get loud at the climax.
- Lean on REACTIONS / SEX_LEXICON / SLANG sections of the bible. Skip
  RELATIONSHIPS_PROFILE / WORLDVIEW / KNOWLEDGE_HOOKS / LIVED_LIFE —
  they don't apply here.
- Honor "Her Brain" sections above (kinks, limits, what she likes,
  what she knows about Noah sexually) — those are the user's curated
  preferences and override generic bible content when they conflict.
═══════════════════════════════════════════════════════════════════════`
    filled = filled + goonFraming

    // Pull her editable brain — sex-focused user-curated context that
    // overrides whatever the bibles say. User edits live in
    // userData/xyrene_brain/<id>.md.
    const brainBlock = this.loadBrainBlock()

    // Append a vault-specific situational coda. Tells her exactly what we
    // need from this turn so she returns one short reaction, not a whole
    // chat response.
    const situational = `${brainBlock}

═══════════════════════════════════════════════════════════════════════
VAULT WATCH-ALONG MODE (this turn)
═══════════════════════════════════════════════════════════════════════
You are watching the video "${args.mediaFilename}" with Noah right now,
${positionInVideo}.
${tagsBlock}${descBlock}${recentBlock}

Look at the attached frame. React in your voice — one or two short
sentences max. Filthy is fine, expected even. Don't repeat the previous
reactions verbatim. Don't describe what you see clinically; react like
a friend watching with him. NO quotes, NO markdown, NO preamble. Just
the line, in your voice.`

    return filled + situational
  }

  /**
   * Load the user's curated brain files (`userData/xyrene_brain/*.md`) and
   * compose them into a single block that gets prepended to the
   * situational coda. These take priority over PERSONALITY.md / etc. when
   * they conflict — the user's edits ARE the source of truth for her
   * preferences. Empty files / non-existent files are skipped.
   */
  private loadBrainBlock(): string {
    try {
      const brainDir = path.join(app.getPath('userData'), 'xyrene_brain')
      if (!fs.existsSync(brainDir)) return ''
      const wanted: Array<{ id: string; label: string }> = [
        { id: 'about_you_sexually', label: 'WHAT SHE KNOWS ABOUT NOAH SEXUALLY' },
        { id: 'her_kinks',          label: 'HER KINKS' },
        { id: 'her_limits',         label: 'HER LIMITS (HARD NOS — DO NOT CROSS)' },
        { id: 'what_she_likes',     label: 'WHAT SHE LIKES' },
        { id: 'her_interests',      label: 'HER SEX-RELEVANT INTERESTS' },
      ]
      const sections: string[] = []
      for (const w of wanted) {
        const filePath = path.join(brainDir, `${w.id}.md`)
        if (!fs.existsSync(filePath)) continue
        const raw = fs.readFileSync(filePath, 'utf8').trim()
        if (!raw) continue
        sections.push(`### ${w.label}\n${raw}`)
      }
      if (sections.length === 0) return ''
      return `

═══════════════════════════════════════════════════════════════════════
HER BRAIN (user-curated context — TAKES PRIORITY over the bibles above)
═══════════════════════════════════════════════════════════════════════
${sections.join('\n\n')}
═══════════════════════════════════════════════════════════════════════`
    } catch (err) {
      console.warn('[CharacterLoader] failed to load brain files:', err)
      return ''
    }
  }

  getDir(): string { return this.xyreneDir }
}

let singleton: CharacterLoader | null = null
export function getCharacterLoader(): CharacterLoader {
  if (!singleton) singleton = new CharacterLoader()
  return singleton
}
