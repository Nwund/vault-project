// File: vault-mobile/stores/settings.ts
// Persisted app settings

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

interface SettingsState {
  // Playback
  autoPlay: boolean
  videoQuality: 'auto' | 'high' | 'medium' | 'low'

  // Sync
  autoSync: boolean
  downloadOnWifiOnly: boolean

  // UI
  hapticEnabled: boolean

  // Wall
  wallTileCount: number
  wallMuted: boolean

  // Actions
  setAutoPlay: (value: boolean) => void
  setVideoQuality: (value: 'auto' | 'high' | 'medium' | 'low') => void
  setAutoSync: (value: boolean) => void
  setDownloadOnWifiOnly: (value: boolean) => void
  setHapticEnabled: (value: boolean) => void
  setWallTileCount: (value: number) => void
  setWallMuted: (value: boolean) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      // Defaults
      autoPlay: true,
      videoQuality: 'auto',
      autoSync: true,
      downloadOnWifiOnly: true,
      hapticEnabled: true,
      wallTileCount: 4,
      wallMuted: false,

      // Actions
      setAutoPlay: (value) => set({ autoPlay: value }),
      setVideoQuality: (value) => set({ videoQuality: value }),
      setAutoSync: (value) => set({ autoSync: value }),
      setDownloadOnWifiOnly: (value) => set({ downloadOnWifiOnly: value }),
      setHapticEnabled: (value) => set({ hapticEnabled: value }),
      setWallTileCount: (value) => set({ wallTileCount: value }),
      setWallMuted: (value) => set({ wallMuted: value }),
    }),
    {
      name: 'vault-settings',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
)
