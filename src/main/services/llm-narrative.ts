// File: src/main/services/llm-narrative.ts
//
// #383 H-159 text-adventure + #370 H-146 CYOA scenario builder.
// One shared engine: each turn is { narrative, choices[], state }.
// Caller supplies the seed scenario + optional video context (so the
// adventure can ride alongside playback). Engine routes generation
// through Venice via the existing tier2-vision-llm helper.
//
// Modes:
//   - 'text-adventure': linear with branching choices (Zork-style).
//     Each turn returns 3-4 numbered options; player picks one and
//     advance() returns the next narrative beat.
//   - 'cyoa': choose-your-own-adventure with explicit branch labels
//     and longer turns (~250 words each). Each branch is a fully-
//     written scene fork.
//
// State lives entirely in the renderer; the backend is a pure
// stateless turn generator. The renderer threads the conversation
// history back in on each advance() call.

import { net } from 'electron'
import { safeStorage } from 'electron'
import { getSettings } from '../settings'

// Thin Venice text-only chat completion. Uses the existing Venice
// API key (safeStorage-encrypted in settings.ai.veniceApiKey).
async function veniceChat(args: { systemPrompt: string; userPrompt: string; maxTokens: number; temperature?: number }): Promise<string> {
  const s = getSettings() as any
  const encKey: string | null = s?.ai?.veniceApiKey ?? null
  if (!encKey) throw new Error('Venice API key not configured')
  let apiKey: string
  try {
    apiKey = safeStorage.decryptString(Buffer.from(encKey, 'base64'))
  } catch (err: any) {
    throw new Error(`Failed to decrypt Venice key: ${err.message}`)
  }
  const body = JSON.stringify({
    model: 'venice-uncensored-1-2',
    messages: [
      { role: 'system', content: args.systemPrompt },
      { role: 'user', content: args.userPrompt },
    ],
    max_tokens: args.maxTokens,
    temperature: args.temperature ?? 0.85,
  })
  return await new Promise<string>((resolve, reject) => {
    const req = net.request({
      method: 'POST',
      url: 'https://api.venice.ai/api/v1/chat/completions',
    })
    req.setHeader('Authorization', `Bearer ${apiKey}`)
    req.setHeader('Content-Type', 'application/json')
    let buf = ''
    req.on('response', (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        res.on('data', (c: Buffer) => { buf += c.toString('utf8') })
        res.on('end', () => reject(new Error(`Venice HTTP ${res.statusCode}: ${buf.slice(0, 200)}`)))
        return
      }
      res.on('data', (c: Buffer) => { buf += c.toString('utf8') })
      res.on('end', () => {
        try {
          const parsed = JSON.parse(buf)
          const text = parsed?.choices?.[0]?.message?.content
          if (typeof text !== 'string') reject(new Error('Venice returned no message content'))
          else resolve(text)
        } catch (err: any) { reject(new Error(`Venice JSON parse: ${err.message}`)) }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

export type NarrativeMode = 'text-adventure' | 'cyoa'

export interface NarrativeTurn {
  narrative: string
  choices: Array<{ id: string; label: string }>
  ended: boolean
  endingType?: 'climax' | 'denial' | 'tease' | 'normal'
}

export interface NarrativeContext {
  mode: NarrativeMode
  seed: string                          // initial scenario / setting
  history: Array<{ turn: NarrativeTurn; chosenChoice: string }>
  videoFilename?: string                // optional — sync to current playback
  videoTags?: string[]
  persona?: 'goonbud' | 'mistress' | 'stepsister' | 'boss' | 'cheerleader'
}

function buildSystemPrompt(mode: NarrativeMode, persona?: string): string {
  const personaTone = persona === 'mistress' ? 'Dominant. Mistress voice. Order, never request.'
    : persona === 'stepsister' ? 'Forbidden tone. Stepsister catching him in the act.'
    : persona === 'boss' ? 'Boss / after-hours / power-imbalance tone.'
    : persona === 'cheerleader' ? 'Bubbly, supportive, hype-girl tone.'
    : 'Direct, vulgar, goon-bud tone — getting off WITH him not for him.'

  if (mode === 'cyoa') {
    return `You are a CYOA (choose-your-own-adventure) narrator running a horny scenario. ${personaTone}

For each turn, write a SCENE (~250 words, sensory, immersive) ending at a branch point.
Then output EXACTLY 3-4 numbered choices the player can take next.
Format response as JSON:
{ "narrative": "...scene text...", "choices": [{"id":"a","label":"..."}, ...], "ended": false }

End the story when narratively warranted with ended:true and endingType set to one of: "climax", "denial", "tease", "normal".`
  }
  // text-adventure
  return `You are a Zork-style text-adventure narrator running a horny scenario. ${personaTone}

For each turn, write a SHORT beat (~80 words, second-person) ending with the player's options.
Then output EXACTLY 3-4 numbered short action choices ("touch yourself", "wait", "go closer", etc).
Format response as JSON:
{ "narrative": "...beat text...", "choices": [{"id":"a","label":"action"}, ...], "ended": false }

End on narratively warranted moments with ended:true and endingType in: "climax", "denial", "tease", "normal".`
}

function buildUserPrompt(ctx: NarrativeContext): string {
  const lines: string[] = []
  if (ctx.history.length === 0) {
    lines.push(`Start the scenario. Seed: ${ctx.seed}`)
    if (ctx.videoFilename) lines.push(`The player is watching the video "${ctx.videoFilename}" alongside this adventure.`)
    if (ctx.videoTags && ctx.videoTags.length > 0) lines.push(`Video tags: ${ctx.videoTags.slice(0, 10).join(', ')}`)
  } else {
    lines.push(`Scenario seed: ${ctx.seed}`)
    if (ctx.videoFilename) lines.push(`Player watching: "${ctx.videoFilename}"`)
    lines.push('')
    lines.push('Story so far:')
    for (const h of ctx.history) {
      lines.push(`Narrator: ${h.turn.narrative}`)
      lines.push(`Player chose: ${h.chosenChoice}`)
    }
    lines.push('')
    lines.push('Continue from here.')
  }
  return lines.join('\n')
}

function parseTurn(raw: string): NarrativeTurn {
  // Try to extract JSON from a response that may include code fences
  // or preamble text. Fall back to a degraded parse if JSON is broken.
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        narrative: String(parsed.narrative ?? raw).trim(),
        choices: Array.isArray(parsed.choices) ? parsed.choices.map((c: any, i: number) => ({
          id: String(c.id ?? String.fromCharCode(97 + i)),
          label: String(c.label ?? c.text ?? '').trim(),
        })).filter((c: any) => c.label) : [],
        ended: !!parsed.ended,
        endingType: parsed.endingType,
      }
    } catch { /* fall through to degraded */ }
  }
  // Degraded: use the whole text as narrative, no choices.
  return { narrative: raw.trim(), choices: [], ended: false }
}

export async function generateTurn(ctx: NarrativeContext): Promise<NarrativeTurn> {
  const systemPrompt = buildSystemPrompt(ctx.mode, ctx.persona)
  const userPrompt = buildUserPrompt(ctx)
  // tier2-vision-llm handles auth + Venice routing. We don't need
  // vision for this — pass an empty image list and the prompt as
  // both system + user via its existing interface.
  try {
    const raw = await veniceChat({
      systemPrompt,
      userPrompt,
      maxTokens: ctx.mode === 'cyoa' ? 600 : 250,
      temperature: 0.85,
    })
    return parseTurn(raw)
  } catch (err: any) {
    return {
      narrative: `(generation failed: ${err?.message ?? String(err)})`,
      choices: [{ id: 'retry', label: 'Try again' }],
      ended: false,
    }
  }
}
