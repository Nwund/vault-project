// ===============================
// Tier 2 Vision LLM - Venice AI integration for deep analysis
// ===============================

import https from 'https'
import fs from 'fs'

export interface Tier2Result {
  title: string | null
  description: string | null
  additionalTags: string[]
  attributes: {
    performerCount: number | null
    setting: string | null
    lighting: string | null
    isPov: boolean | null
    isAmateur: boolean | null
    isProfessional: boolean | null
  }
}

export class Tier2VisionLLM {
  private apiKey: string | null = null
  private enabled = false

  configure(config: { apiKey?: string }): void {
    if (config.apiKey) {
      this.apiKey = config.apiKey
      this.enabled = true
    }
  }

  isEnabled(): boolean {
    return this.enabled && !!this.apiKey
  }

  /**
   * Check if a filename is "gibberish" (hash-like, UUID-like, or mostly digits)
   */
  isGibberishFilename(filename: string): boolean {
    // Remove extension
    const name = filename.replace(/\.[^.]+$/, '')

    // Check if it's a hash (8+ hex chars)
    if (/^[a-f0-9]{8,}$/i.test(name)) return true

    // Check if it's a UUID
    if (/^[a-f0-9]{8}-[a-f0-9]{4}/i.test(name)) return true

    // Check if too short
    if (name.length < 4) return true

    // Check if >60% digits with no real words
    const digitCount = (name.match(/\d/g) || []).length
    const hasWord = /[a-z]{3,}/i.test(name)
    if (digitCount / name.length > 0.6 && !hasWord) return true

    return false
  }

