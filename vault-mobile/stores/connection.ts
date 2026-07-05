// File: vault-mobile/stores/connection.ts
// Connection state management with Zustand

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import * as SecureStore from 'expo-secure-store'
import { api } from '@/services/api'
import { getErrorMessage } from '@/utils'

interface ConnectionState {
  isConnected: boolean
  isConnecting: boolean
  connectionError: string | null
  serverUrl: string | null
  token: string | null
  deviceId: string | null
  deviceName: string
  lastSyncTime: number | null

  // Actions
  initialize: () => Promise<void>
  connect: (serverUrl: string, pairingCode: string, deviceName: string) => Promise<void>
  disconnect: () => void
  setError: (error: string | null) => void
}

// Custom storage adapter for SecureStore
const secureStorage = {
  getItem: async (name: string) => {
    return await SecureStore.getItemAsync(name)
  },
  setItem: async (name: string, value: string) => {
    await SecureStore.setItemAsync(name, value)
  },
  removeItem: async (name: string) => {
    await SecureStore.deleteItemAsync(name)
  },
}

export const useConnectionStore = create<ConnectionState>()(
  persist(
    (set, get) => ({
      isConnected: false,
      isConnecting: false,
      connectionError: null,
      serverUrl: null,
      token: null,
      deviceId: null,
      deviceName: 'Mobile Device',
      lastSyncTime: null,

      initialize: async () => {
        const { serverUrl, token } = get()

        if (serverUrl && token) {
          // Verify connection is still valid
          try {
            api.configure(serverUrl, token)
            await api.ping()
            set({ isConnected: true, connectionError: null })
          } catch (err) {
            // Token may be expired or server unavailable
            set({ isConnected: false, connectionError: 'Connection lost' })
          }
        }
      },

      connect: async (serverUrl: string, pairingCode: string, deviceName: string) => {
        set({ isConnecting: true, connectionError: null })

        try {
          // Pair with server
          const result = await api.pair(serverUrl, pairingCode, deviceName)

          if (!result.success) {
            throw new Error(result.error || 'Pairing failed')
          }

          // Configure API with token
          api.configure(serverUrl, result.token)

          set({
            isConnected: true,
            isConnecting: false,
            serverUrl,
            token: result.token,
            deviceId: result.deviceId,
            deviceName,
            connectionError: null,
            lastSyncTime: Date.now(),
          })
        } catch (err) {
          set({
            isConnecting: false,
            connectionError: getErrorMessage(err),
          })
          throw err
        }
      },

      disconnect: () => {
        api.configure(null, null)
        set({
          isConnected: false,
          serverUrl: null,
          token: null,
          deviceId: null,
          connectionError: null,
        })
      },

      setError: (error) => {
        set({ connectionError: error })
      },
    }),
    {
      name: 'vault-connection',
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({
        serverUrl: state.serverUrl,
        token: state.token,
        deviceId: state.deviceId,
        deviceName: state.deviceName,
        lastSyncTime: state.lastSyncTime,
      }),
      onRehydrateStorage: () => (state) => {
        // Configure API when state is rehydrated from storage
        if (state?.serverUrl && state?.token) {
          console.log('[Connection] Rehydrated, configuring API with:', state.serverUrl)
          api.configure(state.serverUrl, state.token)
        }
      },
    }
  )
)
