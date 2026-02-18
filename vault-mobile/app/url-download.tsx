// File: vault-mobile/app/url-download.tsx
// Send URLs to desktop for download

import { useState, useCallback } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
  Platform,
} from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useConnectionStore } from '@/stores/connection'
import { useToast } from '@/contexts/toast'
import { api } from '@/services/api'

export default function UrlDownloadScreen() {
  const { isConnected } = useConnectionStore()
  const toast = useToast()
  const insets = useSafeAreaInsets()
  const [url, setUrl] = useState('')
  const [sending, setSending] = useState(false)
  const [recentUrls, setRecentUrls] = useState<string[]>([])

  const handlePasteFromClipboard = useCallback(() => {
    // Note: Direct clipboard access requires expo-clipboard
    // For now, just focus the input and let user paste manually
    if (Platform.OS === 'ios') Haptics.selectionAsync()
    toast.info('Long-press in the text field to paste')
  }, [toast])

  const handleSendUrl = useCallback(async () => {
    if (!url.trim()) return
    if (!isConnected) {
      toast.error('Not connected to desktop')
      return
    }

    // Validate URL
    try {
      new URL(url)
    } catch {
      toast.error('Please enter a valid URL')
      return
    }

    Keyboard.dismiss()
    setSending(true)

    try {
      const result = await api.sendDownloadUrl(url.trim())
      if (result.success) {
        if (Platform.OS === 'ios') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        toast.success('Download queued on desktop', result.download?.title || 'Check desktop for progress')
        setRecentUrls(prev => [url, ...prev.filter(u => u !== url)].slice(0, 5))
        setUrl('')
      } else {
        toast.error('Failed to send URL', result.error)
      }
    } catch (e: any) {
      toast.error('Connection error', e.message)
    } finally {
      setSending(false)
    }
  }, [url, isConnected, toast])

  const handleUseRecent = useCallback((recentUrl: string) => {
    setUrl(recentUrl)
    if (Platform.OS === 'ios') Haptics.selectionAsync()
  }, [])

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Send URL to Desktop</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Content */}
      <View style={styles.content}>
        {/* URL Input */}
        <View style={styles.inputContainer}>
          <Ionicons name="link" size={20} color="#71717a" style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            value={url}
            onChangeText={setUrl}
            placeholder="Paste video URL here..."
            placeholderTextColor="#52525b"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="send"
            onSubmitEditing={handleSendUrl}
            editable={!sending}
          />
          {url.length > 0 && (
            <TouchableOpacity
              onPress={() => setUrl('')}
              style={styles.clearButton}
            >
              <Ionicons name="close-circle" size={20} color="#71717a" />
            </TouchableOpacity>
          )}
        </View>

        {/* Action Buttons */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.pasteButton}
            onPress={handlePasteFromClipboard}
            disabled={sending}
          >
            <Ionicons name="clipboard" size={20} color="#3b82f6" />
            <Text style={styles.pasteText}>Paste</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.sendButton,
              (!url.trim() || !isConnected || sending) && styles.sendButtonDisabled
            ]}
            onPress={handleSendUrl}
            disabled={!url.trim() || !isConnected || sending}
          >
            {sending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="send" size={20} color="#fff" />
                <Text style={styles.sendText}>Send to Desktop</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Connection Status */}
        {!isConnected && (
          <View style={styles.warningBox}>
            <Ionicons name="warning" size={20} color="#f59e0b" />
            <Text style={styles.warningText}>
              Not connected to desktop. Downloads will be queued when connected.
            </Text>
          </View>
        )}

        {/* Info */}
        <View style={styles.infoBox}>
          <Ionicons name="information-circle" size={20} color="#3b82f6" />
          <Text style={styles.infoText}>
            Send video URLs from your browser's share menu or paste them here.
            Downloads are processed on your desktop computer.
          </Text>
        </View>

        {/* Supported Sites */}
        <View style={styles.sitesSection}>
          <Text style={styles.sitesTitle}>Supported Sites</Text>
          <Text style={styles.sitesText}>
            Twitter/X, YouTube, PornHub, xVideos, xHamster, RedGifs, and 1000+ more
          </Text>
        </View>

        {/* Recent URLs */}
        {recentUrls.length > 0 && (
          <View style={styles.recentSection}>
            <Text style={styles.recentTitle}>Recent</Text>
            {recentUrls.map((recentUrl, i) => (
              <TouchableOpacity
                key={i}
                style={styles.recentItem}
                onPress={() => handleUseRecent(recentUrl)}
              >
                <Ionicons name="time" size={16} color="#71717a" />
                <Text style={styles.recentUrl} numberOfLines={1}>
                  {recentUrl}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090b',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#27272a',
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#18181b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#27272a',
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    height: 50,
    color: '#fff',
    fontSize: 16,
  },
  clearButton: {
    padding: 8,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  pasteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#18181b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3b82f6',
  },
  pasteText: {
    color: '#3b82f6',
    fontSize: 16,
    fontWeight: '600',
  },
  sendButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    backgroundColor: '#3b82f6',
    borderRadius: 12,
  },
  sendButtonDisabled: {
    backgroundColor: '#27272a',
    opacity: 0.6,
  },
  sendText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 20,
    padding: 14,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  warningText: {
    flex: 1,
    color: '#f59e0b',
    fontSize: 14,
    lineHeight: 20,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 20,
    padding: 14,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.2)',
  },
  infoText: {
    flex: 1,
    color: '#93c5fd',
    fontSize: 14,
    lineHeight: 20,
  },
  sitesSection: {
    marginTop: 24,
  },
  sitesTitle: {
    color: '#a1a1aa',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  sitesText: {
    color: '#71717a',
    fontSize: 14,
    lineHeight: 20,
  },
  recentSection: {
    marginTop: 24,
  },
  recentTitle: {
    color: '#a1a1aa',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  recentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#18181b',
    borderRadius: 8,
    marginBottom: 8,
  },
  recentUrl: {
    flex: 1,
    color: '#a1a1aa',
    fontSize: 13,
  },
})
