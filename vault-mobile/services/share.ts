// File: vault-mobile/services/share.ts
// Share service for sharing media with other apps

import * as Sharing from 'expo-sharing'
import * as FileSystem from 'expo-file-system/legacy'
import { Platform, Alert } from 'react-native'
import { api } from './api'

interface ShareOptions {
  id: string
  filename: string
  type: 'video' | 'image' | 'gif'
}

class ShareService {
  private cacheDir = FileSystem.cacheDirectory ? `${FileSystem.cacheDirectory}share/` : ''

  async initialize() {
    // Ensure cache directory exists
    try {
      const dirInfo = await FileSystem.getInfoAsync(this.cacheDir)
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(this.cacheDir, { intermediates: true })
      }
    } catch (err) {
      console.error('Failed to create share cache directory:', err)
    }
  }

  async canShare(): Promise<boolean> {
    return Sharing.isAvailableAsync()
  }

  async shareMedia(options: ShareOptions): Promise<boolean> {
    const { id, filename, type } = options

    // Check if sharing is available
    const canShare = await this.canShare()
    if (!canShare) {
      Alert.alert('Sharing Not Available', 'Sharing is not supported on this device.')
      return false
    }

    try {
      // Get the media URL
      const mediaUrl = api.getStreamUrl(id)

      // Download to cache first
      const extension = this.getExtension(filename, type)
      const localPath = `${this.cacheDir}${id}${extension}`

      // Check if already cached
      const fileInfo = await FileSystem.getInfoAsync(localPath)
      if (!fileInfo.exists) {
        // Download the file
        const downloadResult = await FileSystem.downloadAsync(
          mediaUrl,
          localPath
        )

        if (downloadResult.status !== 200) {
          throw new Error('Failed to download media')
        }
      }

      // Share the file
      await Sharing.shareAsync(localPath, {
        mimeType: this.getMimeType(type, extension),
        dialogTitle: `Share ${filename}`,
        UTI: this.getUTI(type, extension),
      })

      return true
    } catch (err) {
      console.error('Failed to share media:', err)
      Alert.alert('Share Failed', 'Unable to share this media. Please try again.')
      return false
    }
  }

  async shareLink(id: string): Promise<boolean> {
    // Share a deep link to the media
    // This would require implementing a custom URL scheme
    const deepLink = `vault://media/${id}`

    // For now, just show an alert that this feature is coming soon
    Alert.alert(
      'Coming Soon',
      'Link sharing will be available in a future update.'
    )
    return false
  }

  async clearCache(): Promise<void> {
    try {
      const dirInfo = await FileSystem.getInfoAsync(this.cacheDir)
      if (dirInfo.exists) {
        await FileSystem.deleteAsync(this.cacheDir, { idempotent: true })
        await FileSystem.makeDirectoryAsync(this.cacheDir, { intermediates: true })
      }
    } catch (err) {
      console.error('Failed to clear share cache:', err)
    }
  }

  async getCacheSize(): Promise<number> {
    try {
      const dirInfo = await FileSystem.getInfoAsync(this.cacheDir)
      if (!dirInfo.exists) return 0

      const files = await FileSystem.readDirectoryAsync(this.cacheDir)
      let totalSize = 0

      for (const file of files) {
        const fileInfo = await FileSystem.getInfoAsync(`${this.cacheDir}${file}`)
        if (fileInfo.exists && 'size' in fileInfo && fileInfo.size) {
          totalSize += fileInfo.size
        }
      }

      return totalSize
    } catch (err) {
      console.error('Failed to calculate cache size:', err)
      return 0
    }
  }

  private getExtension(filename: string, type: 'video' | 'image' | 'gif'): string {
    // Try to extract extension from filename
    const match = filename.match(/\.[^.]+$/)
    if (match) return match[0]

    // Fallback based on type
    switch (type) {
      case 'video':
        return '.mp4'
      case 'gif':
        return '.gif'
      case 'image':
      default:
        return '.jpg'
    }
  }

  private getMimeType(type: 'video' | 'image' | 'gif', extension: string): string {
    const mimeTypes: Record<string, string> = {
      '.mp4': 'video/mp4',
      '.mov': 'video/quicktime',
      '.m4v': 'video/x-m4v',
      '.mkv': 'video/x-matroska',
      '.webm': 'video/webm',
      '.avi': 'video/x-msvideo',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.heic': 'image/heic',
    }

    return mimeTypes[extension.toLowerCase()] || (type === 'video' ? 'video/*' : 'image/*')
  }

  private getUTI(type: 'video' | 'image' | 'gif', extension: string): string {
    // iOS Universal Type Identifiers
    if (Platform.OS !== 'ios') return ''

    const utiTypes: Record<string, string> = {
      '.mp4': 'public.mpeg-4',
      '.mov': 'com.apple.quicktime-movie',
      '.m4v': 'com.apple.m4v-video',
      '.jpg': 'public.jpeg',
      '.jpeg': 'public.jpeg',
      '.png': 'public.png',
      '.gif': 'com.compuserve.gif',
      '.heic': 'public.heic',
    }

    return utiTypes[extension.toLowerCase()] || (type === 'video' ? 'public.movie' : 'public.image')
  }
}

export const shareService = new ShareService()
