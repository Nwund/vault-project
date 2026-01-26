// File: src/renderer/themes.ts
export type ThemeId =
  | 'obsidian'
  | 'graphite'
  | 'midnight'
  | 'aurora'
  | 'rose'
  | 'citrus'
  | 'ocean'
  | 'lavender'
  | 'sand'
  | 'vapor'

export type Theme = {
  id: ThemeId
  name: string
  className: string
}

export const THEMES: Theme[] = [
  { id: 'obsidian', name: 'Obsidian', className: 'theme-obsidian' },
  { id: 'graphite', name: 'Graphite', className: 'theme-graphite' },
  { id: 'midnight', name: 'Midnight', className: 'theme-midnight' },
  { id: 'aurora', name: 'Aurora', className: 'theme-aurora' },
  { id: 'rose', name: 'Rose', className: 'theme-rose' },
  { id: 'citrus', name: 'Citrus', className: 'theme-citrus' },
  { id: 'ocean', name: 'Ocean', className: 'theme-ocean' },
  { id: 'lavender', name: 'Lavender', className: 'theme-lavender' },
  { id: 'sand', name: 'Sand', className: 'theme-sand' },
  { id: 'vapor', name: 'Vapor', className: 'theme-vapor' }
]

export const DEFAULT_THEME: ThemeId = 'obsidian'

export function themeClass(themeId: ThemeId): string {
  return THEMES.find((t) => t.id === themeId)?.className ?? 'theme-obsidian'
}
