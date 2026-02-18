// File: vault-mobile/app/(tabs)/settings.tsx
// Enhanced settings with better organization and visual polish

import { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  StyleSheet,
  Platform,
  Linking,
  ActivityIndicator,
} from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useConnectionStore } from '@/stores/connection'
import { useDownloadStore } from '@/stores/downloads'
import { useFavoritesStore } from '@/stores/favorites'
import { useHistoryStore } from '@/stores/history'
import { useSettingsStore } from '@/stores/settings'
import { useSyncStore } from '@/stores/sync'
import { cacheService } from '@/services/cache'
import { useToast } from '@/contexts/toast'

export default function SettingsScreen() {
  const {
    isConnected,
    serverUrl,
    deviceName,
    disconnect,
    lastSyncTime,
  } = useConnectionStore()
  const { downloads, clearCompleted } = useDownloadStore()
  const { items: favorites, clearAll: clearFavorites } = useFavoritesStore()
  const { items: history, clearHistory } = useHistoryStore()
  const {
    autoSync,
    setAutoSync,
    downloadOnWifiOnly,
    setDownloadOnWifiOnly,
    videoQuality,
    setVideoQuality,
    hapticEnabled,
    setHapticEnabled,
    autoPlay,
    setAutoPlay,
  } = useSettingsStore()
  const {
    lastFullSync,
    pendingWatches,
    pendingFavoriteChanges,
    isSyncing,
    syncAll,
    setAutoSync: setSyncAutoSync,
    autoSyncEnabled,
  } = useSyncStore()
  const toast = useToast()

  const [cacheSize, setCacheSize] = useState<number>(0)
  const [isClearingCache, setIsClearingCache] = useState(false)

  // Load cache size on mount
  useEffect(() => {
    loadCacheSize()
  }, [])

  const loadCacheSize = async () => {
    try {
      const stats = await cacheService.getCacheStats()
      setCacheSize(stats.totalSize)
    } catch {
      setCacheSize(0)
    }
  }

  const handleClearCache = async () => {
    if (Platform.OS === 'ios' && hapticEnabled) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
    }
    Alert.alert(
      'Clear Cache',
      'This will clear all cached thumbnails and temporary files. Downloads will not be affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Cache',
          style: 'destructive',
          onPress: async () => {
            setIsClearingCache(true)
            try {
              await cacheService.clearAllCaches()
              setCacheSize(0)
              if (Platform.OS === 'ios' && hapticEnabled) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
              }
            } catch {
              Alert.alert('Error', 'Failed to clear cache')
            } finally {
              setIsClearingCache(false)
            }
          },
        },
      ]
    )
  }

  const handleDisconnect = () => {
    if (Platform.OS === 'ios' && hapticEnabled) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
    }
    Alert.alert(
      'Disconnect',
      'Are you sure you want to disconnect from the desktop Vault? Your downloads will be kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: () => disconnect(),
        },
      ]
    )
  }

  const handleClearDownloads = () => {
    if (Platform.OS === 'ios' && hapticEnabled) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
    }
    Alert.alert(
      'Clear Downloads',
      'This will delete all downloaded media from this device. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: () => clearCompleted(),
        },
      ]
    )
  }

  const formatDate = (timestamp: number | null | undefined) => {
    if (!timestamp) return 'Never'
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()

    if (diff < 60000) return 'Just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} hours ago`
    return date.toLocaleDateString()
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
  }

  const totalDownloadSize = downloads.reduce((sum, d) => sum + (d.sizeBytes || 0), 0)
  const pendingChangesCount = pendingWatches.length + pendingFavoriteChanges.length

  const handleManualSync = async () => {
    if (!isConnected) {
      toast.error('Not connected to desktop')
      return
    }
    if (isSyncing) return

    if (Platform.OS === 'ios' && hapticEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    }

    try {
      const result = await syncAll()
      if (Platform.OS === 'ios' && hapticEnabled) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      }
      toast.success(
        'Sync complete',
        `Favorites: ${result.favorites.pulled + result.favorites.pushed}, History: ${result.history.pulled + result.history.pushed}`
      )
    } catch (err: any) {
      toast.error('Sync failed', err.message)
    }
  }

  const handleSwitchChange = useCallback((setter: (value: boolean) => void) => (value: boolean) => {
    if (Platform.OS === 'ios' && hapticEnabled) {
      Haptics.selectionAsync()
    }
    setter(value)
  }, [hapticEnabled])

  const SettingRow = ({
    icon,
    iconColor = '#71717a',
    label,
    description,
    right,
  }: {
    icon: string
    iconColor?: string
    label: string
    description?: string
    right?: React.ReactNode
  }) => (
    <View style={styles.settingRow}>
      <View style={[styles.settingIcon, { backgroundColor: `${iconColor}20` }]}>
        <Ionicons name={icon as any} size={20} color={iconColor} />
      </View>
      <View style={styles.settingContent}>
        <Text style={styles.settingLabel}>{label}</Text>
        {description && <Text style={styles.settingDescription}>{description}</Text>}
      </View>
      {right}
    </View>
  )

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {/* Connection Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Connection</Text>

        {isConnected ? (
          <View style={styles.card}>
            <View style={styles.connectionHeader}>
              <View style={styles.connectionStatus}>
                <View style={styles.statusDot} />
                <Text style={styles.statusText}>Connected</Text>
              </View>
              <TouchableOpacity
                style={styles.reconnectButton}
                onPress={() => router.push('/connect')}
              >
                <Ionicons name="refresh" size={16} color="#3b82f6" />
              </TouchableOpacity>
            </View>

            <View style={styles.connectionDetails}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Server</Text>
                <Text style={styles.detailValue} numberOfLines={1}>{serverUrl}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Device</Text>
                <Text style={styles.detailValue}>{deviceName || 'Unknown'}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Last Sync</Text>
                <Text style={styles.detailValue}>{formatDate(lastSyncTime)}</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.disconnectButton}
              onPress={handleDisconnect}
            >
              <Ionicons name="log-out-outline" size={18} color="#ef4444" />
              <Text style={styles.disconnectText}>Disconnect</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.connectCard}
            onPress={() => router.push('/connect')}
            activeOpacity={0.8}
          >
            <View style={styles.connectIconContainer}>
              <Ionicons name="link" size={28} color="#3b82f6" />
            </View>
            <View style={styles.connectInfo}>
              <Text style={styles.connectTitle}>Connect to Vault</Text>
              <Text style={styles.connectSubtitle}>
                Pair with your desktop to access your library
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color="#3f3f46" />
          </TouchableOpacity>
        )}
      </View>

      {/* Playback Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Playback</Text>
        <View style={styles.card}>
          <SettingRow
            icon="play-circle"
            iconColor="#22c55e"
            label="Auto-Play"
            description="Start playing when opened"
            right={
              <Switch
                value={autoPlay}
                onValueChange={handleSwitchChange(setAutoPlay)}
                trackColor={{ false: '#27272a', true: '#22c55e' }}
                thumbColor="#fff"
              />
            }
          />

          <View style={styles.divider} />

          <View style={styles.qualitySection}>
            <Text style={styles.qualityLabel}>Streaming Quality</Text>
            <View style={styles.qualityOptions}>
              {(['auto', 'high', 'medium', 'low'] as const).map((quality) => (
                <TouchableOpacity
                  key={quality}
                  style={[
                    styles.qualityOption,
                    videoQuality === quality && styles.qualityOptionActive,
                  ]}
                  onPress={() => {
                    if (Platform.OS === 'ios' && hapticEnabled) Haptics.selectionAsync()
                    setVideoQuality(quality)
                  }}
                >
                  <Text
                    style={[
                      styles.qualityText,
                      videoQuality === quality && styles.qualityTextActive,
                    ]}
                  >
                    {quality.charAt(0).toUpperCase() + quality.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </View>

      {/* Sync Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Sync & Downloads</Text>
        <View style={styles.card}>
          {/* Manual Sync Button */}
          <TouchableOpacity
            style={styles.syncButton}
            onPress={handleManualSync}
            disabled={!isConnected || isSyncing}
            activeOpacity={0.7}
          >
            <View style={styles.syncButtonContent}>
              {isSyncing ? (
                <ActivityIndicator size="small" color="#3b82f6" />
              ) : (
                <Ionicons name="sync" size={22} color={isConnected ? '#3b82f6' : '#52525b'} />
              )}
              <View style={styles.syncButtonText}>
                <Text style={[styles.syncButtonLabel, !isConnected && styles.syncButtonLabelDisabled]}>
                  {isSyncing ? 'Syncing...' : 'Sync Now'}
                </Text>
                <Text style={styles.syncButtonSubtext}>
                  {lastFullSync ? `Last: ${formatDate(lastFullSync)}` : 'Never synced'}
                  {pendingChangesCount > 0 && ` • ${pendingChangesCount} pending`}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#3f3f46" />
          </TouchableOpacity>

          <View style={styles.divider} />

          <SettingRow
            icon="sync"
            iconColor="#3b82f6"
            label="Auto Sync"
            description="Sync favorites & history automatically"
            right={
              <Switch
                value={autoSyncEnabled}
                onValueChange={handleSwitchChange(setSyncAutoSync)}
                trackColor={{ false: '#27272a', true: '#3b82f6' }}
                thumbColor="#fff"
              />
            }
          />

          <View style={styles.divider} />

          <SettingRow
            icon="wifi"
            iconColor="#f59e0b"
            label="Wi-Fi Only"
            description="Only download on Wi-Fi"
            right={
              <Switch
                value={downloadOnWifiOnly}
                onValueChange={handleSwitchChange(setDownloadOnWifiOnly)}
                trackColor={{ false: '#27272a', true: '#f59e0b' }}
                thumbColor="#fff"
              />
            }
          />

          <View style={styles.divider} />

          {/* URL Downloader Link */}
          <TouchableOpacity
            style={styles.syncButton}
            onPress={() => router.push('/url-download')}
            disabled={!isConnected}
            activeOpacity={0.7}
          >
            <View style={styles.syncButtonContent}>
              <Ionicons name="link" size={22} color={isConnected ? '#22c55e' : '#52525b'} />
              <View style={styles.syncButtonText}>
                <Text style={[styles.syncButtonLabel, !isConnected && styles.syncButtonLabelDisabled]}>
                  Download from URL
                </Text>
                <Text style={styles.syncButtonSubtext}>
                  Send video URLs to desktop for download
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#3f3f46" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Preferences Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Preferences</Text>
        <View style={styles.card}>
          <SettingRow
            icon="radio-button-on"
            iconColor="#a855f7"
            label="Haptic Feedback"
            description="Vibration on interactions"
            right={
              <Switch
                value={hapticEnabled}
                onValueChange={handleSwitchChange(setHapticEnabled)}
                trackColor={{ false: '#27272a', true: '#a855f7' }}
                thumbColor="#fff"
              />
            }
          />
        </View>
      </View>

      {/* Storage Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Storage</Text>
        <View style={styles.card}>
          <View style={styles.storageStats}>
            <View style={styles.storageStat}>
              <Text style={styles.storageValue}>{downloads.length}</Text>
              <Text style={styles.storageLabel}>Downloads</Text>
            </View>
            <View style={styles.storageDivider} />
            <View style={styles.storageStat}>
              <Text style={styles.storageValue}>{formatBytes(totalDownloadSize)}</Text>
              <Text style={styles.storageLabel}>Used</Text>
            </View>
          </View>

          {downloads.length > 0 && (
            <TouchableOpacity
              style={styles.clearButton}
              onPress={handleClearDownloads}
            >
              <Ionicons name="trash-outline" size={18} color="#ef4444" />
              <Text style={styles.clearText}>Clear All Downloads</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Favorites & History Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your Data</Text>
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.dataRow}
            onPress={() => {
              if (Platform.OS === 'ios' && hapticEnabled) Haptics.selectionAsync()
              router.push('/favorites')
            }}
          >
            <View style={[styles.settingIcon, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}>
              <Ionicons name="heart" size={20} color="#ef4444" />
            </View>
            <View style={styles.settingContent}>
              <Text style={styles.settingLabel}>Favorites</Text>
              <Text style={styles.settingDescription}>{favorites.length} saved items</Text>
            </View>
            {favorites.length > 0 && (
              <TouchableOpacity
                style={styles.clearMiniButton}
                onPress={() => {
                  if (Platform.OS === 'ios' && hapticEnabled) {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
                  }
                  Alert.alert(
                    'Clear Favorites',
                    'Remove all saved favorites?',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Clear', style: 'destructive', onPress: () => clearFavorites() },
                    ]
                  )
                }}
              >
                <Ionicons name="trash-outline" size={16} color="#71717a" />
              </TouchableOpacity>
            )}
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity
            style={styles.dataRow}
            onPress={() => {
              if (Platform.OS === 'ios' && hapticEnabled) Haptics.selectionAsync()
              router.push('/history')
            }}
          >
            <View style={[styles.settingIcon, { backgroundColor: 'rgba(168, 85, 247, 0.15)' }]}>
              <Ionicons name="time" size={20} color="#a855f7" />
            </View>
            <View style={styles.settingContent}>
              <Text style={styles.settingLabel}>Watch History</Text>
              <Text style={styles.settingDescription}>{history.length} recent items</Text>
            </View>
            {history.length > 0 && (
              <TouchableOpacity
                style={styles.clearMiniButton}
                onPress={() => {
                  if (Platform.OS === 'ios' && hapticEnabled) {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
                  }
                  Alert.alert(
                    'Clear History',
                    'Remove all watch history?',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Clear', style: 'destructive', onPress: () => clearHistory() },
                    ]
                  )
                }}
              >
                <Ionicons name="trash-outline" size={16} color="#71717a" />
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Cache Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Cache</Text>
        <View style={styles.card}>
          <View style={styles.cacheRow}>
            <View style={[styles.settingIcon, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
              <Ionicons name="file-tray-stacked" size={20} color="#3b82f6" />
            </View>
            <View style={styles.settingContent}>
              <Text style={styles.settingLabel}>Cached Data</Text>
              <Text style={styles.settingDescription}>
                Thumbnails and temporary files
              </Text>
            </View>
            <Text style={styles.cacheSize}>
              {cacheService.formatBytes(cacheSize)}
            </Text>
          </View>

          {cacheSize > 0 && (
            <TouchableOpacity
              style={styles.clearCacheButton}
              onPress={handleClearCache}
              disabled={isClearingCache}
            >
              {isClearingCache ? (
                <ActivityIndicator size="small" color="#3b82f6" />
              ) : (
                <>
                  <Ionicons name="trash-outline" size={18} color="#3b82f6" />
                  <Text style={styles.clearCacheText}>Clear Cache</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* About Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.card}>
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>Version</Text>
            <Text style={styles.aboutValue}>1.0.0</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>Build</Text>
            <Text style={styles.aboutValue}>2026.02.14</Text>
          </View>
        </View>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>Vault Mobile</Text>
        <Text style={styles.footerSubtext}>Made with care</Text>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090b',
  },
  contentContainer: {
    paddingBottom: 120,
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    color: '#71717a',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#18181b',
    borderRadius: 16,
    overflow: 'hidden',
  },
  connectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 12,
  },
  connectionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22c55e',
    marginRight: 8,
  },
  statusText: {
    color: '#22c55e',
    fontSize: 15,
    fontWeight: '600',
  },
  reconnectButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  connectionDetails: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  detailLabel: {
    color: '#71717a',
    fontSize: 14,
  },
  detailValue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
    marginLeft: 16,
  },
  disconnectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    gap: 8,
  },
  disconnectText: {
    color: '#ef4444',
    fontSize: 15,
    fontWeight: '600',
  },
  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  syncButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  syncButtonText: {
    gap: 2,
  },
  syncButtonLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  syncButtonLabelDisabled: {
    color: '#52525b',
  },
  syncButtonSubtext: {
    color: '#71717a',
    fontSize: 13,
  },
  connectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#18181b',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#27272a',
    borderStyle: 'dashed',
  },
  connectIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  connectInfo: {
    flex: 1,
    marginLeft: 14,
  },
  connectTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  connectSubtitle: {
    color: '#71717a',
    fontSize: 13,
    marginTop: 4,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  settingIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  settingContent: {
    flex: 1,
  },
  settingLabel: {
    color: '#fff',
    fontSize: 16,
  },
  settingDescription: {
    color: '#52525b',
    fontSize: 13,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: '#27272a',
    marginHorizontal: 14,
  },
  qualitySection: {
    padding: 14,
  },
  qualityLabel: {
    color: '#fff',
    fontSize: 16,
    marginBottom: 14,
  },
  qualityOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  qualityOption: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#27272a',
    alignItems: 'center',
  },
  qualityOptionActive: {
    backgroundColor: '#3b82f6',
  },
  qualityText: {
    color: '#a1a1aa',
    fontSize: 14,
    fontWeight: '600',
  },
  qualityTextActive: {
    color: '#fff',
  },
  storageStats: {
    flexDirection: 'row',
    padding: 20,
  },
  storageStat: {
    flex: 1,
    alignItems: 'center',
  },
  storageValue: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
  },
  storageLabel: {
    color: '#71717a',
    fontSize: 13,
    marginTop: 4,
  },
  storageDivider: {
    width: 1,
    backgroundColor: '#27272a',
    marginHorizontal: 20,
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    marginHorizontal: 14,
    marginBottom: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    gap: 8,
  },
  clearText: {
    color: '#ef4444',
    fontSize: 15,
    fontWeight: '600',
  },
  aboutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 14,
  },
  aboutLabel: {
    color: '#fff',
    fontSize: 15,
  },
  aboutValue: {
    color: '#71717a',
    fontSize: 15,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  footerText: {
    color: '#3f3f46',
    fontSize: 14,
    fontWeight: '600',
  },
  footerSubtext: {
    color: '#27272a',
    fontSize: 12,
    marginTop: 4,
  },
  dataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  clearMiniButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(113, 113, 122, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cacheRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  cacheSize: {
    color: '#71717a',
    fontSize: 14,
    fontWeight: '500',
  },
  clearCacheButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    marginHorizontal: 14,
    marginBottom: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    gap: 8,
  },
  clearCacheText: {
    color: '#3b82f6',
    fontSize: 15,
    fontWeight: '600',
  },
})
