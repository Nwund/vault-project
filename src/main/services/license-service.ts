// File: src/main/services/license-service.ts
// License and tier management for Vault

import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'

export enum UserTier {
  FREE = 'free',
  PREMIUM = 'premium',
  OWNER = 'owner',
}

export interface TierLimits {
  playlists: number | 'unlimited'
  goonWallTiles: number
  themes: 'basic' | 'all'
  diabella: boolean
  stats: 'basic' | 'full'
  achievements: boolean
  watchAlong: boolean
  quickCuts: boolean
  customPacks: boolean
}

export const TIER_LIMITS: Record<UserTier, TierLimits> = {
  [UserTier.FREE]: {
    playlists: 3,
    goonWallTiles: 4,
    themes: 'basic',
    diabella: false,
    stats: 'basic',
    achievements: false,
    watchAlong: false,
    quickCuts: false,
    customPacks: false,
  },
  [UserTier.PREMIUM]: {
    playlists: 'unlimited',
    goonWallTiles: 16,
    themes: 'all',
    diabella: true,
    stats: 'full',
    achievements: true,
    watchAlong: true,
    quickCuts: true,
    customPacks: true,
  },
  [UserTier.OWNER]: {
    playlists: 'unlimited',
    goonWallTiles: 25,
    themes: 'all',
    diabella: true,
    stats: 'full',
    achievements: true,
    watchAlong: true,
    quickCuts: true,
    customPacks: true,
  },
}

class LicenseService {
  private currentTier: UserTier = UserTier.FREE
  private licenseKey: string | null = null

  // Hashed machine IDs for owner access (add your machine IDs here)
  private readonly OWNER_MACHINE_IDS: string[] = [
    // Run getMyMachineId() to get your hashed ID and add it here
    // Example: 'a1b2c3d4e5f6...'
  ]

  // Secret key for owner access (store in .owner-key file)
  private readonly OWNER_SECRET_KEY = 'VAULT-OWNER-MASTER-KEY-2024'

  constructor() {
    this.detectTier()
  }

  /**
   * Detect the user's tier on startup
   */
  private detectTier(): void {
    // Check for owner first
    if (this.isOwner()) {
      this.currentTier = UserTier.OWNER
      console.log('[License] Owner mode detected')
      return
    }

    // Check for saved license
    const savedLicense = this.loadSavedLicense()
    if (savedLicense && this.validateLicenseKey(savedLicense)) {
      this.licenseKey = savedLicense
      this.currentTier = UserTier.PREMIUM
      console.log('[License] Premium license validated')
      return
    }

    // Default to free
    this.currentTier = UserTier.FREE
    console.log('[License] Free tier')
  }

  /**
   * Check if current machine is owner
   */
  isOwner(): boolean {
    // Check 1: Machine ID (if node-machine-id is available)
    try {
      const machineId = this.getMachineId()
      const hashedId = this.hashMachineId(machineId)
      if (this.OWNER_MACHINE_IDS.includes(hashedId)) {
        return true
      }
    } catch {
      // Machine ID not available
    }

    // Check 2: Secret key file in user data
    try {
      const keyFilePath = path.join(app.getPath('userData'), '.owner-key')
      if (fs.existsSync(keyFilePath)) {
        const key = fs.readFileSync(keyFilePath, 'utf-8').trim()
        if (key === this.OWNER_SECRET_KEY) {
          return true
        }
      }
    } catch {
      // Key file not found
    }

    // Check 3: Environment variable (for development)
    if (process.env.VAULT_OWNER_MODE === 'true') {
      return true
    }

    // Check 4: Dev mode detection
    if (!app.isPackaged) {
      // In development, always treat as owner
      return true
    }

    return false
  }

  /**
   * Get machine-specific identifier
   */
  private getMachineId(): string {
    // Simple machine ID based on available info
    const os = require('os')
    const cpus = os.cpus()
    const networkInterfaces = os.networkInterfaces()

    const components = [
      os.hostname(),
      os.platform(),
      os.arch(),
      cpus[0]?.model || '',
      Object.values(networkInterfaces)
        .flat()
        .find((i: any) => !i?.internal && i?.mac)?.mac || '',
    ]

    return components.join('|')
  }

  /**
   * Hash machine ID for security
   */
  private hashMachineId(id: string): string {
    return crypto.createHash('sha256').update(id + 'vault-salt-2024').digest('hex')
  }

