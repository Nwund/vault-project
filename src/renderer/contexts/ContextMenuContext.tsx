// File: src/renderer/contexts/ContextMenuContext.tsx
//
// Right-click context menu state. Moved out of App.tsx so the page
// modules (LibraryPage, etc.) can call `useContextMenu()` directly
// instead of having `showContextMenu` plumbed through props.

import { createContext, useContext } from 'react'
import type { MediaRow } from '../types'

export type ContextMenuState = {
  visible: boolean
  x: number
  y: number
  mediaId: string | null
  mediaPath: string | null
  mediaType: 'video' | 'image' | 'gif' | null
  mediaData?: MediaRow | null
}

export const ContextMenuContext = createContext<{
  contextMenu: ContextMenuState
  showContextMenu: (media: MediaRow, x: number, y: number) => void
  hideContextMenu: () => void
}>({
  contextMenu: { visible: false, x: 0, y: 0, mediaId: null, mediaPath: null, mediaType: null, mediaData: null },
  showContextMenu: () => {},
  hideContextMenu: () => {}
})

export function useContextMenu() {
  return useContext(ContextMenuContext)
}
