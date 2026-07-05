// File: vault-mobile/constants/colors.ts
// App color palette and theme

export const colors = {
  // Primary colors
  primary: '#3b82f6',
  primaryLight: 'rgba(59, 130, 246, 0.15)',
  primaryDark: '#2563eb',

  // Background colors
  background: '#09090b',
  surface: '#18181b',
  surfaceLight: '#1f1f23',
  surfaceLighter: '#27272a',

  // Text colors
  textPrimary: '#ffffff',
  textSecondary: '#a1a1aa',
  textMuted: '#71717a',
  textDisabled: '#52525b',

  // Accent colors
  red: '#ef4444',
  redLight: 'rgba(239, 68, 68, 0.15)',
  green: '#22c55e',
  greenLight: 'rgba(34, 197, 94, 0.15)',
  yellow: '#f59e0b',
  yellowLight: 'rgba(245, 158, 11, 0.15)',
  purple: '#a855f7',
  purpleLight: 'rgba(168, 85, 247, 0.15)',
  orange: '#f97316',
  orangeLight: 'rgba(249, 115, 22, 0.15)',
  pink: '#ec4899',
  pinkLight: 'rgba(236, 72, 153, 0.15)',
  teal: '#14b8a6',
  tealLight: 'rgba(20, 184, 166, 0.15)',

  // Border colors
  border: '#27272a',
  borderLight: '#3f3f46',

  // Status colors
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#3b82f6',

  // Overlay
  overlay: 'rgba(0, 0, 0, 0.7)',
  overlayLight: 'rgba(0, 0, 0, 0.5)',
} as const

export type ColorKey = keyof typeof colors
