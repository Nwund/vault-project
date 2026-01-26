// ===============================
// File: src/renderer/styles/themes.ts
// Hypersexual Goon Themes for Vault
// ===============================

// Classic themes
export type ClassicThemeId =
  | 'obsidian'
  | 'moonlight'
  | 'ember'
  | 'velvet'
  | 'noir'
  | 'neon-dreams'
  | 'champagne'
  | 'rose-gold'
  | 'midnight-garden'
  | 'sapphire'

// Hypersexual goon themes
export type GoonThemeId =
  | 'afterglow'      // Post-orgasm bliss - warm pinks
  | 'edgelands'      // Perpetual almost-there - throbbing purple
  | 'red-room'       // Dominant, intense - crimson
  | 'midnight-velvet' // Luxurious darkness - deep plum
  | 'neon-lust'      // Cyberpunk brothel - hot pink/cyan
  | 'honeypot'       // Sweet, sticky, addictive - gold
  | 'sinners-paradise' // Hellfire and pleasure - orange/red
  | 'wet-dreams'     // Dreamy, fluid, surreal - indigo
  | 'flesh'          // Raw, primal, carnal - skin tones
  | 'void'           // Total focus - pure black

export type ThemeId = ClassicThemeId | GoonThemeId

export interface ThemeColors {
  // Backgrounds
  background: string
  backgroundAlt: string
  surface: string
  surfaceHover: string
  surfaceActive: string

  // Borders
  border: string
  borderHover: string
  borderActive: string

  // Text
  text: string
  textMuted: string
  textSubtle: string

  // Primary accent
  primary: string
  primaryHover: string
  primaryMuted: string

  // Secondary accent
  secondary: string
  secondaryHover: string

  // Semantic colors
  success: string
  warning: string
  error: string
  info: string

  // Special
  gradient: string
  glow: string
  overlay: string
}