  /**
   * Get your machine ID (for adding to OWNER_MACHINE_IDS)
   */
  getMyMachineId(): string {
    const raw = this.getMachineId()
    const hashed = this.hashMachineId(raw)
    console.log('[License] Your machine ID (hashed):', hashed)
    return hashed
  }

  /**
   * Validate a license key
   */
  validateLicenseKey(key: string): boolean {
    // Format: VAULT-XXXX-XXXX-XXXX-XXXX
    const parts = key.toUpperCase().split('-')
    if (parts.length !== 5 || parts[0] !== 'VAULT') {
      return false
    }

    // Validate each part is 4 alphanumeric chars
    for (let i = 1; i < 4; i++) {
      if (!/^[A-Z0-9]{4}$/.test(parts[i])) {
        return false
      }
    }

    // Validate checksum
    const payload = parts.slice(1, 4).join('')
    const checksum = parts[4]
    const expectedChecksum = this.generateChecksum(payload)

    return checksum === expectedChecksum
  }

  /**
   * Generate checksum for license key
   */
  private generateChecksum(payload: string): string {
    return crypto
      .createHash('md5')
      .update(payload + 'vault-checksum-2024')
      .digest('hex')
      .slice(0, 4)
      .toUpperCase()
  }

  /**
   * Generate a new license key (for distribution)
   */
  generateLicenseKey(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    const parts: string[] = ['VAULT']

    for (let i = 0; i < 3; i++) {
      let part = ''
      for (let j = 0; j < 4; j++) {
        part += chars[Math.floor(Math.random() * chars.length)]
      }
      parts.push(part)
    }

    const payload = parts.slice(1).join('')
    const checksum = this.generateChecksum(payload)
    parts.push(checksum)

    return parts.join('-')
  }

  /**
   * Activate a license key
   */
  activateLicense(key: string): boolean {
    if (!this.validateLicenseKey(key)) {
      return false
    }

    this.licenseKey = key
    this.currentTier = UserTier.PREMIUM
    this.saveLicense(key)

    return true
  }

  /**
   * Save license to disk
   */
  private saveLicense(key: string): void {
    try {
      const licensePath = path.join(app.getPath('userData'), '.license')
      fs.writeFileSync(licensePath, key, 'utf-8')
    } catch (err) {
      console.error('[License] Failed to save license:', err)
    }
  }

  /**
   * Load saved license from disk
   */
  private loadSavedLicense(): string | null {
    try {
      const licensePath = path.join(app.getPath('userData'), '.license')
      if (fs.existsSync(licensePath)) {
        return fs.readFileSync(licensePath, 'utf-8').trim()
      }
    } catch {
      // No saved license
    }
    return null
  }

  /**
   * Get current tier
   */
  getTier(): UserTier {
    return this.currentTier
  }

  /**
   * Get tier limits
   */
  getLimits(): TierLimits {
    return TIER_LIMITS[this.currentTier]
  }

  /**
   * Check if a feature is available
   */
  hasFeature(feature: keyof TierLimits): boolean {
    const limits = this.getLimits()
    const value = limits[feature]

    if (typeof value === 'boolean') {
      return value
    }
    if (value === 'unlimited' || value === 'all' || value === 'full') {
      return true
    }
    return true // Numbers are always "available" just limited
  }

  /**
   * Get feature limit (for numeric limits)
   */
  getLimit(feature: 'playlists' | 'goonWallTiles'): number {
    const limits = this.getLimits()
    const value = limits[feature]

    if (value === 'unlimited') {
      return Infinity
    }
    return value as number
  }

  /**
   * Check if premium features are available
   */
  isPremium(): boolean {
    return this.currentTier === UserTier.PREMIUM || this.currentTier === UserTier.OWNER
  }

  /**
   * Get license info for display
   */
  getLicenseInfo(): {
    tier: UserTier
    licenseKey: string | null
    isPremium: boolean
    isOwner: boolean
  } {
    return {
      tier: this.currentTier,
      licenseKey: this.licenseKey,
      isPremium: this.isPremium(),
      isOwner: this.currentTier === UserTier.OWNER,
    }
  }
}

// Singleton instance
let licenseService: LicenseService | null = null

export function getLicenseService(): LicenseService {
  if (!licenseService) {
    licenseService = new LicenseService()
  }
  return licenseService
}

export default LicenseService
