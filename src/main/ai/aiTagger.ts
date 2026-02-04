// File: src/main/ai/aiTagger.ts
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import Store from 'electron-store'
import ffmpeg from 'fluent-ffmpeg'
import { ffmpegBin } from '../ffpaths'

if (ffmpegBin) ffmpeg.setFfmpegPath(ffmpegBin)

export type AiProvider = 'none' | 'ollama'

export type AiConfig = {
  provider: AiProvider
  enabled: boolean
  ollamaUrl: string
  ollamaModel: string
  frameCount: number
  minConfidence: number
  allowedTags: string[]
}

export type AiTagResult = {
  tags: Array<{ name: string; confidence: number }>
  rawText?: string
}

const DEFAULT_CONFIG: AiConfig = {
  provider: 'ollama',
  enabled: true,
  ollamaUrl: 'http://127.0.0.1:11434',
  ollamaModel: 'llava:latest',
  frameCount: 4,
  minConfidence: 0.35,
  allowedTags: [
    'orgasm',
    'anal',
    'blowjob',
    'cumshot',
    'deepthroat',
    'handjob',
    'threesome',
    'gangbang',
    'lesbian',
    'creampie',
    'rough',
    'solo',
    'masturbation',
    'cowgirl',
    'missionary',
    'doggy style'
  ]
}

const store = new Store<{ ai: AiConfig }>({ name: 'vault' })

export function getAiConfig(): AiConfig {
  const cfg = store.get('ai')
  return { ...DEFAULT_CONFIG, ...(cfg ?? {}) }
}

export function setAiConfig(patch: Partial<AiConfig>): AiConfig {
  const next = { ...getAiConfig(), ...patch }
  store.set('ai', next)
  return next
}

function tmpDirForJob(): string {
  const dir = path.join(os.tmpdir(), 'Vault', 'ai', crypto.randomUUID())
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function readB64(filePath: string): string {
  return fs.readFileSync(filePath).toString('base64')
}

async function extractFrames(videoPath: string, frameCount: number): Promise<string[]> {
  const outDir = tmpDirForJob()
  const count = Math.max(1, Math.min(8, Math.trunc(frameCount)))

  const files = Array.from({ length: count }, (_, i) => path.join(outDir, `frame-${String(i + 1).padStart(2, '0')}.jpg`))

  await new Promise<void>((resolve, reject) => {
    // "thumbnail" gives representative frames; fps spreads across time-ish.
    // This is intentionally simple and robust.
    ffmpeg(videoPath)
      .outputOptions([
        '-vf',
        `fps=1/5,scale=640:-1:flags=lanczos`,
        '-q:v',
        '5'
      ])
      .output(path.join(outDir, 'frame-%02d.jpg'))
      .outputOptions(['-frames:v', String(count)])
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run()
  })

  // Return only existing (ffmpeg might produce fewer for very short clips)
  return files.filter((f) => fs.existsSync(f))
}

function buildPrompt(allowedTags: string[]): string {
  const tagList = allowedTags.map((t) => `"${t}"`).join(', ')
  return [
    'You are a strict media tagger.',
    'From the allowed tag list ONLY, choose the most relevant tags for the provided adult video frames.',
    'Return JSON ONLY with this schema:',
    '{"tags":[{"name":"<tag from allowed list>","confidence":0.0}]}',
    'Rules:',
    '- name must be exactly one of the allowed tags',
    '- confidence is 0.0 to 1.0',
    '- do not include any other keys',
    '',
    `Allowed tags: [${tagList}]`
  ].join('\n')
}

function safeParseJsonObject(text: string): any | null {
  const trimmed = text.trim()
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      return JSON.parse(trimmed)
    } catch {
      // fallthrough
    }
  }
  const match = trimmed.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    return JSON.parse(match[0])
  } catch {
    return null
  }
}

async function ollamaTagFrames(cfg: AiConfig, imagesB64: string[]): Promise<AiTagResult> {
  const url = new URL('/api/chat', cfg.ollamaUrl).toString()
  const prompt = buildPrompt(cfg.allowedTags)

  const body = {
    model: cfg.ollamaModel,
    stream: false,
    messages: [
      {
        role: 'system',
        content: prompt
      },
      {
        role: 'user',
        content: 'Tag this video based on the frames.',
        images: imagesB64
      }
    ]
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Ollama error ${res.status}: ${text.slice(0, 400)}`)
  }

  const json = (await res.json()) as { message?: { content?: string } }
  const text = json?.message?.content ?? ''
  const parsed = safeParseJsonObject(text)

  const tagsRaw = parsed?.tags
  if (!Array.isArray(tagsRaw)) return { tags: [], rawText: text }

  const tags = tagsRaw
    .map((t: any) => ({
      name: String(t?.name ?? '').trim(),
      confidence: Number(t?.confidence ?? 0)
    }))
    .filter((t: { name: string; confidence: number }) => cfg.allowedTags.includes(t.name) && Number.isFinite(t.confidence))
    .map((t: { name: string; confidence: number }) => ({ ...t, confidence: Math.max(0, Math.min(1, t.confidence)) }))

  return { tags, rawText: text }
}

export async function aiTagVideo(
  videoPath: string,
  override?: Partial<AiConfig>
): Promise<AiTagResult> {
  const cfg = { ...getAiConfig(), ...(override ?? {}) }

  if (!cfg.enabled || cfg.provider === 'none') return { tags: [] }
  if (cfg.provider !== 'ollama') return { tags: [] }

  const frames = await extractFrames(videoPath, cfg.frameCount)
  const imagesB64 = frames.map(readB64)

  if (imagesB64.length === 0) return { tags: [] }

  const result = await ollamaTagFrames(cfg, imagesB64)

  // Apply thresholding here (callers can store everything if desired)
  result.tags = result.tags.filter((t) => t.confidence >= cfg.minConfidence)

  return result
}
