// ===============================
// File: src/main/services/audio/sound-organizer.ts
// Organizes NSFW sound packs into categorized folders
// ===============================

import * as fs from 'fs'
import * as path from 'path'

export interface SoundFile {
  originalPath: string
  filename: string
  category: string
  subcategory: string
  intensity: number // 1-5
  tags: string[]
}

export interface SoundManifest {
  version: string
  generatedAt: string
  totalFiles: number
  categories: Record<string, {
    files: Array<{ filename: string; intensity: number; tags: string[] }>
    subcategories: Record<string, Array<{ filename: string; intensity: number; tags: string[] }>>
  }>
}

// Keywords for categorization
const CATEGORY_KEYWORDS: Record<string, string[] | Record<string, string[]>> = {
  greetings: [
    'hello', 'hi', 'hey', 'welcome', 'greet', 'morning', 'evening',
    'back', 'there you are', 'missed you', 'intro'
  ],
  farewells: [
    'bye', 'goodbye', 'later', 'farewell', 'see you', 'leaving',
    'goodnight', 'sweet dreams', 'until', 'outro'
  ],
  reactions: {
    positive: ['mmm', 'nice', 'good', 'love', 'yes', 'perfect', 'delicious', 'yum'],
    surprised: ['oh', 'wow', 'omg', 'what', 'really', 'gasp'],
    excited: ['yes yes', 'more', 'dont stop', 'keep', 'amazing', 'incredible']
  },
  moans: {
    soft: ['soft', 'gentle', 'quiet', 'light', 'subtle'],
    medium: ['medium', 'moderate', 'normal'],
    intense: ['loud', 'intense', 'hard', 'strong', 'passionate']
  },
  teasing: {
    playful: ['tease', 'maybe', 'perhaps', 'want', 'beg', 'please', 'playful'],
    seductive: ['come', 'closer', 'show', 'let me', 'watch', 'seduce'],
    demanding: ['now', 'do it', 'obey', 'kneel', 'listen', 'command']
  },
  encouragement: {
    gentle: ['good boy', 'good girl', 'thats it', 'sweet'],
    eager: ['keep going', 'youre doing', 'perfect', 'just like that', 'right there'],
    commanding: ['faster', 'harder', 'more', 'dont stop', 'give me']
  },
  dirty_talk: {
    mild: ['naughty', 'bad', 'dirty', 'want you'],
    explicit: ['fuck', 'cock', 'pussy', 'cum', 'wet', 'hard'],
    extreme: ['deep', 'fill', 'take', 'pound', 'destroy']
  },
  breathing: {
    light: ['breath', 'sigh', 'exhale'],
    heavy: ['heavy', 'deep breath'],
    panting: ['pant', 'gasp', 'panting']
  },
  climax: {
    building: ['close', 'almost', 'edge', 'building'],
    peak: ['cumming', 'orgasm', 'finish', 'coming', 'release'],
    afterglow: ['after', 'satisfied', 'mmm', 'relaxed']
  },
  misc: {
    giggles: ['giggle', 'laugh', 'hehe', 'haha', 'chuckle', 'snicker'],
    whispers: ['whisper', 'quiet', 'soft', 'gentle', 'ear', 'secret', 'asmr'],
    other: []
  }
}

// Intensity keywords
const INTENSITY_KEYWORDS: Record<number, string[]> = {
  1: ['soft', 'gentle', 'light', 'quiet', 'subtle', 'mild', 'whisper'],
  2: ['medium', 'moderate', 'normal'],
  3: ['loud', 'strong', 'intense'],
  4: ['very', 'extreme', 'passionate', 'heavy'],
  5: ['max', 'peak', 'scream', 'explosive', 'wild']
}

export class SoundOrganizer {
  private sourceDir: string
  private targetDir: string

  constructor(sourceDir: string, targetDir: string) {
    this.sourceDir = sourceDir
    this.targetDir = targetDir
  }

  async organize(): Promise<SoundFile[]> {
    const files = this.scanDirectory(this.sourceDir)
    const categorized: SoundFile[] = []

    for (const file of files) {
      const soundFile = this.categorizeFile(file)
      categorized.push(soundFile)
      await this.copyFile(soundFile)
    }

    return categorized
  }