export interface Theme {
  id: ThemeId
  name: string
  description: string
  isDark: boolean
  colors: ThemeColors
  shadows: {
    sm: string
    md: string
    lg: string
    glow: string
  }
  blur: {
    sm: string
    md: string
    lg: string
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// THEME DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

export const themes: Record<ThemeId, Theme> = {
  // 1. OBSIDIAN - Default Dark (Purple accent)
  obsidian: {
    id: 'obsidian',
    name: 'Obsidian',
    description: 'Deep blacks with purple accents. Elegant and minimal.',
    isDark: true,
    colors: {
      background: '#05070d',
      backgroundAlt: '#0a0c14',
      surface: 'rgba(255, 255, 255, 0.04)',
      surfaceHover: 'rgba(255, 255, 255, 0.06)',
      surfaceActive: 'rgba(255, 255, 255, 0.08)',
      border: 'rgba(255, 255, 255, 0.08)',
      borderHover: 'rgba(255, 255, 255, 0.12)',
      borderActive: 'rgba(255, 255, 255, 0.16)',
      text: '#f8fafc',
      textMuted: 'rgba(255, 255, 255, 0.6)',
      textSubtle: 'rgba(255, 255, 255, 0.4)',
      primary: '#8b5cf6',
      primaryHover: '#a78bfa',
      primaryMuted: 'rgba(139, 92, 246, 0.2)',
      secondary: '#ec4899',
      secondaryHover: '#f472b6',
      success: '#22c55e',
      warning: '#f59e0b',
      error: '#ef4444',
      info: '#3b82f6',
      gradient: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)',
      glow: 'rgba(139, 92, 246, 0.4)',
      overlay: 'rgba(0, 0, 0, 0.7)'
    },
    shadows: {
      sm: '0 1px 2px rgba(0, 0, 0, 0.5)',
      md: '0 4px 12px rgba(0, 0, 0, 0.5)',
      lg: '0 8px 32px rgba(0, 0, 0, 0.6)',
      glow: '0 0 20px rgba(139, 92, 246, 0.3)'
    },
    blur: {
      sm: '8px',
      md: '16px',
      lg: '32px'
    }
  },

  // 2. MOONLIGHT - Soft dark blue-gray, silver accents
  moonlight: {
    id: 'moonlight',
    name: 'Moonlight',
    description: 'Soft blue-gray with silver accents. Calm and sophisticated.',
    isDark: true,
    colors: {
      background: '#0f1318',
      backgroundAlt: '#161b22',
      surface: 'rgba(148, 163, 184, 0.05)',
      surfaceHover: 'rgba(148, 163, 184, 0.08)',
      surfaceActive: 'rgba(148, 163, 184, 0.12)',
      border: 'rgba(148, 163, 184, 0.1)',
      borderHover: 'rgba(148, 163, 184, 0.15)',
      borderActive: 'rgba(148, 163, 184, 0.2)',
      text: '#e2e8f0',
      textMuted: 'rgba(226, 232, 240, 0.6)',
      textSubtle: 'rgba(226, 232, 240, 0.4)',
      primary: '#94a3b8',
      primaryHover: '#cbd5e1',
      primaryMuted: 'rgba(148, 163, 184, 0.2)',
      secondary: '#7dd3fc',
      secondaryHover: '#a5f3fc',
      success: '#4ade80',
      warning: '#fbbf24',
      error: '#f87171',
      info: '#60a5fa',
      gradient: 'linear-gradient(135deg, #64748b 0%, #94a3b8 100%)',
      glow: 'rgba(148, 163, 184, 0.3)',
      overlay: 'rgba(15, 19, 24, 0.8)'
    },
    shadows: {
      sm: '0 1px 2px rgba(0, 0, 0, 0.4)',
      md: '0 4px 12px rgba(0, 0, 0, 0.4)',
      lg: '0 8px 32px rgba(0, 0, 0, 0.5)',
      glow: '0 0 20px rgba(148, 163, 184, 0.2)'
    },
    blur: {
      sm: '8px',
      md: '16px',
      lg: '32px'
    }
  },

  // 3. EMBER - Dark with warm orange/red accents
  ember: {
    id: 'ember',
    name: 'Ember',
    description: 'Dark with warm orange and red accents. Passionate and intense.',
    isDark: true,
    colors: {
      background: '#0c0806',
      backgroundAlt: '#14100c',
      surface: 'rgba(251, 146, 60, 0.04)',
      surfaceHover: 'rgba(251, 146, 60, 0.07)',
      surfaceActive: 'rgba(251, 146, 60, 0.1)',
      border: 'rgba(251, 146, 60, 0.1)',
      borderHover: 'rgba(251, 146, 60, 0.15)',
      borderActive: 'rgba(251, 146, 60, 0.2)',
      text: '#fef3c7',
      textMuted: 'rgba(254, 243, 199, 0.65)',
      textSubtle: 'rgba(254, 243, 199, 0.4)',
      primary: '#f97316',
      primaryHover: '#fb923c',
      primaryMuted: 'rgba(249, 115, 22, 0.2)',
      secondary: '#ef4444',
      secondaryHover: '#f87171',
      success: '#84cc16',
      warning: '#eab308',
      error: '#dc2626',
      info: '#f59e0b',
      gradient: 'linear-gradient(135deg, #dc2626 0%, #f97316 50%, #fbbf24 100%)',
      glow: 'rgba(249, 115, 22, 0.4)',
      overlay: 'rgba(12, 8, 6, 0.8)'
    },
    shadows: {
      sm: '0 1px 2px rgba(0, 0, 0, 0.5)',
      md: '0 4px 12px rgba(0, 0, 0, 0.5)',
      lg: '0 8px 32px rgba(0, 0, 0, 0.6)',
      glow: '0 0 20px rgba(249, 115, 22, 0.3)'
    },
    blur: {
      sm: '8px',
      md: '16px',
      lg: '32px'
    }
  },

  // 4. VELVET - Deep purple/burgundy tones
  velvet: {
    id: 'velvet',
    name: 'Velvet',
    description: 'Deep purple and burgundy tones. Luxurious and sensual.',
    isDark: true,
    colors: {
      background: '#0d0611',
      backgroundAlt: '#150a1a',
      surface: 'rgba(192, 132, 252, 0.04)',
      surfaceHover: 'rgba(192, 132, 252, 0.07)',
      surfaceActive: 'rgba(192, 132, 252, 0.1)',
      border: 'rgba(192, 132, 252, 0.1)',
      borderHover: 'rgba(192, 132, 252, 0.15)',
      borderActive: 'rgba(192, 132, 252, 0.2)',
      text: '#fae8ff',
      textMuted: 'rgba(250, 232, 255, 0.65)',
      textSubtle: 'rgba(250, 232, 255, 0.4)',
      primary: '#a855f7',
      primaryHover: '#c084fc',
      primaryMuted: 'rgba(168, 85, 247, 0.2)',
      secondary: '#be185d',
      secondaryHover: '#db2777',
      success: '#10b981',
      warning: '#d97706',
      error: '#be123c',
      info: '#8b5cf6',
      gradient: 'linear-gradient(135deg, #581c87 0%, #831843 100%)',
      glow: 'rgba(168, 85, 247, 0.4)',
      overlay: 'rgba(13, 6, 17, 0.8)'
    },
    shadows: {
      sm: '0 1px 2px rgba(0, 0, 0, 0.5)',
      md: '0 4px 12px rgba(0, 0, 0, 0.5)',
      lg: '0 8px 32px rgba(0, 0, 0, 0.6)',
      glow: '0 0 20px rgba(168, 85, 247, 0.3)'
    },
    blur: {
      sm: '8px',
      md: '16px',
      lg: '32px'
    }
  },

  // 5. NOIR - Pure black and white, high contrast
  noir: {
    id: 'noir',
    name: 'Noir',
    description: 'Pure black and white with high contrast. Classic and dramatic.',
    isDark: true,
    colors: {
      background: '#000000',
      backgroundAlt: '#0a0a0a',
      surface: 'rgba(255, 255, 255, 0.03)',
      surfaceHover: 'rgba(255, 255, 255, 0.06)',
      surfaceActive: 'rgba(255, 255, 255, 0.09)',
      border: 'rgba(255, 255, 255, 0.1)',
      borderHover: 'rgba(255, 255, 255, 0.2)',
      borderActive: 'rgba(255, 255, 255, 0.3)',
      text: '#ffffff',
      textMuted: 'rgba(255, 255, 255, 0.7)',
      textSubtle: 'rgba(255, 255, 255, 0.5)',
      primary: '#ffffff',
      primaryHover: '#e5e5e5',
      primaryMuted: 'rgba(255, 255, 255, 0.15)',
      secondary: '#a3a3a3',
      secondaryHover: '#d4d4d4',
      success: '#22c55e',
      warning: '#eab308',
      error: '#ef4444',
      info: '#ffffff',
      gradient: 'linear-gradient(135deg, #262626 0%, #525252 100%)',
      glow: 'rgba(255, 255, 255, 0.2)',
      overlay: 'rgba(0, 0, 0, 0.85)'
    },
    shadows: {
      sm: '0 1px 2px rgba(0, 0, 0, 0.8)',
      md: '0 4px 12px rgba(0, 0, 0, 0.8)',
      lg: '0 8px 32px rgba(0, 0, 0, 0.9)',
      glow: '0 0 20px rgba(255, 255, 255, 0.1)'
    },
    blur: {
      sm: '8px',
      md: '16px',
      lg: '32px'
    }
  },

  // 6. NEON DREAMS - Dark with cyan/pink neon accents
  'neon-dreams': {
    id: 'neon-dreams',
    name: 'Neon Dreams',
    description: 'Dark with cyan and pink neon accents. Cyberpunk and electric.',
    isDark: true,
    colors: {
      background: '#0a0a12',
      backgroundAlt: '#0f0f1a',
      surface: 'rgba(34, 211, 238, 0.04)',
      surfaceHover: 'rgba(34, 211, 238, 0.07)',
      surfaceActive: 'rgba(34, 211, 238, 0.1)',
      border: 'rgba(34, 211, 238, 0.12)',
      borderHover: 'rgba(34, 211, 238, 0.2)',
      borderActive: 'rgba(34, 211, 238, 0.3)',
      text: '#ecfeff',
      textMuted: 'rgba(236, 254, 255, 0.7)',
      textSubtle: 'rgba(236, 254, 255, 0.5)',
      primary: '#22d3ee',
      primaryHover: '#67e8f9',
      primaryMuted: 'rgba(34, 211, 238, 0.2)',
      secondary: '#f472b6',
      secondaryHover: '#f9a8d4',
      success: '#4ade80',
      warning: '#facc15',
      error: '#fb7185',
      info: '#38bdf8',
      gradient: 'linear-gradient(135deg, #06b6d4 0%, #ec4899 100%)',
      glow: 'rgba(34, 211, 238, 0.5)',
      overlay: 'rgba(10, 10, 18, 0.85)'
    },
    shadows: {
      sm: '0 1px 2px rgba(0, 0, 0, 0.5)',
      md: '0 4px 12px rgba(0, 0, 0, 0.5)',
      lg: '0 8px 32px rgba(0, 0, 0, 0.6)',
      glow: '0 0 30px rgba(34, 211, 238, 0.4)'
    },
    blur: {
      sm: '8px',
      md: '16px',
      lg: '32px'
    }
  },

  // 7. CHAMPAGNE - Warm cream and gold (LIGHT theme)
  champagne: {
    id: 'champagne',
    name: 'Champagne',
    description: 'Warm cream and gold. Elegant and bright.',
    isDark: false,
    colors: {
      background: '#faf8f5',
      backgroundAlt: '#f5f0e8',
      surface: 'rgba(180, 140, 100, 0.06)',
      surfaceHover: 'rgba(180, 140, 100, 0.1)',
      surfaceActive: 'rgba(180, 140, 100, 0.14)',
      border: 'rgba(180, 140, 100, 0.15)',
      borderHover: 'rgba(180, 140, 100, 0.25)',
      borderActive: 'rgba(180, 140, 100, 0.35)',
      text: '#292524',
      textMuted: 'rgba(41, 37, 36, 0.65)',
      textSubtle: 'rgba(41, 37, 36, 0.45)',
      primary: '#b45309',
      primaryHover: '#d97706',
      primaryMuted: 'rgba(180, 83, 9, 0.15)',
      secondary: '#78716c',
      secondaryHover: '#a8a29e',
      success: '#16a34a',
      warning: '#ca8a04',
      error: '#dc2626',
      info: '#0284c7',
      gradient: 'linear-gradient(135deg, #fbbf24 0%, #b45309 100%)',
      glow: 'rgba(251, 191, 36, 0.3)',
      overlay: 'rgba(250, 248, 245, 0.9)'
    },
    shadows: {
      sm: '0 1px 2px rgba(180, 140, 100, 0.1)',
      md: '0 4px 12px rgba(180, 140, 100, 0.12)',
      lg: '0 8px 32px rgba(180, 140, 100, 0.15)',
      glow: '0 0 20px rgba(251, 191, 36, 0.2)'
    },
    blur: {
      sm: '8px',
      md: '16px',
      lg: '32px'
    }
  },

  // 8. ROSE GOLD - Soft pink and copper (LIGHT theme)
  'rose-gold': {
    id: 'rose-gold',
    name: 'Rose Gold',
    description: 'Soft pink and copper tones. Feminine and warm.',
    isDark: false,
    colors: {
      background: '#fdf4f5',
      backgroundAlt: '#fce8ea',
      surface: 'rgba(225, 150, 160, 0.06)',
      surfaceHover: 'rgba(225, 150, 160, 0.1)',
      surfaceActive: 'rgba(225, 150, 160, 0.14)',
      border: 'rgba(225, 150, 160, 0.18)',
      borderHover: 'rgba(225, 150, 160, 0.28)',
      borderActive: 'rgba(225, 150, 160, 0.38)',
      text: '#44403c',
      textMuted: 'rgba(68, 64, 60, 0.65)',
      textSubtle: 'rgba(68, 64, 60, 0.45)',
      primary: '#be123c',
      primaryHover: '#e11d48',
      primaryMuted: 'rgba(190, 18, 60, 0.12)',
      secondary: '#b45309',
      secondaryHover: '#d97706',
      success: '#16a34a',
      warning: '#ca8a04',
      error: '#dc2626',
      info: '#db2777',
      gradient: 'linear-gradient(135deg, #fda4af 0%, #be123c 100%)',
      glow: 'rgba(251, 113, 133, 0.3)',
      overlay: 'rgba(253, 244, 245, 0.9)'
    },
    shadows: {
      sm: '0 1px 2px rgba(225, 150, 160, 0.15)',
      md: '0 4px 12px rgba(225, 150, 160, 0.18)',
      lg: '0 8px 32px rgba(225, 150, 160, 0.22)',
      glow: '0 0 20px rgba(251, 113, 133, 0.2)'
    },
    blur: {
      sm: '8px',
      md: '16px',
      lg: '32px'
    }
  },

  // 9. MIDNIGHT GARDEN - Dark green and gold
  'midnight-garden': {
    id: 'midnight-garden',
    name: 'Midnight Garden',
    description: 'Dark green and gold. Natural and mysterious.',
    isDark: true,
    colors: {
      background: '#05090a',
      backgroundAlt: '#0a1210',
      surface: 'rgba(74, 222, 128, 0.04)',
      surfaceHover: 'rgba(74, 222, 128, 0.07)',
      surfaceActive: 'rgba(74, 222, 128, 0.1)',
      border: 'rgba(74, 222, 128, 0.1)',
      borderHover: 'rgba(74, 222, 128, 0.18)',
      borderActive: 'rgba(74, 222, 128, 0.25)',
      text: '#ecfdf5',
      textMuted: 'rgba(236, 253, 245, 0.65)',
      textSubtle: 'rgba(236, 253, 245, 0.4)',
      primary: '#22c55e',
      primaryHover: '#4ade80',
      primaryMuted: 'rgba(34, 197, 94, 0.2)',
      secondary: '#eab308',
      secondaryHover: '#facc15',
      success: '#34d399',
      warning: '#fbbf24',
      error: '#f87171',
      info: '#22d3ee',
      gradient: 'linear-gradient(135deg, #166534 0%, #ca8a04 100%)',
      glow: 'rgba(34, 197, 94, 0.4)',
      overlay: 'rgba(5, 9, 10, 0.85)'
    },
    shadows: {
      sm: '0 1px 2px rgba(0, 0, 0, 0.5)',
      md: '0 4px 12px rgba(0, 0, 0, 0.5)',
      lg: '0 8px 32px rgba(0, 0, 0, 0.6)',
      glow: '0 0 20px rgba(34, 197, 94, 0.3)'
    },
    blur: {
      sm: '8px',
      md: '16px',
      lg: '32px'
    }
  },

  // 10. SAPPHIRE - Deep blue with ice blue accents
  sapphire: {
    id: 'sapphire',
    name: 'Sapphire',
    description: 'Deep blue with ice blue accents. Cool and professional.',
    isDark: true,
    colors: {
      background: '#030712',
      backgroundAlt: '#0c1426',
      surface: 'rgba(59, 130, 246, 0.04)',
      surfaceHover: 'rgba(59, 130, 246, 0.07)',
      surfaceActive: 'rgba(59, 130, 246, 0.1)',
      border: 'rgba(59, 130, 246, 0.1)',
      borderHover: 'rgba(59, 130, 246, 0.18)',
      borderActive: 'rgba(59, 130, 246, 0.25)',
      text: '#e0f2fe',
      textMuted: 'rgba(224, 242, 254, 0.65)',
      textSubtle: 'rgba(224, 242, 254, 0.4)',
      primary: '#3b82f6',
      primaryHover: '#60a5fa',
      primaryMuted: 'rgba(59, 130, 246, 0.2)',
      secondary: '#06b6d4',
      secondaryHover: '#22d3ee',
      success: '#10b981',
      warning: '#f59e0b',
      error: '#ef4444',
      info: '#0ea5e9',
      gradient: 'linear-gradient(135deg, #1e3a8a 0%, #0284c7 100%)',
      glow: 'rgba(59, 130, 246, 0.4)',
      overlay: 'rgba(3, 7, 18, 0.85)'
    },
    shadows: {
      sm: '0 1px 2px rgba(0, 0, 0, 0.5)',
      md: '0 4px 12px rgba(0, 0, 0, 0.5)',
      lg: '0 8px 32px rgba(0, 0, 0, 0.6)',
      glow: '0 0 20px rgba(59, 130, 246, 0.3)'
    },
    blur: {
      sm: '8px',
      md: '16px',
      lg: '32px'
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // HYPERSEXUAL GOON THEMES
  // ═══════════════════════════════════════════════════════════════════════════

  // AFTERGLOW - Post-orgasm bliss
  'afterglow': {
    id: 'afterglow' as ThemeId,
    name: 'Afterglow',
    description: 'Warm, satisfied, basking in pleasure',
    isDark: true,
    colors: {
      background: '#1A0A14',
      backgroundAlt: '#2D1420',
      surface: 'rgba(255, 107, 157, 0.06)',
      surfaceHover: 'rgba(255, 107, 157, 0.1)',
      surfaceActive: 'rgba(255, 107, 157, 0.14)',
      border: 'rgba(255, 107, 157, 0.12)',
      borderHover: 'rgba(255, 107, 157, 0.2)',
      borderActive: 'rgba(255, 107, 157, 0.28)',
      text: '#FFE4EC',
      textMuted: 'rgba(255, 228, 236, 0.7)',
      textSubtle: 'rgba(255, 228, 236, 0.5)',
      primary: '#FF6B9D',
      primaryHover: '#FF8FB4',
      primaryMuted: 'rgba(255, 107, 157, 0.25)',
      secondary: '#FFB4D1',
      secondaryHover: '#FFC9DE',
      success: '#4ade80',
      warning: '#fbbf24',
      error: '#f87171',
      info: '#FF6B9D',
      gradient: 'linear-gradient(135deg, #FF6B9D 0%, #FFB4D1 100%)',
      glow: 'rgba(255, 107, 157, 0.4)',
      overlay: 'rgba(26, 10, 20, 0.9)'
    },
    shadows: {
      sm: '0 1px 2px rgba(0, 0, 0, 0.5)',
      md: '0 4px 12px rgba(0, 0, 0, 0.5)',
      lg: '0 8px 32px rgba(0, 0, 0, 0.6)',
      glow: '0 0 30px rgba(255, 107, 157, 0.4)'
    },
    blur: {
      sm: '8px',
      md: '16px',
      lg: '32px'
    }
  },

  // EDGELANDS - Perpetual almost-there
  'edgelands': {
    id: 'edgelands' as ThemeId,
    name: 'Edgelands',
    description: 'Throbbing, desperate, on the edge',
    isDark: true,
    colors: {
      background: '#0D0511',
      backgroundAlt: '#1A0B22',
      surface: 'rgba(157, 78, 221, 0.06)',
      surfaceHover: 'rgba(157, 78, 221, 0.1)',
      surfaceActive: 'rgba(157, 78, 221, 0.14)',
      border: 'rgba(224, 64, 251, 0.12)',
      borderHover: 'rgba(224, 64, 251, 0.2)',
      borderActive: 'rgba(224, 64, 251, 0.28)',
      text: '#F3E5F5',
      textMuted: 'rgba(243, 229, 245, 0.7)',
      textSubtle: 'rgba(243, 229, 245, 0.5)',
      primary: '#9D4EDD',
      primaryHover: '#B36AE8',
      primaryMuted: 'rgba(157, 78, 221, 0.25)',
      secondary: '#E040FB',
      secondaryHover: '#EA6CFC',
      success: '#4ade80',
      warning: '#fbbf24',
      error: '#f87171',
      info: '#B388FF',
      gradient: 'linear-gradient(135deg, #9D4EDD 0%, #E040FB 100%)',
      glow: 'rgba(224, 64, 251, 0.5)',
      overlay: 'rgba(13, 5, 17, 0.9)'
    },
    shadows: {
      sm: '0 1px 2px rgba(0, 0, 0, 0.5)',
      md: '0 4px 12px rgba(0, 0, 0, 0.5)',
      lg: '0 8px 32px rgba(0, 0, 0, 0.6)',
      glow: '0 0 30px rgba(224, 64, 251, 0.5)'
    },
    blur: {
      sm: '8px',
      md: '16px',
      lg: '32px'
    }
  },

  // RED ROOM - Dominant, intense
  'red-room': {
    id: 'red-room' as ThemeId,
    name: 'Red Room',
    description: 'Powerful, commanding, intense',
    isDark: true,
    colors: {
      background: '#0A0000',
      backgroundAlt: '#1A0505',
      surface: 'rgba(220, 20, 60, 0.06)',
      surfaceHover: 'rgba(220, 20, 60, 0.1)',
      surfaceActive: 'rgba(220, 20, 60, 0.14)',
      border: 'rgba(220, 20, 60, 0.15)',
      borderHover: 'rgba(220, 20, 60, 0.25)',
      borderActive: 'rgba(220, 20, 60, 0.35)',
      text: '#FFEBEE',
      textMuted: 'rgba(255, 235, 238, 0.7)',
      textSubtle: 'rgba(255, 235, 238, 0.5)',
      primary: '#DC143C',
      primaryHover: '#E53555',
      primaryMuted: 'rgba(220, 20, 60, 0.25)',
      secondary: '#FF2D2D',
      secondaryHover: '#FF5757',
      success: '#4ade80',
      warning: '#fbbf24',
      error: '#FF2D2D',
      info: '#EF9A9A',
      gradient: 'linear-gradient(135deg, #8B0000 0%, #DC143C 100%)',
      glow: 'rgba(220, 20, 60, 0.6)',
      overlay: 'rgba(10, 0, 0, 0.9)'
    },
    shadows: {
      sm: '0 1px 2px rgba(0, 0, 0, 0.6)',
      md: '0 4px 12px rgba(0, 0, 0, 0.6)',
      lg: '0 8px 32px rgba(0, 0, 0, 0.7)',
      glow: '0 0 30px rgba(220, 20, 60, 0.5)'
    },
    blur: {
      sm: '8px',
      md: '16px',
      lg: '32px'
    }
  },

  // MIDNIGHT VELVET - Luxurious darkness
  'midnight-velvet': {
    id: 'midnight-velvet' as ThemeId,
    name: 'Midnight Velvet',
    description: 'Rich, indulgent, sinfully soft',
    isDark: true,
    colors: {
      background: '#0A0510',
      backgroundAlt: '#150A1A',
      surface: 'rgba(142, 69, 133, 0.06)',
      surfaceHover: 'rgba(142, 69, 133, 0.1)',
      surfaceActive: 'rgba(142, 69, 133, 0.14)',
      border: 'rgba(218, 112, 214, 0.12)',
      borderHover: 'rgba(218, 112, 214, 0.2)',
      borderActive: 'rgba(218, 112, 214, 0.28)',
      text: '#F8E8F8',
      textMuted: 'rgba(248, 232, 248, 0.7)',
      textSubtle: 'rgba(248, 232, 248, 0.5)',
      primary: '#8E4585',
      primaryHover: '#A55A9C',
      primaryMuted: 'rgba(142, 69, 133, 0.25)',
      secondary: '#DA70D6',
      secondaryHover: '#E38FDF',
      success: '#4ade80',
      warning: '#fbbf24',
      error: '#f87171',
      info: '#C9A0C9',
      gradient: 'linear-gradient(135deg, #4A0028 0%, #8E4585 100%)',
      glow: 'rgba(142, 69, 133, 0.4)',
      overlay: 'rgba(10, 5, 16, 0.9)'
    },
    shadows: {
      sm: '0 1px 2px rgba(0, 0, 0, 0.5)',
      md: '0 4px 12px rgba(0, 0, 0, 0.5)',
      lg: '0 8px 32px rgba(0, 0, 0, 0.6)',
      glow: '0 0 30px rgba(142, 69, 133, 0.4)'
    },
    blur: {
      sm: '8px',
      md: '16px',
      lg: '32px'
    }
  },

  // NEON LUST - Cyberpunk brothel
  'neon-lust': {
    id: 'neon-lust' as ThemeId,
    name: 'Neon Lust',
    description: 'Electric, dirty, cyberpunk desire',
    isDark: true,
    colors: {
      background: '#0A0A0F',
      backgroundAlt: '#12121A',
      surface: 'rgba(255, 0, 255, 0.05)',
      surfaceHover: 'rgba(255, 0, 255, 0.08)',
      surfaceActive: 'rgba(255, 0, 255, 0.12)',
      border: 'rgba(255, 0, 255, 0.15)',
      borderHover: 'rgba(255, 0, 255, 0.25)',
      borderActive: 'rgba(255, 0, 255, 0.35)',
      text: '#FFFFFF',
      textMuted: 'rgba(255, 255, 255, 0.7)',
      textSubtle: 'rgba(255, 255, 255, 0.5)',
      primary: '#FF00FF',
      primaryHover: '#FF33FF',
      primaryMuted: 'rgba(255, 0, 255, 0.25)',
      secondary: '#00FFFF',
      secondaryHover: '#33FFFF',
      success: '#00FF88',
      warning: '#FFFF00',
      error: '#FF1493',
      info: '#00FFFF',
      gradient: 'linear-gradient(135deg, #FF00FF 0%, #00FFFF 100%)',
      glow: 'rgba(255, 0, 255, 0.6)',
      overlay: 'rgba(10, 10, 15, 0.9)'
    },
    shadows: {
      sm: '0 1px 2px rgba(0, 0, 0, 0.5)',
      md: '0 4px 12px rgba(0, 0, 0, 0.5)',
      lg: '0 8px 32px rgba(0, 0, 0, 0.6)',
      glow: '0 0 40px rgba(255, 0, 255, 0.5), 0 0 60px rgba(0, 255, 255, 0.3)'
    },
    blur: {
      sm: '8px',
      md: '16px',
      lg: '32px'
    }
  },

  // HONEYPOT - Sweet, sticky, addictive
  'honeypot': {
    id: 'honeypot' as ThemeId,
    name: 'Honeypot',
    description: 'Sweet, golden, irresistibly sticky',
    isDark: true,
    colors: {
      background: '#0F0A05',
      backgroundAlt: '#1A1408',
      surface: 'rgba(255, 179, 0, 0.06)',
      surfaceHover: 'rgba(255, 179, 0, 0.1)',
      surfaceActive: 'rgba(255, 179, 0, 0.14)',
      border: 'rgba(255, 179, 0, 0.12)',
      borderHover: 'rgba(255, 179, 0, 0.2)',
      borderActive: 'rgba(255, 179, 0, 0.28)',
      text: '#FFF8E1',
      textMuted: 'rgba(255, 248, 225, 0.7)',
      textSubtle: 'rgba(255, 248, 225, 0.5)',
      primary: '#FFB300',
      primaryHover: '#FFC233',
      primaryMuted: 'rgba(255, 179, 0, 0.25)',
      secondary: '#FFD54F',
      secondaryHover: '#FFDD72',
      success: '#4ade80',
      warning: '#FFB300',
      error: '#f87171',
      info: '#FFCC80',
      gradient: 'linear-gradient(135deg, #FF8C00 0%, #FFD54F 100%)',
      glow: 'rgba(255, 179, 0, 0.5)',
      overlay: 'rgba(15, 10, 5, 0.9)'
    },
    shadows: {
      sm: '0 1px 2px rgba(0, 0, 0, 0.5)',
      md: '0 4px 12px rgba(0, 0, 0, 0.5)',
      lg: '0 8px 32px rgba(0, 0, 0, 0.6)',
      glow: '0 0 30px rgba(255, 179, 0, 0.4)'
    },
    blur: {
      sm: '8px',
      md: '16px',
      lg: '32px'
    }
  },

  // SINNERS PARADISE - Hellfire and pleasure
  'sinners-paradise': {
    id: 'sinners-paradise' as ThemeId,
    name: "Sinner's Paradise",
    description: 'Hellfire and heavenly pleasure',
    isDark: true,
    colors: {
      background: '#0D0000',
      backgroundAlt: '#1A0808',
      surface: 'rgba(255, 69, 0, 0.06)',
      surfaceHover: 'rgba(255, 69, 0, 0.1)',
      surfaceActive: 'rgba(255, 69, 0, 0.14)',
      border: 'rgba(255, 69, 0, 0.12)',
      borderHover: 'rgba(255, 69, 0, 0.2)',
      borderActive: 'rgba(255, 69, 0, 0.28)',
      text: '#FFF5EE',
      textMuted: 'rgba(255, 245, 238, 0.7)',
      textSubtle: 'rgba(255, 245, 238, 0.5)',
      primary: '#FF4500',
      primaryHover: '#FF6A33',
      primaryMuted: 'rgba(255, 69, 0, 0.25)',
      secondary: '#FF8C00',
      secondaryHover: '#FFA333',
      success: '#4ade80',
      warning: '#FF8C00',
      error: '#FF4500',
      info: '#FFAB91',
      gradient: 'linear-gradient(135deg, #8B0000 0%, #FF4500 50%, #FF8C00 100%)',
      glow: 'rgba(255, 69, 0, 0.5)',
      overlay: 'rgba(13, 0, 0, 0.9)'
    },
    shadows: {
      sm: '0 1px 2px rgba(0, 0, 0, 0.6)',
      md: '0 4px 12px rgba(0, 0, 0, 0.6)',
      lg: '0 8px 32px rgba(0, 0, 0, 0.7)',
      glow: '0 0 30px rgba(255, 69, 0, 0.5)'
    },
    blur: {
      sm: '8px',
      md: '16px',
      lg: '32px'
    }
  },

  // WET DREAMS - Dreamy, fluid, surreal
  'wet-dreams': {
    id: 'wet-dreams' as ThemeId,
    name: 'Wet Dreams',
    description: 'Fluid, dreamy, surreal pleasure',
    isDark: true,
    colors: {
      background: '#050510',
      backgroundAlt: '#0A0A1A',
      surface: 'rgba(92, 107, 192, 0.06)',
      surfaceHover: 'rgba(92, 107, 192, 0.1)',
      surfaceActive: 'rgba(92, 107, 192, 0.14)',
      border: 'rgba(121, 134, 203, 0.12)',
      borderHover: 'rgba(121, 134, 203, 0.2)',
      borderActive: 'rgba(121, 134, 203, 0.28)',
      text: '#E8EAF6',
      textMuted: 'rgba(232, 234, 246, 0.7)',
      textSubtle: 'rgba(232, 234, 246, 0.5)',
      primary: '#5C6BC0',
      primaryHover: '#7986CB',
      primaryMuted: 'rgba(92, 107, 192, 0.25)',
      secondary: '#7986CB',
      secondaryHover: '#9499D1',
      success: '#4ade80',
      warning: '#fbbf24',
      error: '#f87171',
      info: '#9FA8DA',
      gradient: 'linear-gradient(135deg, #3F51B5 0%, #7986CB 100%)',
      glow: 'rgba(92, 107, 192, 0.4)',
      overlay: 'rgba(5, 5, 16, 0.9)'
    },
    shadows: {
      sm: '0 1px 2px rgba(0, 0, 0, 0.5)',
      md: '0 4px 12px rgba(0, 0, 0, 0.5)',
      lg: '0 8px 32px rgba(0, 0, 0, 0.6)',
      glow: '0 0 30px rgba(92, 107, 192, 0.4)'
    },
    blur: {
      sm: '8px',
      md: '16px',
      lg: '32px'
    }
  },

  // FLESH - Raw, primal, carnal
  'flesh': {
    id: 'flesh' as ThemeId,
    name: 'Flesh',
    description: 'Raw, primal, nothing but skin',
    isDark: true,
    colors: {
      background: '#0F0808',
      backgroundAlt: '#1A1010',
      surface: 'rgba(232, 165, 152, 0.06)',
      surfaceHover: 'rgba(232, 165, 152, 0.1)',
      surfaceActive: 'rgba(232, 165, 152, 0.14)',
      border: 'rgba(255, 171, 145, 0.12)',
      borderHover: 'rgba(255, 171, 145, 0.2)',
      borderActive: 'rgba(255, 171, 145, 0.28)',
      text: '#FFF5F0',
      textMuted: 'rgba(255, 245, 240, 0.7)',
      textSubtle: 'rgba(255, 245, 240, 0.5)',
      primary: '#E8A598',
      primaryHover: '#EDB9AF',
      primaryMuted: 'rgba(232, 165, 152, 0.25)',
      secondary: '#FFAB91',
      secondaryHover: '#FFBDA7',
      success: '#4ade80',
      warning: '#fbbf24',
      error: '#f87171',
      info: '#FFCCBC',
      gradient: 'linear-gradient(135deg, #D7A09E 0%, #FFAB91 100%)',
      glow: 'rgba(232, 165, 152, 0.4)',
      overlay: 'rgba(15, 8, 8, 0.9)'
    },
    shadows: {
      sm: '0 1px 2px rgba(0, 0, 0, 0.5)',
      md: '0 4px 12px rgba(0, 0, 0, 0.5)',
      lg: '0 8px 32px rgba(0, 0, 0, 0.6)',
      glow: '0 0 30px rgba(232, 165, 152, 0.4)'
    },
    blur: {
      sm: '8px',
      md: '16px',
      lg: '32px'
    }
  },

  // VOID - Total sensory deprivation focus
  'void': {
    id: 'void' as ThemeId,
    name: 'Void',
    description: 'Nothing but you and the content',
    isDark: true,
    colors: {
      background: '#000000',
      backgroundAlt: '#0A0A0A',
      surface: 'rgba(255, 255, 255, 0.03)',
      surfaceHover: 'rgba(255, 255, 255, 0.05)',
      surfaceActive: 'rgba(255, 255, 255, 0.08)',
      border: 'rgba(255, 255, 255, 0.08)',
      borderHover: 'rgba(255, 255, 255, 0.12)',
      borderActive: 'rgba(255, 255, 255, 0.16)',
      text: '#FFFFFF',
      textMuted: 'rgba(255, 255, 255, 0.6)',
      textSubtle: 'rgba(255, 255, 255, 0.4)',
      primary: '#FFFFFF',
      primaryHover: '#E0E0E0',
      primaryMuted: 'rgba(255, 255, 255, 0.15)',
      secondary: '#888888',
      secondaryHover: '#AAAAAA',
      success: '#4ade80',
      warning: '#fbbf24',
      error: '#f87171',
      info: '#888888',
      gradient: 'linear-gradient(135deg, #333333 0%, #666666 100%)',
      glow: 'rgba(255, 255, 255, 0.1)',
      overlay: 'rgba(0, 0, 0, 0.95)'
    },
    shadows: {
      sm: '0 1px 2px rgba(0, 0, 0, 0.8)',
      md: '0 4px 12px rgba(0, 0, 0, 0.8)',
      lg: '0 8px 32px rgba(0, 0, 0, 0.9)',
      glow: '0 0 20px rgba(255, 255, 255, 0.1)'
    },
    blur: {
      sm: '8px',
      md: '16px',
      lg: '32px'
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// THEME UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

export const THEME_LIST = Object.values(themes)

export function getTheme(id: ThemeId): Theme {
  return themes[id] || themes.obsidian
}

export function getThemeCSS(theme: Theme): string {
  const c = theme.colors
  return `
    --background: ${c.background};
    --background-alt: ${c.backgroundAlt};
    --surface: ${c.surface};
    --surface-hover: ${c.surfaceHover};
    --surface-active: ${c.surfaceActive};
    --border: ${c.border};
    --border-hover: ${c.borderHover};
    --border-active: ${c.borderActive};
    --text: ${c.text};
    --text-muted: ${c.textMuted};
    --text-subtle: ${c.textSubtle};
    --primary: ${c.primary};
    --primary-hover: ${c.primaryHover};
    --primary-muted: ${c.primaryMuted};
    --secondary: ${c.secondary};
    --secondary-hover: ${c.secondaryHover};
    --success: ${c.success};
    --warning: ${c.warning};
    --error: ${c.error};
    --info: ${c.info};
    --gradient: ${c.gradient};
    --glow: ${c.glow};
    --overlay: ${c.overlay};
    --shadow-sm: ${theme.shadows.sm};
    --shadow-md: ${theme.shadows.md};
    --shadow-lg: ${theme.shadows.lg};
    --shadow-glow: ${theme.shadows.glow};
    --blur-sm: ${theme.blur.sm};
    --blur-md: ${theme.blur.md};
    --blur-lg: ${theme.blur.lg};
    color-scheme: ${theme.isDark ? 'dark' : 'light'};
  `.trim()
}

export function applyTheme(themeId: ThemeId): void {
  const theme = getTheme(themeId)
  document.documentElement.setAttribute('data-theme', themeId)
  document.documentElement.style.cssText = getThemeCSS(theme)
}

export function getSystemPrefersDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true
}

export function watchSystemTheme(callback: (isDark: boolean) => void): () => void {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  const handler = (e: MediaQueryListEvent) => callback(e.matches)
  mediaQuery.addEventListener('change', handler)
  return () => mediaQuery.removeEventListener('change', handler)
}

// ─────────────────────────────────────────────────────────────────────────────
// EROTIC ANIMATIONS CSS
// ─────────────────────────────────────────────────────────────────────────────

export const EROTIC_ANIMATIONS_CSS = `
  /* Gentle breathing - like a chest rising and falling */
  @keyframes breathe {
    0%, 100% { transform: scale(1); opacity: 0.8; }
    50% { transform: scale(1.02); opacity: 1; }
  }

  /* Throbbing pulse - like arousal */
  @keyframes throb {
    0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 var(--glow); }
    50% { transform: scale(1.01); box-shadow: 0 0 20px 5px var(--glow); }
  }

  /* Subtle pulse for buttons */
  @keyframes pulse-subtle {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.85; }
  }

  /* Heat shimmer */
  @keyframes shimmer {
    0% { background-position: -200% center; }
    100% { background-position: 200% center; }
  }

  /* Slow reveal - like undressing */
  @keyframes reveal {
    0% { clip-path: inset(0 100% 0 0); }
    100% { clip-path: inset(0 0 0 0); }
  }

  /* Orgasmic burst */
  @keyframes burst {
    0% { transform: scale(1); filter: brightness(1); }
    50% { transform: scale(1.1); filter: brightness(1.5); }
    100% { transform: scale(1); filter: brightness(1); }
  }

  /* Edge building */
  @keyframes edge-build {
    0% { transform: scale(1); }
    70% { transform: scale(1.05); }
    85% { transform: scale(1.08); }
    95% { transform: scale(1.1); }
    100% { transform: scale(1); }
  }

  /* Wet glisten */
  @keyframes glisten {
    0%, 100% { opacity: 0.3; }
    50% { opacity: 0.8; }
  }

  /* Floating */
  @keyframes float {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-5px); }
  }

  /* Gentle glow pulse */
  @keyframes glow-pulse {
    0%, 100% { box-shadow: 0 0 10px var(--glow); }
    50% { box-shadow: 0 0 25px var(--glow), 0 0 40px var(--glow); }
  }

  /* Subliminal flash */
  @keyframes subliminal {
    0%, 95%, 100% { opacity: 0; }
    96%, 99% { opacity: 0.8; }
  }

  /* Drip effect */
  @keyframes drip {
    0% { transform: translateY(-10px); opacity: 0; }
    50% { opacity: 1; }
    100% { transform: translateY(100px); opacity: 0; }
  }

  /* Heat intensity */
  @keyframes heat-intensity {
    0%, 100% { opacity: 0.1; }
    50% { opacity: 0.3; }
  }

  /* Animation utility classes */
  .animate-breathe { animation: breathe 4s ease-in-out infinite; }
  .animate-throb { animation: throb 2s ease-in-out infinite; }
  .animate-pulse-subtle { animation: pulse-subtle 3s ease-in-out infinite; }
  .animate-shimmer { animation: shimmer 2s infinite; }
  .animate-float { animation: float 3s ease-in-out infinite; }
  .animate-glow-pulse { animation: glow-pulse 2s ease-in-out infinite; }
  .animate-burst { animation: burst 0.5s ease-out; }
  .animate-edge { animation: edge-build 10s ease-in-out infinite; }

  /* Sensual hover effects */
  .sensual-hover {
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .sensual-hover:hover {
    transform: scale(1.02);
    box-shadow: 0 0 30px var(--glow);
  }
  .sensual-hover:active {
    transform: scale(0.98);
    filter: brightness(1.2);
  }

  /* Wet sheen overlay */
  .wet-sheen::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(
      135deg,
      transparent 40%,
      rgba(255,255,255,0.1) 50%,
      transparent 60%
    );
    pointer-events: none;
    animation: shimmer 2s infinite;
    background-size: 200% 100%;
  }

  /* Heat overlay */
  .heat-overlay::before {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: radial-gradient(
      circle at center,
      transparent 30%,
      rgba(255, 0, 50, var(--heat-intensity, 0.1)) 100%
    );
    transition: all 1s ease;
    animation: heat-intensity 4s ease-in-out infinite;
  }

  /* Vignette effect */
  .vignette::after {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: radial-gradient(
      ellipse at center,
      transparent 0%,
      transparent 50%,
      rgba(0,0,0,0.4) 100%
    );
  }

  /* Pulsing border */
  .pulse-border {
    position: relative;
  }
  .pulse-border::before {
    content: '';
    position: absolute;
    inset: -2px;
    border-radius: inherit;
    background: linear-gradient(45deg, var(--primary), var(--secondary));
    opacity: 0.5;
    filter: blur(10px);
    animation: throb 2s ease-in-out infinite;
    z-index: -1;
  }
`

// Inject animations CSS into document
export function injectEroticAnimations(): void {
  if (typeof document === 'undefined') return
  if (document.getElementById('erotic-animations')) return

  const style = document.createElement('style')
  style.id = 'erotic-animations'
  style.textContent = EROTIC_ANIMATIONS_CSS
  document.head.appendChild(style)
}

// Check if theme is a goon theme
export function isGoonTheme(themeId: ThemeId): boolean {
  const goonThemes: GoonThemeId[] = [
    'afterglow', 'edgelands', 'red-room', 'midnight-velvet',
    'neon-lust', 'honeypot', 'sinners-paradise', 'wet-dreams', 'flesh', 'void'
  ]
  return goonThemes.includes(themeId as GoonThemeId)
}

// Get theme category
export function getThemeCategory(themeId: ThemeId): 'classic' | 'goon' {
  return isGoonTheme(themeId) ? 'goon' : 'classic'
}

// Goon theme list for UI
export const GOON_THEME_LIST = [
  { id: 'afterglow', name: 'Afterglow', vibe: 'satisfied' },
  { id: 'edgelands', name: 'Edgelands', vibe: 'desperate' },
  { id: 'red-room', name: 'Red Room', vibe: 'dominant' },
  { id: 'midnight-velvet', name: 'Midnight Velvet', vibe: 'luxurious' },
  { id: 'neon-lust', name: 'Neon Lust', vibe: 'electric' },
  { id: 'honeypot', name: 'Honeypot', vibe: 'addictive' },
  { id: 'sinners-paradise', name: "Sinner's Paradise", vibe: 'sinful' },
  { id: 'wet-dreams', name: 'Wet Dreams', vibe: 'dreamy' },
  { id: 'flesh', name: 'Flesh', vibe: 'primal' },
  { id: 'void', name: 'Void', vibe: 'focused' },
] as const
