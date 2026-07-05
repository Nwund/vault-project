// File: vault-mobile/app/review/[id].tsx
// AI Review detail — watch the real video, edit title/description (with AI
// regenerate), edit tags (toggle AI-suggested, add custom/new), then
// Approve or Reject. Drives the PC over the mobile-sync API.

import { useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from 'react-native'
import { useLocalSearchParams, router, Stack } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Video, ResizeMode } from 'expo-av'
import * as Haptics from 'expo-haptics'
import { api } from '@/services/api'
import { useReviewStore } from '@/stores/review'
import { getErrorMessage } from '@/utils'

export default function ReviewDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const mediaId = id!
  const item = useReviewStore((s) => s.getItem(mediaId))
  const approve = useReviewStore((s) => s.approve)
  const reject = useReviewStore((s) => s.reject)
  const regenerate = useReviewStore((s) => s.regenerate)
  const removeAppliedTag = useReviewStore((s) => s.removeAppliedTag)
  const [removingTag, setRemovingTag] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set())
  const [selectedNewNames, setSelectedNewNames] = useState<Set<string>>(new Set())
  const [customTags, setCustomTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [regenerating, setRegenerating] = useState<'title' | 'description' | null>(null)
  const [submitting, setSubmitting] = useState<null | 'approve' | 'reject'>(null)

  // Initialise editable state once the item is available.
  useEffect(() => {
    if (!item) return
    // For already-approved items show the saved (approved) title, not the
    // AI's original suggestion, so a re-opened item reflects your edits.
    setTitle(
      item.reviewStatus === 'approved' && item.approvedTitle
        ? String(item.approvedTitle)
        : item.suggestedTitle || ''
    )
    setDescription(item.description || '')
    const initial =
      item.reviewStatus === 'approved' && item.approvedTagIds?.length
        ? item.approvedTagIds
        : item.matchedTags.map((t) => t.id)
    setSelectedTagIds(new Set(initial))
    setSelectedNewNames(new Set())
    setCustomTags([])
  }, [item?.mediaId])

  const streamUrl = useMemo(() => (mediaId ? api.getStreamUrl(mediaId) : ''), [mediaId])

  if (!item) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Review' }} />
        <Text style={styles.muted}>Item not loaded. Go back and reopen it.</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => router.back()}>
          <Text style={styles.retryText}>Back</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const toggleTag = (tagId: string) => {
    if (Platform.OS === 'ios') Haptics.selectionAsync()
    setSelectedTagIds((prev) => {
      const next = new Set(prev)
      next.has(tagId) ? next.delete(tagId) : next.add(tagId)
      return next
    })
  }
  const toggleNew = (name: string) => {
    if (Platform.OS === 'ios') Haptics.selectionAsync()
    setSelectedNewNames((prev) => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }
  const addCustomTag = () => {
    const raw = tagInput.trim().toLowerCase()
    if (!raw) return
    // Support comma-separated entry.
    const names = raw.split(',').map((t) => t.trim()).filter(Boolean)
    setCustomTags((prev) => Array.from(new Set([...prev, ...names])))
    setTagInput('')
  }
  const removeCustomTag = (name: string) =>
    setCustomTags((prev) => prev.filter((t) => t !== name))

  const removeApplied = async (name: string) => {
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setRemovingTag(name)
    try {
      await removeAppliedTag(mediaId, name)
      // Also drop it from the AI-kept selection if it maps to a matched tag.
      const matched = item?.matchedTags.find((t) => t.name === name)
      if (matched) {
        setSelectedTagIds((prev) => {
          const next = new Set(prev)
          next.delete(matched.id)
          return next
        })
      }
    } catch (err) {
      Alert.alert('Remove tag failed', getErrorMessage(err))
    } finally {
      setRemovingTag(null)
    }
  }

  const doRegenerate = async (field: 'title' | 'description') => {
    setRegenerating(field)
    try {
      const value = await regenerate(mediaId, field)
      if (value != null) {
        field === 'title' ? setTitle(value) : setDescription(value)
      }
    } catch (err) {
      Alert.alert('Regenerate failed', getErrorMessage(err))
    } finally {
      setRegenerating(null)
    }
  }

  const doApprove = async () => {
    setSubmitting('approve')
    try {
      await approve(mediaId, {
        selectedTagIds: Array.from(selectedTagIds),
        newTags: [...selectedNewNames, ...customTags],
        editedTitle: title || undefined,
        editedDescription: description !== (item.description ?? '') ? description : undefined,
        originalTitle: item.suggestedTitle ?? null,
        originalDescription: item.description ?? null,
      })
      if (Platform.OS === 'ios') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      router.back()
    } catch (err) {
      Alert.alert('Approve failed', getErrorMessage(err))
      setSubmitting(null)
    }
  }

  const doReject = () => {
    Alert.alert('Reject this item?', 'It will be re-queued for a fresh AI pass.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reject',
        style: 'destructive',
        onPress: async () => {
          setSubmitting('reject')
          try {
            await reject(mediaId)
            router.back()
          } catch (err) {
            Alert.alert('Reject failed', getErrorMessage(err))
            setSubmitting(null)
          }
        },
      },
    ])
  }

  const busy = submitting !== null

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: 'Review', headerShown: true }} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Video */}
        <View style={styles.videoWrap}>
          <Video
            source={{ uri: streamUrl }}
            style={styles.video}
            resizeMode={ResizeMode.CONTAIN}
            useNativeControls
            isLooping
          />
        </View>
        <Text style={styles.filename} numberOfLines={1}>{item.filename}</Text>

        {/* Title */}
        <View style={styles.fieldRow}>
          <Text style={styles.label}>Title</Text>
          <TouchableOpacity onPress={() => doRegenerate('title')} disabled={regenerating === 'title'}>
            {regenerating === 'title'
              ? <ActivityIndicator size="small" color="#3b82f6" />
              : <Text style={styles.regen}><Ionicons name="sparkles-outline" size={13} /> Regenerate</Text>}
          </TouchableOpacity>
        </View>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Title"
          placeholderTextColor="#52525b"
        />

        {/* Description */}
        <View style={styles.fieldRow}>
          <Text style={styles.label}>Description</Text>
          <TouchableOpacity onPress={() => doRegenerate('description')} disabled={regenerating === 'description'}>
            {regenerating === 'description'
              ? <ActivityIndicator size="small" color="#3b82f6" />
              : <Text style={styles.regen}><Ionicons name="sparkles-outline" size={13} /> Regenerate</Text>}
          </TouchableOpacity>
        </View>
        <TextInput
          style={[styles.input, styles.textarea]}
          value={description}
          onChangeText={setDescription}
          placeholder="Description"
          placeholderTextColor="#52525b"
          multiline
        />

        {/* Applied tags (source of truth) — tap to remove from the media */}
        {item.appliedTags && item.appliedTags.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>On this media · tap to remove · {item.appliedTags.length}</Text>
            <View style={styles.chipWrap}>
              {item.appliedTags.map((name) => (
                <TouchableOpacity
                  key={name}
                  style={[styles.chip, styles.chipApplied]}
                  onPress={() => removeApplied(name)}
                  disabled={removingTag === name}
                >
                  <Text style={styles.chipAppliedText}>{name}</Text>
                  {removingTag === name
                    ? <ActivityIndicator size="small" color="#6ee7b7" />
                    : <Ionicons name="close" size={13} color="#6ee7b7" />}
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* AI-matched tags — toggle to keep/drop */}
        {item.matchedTags.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>AI tags · tap to keep/remove</Text>
            <View style={styles.chipWrap}>
              {item.matchedTags.map((t) => {
                const on = selectedTagIds.has(t.id)
                return (
                  <TouchableOpacity key={t.id} onPress={() => toggleTag(t.id)} style={[styles.chip, on ? styles.chipOn : styles.chipOff]}>
                    <Ionicons name={on ? 'checkmark' : 'add'} size={13} color={on ? '#fff' : '#a1a1aa'} />
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{t.name}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </>
        )}

        {/* AI new-tag suggestions — tap to add */}
        {item.newTagSuggestions.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Suggested new · tap to add</Text>
            <View style={styles.chipWrap}>
              {item.newTagSuggestions.map((s) => {
                const on = selectedNewNames.has(s.name)
                return (
                  <TouchableOpacity key={s.name} onPress={() => toggleNew(s.name)} style={[styles.chip, on ? styles.chipOn : styles.chipOff]}>
                    <Ionicons name={on ? 'checkmark' : 'add'} size={13} color={on ? '#fff' : '#a1a1aa'} />
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{s.name}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </>
        )}

        {/* Custom tag entry */}
        <Text style={styles.sectionLabel}>Add your own tags</Text>
        <View style={styles.addRow}>
          <TextInput
            style={[styles.input, styles.addInput]}
            value={tagInput}
            onChangeText={setTagInput}
            placeholder="Type a tag, then Add"
            placeholderTextColor="#52525b"
            autoCapitalize="none"
            onSubmitEditing={addCustomTag}
            returnKeyType="done"
          />
          <TouchableOpacity style={styles.addBtn} onPress={addCustomTag}>
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
        {customTags.length > 0 && (
          <View style={styles.chipWrap}>
            {customTags.map((name) => (
              <TouchableOpacity key={name} onPress={() => removeCustomTag(name)} style={[styles.chip, styles.chipCustom]}>
                <Text style={styles.chipCustomText}>{name}</Text>
                <Ionicons name="close" size={13} color="#c4b5fd" />
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Sticky actions */}
      <View style={styles.footer}>
        <TouchableOpacity style={[styles.actionBtn, styles.rejectBtn]} onPress={doReject} disabled={busy}>
          {submitting === 'reject'
            ? <ActivityIndicator color="#ef4444" />
            : <><Ionicons name="close" size={18} color="#ef4444" /><Text style={styles.rejectText}>Reject</Text></>}
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, styles.approveBtn]} onPress={doApprove} disabled={busy}>
          {submitting === 'approve'
            ? <ActivityIndicator color="#fff" />
            : <><Ionicons name="checkmark" size={18} color="#fff" /><Text style={styles.approveText}>Approve</Text></>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#09090b' },
  scroll: { padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, backgroundColor: '#09090b', padding: 24 },
  muted: { color: '#71717a', fontSize: 15 },
  videoWrap: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000', borderRadius: 12, overflow: 'hidden' },
  video: { width: '100%', height: '100%' },
  filename: { color: '#71717a', fontSize: 12, marginTop: 8 },
  fieldRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, marginBottom: 6 },
  label: { color: '#e4e4e7', fontSize: 14, fontWeight: '600' },
  regen: { color: '#3b82f6', fontSize: 12, fontWeight: '600' },
  input: { backgroundColor: '#18181b', borderRadius: 10, color: '#fafafa', paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, borderWidth: 1, borderColor: '#27272a' },
  textarea: { minHeight: 90, textAlignVertical: 'top' },
  sectionLabel: { color: '#a1a1aa', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 20, marginBottom: 8 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
  chipOn: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  chipOff: { backgroundColor: '#18181b', borderColor: '#3f3f46' },
  chipText: { color: '#a1a1aa', fontSize: 13 },
  chipTextOn: { color: '#fff', fontWeight: '600' },
  chipApplied: { backgroundColor: 'rgba(16,185,129,0.12)', borderColor: 'rgba(16,185,129,0.3)' },
  chipAppliedText: { color: '#6ee7b7', fontSize: 13 },
  chipCustom: { backgroundColor: 'rgba(139,92,246,0.15)', borderColor: 'rgba(139,92,246,0.35)' },
  chipCustomText: { color: '#c4b5fd', fontSize: 13, fontWeight: '600' },
  addRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  addInput: { flex: 1 },
  addBtn: { width: 44, height: 44, borderRadius: 10, backgroundColor: '#3b82f6', alignItems: 'center', justifyContent: 'center' },
  footer: { flexDirection: 'row', gap: 12, padding: 14, borderTopWidth: 1, borderTopColor: '#18181b', backgroundColor: '#09090b' },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12 },
  rejectBtn: { backgroundColor: '#18181b', borderWidth: 1, borderColor: '#3f1d1d' },
  rejectText: { color: '#ef4444', fontSize: 15, fontWeight: '700' },
  approveBtn: { backgroundColor: '#16a34a' },
  approveText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#18181b', borderRadius: 10 },
  retryText: { color: '#3b82f6', fontWeight: '600' },
})
