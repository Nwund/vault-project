// ===============================
// Model Downloader - Download ONNX models from HuggingFace
// ===============================

import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import https from 'https'
import http from 'http'

export interface ModelInfo {
  name: string
  filename: string
  url: string
  size: number // bytes
  downloaded: boolean
}

export interface DownloadProgress {
  model: string
  percent: number
  bytesDownloaded: number
  bytesTotal: number
}

// NSFWJS outputs these 5 classes (in order)
export const NSFW_CLASSES = ['drawings', 'hentai', 'neutral', 'porn', 'sexy'] as const

const MODELS: Omit<ModelInfo, 'downloaded'>[] = [
  // === NSFWJS - Content classification ===
  {
    name: 'NSFW Classifier',
    filename: 'nsfw-classifier.onnx',
    url: 'https://huggingface.co/deepghs/imgutils-models/resolve/main/nsfw/nsfwjs.onnx',
    size: 10.3 * 1024 * 1024 // ~10.3MB
  },

  // === WD Tagger - Anime/booru tagging ===
  // SwinV2 variant (current default). User can switch to ViT-v3 variant
  // below via settings.ai.wdTaggerVariant if desired (Deiwulf/AI-image-
  // auto-tagger reference, 2026-05-12). Both are SmilingWolf v3
  // generation — accuracy is comparable; ViT is slightly smaller.
  {
    name: 'WD Tagger v3 (SwinV2)',
    filename: 'wd-tagger-v3.onnx',
    url: 'https://huggingface.co/SmilingWolf/wd-swinv2-tagger-v3/resolve/main/model.onnx',
    size: 467 * 1024 * 1024 // ~467MB
  },
  {
    name: 'WD Tag Labels',
    filename: 'wd-tags.json',
    url: 'https://huggingface.co/SmilingWolf/wd-swinv2-tagger-v3/resolve/main/selected_tags.csv',
    size: 308 * 1024 // ~308KB
  },
  // Alternative WD tagger ViT variant. Downloaded on demand when the
  // user opts into it in AI Tools → Setup → Tagger variant. Smaller
  // file, comparable accuracy to SwinV2 — matches the Deiwulf
  // reference for digiKam-style tagging.
  {
    name: 'WD Tagger v3 (ViT)',
    filename: 'wd-vit-tagger-v3.onnx',
    url: 'https://huggingface.co/SmilingWolf/wd-vit-tagger-v3/resolve/main/model.onnx',
    size: 343 * 1024 * 1024  // ~343MB
  },
  {
    name: 'WD ViT Tag Labels',
    filename: 'wd-vit-tags.csv',
    url: 'https://huggingface.co/SmilingWolf/wd-vit-tagger-v3/resolve/main/selected_tags.csv',
    size: 308 * 1024
  },

  // === NudeNet - Body part detection for real content ===
  // NOTE: NudeNet classifier URL is no longer available (404)
  // The model was removed from deepghs/imgutils-models repository
  // Body part tagging is handled by WD Tagger and CLIP instead
  // Keeping this commented out for future if a replacement is found
  // {
  //   name: 'NudeNet Classifier',
  //   filename: 'nudenet-classifier.onnx',
  //   url: 'https://huggingface.co/deepghs/imgutils-models/resolve/main/nudenet/classifier.onnx',
  //   size: 3 * 1024 * 1024 // ~3MB
  // },

  // === CLIP - Zero-shot classification with custom tags ===
  {
    name: 'CLIP Vision',
    filename: 'clip-vision.onnx',
    url: 'https://huggingface.co/Xenova/clip-vit-base-patch32/resolve/main/onnx/vision_model.onnx',
    size: 88 * 1024 * 1024 // ~88MB
  },
  {
    name: 'CLIP Text',
    filename: 'clip-text.onnx',
    url: 'https://huggingface.co/Xenova/clip-vit-base-patch32/resolve/main/onnx/text_model.onnx',
    size: 64 * 1024 * 1024 // ~64MB
  },

  // === MoveNet + YuNet were previously listed here for auto-download
  // but the community ONNX mirrors are unreliable (HF repos rename,
  // GitHub raw URLs get rate-limited). Both moved to manual-install
  // pattern — drop the ONNX at:
  //   <userData>/models/movenet-multipose-lightning.onnx
  //   <userData>/models/face-detection-yunet.onnx
  // Setup tab cards show the expected paths + install instructions.
  // The pose/face detector modules use isAvailable() guards so the
  // queue silently skips when missing.
]

export class ModelDownloader {
  private modelsDir: string

  constructor() {
    this.modelsDir = path.join(app.getPath('userData'), 'ai-models')

    // Ensure models directory exists
    if (!fs.existsSync(this.modelsDir)) {
      fs.mkdirSync(this.modelsDir, { recursive: true })
    }
  }

  getModelsDir(): string {
    return this.modelsDir
  }

  getModelPath(filename: string): string {
    return path.join(this.modelsDir, filename)
  }

  /**
   * Check which models are downloaded
   */
  checkModels(): { all_ready: boolean; models: ModelInfo[] } {
    const models = MODELS.map(m => ({
      ...m,
      downloaded: fs.existsSync(this.getModelPath(m.filename))
    }))

    return {
      all_ready: models.every(m => m.downloaded),
      models
    }
  }

