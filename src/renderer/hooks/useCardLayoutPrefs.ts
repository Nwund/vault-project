// File: src/renderer/hooks/useCardLayoutPrefs.ts
//
// #159 — Customizable card metadata + home-section ordering.
//
// Two independent preference sets stored in localStorage:
//
//   vault.cardFields.v1   — Set<CardFieldId>  (which metadata to show)
//   vault.homeOrder.v1    — string[]          (ordered Home-section ids)
//
// MediaTile + LibraryPage Home consume these to decide what to render.
// Both expose a React hook that subscribes to changes from any window.

import { useCallback, useEffect, useState } from 'react'

export type CardFieldId =
  | 'rating'
  | 'duration'
  | 'tagChips'
  | 'performer'
  | 'lastWatched'
  | 'fileSize'
  | 'addedDate'
  | 'resolution'

const CARD_FIELDS_KEY = 'vault.cardFields.v1'
const HOME_ORDER_KEY = 'vault.homeOrder.v1'

// Defaults match Vault's pre-#159 behavior so installing the toggle
// doesn't change anyone's experience until they actively opt in.
const DEFAULT_CARD_FIELDS: CardFieldId[] = ['rating', 'duration', 'tagChips']

// Stable ids for the Home tab's panels. Adding a new section?
// Append its id here so it ships disabled-by-default for old users.
export type HomeSectionId =
  | 'recentlyViewed'
  | 'todaysMix'
  | 'continueWatching'
  | 'achievements'
  | 'subscriptionsInbox'
  | 'mostViewed'

const DEFAULT_HOME_ORDER: HomeSectionId[] = [
  'recentlyViewed',
  'todaysMix',
  'continueWatching',
  'achievements',
  'subscriptionsInbox',
  'mostViewed',
]

function readSet(): Set<CardFieldId> {
  try {
    const raw = localStorage.getItem(CARD_FIELDS_KEY)
    if (!raw) return new Set(DEFAULT_CARD_FIELDS)
    const arr = JSON.parse(raw) as CardFieldId[]
    return Array.isArray(arr) ? new Set(arr) : new Set(DEFAULT_CARD_FIELDS)
  } catch { return new Set(DEFAULT_CARD_FIELDS) }
}

function readOrder(): HomeSectionId[] {
  try {
    const raw = localStorage.getItem(HOME_ORDER_KEY)
    if (!raw) return [...DEFAULT_HOME_ORDER]
    const arr = JSON.parse(raw) as HomeSectionId[]
    if (!Array.isArray(arr)) return [...DEFAULT_HOME_ORDER]
    // Heal: append any newly-added defaults the user hasn't seen.
    const seen = new Set(arr)
    for (const id of DEFAULT_HOME_ORDER) if (!seen.has(id)) arr.push(id)
    return arr
  } catch { return [...DEFAULT_HOME_ORDER] }
}

function write<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    window.dispatchEvent(new CustomEvent('vault:card-layout-changed'))
  } catch { /* quota — non-fatal */ }
}

export function useCardLayoutPrefs(): {
  fields: Set<CardFieldId>
  setField: (field: CardFieldId, on: boolean) => void
  resetFields: () => void
  homeOrder: HomeSectionId[]
  setHomeOrder: (next: HomeSectionId[]) => void
  resetHome: () => void
  ALL_FIELDS: ReadonlyArray<{ id: CardFieldId; label: string }>
  ALL_HOME_SECTIONS: ReadonlyArray<{ id: HomeSectionId; label: string }>
} {
  const [fields, setFields] = useState<Set<CardFieldId>>(() => readSet())
  const [homeOrder, setHomeOrderState] = useState<HomeSectionId[]>(() => readOrder())

  useEffect(() => {
    const onChange = () => {
      setFields(readSet())
      setHomeOrderState(readOrder())
    }
    window.addEventListener('vault:card-layout-changed', onChange)
    window.addEventListener('storage', onChange)
    return () => {
      window.removeEventListener('vault:card-layout-changed', onChange)
      window.removeEventListener('storage', onChange)
    }
  }, [])

  const setField = useCallback((field: CardFieldId, on: boolean) => {
    const cur = readSet()
    if (on) cur.add(field)
    else cur.delete(field)
    write(CARD_FIELDS_KEY, Array.from(cur))
    setFields(new Set(cur))
  }, [])

  const resetFields = useCallback(() => {
    write(CARD_FIELDS_KEY, DEFAULT_CARD_FIELDS)
    setFields(new Set(DEFAULT_CARD_FIELDS))
  }, [])

  const setHomeOrder = useCallback((next: HomeSectionId[]) => {
    write(HOME_ORDER_KEY, next)
    setHomeOrderState(next)
  }, [])

  const resetHome = useCallback(() => {
    write(HOME_ORDER_KEY, DEFAULT_HOME_ORDER)
    setHomeOrderState([...DEFAULT_HOME_ORDER])
  }, [])

  return {
    fields,
    setField,
    resetFields,
    homeOrder,
    setHomeOrder,
    resetHome,
    ALL_FIELDS: [
      { id: 'rating', label: 'Rating ★' },
      { id: 'duration', label: 'Duration' },
      { id: 'tagChips', label: 'Tag chips' },
      { id: 'performer', label: 'Performer name' },
      { id: 'lastWatched', label: 'Last watched' },
      { id: 'fileSize', label: 'File size' },
      { id: 'addedDate', label: 'Added date' },
      { id: 'resolution', label: 'Resolution (e.g. 1080p)' },
    ],
    ALL_HOME_SECTIONS: [
      { id: 'recentlyViewed', label: 'Recently viewed' },
      { id: 'todaysMix', label: "Today's mix" },
      { id: 'continueWatching', label: 'Continue watching' },
      { id: 'achievements', label: 'Achievements progress' },
      { id: 'subscriptionsInbox', label: 'Subscriptions inbox' },
      { id: 'mostViewed', label: 'Most viewed' },
    ],
  }
}