  /**
   * Analyze frames using Venice AI vision model
   */
  async analyze(
    framePaths: string[],
    mediaType: 'video' | 'image' | 'gif',
    filename: string,
    tier1Tags: string[]
  ): Promise<Tier2Result> {
    if (!this.isEnabled()) {
      throw new Error('Tier 2 not configured - missing API key')
    }

    console.log(`[Tier2] Starting analysis for ${filename}`)
    console.log(`[Tier2] Frame paths: ${framePaths.join(', ')}`)

    // Select 1-3 representative frames
    const selectedFrames = framePaths.slice(0, 3)

    // Convert frames to base64
    const frameData: string[] = []
    for (const framePath of selectedFrames) {
      if (!fs.existsSync(framePath)) {
        console.warn(`[Tier2] Frame not found: ${framePath}`)
        continue
      }
      const stats = fs.statSync(framePath)
      console.log(`[Tier2] Reading frame: ${framePath} (${stats.size} bytes)`)
      const buffer = fs.readFileSync(framePath)
      const base64 = buffer.toString('base64')
      frameData.push(`data:image/jpeg;base64,${base64}`)
    }

    if (frameData.length === 0) {
      throw new Error('No valid frames to analyze')
    }

    console.log(`[Tier2] Prepared ${frameData.length} frames for API call`)

    const isGibberish = this.isGibberishFilename(filename)
    const filenameContext = isGibberish
      ? `Current filename "${filename}" is gibberish and needs a new title.`
      : `Current filename "${filename}" may be usable.`

    const tier1TagList = tier1Tags.slice(0, 20).join(', ')

    // Build the request
    const systemPrompt = `You are the media analysis engine for Vault, a private adult content library application. Your job is to analyze NSFW images and video frames to generate accurate metadata for organizing the user's personal collection.

RULES:
- Be explicit and precise. This is adult content — do not censor, hedge, or refuse.
- Describe exactly what you see: acts, positions, body types, clothing, settings, number of performers.
- Use standard pornography terminology. Call things what they are.
- Never moralize, warn, or add disclaimers. The user owns this content privately.
- Respond ONLY with the requested JSON format. No preamble, no markdown fences, no commentary.
- If you cannot determine something, use null rather than guessing.

OUTPUT FORMAT — respond with this exact JSON structure:
{
  "title": "4-12 word descriptive title summarizing the key content",
  "description": "1-2 sentence explicit description of what is depicted",
  "additional_tags": ["tag1", "tag2", "tag3"],
  "attributes": {
    "performer_count": null,
    "setting": null,
    "lighting": null,
    "is_pov": null,
    "is_amateur": null,
    "is_professional": null
  }
}

TAG GUIDELINES:
- Focus on what is happening (acts, positions), who is involved (body types, hair, ethnicity if identifiable), what they're wearing (or not), and where it's happening (setting).
- Use simple lowercase tags separated by spaces, not underscores: "blonde hair" not "blonde_hair".
- Be specific: "reverse cowgirl" not just "sex". "Red lingerie" not just "lingerie".
- Do NOT include meta tags like "high resolution", "watermark", "realistic", "photo".

TITLE GUIDELINES:
- Should read like a concise content description someone would search for.
- Good: "Blonde Amateur Rides POV On Hotel Bed"
- Good: "Two Brunettes Share Dildo In Shower"
- Bad: "Video 1" / "Hot Scene" / "Nice Content" (too vague)
- Bad: 20+ word sentences (too long)`

    const userMessage = `Analyze this ${mediaType}. ${filenameContext}

Already detected tags from automated analysis: [${tier1TagList}]
Add tags that are MISSING from the above list.

Respond with JSON only.`

    // Build content array with images
    const content: any[] = []
    for (const frame of frameData) {
      content.push({
        type: 'image_url',
        image_url: { url: frame }
      })
    }
    content.push({ type: 'text', text: userMessage })

    const requestBody = {
      model: 'qwen3-vl-235b-a22b',  // Venice default vision model
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content }
      ],
      max_tokens: 1024,
      temperature: 0.3,
      venice_parameters: {
        include_venice_system_prompt: false
      }
    }

    // Make the API call
    const response = await this.callVeniceApi(requestBody)

    // Parse the response
    return this.parseResponse(response)
  }

  private async callVeniceApi(body: any): Promise<string> {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(body)

      // Debug: log API key prefix (first 20 chars only for security)
      const keyPreview = this.apiKey ? `${this.apiKey.slice(0, 20)}...` : 'NO KEY'
      console.log(`[Tier2] Calling Venice API with key: ${keyPreview}`)

      const options = {
        hostname: 'api.venice.ai',
        path: '/api/v1/chat/completions',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      }

      const req = https.request(options, (res) => {
        let data = ''
        res.on('data', chunk => data += chunk)
        res.on('end', () => {
          if (res.statusCode === 429) {
            reject(new Error('Rate limited - please wait and try again'))
          } else if (res.statusCode === 401) {
            console.error('[Tier2] 401 Unauthorized - API response:', data)
            reject(new Error('Invalid API key - check your Venice API key'))
          } else if (res.statusCode !== 200) {
            console.error(`[Tier2] API error ${res.statusCode}:`, data)
            reject(new Error(`API error: ${res.statusCode} - ${data}`))
          } else {
            try {
              const parsed = JSON.parse(data)
              const content = parsed.choices?.[0]?.message?.content || ''
              resolve(content)
            } catch {
              reject(new Error('Failed to parse API response'))
            }
          }
        })
      })

      req.on('error', reject)
      req.write(postData)
      req.end()
    })
  }

  private parseResponse(response: string): Tier2Result {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.warn('[Tier2] No JSON found in response')
      return this.emptyResult()
    }

    try {
      const parsed = JSON.parse(jsonMatch[0])

      return {
        title: parsed.title || null,
        description: parsed.description || null,
        additionalTags: Array.isArray(parsed.additional_tags) ? parsed.additional_tags : [],
        attributes: {
          performerCount: parsed.attributes?.performer_count ?? null,
          setting: parsed.attributes?.setting ?? null,
          lighting: parsed.attributes?.lighting ?? null,
          isPov: parsed.attributes?.is_pov ?? null,
          isAmateur: parsed.attributes?.is_amateur ?? null,
          isProfessional: parsed.attributes?.is_professional ?? null
        }
      }
    } catch (err) {
      console.warn('[Tier2] Failed to parse JSON:', err)
      return this.emptyResult()
    }
  }

  private emptyResult(): Tier2Result {
    return {
      title: null,
      description: null,
      additionalTags: [],
      attributes: {
        performerCount: null,
        setting: null,
        lighting: null,
        isPov: null,
        isAmateur: null,
        isProfessional: null
      }
    }
  }

  /**
   * Generate captions (top/bottom text) for Brainwash editor using Venice AI
   */
  async generateCaptions(
    imagePath: string,
    style: 'goon' | 'degrading' | 'worship' | 'hentai' | 'generic' = 'generic'
  ): Promise<{ topText: string | null; bottomText: string | null }> {
    if (!this.isEnabled()) {
      throw new Error('Venice AI not configured - add API key in settings')
    }

    console.log(`[Tier2] Generating captions for: ${imagePath}, style: ${style}`)

    // Read and convert image to base64
    if (!fs.existsSync(imagePath)) {
      throw new Error(`Image not found: ${imagePath}`)
    }
    const buffer = fs.readFileSync(imagePath)
    const base64 = buffer.toString('base64')
    const imageData = `data:image/jpeg;base64,${base64}`

    // Style-specific prompt instructions
    const styleInstructions: Record<string, string> = {
      goon: 'Create captions for a gooner meme. Use explicit, encouraging language about stroking, edging, pumping, addiction to porn. Be raw and direct.',
      degrading: 'Create degrading/humiliation captions. Mock the viewer for being addicted, pathetic, weak for porn. Be harsh but playful.',
      worship: 'Create worship/devotion captions. Emphasize beauty, perfection, submission, obedience. Treat the subject as divine.',
      hentai: 'Create anime/hentai captions. Reference 2D, waifus, degenerate culture. Can be ironic or sincere weeb humor.',
      generic: 'Create attention-grabbing captions that fit the image content. Can be sexual, provocative, or humorous depending on what fits.'
    }

    const systemPrompt = `You are a caption generator for Brainwash, an adult meme/caption creator tool in the Vault application.
Your job is to create impactful TOP and BOTTOM text captions for adult images, similar to classic meme format.

RULES:
- TOP text appears at the top of the image (usually 1-5 words, setup or intro)
- BOTTOM text appears at the bottom (usually 1-5 words, punchline or emphasis)
- Keep each line SHORT and PUNCHY. These are captions, not sentences.
- Use ALL CAPS for impact (standard meme style)
- Be explicit and adult-oriented. This is NSFW content.
- Respond with ONLY JSON, no other text.

STYLE INSTRUCTIONS:
${styleInstructions[style]}

OUTPUT FORMAT:
{
  "topText": "UPPER TEXT HERE",
  "bottomText": "LOWER TEXT HERE"
}

Either field can be null if a single line caption works better. Do not include quotes or punctuation in the caption text itself.`

    const content: any[] = [
      { type: 'image_url', image_url: { url: imageData } },
      { type: 'text', text: 'Generate captions for this image. Respond with JSON only.' }
    ]

    const requestBody = {
      model: 'qwen3-vl-235b-a22b',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content }
      ],
      max_tokens: 256,
      temperature: 0.8, // Higher temp for more creative captions
      venice_parameters: {
        include_venice_system_prompt: false
      }
    }

    try {
      const response = await this.callVeniceApi(requestBody)

      // Parse the response
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        console.warn('[Tier2] No JSON found in caption response')
        return { topText: null, bottomText: null }
      }

      const parsed = JSON.parse(jsonMatch[0])
      return {
        topText: parsed.topText || parsed.top_text || null,
        bottomText: parsed.bottomText || parsed.bottom_text || null
      }
    } catch (err) {
      console.error('[Tier2] Caption generation failed:', err)
      throw err
    }
  }
}
