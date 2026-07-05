// File: vault-mobile/app/review/index.tsx
// AI Tagging Review — list of items awaiting/holding a review decision,
// split into Pending / Approved / Rejected tabs. Tap an item to view + edit.

import { useEffect, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Alert,
} from 'react-native'
import { router, Stack } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { api, type ReviewItem } from '@/services/api'
import { useReviewStore, type ReviewStatus } from '@/stores/review'

const TABS: { key: ReviewStatus; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'pending', label: 'Pending', icon: 'time-outline' },
  { key: 'approved', label: 'Approved', icon: 'checkmark-circle-outline' },
  { key: 'rejected', label: 'Rejected', icon: 'close-circle-outline' },
]

export default function ReviewListScreen() {
  const { status, items, total, isLoading, error, setStatus, fetch } = useReviewStore()
  const { queueStatus, fetchQueueStatus, scanUntagged, startScan, stopScan, setVenice } = useReviewStore()
  const [scanBusy, setScanBusy] = useState(false)
  const [veniceBusy, setVeniceBusy] = useState(false)

  useEffect(() => {
    fetch()
  }, [status])

  // Poll scan-queue status while on this screen so the user can watch
  // pending/processing counts move as the PC scans.
  useEffect(() => {
    fetchQueueStatus()
    const iv = setInterval(fetchQueueStatus, 4000)
    return () => clearInterval(iv)
  }, [])

  const toggleScan = async () => {
    setScanBusy(true)
    try {
      queueStatus?.isRunning ? await stopScan() : await startScan()
    } catch (e: any) {
      Alert.alert('Scanner', e?.message ?? 'Failed')
    } finally {
      setScanBusy(false)
    }
  }
  const doScanUntagged = async () => {
    setScanBusy(true)
    try {
      const n = await scanUntagged()
      const venice = queueStatus?.tier2Enabled
        ? 'Venice (rich titles/descriptions) is ON.'
        : 'Venice is OFF — local tags only (no AI titles/descriptions).'
      Alert.alert('Scanning started', `Queued ${n} untagged video${n === 1 ? '' : 's'} for analysis on the PC. ${venice} They'll appear in Pending as they finish.`)
    } catch (e: any) {
      Alert.alert('Scan untagged', e?.message ?? 'Failed')
    } finally {
      setScanBusy(false)
    }
  }

  const toggleVenice = async () => {
    setVeniceBusy(true)
    try {
      await setVenice(!queueStatus?.tier2Enabled)
    } catch (e: any) {
      Alert.alert('Venice', e?.message ?? 'Failed')
    } finally {
      setVeniceBusy(false)
    }
  }

  const renderItem = ({ item }: { item: ReviewItem }) => {
    const tagCount = (item.appliedTags?.length ?? 0) || item.matchedTags.length
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.7}
        onPress={() => {
          if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
          router.push(`/review/${item.mediaId}` as any)
        }}
      >
        <Image source={{ uri: api.getThumbUrl(item.mediaId) }} style={styles.thumb} />
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {item.suggestedTitle || item.filename}
          </Text>
          <Text style={styles.cardSub} numberOfLines={1}>
            {tagCount} tag{tagCount === 1 ? '' : 's'}
            {item.description ? ` · ${item.description}` : ''}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#52525b" />
      </TouchableOpacity>
    )
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'AI Review', headerShown: true }} />

      {/* Scanner control */}
      <View style={styles.scanCard}>
        <View style={styles.scanInfo}>
          <View style={styles.scanDotRow}>
            <View style={[styles.scanDot, queueStatus?.isRunning ? styles.scanDotOn : styles.scanDotOff]} />
            <Text style={styles.scanTitle}>
              {queueStatus?.isRunning ? 'Scanning on PC' : 'Scanner idle'}
            </Text>
          </View>
          <Text style={styles.scanSub}>
            {queueStatus
              ? `${queueStatus.processing} processing · ${queueStatus.pending} queued${typeof queueStatus.untagged === 'number' ? ` · ${queueStatus.untagged} untagged` : ''}`
              : '…'}
          </Text>
          <TouchableOpacity style={styles.veniceChip} onPress={toggleVenice} disabled={veniceBusy}>
            {veniceBusy
              ? <ActivityIndicator size="small" color="#a855f7" />
              : <Ionicons name={queueStatus?.tier2Enabled ? 'sparkles' : 'sparkles-outline'} size={13} color={queueStatus?.tier2Enabled ? '#a855f7' : '#71717a'} />}
            <Text style={[styles.veniceChipText, { color: queueStatus?.tier2Enabled ? '#c4b5fd' : '#71717a' }]}>
              Venice {queueStatus?.tier2Enabled ? 'ON' : 'OFF'}
            </Text>
          </TouchableOpacity>
        </View>
        <View style={styles.scanBtns}>
          <TouchableOpacity style={styles.scanSmallBtn} onPress={doScanUntagged} disabled={scanBusy}>
            <Ionicons name="scan" size={16} color="#a855f7" />
            <Text style={styles.scanSmallText}>Scan untagged</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.scanToggle, queueStatus?.isRunning ? styles.scanToggleStop : styles.scanToggleStart]}
            onPress={toggleScan}
            disabled={scanBusy}
          >
            {scanBusy
              ? <ActivityIndicator size="small" color="#fff" />
              : <Ionicons name={queueStatus?.isRunning ? 'pause' : 'play'} size={18} color="#fff" />}
          </TouchableOpacity>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {TABS.map((t) => {
          const active = status === t.key
          return (
            <TouchableOpacity
              key={t.key}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => {
                if (Platform.OS === 'ios') Haptics.selectionAsync()
                setStatus(t.key)
              }}
            >
              <Ionicons name={t.icon} size={16} color={active ? '#fff' : '#a1a1aa'} />
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{t.label}</Text>
            </TouchableOpacity>
          )
        })}
      </View>

      {error ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={40} color="#ef4444" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={fetch}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : isLoading && items.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="checkmark-done-outline" size={44} color="#3f3f46" />
          <Text style={styles.emptyText}>Nothing {status} to review</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.mediaId}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={isLoading} onRefresh={fetch} tintColor="#3b82f6" />
          }
          ListHeaderComponent={
            <Text style={styles.countHeader}>{total} item{total === 1 ? '' : 's'}</Text>
          }
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#09090b' },
  scanCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    margin: 12, marginBottom: 0, padding: 12, borderRadius: 12,
    backgroundColor: '#18181b', borderWidth: 1, borderColor: '#27272a',
  },
  scanInfo: { flex: 1 },
  scanDotRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  scanDot: { width: 9, height: 9, borderRadius: 5 },
  scanDotOn: { backgroundColor: '#22c55e' },
  scanDotOff: { backgroundColor: '#52525b' },
  scanTitle: { color: '#fafafa', fontSize: 14, fontWeight: '700' },
  scanSub: { color: '#71717a', fontSize: 12, marginTop: 3 },
  veniceChip: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(168,85,247,0.1)', borderWidth: 1, borderColor: 'rgba(168,85,247,0.25)' },
  veniceChipText: { fontSize: 11, fontWeight: '700' },
  scanBtns: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scanSmallBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 8,
    borderRadius: 9, backgroundColor: 'rgba(168,85,247,0.12)', borderWidth: 1, borderColor: 'rgba(168,85,247,0.3)',
  },
  scanSmallText: { color: '#c4b5fd', fontSize: 12, fontWeight: '600' },
  scanToggle: { width: 42, height: 38, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  scanToggleStart: { backgroundColor: '#16a34a' },
  scanToggleStop: { backgroundColor: '#3f3f46' },
  tabs: { flexDirection: 'row', gap: 8, padding: 12, backgroundColor: '#09090b' },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 10, backgroundColor: '#18181b',
  },
  tabActive: { backgroundColor: '#3b82f6' },
  tabLabel: { color: '#a1a1aa', fontSize: 13, fontWeight: '600' },
  tabLabelActive: { color: '#fff' },
  list: { padding: 12, gap: 10 },
  countHeader: { color: '#71717a', fontSize: 12, marginBottom: 8, marginLeft: 2 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10,
    backgroundColor: '#18181b', borderRadius: 12, marginBottom: 10,
  },
  thumb: { width: 64, height: 64, borderRadius: 8, backgroundColor: '#27272a' },
  cardBody: { flex: 1 },
  cardTitle: { color: '#fafafa', fontSize: 15, fontWeight: '600' },
  cardSub: { color: '#71717a', fontSize: 12, marginTop: 3 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  emptyText: { color: '#52525b', fontSize: 15 },
  errorText: { color: '#ef4444', fontSize: 14, textAlign: 'center' },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#18181b', borderRadius: 10 },
  retryText: { color: '#3b82f6', fontWeight: '600' },
})
