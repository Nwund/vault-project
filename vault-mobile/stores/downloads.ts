// File: vault-mobile/stores/downloads.ts
// Download state management with AsyncStorage persistence

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as FileSystem from 'expo-file-system/legacy'
import { getErrorMessage } from '@/utils'

// Track active download resumables for pause/resume
const activeDownloads = new Map<string, FileSystem.DownloadResumable>()

// Throttle progress updates to reduce re-renders
let lastProgressUpdate = 0
const PROGRESS_THROTTLE_MS = 250

export interface DownloadedMedia {
  id: string
  filename: string
  type: 'video' | 'image' | 'gif'
  durationSec?: number
  sizeBytes?: number
  localPath: string
  downloadedAt: number
}

interface DownloadQueueItem {
  id: string
  filename: string
  remoteUrl: string
  type: 'video' | 'image' | 'gif'
  durationSec?: number
  progress: number
  status: 'pending' | 'downloading' | 'paused' | 'failed'
}

interface AddToQueueOptions {
  id: string
  filename: string
  remoteUrl: string
  type: 'video' | 'image' | 'gif'
  durationSec?: number
}

interface DownloadState {
  downloads: DownloadedMedia[]
  downloadQueue: DownloadQueueItem[]
  isInitialized: boolean

  // Actions
  initialize: () => Promise<void>
  addToQueue: (options: AddToQueueOptions) => void
  removeFromQueue: (id: string) => void
  startDownload: (id: string) => Promise<void>
  pauseDownload: (id: string) => Promise<void>
  resumeDownload: (id: string) => Promise<void>
  retryDownload: (id: string) => void
  removeDownload: (id: string) => Promise<void>
  clearCompleted: () => Promise<void>
  getLocalPath: (id: string) => string | null
  isDownloaded: (id: string) => boolean
}

const DOWNLOADS_DIR = FileSystem.documentDirectory ? `${FileSystem.documentDirectory}downloads/` : ''

// Get file extension from filename
const getExtension = (filename: string): string => {
  const match = filename.match(/\.([^.]+)$/)
  return match ? match[1] : 'mp4'
}

// Create safe filename using ID + original extension
const getSafeFilename = (id: string, originalFilename: string): string => {
  const ext = getExtension(originalFilename)
  return `${id}.${ext}`
}

