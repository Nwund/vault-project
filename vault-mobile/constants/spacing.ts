// File: vault-mobile/constants/spacing.ts
// Consistent spacing and sizing values

export const spacing = {
  // Base spacing
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,

  // Screen padding
  screenPadding: 16,
  screenPaddingHorizontal: 16,
  screenPaddingVertical: 24,

  // Card padding
  cardPadding: 14,
  cardPaddingLarge: 16,

  // Icon sizes
  iconSmall: 16,
  iconMedium: 20,
  iconLarge: 24,
  iconXLarge: 32,

  // Border radius
  radiusSmall: 4,
  radiusMedium: 8,
  radiusLarge: 12,
  radiusXLarge: 16,
  radiusFull: 9999,

  // Component sizes
  buttonHeight: 48,
  buttonHeightSmall: 40,
  inputHeight: 48,
  tabBarHeight: 88,
  headerHeight: 56,
} as const

export type SpacingKey = keyof typeof spacing