  /**
   * Download all missing models
   */
  async downloadModels(
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<{ success: boolean; error?: string }> {
    const { models } = this.checkModels()
    const missing = models.filter(m => !m.downloaded)

    if (missing.length === 0) {
      return { success: true }
    }

    for (const model of missing) {
      try {
        await this.downloadModel(model, onProgress)
      } catch (error) {
        console.error(`[ModelDownloader] Failed to download ${model.name}:`, error)
        return {
          success: false,
          error: `Failed to download ${model.name}: ${error}`
        }
      }
    }

    return { success: true }
  }

  private async downloadModel(
    model: Omit<ModelInfo, 'downloaded'>,
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<void> {
    const destPath = this.getModelPath(model.filename)
    const tempPath = destPath + '.tmp'

    // Clean up any existing temp file
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath) } catch {}
    }

    return new Promise((resolve, reject) => {
      const downloadWithRedirect = (url: string, redirectCount = 0) => {
        if (redirectCount > 10) {
          reject(new Error('Too many redirects'))
          return
        }

        console.log(`[ModelDownloader] Downloading ${model.name} from: ${url.slice(0, 80)}...`)

        // Use http or https based on URL protocol
        const isHttps = url.startsWith('https')
        const httpModule = isHttps ? https : http
        const timeout = 600000 // 10 minutes for large models

        const request = httpModule.get(url, { timeout }, (response) => {
          // Handle redirects (301, 302, 303, 307, 308)
          if ([301, 302, 303, 307, 308].includes(response.statusCode || 0)) {
            const redirectUrl = response.headers.location
            if (redirectUrl) {
              // Handle relative redirects
              const fullRedirectUrl = redirectUrl.startsWith('http')
                ? redirectUrl
                : new URL(redirectUrl, url).toString()
              console.log(`[ModelDownloader] Following redirect to: ${fullRedirectUrl.slice(0, 80)}...`)
              downloadWithRedirect(fullRedirectUrl, redirectCount + 1)
              return
            }
          }

          if (response.statusCode !== 200) {
            console.error(`[ModelDownloader] HTTP error ${response.statusCode} for ${model.name}`)
            reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage || 'Unknown error'}`))
            return
          }

          const totalBytes = parseInt(response.headers['content-length'] || '0', 10) || model.size
          let downloadedBytes = 0

          console.log(`[ModelDownloader] Starting download of ${model.name} (${(totalBytes / 1024 / 1024).toFixed(1)} MB)`)

          const fileStream = fs.createWriteStream(tempPath)

          response.on('data', (chunk: Buffer) => {
            downloadedBytes += chunk.length
            onProgress?.({
              model: model.name,
              percent: Math.round((downloadedBytes / totalBytes) * 100),
              bytesDownloaded: downloadedBytes,
              bytesTotal: totalBytes
            })
          })

          response.pipe(fileStream)

          fileStream.on('finish', () => {
            fileStream.close()
            console.log(`[ModelDownloader] Finished downloading ${model.name}`)

            // Handle CSV to JSON conversion for tag labels
            if (model.filename === 'wd-tags.json') {
              this.convertCsvToJson(tempPath, destPath)
                .then(resolve)
                .catch(reject)
            } else {
              // Move temp file to final destination
              try {
                fs.renameSync(tempPath, destPath)
                resolve()
              } catch (err) {
                reject(new Error(`Failed to save model file: ${err}`))
              }
            }
          })

          fileStream.on('error', (err) => {
            try { fs.unlinkSync(tempPath) } catch {}
            reject(err)
          })

          response.on('error', (err) => {
            try { fs.unlinkSync(tempPath) } catch {}
            reject(err)
          })
        })

        request.on('error', (err) => {
          console.error(`[ModelDownloader] Request error for ${model.name}:`, err)
          reject(err)
        })
        request.on('timeout', () => {
          request.destroy()
          console.error(`[ModelDownloader] Timeout downloading ${model.name}`)
          reject(new Error('Request timeout - try again with a faster connection'))
        })
      }

      downloadWithRedirect(model.url)
    })
  }

  /**
   * Convert the CSV tag labels file to JSON
   */
  private async convertCsvToJson(csvPath: string, jsonPath: string): Promise<void> {
    const csvContent = fs.readFileSync(csvPath, 'utf-8')
    const lines = csvContent.trim().split('\n')

    // Skip header row, extract tag names
    const tags: string[] = []
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',')
      if (parts.length >= 2) {
        // Tag name is usually the second column
        const tagName = parts[1]?.trim().replace(/"/g, '')
        if (tagName) {
          tags.push(tagName)
        }
      }
    }

    fs.writeFileSync(jsonPath, JSON.stringify(tags, null, 2))
    fs.unlinkSync(csvPath)
  }

  /**
   * Get the tag labels for a WD-Tagger variant. With no arg → returns
   * the canonical wd-tags.json (the default SwinV2 labels). With a
   * variant ID (e.g. 'pixai', 'joytag', 'idolsankaku') → looks for
   * wd-tags-<variant>.json first and falls back to wd-tags.json so
   * variants that share the same label vocab don't need a separate
   * file. Variants with their own vocab (joytag, idolsankaku) MUST
   * ship a wd-tags-<variant>.json or their tag IDs will be misaligned.
   */
  getTagLabels(variantId?: string): string[] {
    const candidates: string[] = []
    if (variantId) candidates.push(`wd-tags-${variantId}.json`)
    candidates.push('wd-tags.json')
    for (const filename of candidates) {
      const labelsPath = this.getModelPath(filename)
      if (!fs.existsSync(labelsPath)) continue
      try {
        const content = fs.readFileSync(labelsPath, 'utf-8')
        const parsed = JSON.parse(content)
        if (Array.isArray(parsed) && parsed.length > 0) return parsed
      } catch {
        // try next candidate
      }
    }
    return []
  }
}
