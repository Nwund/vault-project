// File: vault-mobile/stores/downloads.ts
// Download state management with SQLite persistence

import { create } from 'zustand'
import * as FileSystem from 'expo-file-system/legacy'
import { getErrorMessage } from '@/utils'

export interface DownloadedMedia {
  id: string
  filename: string
  type: 'video' | 'image' | 'gif'
  durationSec?: number
  sizeBytes?: number
  localPath: string
  downloadedAt: number
  thumbId?: string
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
  pauseDownload: (id: string) => void
  resumeDownload: (id: string) => void
  removeDownload: (id: string) => Promise<void>
  clearCompleted: () => Promise<void>
  getLocalPath: (id: string) => string | null
}

const DOWNLOADS_DIR = FileSystem.documentDirectory ? `${FileSystem.documentDirectory}downloads/` : ''

export const useDownloadStore = create<DownloadState>((set, get) => ({
  downloads: [],
  downloadQueue: [],
  isInitialized: false,

  initialize: async () => {
    // Ensure downloads directory exists
    const dirInfo = await FileSystem.getInfoAsync(DOWNLOADS_DIR)
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(DOWNLOADS_DIR, { intermediates: true })
    }

    // Load existing downloads from disk
    // In a real app, this would be from SQLite
    try {
      const files = await FileSystem.readDirectoryAsync(DOWNLOADS_DIR)
      const downloads: DownloadedMedia[] = []

      for (const filename of files) {
        const info = await FileSystem.getInfoAsync(`${DOWNLOADS_DIR}${filename}`)
        if (info.exists && !info.isDirectory) {
          downloads.push({
            id: filename.replace(/\.[^/.]+$/, ''), // Remove extension for ID
            filename,
            type: 'video', // Would need metadata lookup
            localPath: `${DOWNLOADS_DIR}${filename}`,
            sizeBytes: info.size,
            downloadedAt: info.modificationTime ? info.modificationTime * 1000 : Date.now(),
          })
        }
      }

      set({ downloads, isInitialized: true })
    } catch (err) {
      console.error('Failed to load downloads:', err)
      set({ isInitialized: true })
    }
  },

  addToQueue: ({ id, filename, remoteUrl, type, durationSec }) => {
    set((state) => ({
      downloadQueue: [
        ...state.downloadQueue,
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
    }))
  },

  removeFromQueue: (id) => {
    set((state) => ({
      downloadQueue: state.downloadQueue.filter((d) => d.id !== id),
    }))
  },

  startDownload: async (id) => {
    const { downloadQueue } = get()
    const item = downloadQueue.find((d) => d.id === id)
    if (!item) return

    // Update status
    set((state) => ({
      downloadQueue: state.downloadQueue.map((d) =>
        d.id === id ? { ...d, status: 'downloading' as const } : d
      ),
    }))

    try {
      const localPath = `${DOWNLOADS_DIR}${item.filename}`

      // Download with progress
      const downloadResumable = FileSystem.createDownloadResumable(
        item.remoteUrl,
        localPath,
        {},
        (downloadProgress) => {
          const progress =
            downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite

          set((state) => ({
            downloadQueue: state.downloadQueue.map((d) =>
              d.id === id ? { ...d, progress } : d
            ),
          }))
        }
      )

      const result = await downloadResumable.downloadAsync()

      if (result?.uri) {
        // Add to completed downloads
        const fileInfo = await FileSystem.getInfoAsync(localPath)
        const sizeBytes = fileInfo.exists && 'size' in fileInfo ? fileInfo.size : undefined

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

  pauseDownload: (id) => {
    set((state) => ({
      downloadQueue: state.downloadQueue.map((d) =>
        d.id === id ? { ...d, status: 'paused' as const } : d
      ),
    }))
  },

  resumeDownload: (id) => {
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
}))