  private scanDirectory(dir: string): string[] {
    const audioExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac', '.webm']
    const files: string[] = []

    const scan = (currentDir: string) => {
      if (!fs.existsSync(currentDir)) return

      const items = fs.readdirSync(currentDir)
      for (const item of items) {
        const fullPath = path.join(currentDir, item)
        try {
          const stat = fs.statSync(fullPath)

          if (stat.isDirectory()) {
            scan(fullPath)
          } else if (audioExtensions.includes(path.extname(item).toLowerCase())) {
            files.push(fullPath)
          }
        } catch (e) {
          // Skip files we can't access
        }
      }
    }

    scan(dir)
    return files
  }

  private categorizeFile(filePath: string): SoundFile {
    const filename = path.basename(filePath, path.extname(filePath)).toLowerCase()
    const filenameClean = filename.replace(/[_\-\.0-9]/g, ' ').trim()

    let category = 'misc'
    let subcategory = 'other'
    let intensity = 2
    const tags: string[] = []

    // Check each category
    for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      if (Array.isArray(keywords)) {
        // Simple category (no subcategories)
        for (const keyword of keywords) {
          if (filenameClean.includes(keyword)) {
            category = cat
            tags.push(keyword)
            break
          }
        }
      } else {
        // Nested subcategories
        for (const [subcat, subKeywords] of Object.entries(keywords)) {
          for (const keyword of subKeywords) {
            if (filenameClean.includes(keyword)) {
              category = cat
              subcategory = subcat
              tags.push(keyword)
              break
            }
          }
          if (category !== 'misc') break
        }
      }
      if (category !== 'misc') break
    }

    // Determine intensity
    for (const [level, keywords] of Object.entries(INTENSITY_KEYWORDS)) {
      for (const keyword of keywords) {
        if (filenameClean.includes(keyword)) {
          intensity = parseInt(level)
          break
        }
      }
    }

    // If still misc, try to infer from parent folder name
    if (category === 'misc') {
      const parentDir = path.basename(path.dirname(filePath)).toLowerCase()
      for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
        if (Array.isArray(keywords)) {
          if (keywords.some(k => parentDir.includes(k))) {
            category = cat
            break
          }
        } else {
          for (const [subcat, subKeywords] of Object.entries(keywords)) {
            if (subKeywords.some(k => parentDir.includes(k)) || parentDir.includes(subcat)) {
              category = cat
              subcategory = subcat
              break
            }
          }
        }
      }
    }

    return {
      originalPath: filePath,
      filename: path.basename(filePath),
      category,
      subcategory,
      intensity,
      tags
    }
  }

  private async copyFile(soundFile: SoundFile): Promise<void> {
    let targetPath: string

    if (soundFile.subcategory !== 'other') {
      targetPath = path.join(
        this.targetDir,
        soundFile.category,
        soundFile.subcategory,
        soundFile.filename
      )
    } else {
      targetPath = path.join(
        this.targetDir,
        soundFile.category,
        soundFile.filename
      )
    }

    // Create directory if needed
    const dir = path.dirname(targetPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    // Copy file (not move, to preserve original)
    if (!fs.existsSync(targetPath)) {
      fs.copyFileSync(soundFile.originalPath, targetPath)
    }
  }

  generateManifest(files: SoundFile[]): SoundManifest {
    const manifest: SoundManifest = {
      version: '1.0',
      generatedAt: new Date().toISOString(),
      totalFiles: files.length,
      categories: {}
    }

    for (const file of files) {
      if (!manifest.categories[file.category]) {
        manifest.categories[file.category] = {
          files: [],
          subcategories: {}
        }
      }

      const catData = manifest.categories[file.category]

      if (file.subcategory !== 'other') {
        if (!catData.subcategories[file.subcategory]) {
          catData.subcategories[file.subcategory] = []
        }
        catData.subcategories[file.subcategory].push({
          filename: file.filename,
          intensity: file.intensity,
          tags: file.tags
        })
      } else {
        catData.files.push({
          filename: file.filename,
          intensity: file.intensity,
          tags: file.tags
        })
      }
    }

    return manifest
  }

  saveManifest(manifest: SoundManifest): void {
    const manifestPath = path.join(this.targetDir, 'manifest.json')
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  }
}
