// File: vault-mobile/stores/broken-media.ts
// Tracks media items that failed to load/play

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

interface BrokenMediaState {
  brokenIds: Set<string>
  thumbFailedIds: Set<string>

  // Mark a media item as broken (won't play/load)
  markBroken: (id: string) => void

  // Mark a thumbnail as failed
  markThumbFailed: (id: string) => void

  // Check if an item is broken
  isBroken: (id: string) => boolean

  // Check if thumb failed
  isThumbFailed: (id: string) => boolean

  // Clear broken status for an item (e.g., after successful retry)
  clearBroken: (id: string) => void

  // Clear all (for debugging/reset)
  clearAll: () => void
}

export const useBrokenMediaStore = create<BrokenMediaState>()(
  persist(
    (set, get) => ({
      brokenIds: new Set<string>(),
      thumbFailedIds: new Set<string>(),

      markBroken: (id) => {
        set(state => ({
          brokenIds: new Set(state.brokenIds).add(id),
        }))
      },

      markThumbFailed: (id) => {
        set(state => ({
          thumbFailedIds: new Set(state.thumbFailedIds).add(id),
        }))
      },

      isBroken: (id) => {
        return get().brokenIds.has(id)
      },

      isThumbFailed: (id) => {
        return get().thumbFailedIds.has(id)
      },

      clearBroken: (id) => {
        set(state => {
          const newBrokenIds = new Set(state.brokenIds)
          const newThumbFailedIds = new Set(state.thumbFailedIds)
          newBrokenIds.delete(id)
          newThumbFailedIds.delete(id)
          return {
            brokenIds: newBrokenIds,
            thumbFailedIds: newThumbFailedIds,
          }
        })
      },

      clearAll: () => {
        set({
          brokenIds: new Set(),
          thumbFailedIds: new Set(),
        })
      },
    }),
    {
      name: 'vault-broken-media',
      storage: createJSONStorage(() => AsyncStorage),
      // Custom serialization for Sets
      partialize: (state) => ({
        brokenIds: Array.from(state.brokenIds),
        thumbFailedIds: Array.from(state.thumbFailedIds),
      }),
      merge: (persisted: any, current) => ({
        ...current,
        brokenIds: new Set(persisted?.brokenIds || []),
        thumbFailedIds: new Set(persisted?.thumbFailedIds || []),
      }),
    }
  )
)

// Utility to check if a file extension is supported on mobile
export function isFormatSupported(filename: string, type: 'video' | 'image' | 'gif'): boolean {
  const ext = filename.toLowerCase().split('.').pop() || ''
  const lowerFilename = filename.toLowerCase()

  // Supported video formats on iOS/Android
  // Note: Even MP4/MOV containers can have unsupported codecs inside
  const supportedVideoFormats = ['mp4', 'm4v', 'mov', '3gp']

  // WebM support varies - Android generally supports VP8/VP9, iOS does not
  // We'll try webm but it may fail on iOS
  const partialSupportFormats = ['webm']

  // Supported image formats
  const supportedImageFormats = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'heic', 'heif']

  // Check for filename patterns that suggest problematic codecs
  // These often indicate HEVC/H.265 or other problematic codecs
  const problematicPatterns = [
    'x265', 'hevc', 'h265', 'h.265',
    '10bit', '10-bit',
    'av1',
  ]

  const hasProblematicPattern = problematicPatterns.some(pattern =>
    lowerFilename.includes(pattern)
  )

  if (type === 'video') {
    // Filter out known unsupported formats: MKV, AVI, WMV, FLV, etc.
    if (!supportedVideoFormats.includes(ext) && !partialSupportFormats.includes(ext)) {
      return false
    }

    // Filter out files with problematic codec patterns in filename
    if (hasProblematicPattern) {
      return false
    }

    return true
  }

  if (type === 'image' || type === 'gif') {
    return supportedImageFormats.includes(ext)
  }

  return false
}

// Get unsupported format warning
export function getFormatWarning(filename: string, type: 'video' | 'image' | 'gif'): string | null {
  const ext = filename.toLowerCase().split('.').pop() || ''

  const unsupportedWarnings: Record<string, string> = {
    'mkv': 'MKV format may not play on mobile',
    'avi': 'AVI format is not supported on mobile',
    'wmv': 'WMV format is not supported on mobile',
    'flv': 'FLV format is not supported on mobile',
    'rm': 'RealMedia format is not supported',
    'rmvb': 'RealMedia format is not supported',
  }

  return unsupportedWarnings[ext] || null
}
