// File: vault-mobile/app/playlist/[id].tsx
// Playlist detail — lists the videos in a playlist and plays them. Replaces
// the old (broken) nav that sent a playlist id straight to the video player.

import { useEffect, useState, useCallback } from 'react'
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
} from 'react-native'
import { useLocalSearchParams, router, Stack } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { api } from '@/services/api'
import { getErrorMessage } from '@/utils'

interface Item {
  id: string
  filename: string
  type: 'video' | 'image' | 'gif'
  durationSec?: number
  hasThumb: boolean
}

function fmtDuration(sec?: number) {
  if (!sec || sec <= 0) return ''
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function PlaylistDetailScreen() {
  const { id, autoplay } = useLocalSearchParams<{ id: string; autoplay?: string }>()
  const [items, setItems] = useState<Item[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await api.getPlaylistItems(id!)
      setItems(res.items || [])
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  // Optional autoplay: jump straight into the first video.
  useEffect(() => {
    if (autoplay && items.length > 0) {
      router.replace(`/player/${items[0].id}` as any)
    }
  }, [autoplay, items])

  const playItem = (mediaId: string) => {
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    router.push(`/player/${mediaId}` as any)
  }

  const renderItem = ({ item, index }: { item: Item; index: number }) => (
    <TouchableOpacity style={styles.row} activeOpacity={0.7} onPress={() => playItem(item.id)}>
      <Text style={styles.rowIndex}>{index + 1}</Text>
      <Image source={{ uri: api.getThumbUrl(item.id) }} style={styles.thumb} />
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={2}>{item.filename}</Text>
        {fmtDuration(item.durationSec) ? (
          <Text style={styles.rowSub}>{fmtDuration(item.durationSec)}</Text>
        ) : null}
      </View>
      <Ionicons name="play-circle" size={26} color="#3b82f6" />
    </TouchableOpacity>
  )

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Playlist', headerShown: true }} />
      {items.length > 0 && (
        <TouchableOpacity style={styles.playAll} onPress={() => playItem(items[0].id)}>
          <Ionicons name="play" size={18} color="#fff" />
          <Text style={styles.playAllText}>Play all ({items.length})</Text>
        </TouchableOpacity>
      )}
      {error ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={40} color="#ef4444" />
          <Text style={styles.err}>{error}</Text>
          <TouchableOpacity style={styles.retry} onPress={load}><Text style={styles.retryText}>Retry</Text></TouchableOpacity>
        </View>
      ) : isLoading && items.length === 0 ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#3b82f6" /></View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="albums-outline" size={44} color="#3f3f46" />
          <Text style={styles.empty}>This playlist is empty</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={load} tintColor="#3b82f6" />}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#09090b' },
  playAll: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    margin: 12, paddingVertical: 12, borderRadius: 12, backgroundColor: '#3b82f6',
  },
  playAllText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  list: { paddingHorizontal: 12, paddingBottom: 40 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: '#18181b',
  },
  rowIndex: { color: '#52525b', fontSize: 13, width: 20, textAlign: 'center' },
  thumb: { width: 84, height: 52, borderRadius: 6, backgroundColor: '#27272a' },
  rowBody: { flex: 1 },
  rowTitle: { color: '#fafafa', fontSize: 14 },
  rowSub: { color: '#71717a', fontSize: 12, marginTop: 3 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  err: { color: '#ef4444', fontSize: 14, textAlign: 'center' },
  empty: { color: '#52525b', fontSize: 15 },
  retry: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#18181b', borderRadius: 10 },
  retryText: { color: '#3b82f6', fontWeight: '600' },
})