export const useDownloadStore = create<DownloadState>()(
  persist(
    (set, get) => ({
      downloads: [],
      downloadQueue: [],
      isInitialized: false,

      initialize: async () => {
        // Ensure downloads directory exists
        try {
          const dirInfo = await FileSystem.getInfoAsync(DOWNLOADS_DIR)
          if (!dirInfo.exists) {
            await FileSystem.makeDirectoryAsync(DOWNLOADS_DIR, { intermediates: true })
          }

          // Verify existing downloads still exist on disk
          const { downloads } = get()
          const validDownloads: DownloadedMedia[] = []

          for (const download of downloads) {
            const info = await FileSystem.getInfoAsync(download.localPath)
            if (info.exists) {
              validDownloads.push(download)
            }
          }

          set({ downloads: validDownloads, isInitialized: true })
        } catch (err) {
          console.error('Failed to initialize downloads:', err)
          set({ isInitialized: true })
        }
      },

      addToQueue: ({ id, filename, remoteUrl, type, durationSec }) => {
        const { downloadQueue, downloads } = get()

        // Skip if already downloaded or in queue
        if (downloads.some(d => d.id === id) || downloadQueue.some(d => d.id === id)) {
          return
        }

        set({
          downloadQueue: [
            ...downloadQueue,
            {
              id,
              filename,
              remoteUrl,
              type,
              durationSec,
              progress: 0,
              status: 'pending',
            },
          ],
        })
      },

      removeFromQueue: (id) => {
        set((state) => ({
          downloadQueue: state.downloadQueue.filter((d) => d.id !== id),
        }))
      },

      startDownload: async (id) => {
        const { downloadQueue } = get()
        const item = downloadQueue.find((d) => d.id === id)
        if (!item) {
          console.error('Download item not found in queue:', id)
          return
        }

        // Ensure directory exists
        try {
          const dirInfo = await FileSystem.getInfoAsync(DOWNLOADS_DIR)
          if (!dirInfo.exists) {
            await FileSystem.makeDirectoryAsync(DOWNLOADS_DIR, { intermediates: true })
          }
        } catch (err) {
          console.error('Failed to create downloads directory:', err)
          return
        }

        // Update status
        set((state) => ({
          downloadQueue: state.downloadQueue.map((d) =>
            d.id === id ? { ...d, status: 'downloading' as const } : d
          ),
        }))

        try {
          // Use safe filename (id + extension)
          const safeFilename = getSafeFilename(id, item.filename)
          const localPath = `${DOWNLOADS_DIR}${safeFilename}`

          console.log('Starting download:', item.remoteUrl, '->', localPath)

          // Download with throttled progress updates
          const downloadResumable = FileSystem.createDownloadResumable(
            item.remoteUrl,
            localPath,
            {},
            (downloadProgress) => {
              const now = Date.now()
              // Throttle progress updates to reduce re-renders
              if (now - lastProgressUpdate < PROGRESS_THROTTLE_MS) return
              lastProgressUpdate = now

              const progress =
                downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite

              set((state) => ({
                downloadQueue: state.downloadQueue.map((d) =>
                  d.id === id ? { ...d, progress } : d
                ),
              }))
            }
          )

          // Store for pause/resume
          activeDownloads.set(id, downloadResumable)

          const result = await downloadResumable.downloadAsync()

          // Remove from active downloads
          activeDownloads.delete(id)

          if (result?.uri) {
            console.log('Download complete:', result.uri)

            // Get file info
            const fileInfo = await FileSystem.getInfoAsync(localPath)
            const sizeBytes = fileInfo.exists && 'size' in fileInfo ? fileInfo.size : undefined

            // Add to completed downloads
            set((state) => ({
              downloads: [
                ...state.downloads,
                {
                  id,
                  filename: item.filename,
                  type: item.type,
                  durationSec: item.durationSec,
                  localPath,
                  sizeBytes,
                  downloadedAt: Date.now(),
                },
              ],
              downloadQueue: state.downloadQueue.filter((d) => d.id !== id),
            }))
          } else {
            throw new Error('Download returned no URI')
          }
        } catch (err) {
          console.error('Download failed:', getErrorMessage(err))
          set((state) => ({
            downloadQueue: state.downloadQueue.map((d) =>
              d.id === id ? { ...d, status: 'failed' as const } : d
            ),
          }))
        }
      },

      pauseDownload: async (id) => {
        const resumable = activeDownloads.get(id)
        if (resumable) {
          try {
            await resumable.pauseAsync()
            set((state) => ({
              downloadQueue: state.downloadQueue.map((d) =>
                d.id === id ? { ...d, status: 'paused' as const } : d
              ),
            }))
          } catch (err) {
            console.error('Failed to pause download:', err)
          }
        }
      },

      resumeDownload: async (id) => {
        const resumable = activeDownloads.get(id)
        if (resumable) {
          try {
            set((state) => ({
              downloadQueue: state.downloadQueue.map((d) =>
                d.id === id ? { ...d, status: 'downloading' as const } : d
              ),
            }))
            const result = await resumable.resumeAsync()
            if (result?.uri) {
              // Download complete
              const { downloadQueue } = get()
              const item = downloadQueue.find(d => d.id === id)
              if (item) {
                const fileInfo = await FileSystem.getInfoAsync(result.uri)
                const sizeBytes = fileInfo.exists && 'size' in fileInfo ? fileInfo.size : undefined
                set((state) => ({
                  downloads: [
                    ...state.downloads,
                    {
                      id,
                      filename: item.filename,
                      type: item.type,
                      durationSec: item.durationSec,
                      localPath: result.uri,
                      sizeBytes,
                      downloadedAt: Date.now(),
                    },
                  ],
                  downloadQueue: state.downloadQueue.filter((d) => d.id !== id),
                }))
              }
              activeDownloads.delete(id)
            }
          } catch (err) {
            console.error('Failed to resume download:', err)
            set((state) => ({
              downloadQueue: state.downloadQueue.map((d) =>
                d.id === id ? { ...d, status: 'failed' as const } : d
              ),
            }))
          }
        } else {
          // No active resumable, restart download
          get().startDownload(id)
        }
      },

      retryDownload: (id) => {
        // Reset status and restart
        set((state) => ({
          downloadQueue: state.downloadQueue.map((d) =>
            d.id === id ? { ...d, status: 'pending' as const, progress: 0 } : d
          ),
        }))
        get().startDownload(id)
      },

      removeDownload: async (id) => {
        const { downloads } = get()
        const download = downloads.find((d) => d.id === id)

        if (download) {
          try {
            await FileSystem.deleteAsync(download.localPath, { idempotent: true })
          } catch (err) {
            console.error('Failed to delete file:', err)
          }
        }

        set((state) => ({
          downloads: state.downloads.filter((d) => d.id !== id),
        }))
      },

      clearCompleted: async () => {
        const { downloads } = get()

        // Delete all files
        await Promise.all(
          downloads.map((d) =>
            FileSystem.deleteAsync(d.localPath, { idempotent: true }).catch(() => {})
          )
        )

        set({ downloads: [] })
      },

      getLocalPath: (id) => {
        const { downloads } = get()
        const download = downloads.find((d) => d.id === id)
        return download?.localPath || null
      },

      isDownloaded: (id) => {
        const { downloads } = get()
        return downloads.some(d => d.id === id)
      },
    }),
    {
      name: 'vault-downloads',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        // Only persist downloads array, not queue or init state
        downloads: state.downloads,
      }),
    }
  )
)
