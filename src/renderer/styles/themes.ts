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
  | 'aurora'
  | 'copper'
  | 'lavender-haze'
  | 'deep-ocean'
  | 'bloodmoon'
  | 'mint'
  | 'sunset-strip'
  | 'slate'
  | 'cherry-blossom'
  | 'electric-lime'
  // New light themes
  | 'arctic'
  | 'linen'
  | 'mint-cream'
  | 'peach-blossom'
  | 'sky-blue'
  | 'lavender-mist'
  | 'sage'
  | 'coral-reef'

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
  // New goon themes
  | 'submissive'     // Soft, yielding, devotion - pastel pink
  | 'dominant'       // Power, control, authority - deep red/black
  | 'latex'          // Shiny, sleek, fetish - glossy black
  | 'bimbo'          // Bubbly, pink, playful - hot pink
  | 'hypno'          // Trance, spiral, mindless - swirling purple

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
  // 1. OBSIDIAN - Default Dark (Purple accent) - Enhanced
  obsidian: {
    id: 'obsidian',
    name: 'Obsidian',
    description: 'Deep blacks with vivid purple accents. Elegant and powerful.',
    isDark: true,
    colors: {
      background: '#030508',
      backgroundAlt: '#0a0f1e',
      surface: 'rgba(139, 92, 246, 0.04)',
      surfaceHover: 'rgba(139, 92, 246, 0.08)',
      surfaceActive: 'rgba(139, 92, 246, 0.12)',
      border: 'rgba(139, 92, 246, 0.12)',
      borderHover: 'rgba(139, 92, 246, 0.2)',
      borderActive: 'rgba(139, 92, 246, 0.28)',
      text: '#f8fafc',
      textMuted: 'rgba(255, 255, 255, 0.65)',
      textSubtle: 'rgba(255, 255, 255, 0.45)',
      primary: '#a855f7',
      primaryHover: '#c084fc',
      primaryMuted: 'rgba(168, 85, 247, 0.25)',
      secondary: '#f472b6',
      secondaryHover: '#f9a8d4',
      success: '#22c55e',
      warning: '#f59e0b',
      error: '#ef4444',
      info: '#60a5fa',
      gradient: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 50%, #ec4899 100%)',
      glow: 'rgba(168, 85, 247, 0.5)',
      overlay: 'rgba(0, 0, 0, 0.75)'
    },
    shadows: {
      sm: '0 1px 2px rgba(0, 0, 0, 0.6)',
      md: '0 4px 12px rgba(0, 0, 0, 0.6)',
      lg: '0 8px 32px rgba(0, 0, 0, 0.7)',
      glow: '0 0 25px rgba(168, 85, 247, 0.4)'
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
      backgroundAlt: '#1a2130',
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

  // 3. EMBER - Dark with warm orange/red accents - Enhanced
  ember: {
    id: 'ember',
    name: 'Ember',
    description: 'Smoldering dark with fiery orange accents. Passionate heat.',
    isDark: true,
    colors: {
      background: '#080402',
      backgroundAlt: '#181008',
      surface: 'rgba(255, 120, 50, 0.05)',
      surfaceHover: 'rgba(255, 120, 50, 0.09)',
      surfaceActive: 'rgba(255, 120, 50, 0.13)',
      border: 'rgba(255, 120, 50, 0.12)',
      borderHover: 'rgba(255, 120, 50, 0.2)',
      borderActive: 'rgba(255, 120, 50, 0.28)',
      text: '#fff5e6',
      textMuted: 'rgba(255, 245, 230, 0.7)',
      textSubtle: 'rgba(255, 245, 230, 0.45)',
      primary: '#ff6a00',
      primaryHover: '#ff8c33',
      primaryMuted: 'rgba(255, 106, 0, 0.25)',
      secondary: '#ff3333',
      secondaryHover: '#ff6666',
      success: '#9acd32',
      warning: '#ffd700',
      error: '#ff2020',
      info: '#ff9500',
      gradient: 'linear-gradient(135deg, #ff2020 0%, #ff6a00 40%, #ffd700 100%)',
      glow: 'rgba(255, 106, 0, 0.5)',
      overlay: 'rgba(8, 4, 2, 0.85)'
    },
    shadows: {
      sm: '0 1px 2px rgba(0, 0, 0, 0.6)',
      md: '0 4px 12px rgba(0, 0, 0, 0.6), 0 0 15px rgba(255, 106, 0, 0.1)',
      lg: '0 8px 32px rgba(0, 0, 0, 0.7), 0 0 30px rgba(255, 106, 0, 0.15)',
      glow: '0 0 25px rgba(255, 106, 0, 0.4), 0 0 50px rgba(255, 50, 0, 0.2)'
    },
    blur: {
      sm: '8px',
      md: '16px',
      lg: '32px'
    }
  },

  // 4. VELVET - Deep purple/burgundy tones - Enhanced
  velvet: {
    id: 'velvet',
    name: 'Velvet',
    description: 'Rich purple and deep burgundy. Opulent and seductive.',
    isDark: true,
    colors: {
      background: '#0a0414',
      backgroundAlt: '#150a28',
      surface: 'rgba(200, 100, 255, 0.05)',
      surfaceHover: 'rgba(200, 100, 255, 0.09)',
      surfaceActive: 'rgba(200, 100, 255, 0.13)',
      border: 'rgba(200, 100, 255, 0.12)',
      borderHover: 'rgba(200, 100, 255, 0.2)',
      borderActive: 'rgba(200, 100, 255, 0.28)',
      text: '#fce8ff',
      textMuted: 'rgba(252, 232, 255, 0.7)',
      textSubtle: 'rgba(252, 232, 255, 0.45)',
      primary: '#c850ff',
      primaryHover: '#d980ff',
      primaryMuted: 'rgba(200, 80, 255, 0.25)',
      secondary: '#e6197a',
      secondaryHover: '#ff4090',
      success: '#20d997',
      warning: '#e6a000',
      error: '#e6194b',
      info: '#a855f7',
      gradient: 'linear-gradient(135deg, #6b21a8 0%, #c850ff 50%, #e6197a 100%)',
      glow: 'rgba(200, 80, 255, 0.5)',
      overlay: 'rgba(10, 4, 20, 0.85)'
    },
    shadows: {
      sm: '0 1px 2px rgba(0, 0, 0, 0.6)',
      md: '0 4px 12px rgba(0, 0, 0, 0.6), 0 0 15px rgba(200, 80, 255, 0.1)',
      lg: '0 8px 32px rgba(0, 0, 0, 0.7), 0 0 30px rgba(200, 80, 255, 0.15)',
      glow: '0 0 25px rgba(200, 80, 255, 0.4), 0 0 50px rgba(230, 25, 122, 0.2)'
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
      backgroundAlt: '#0d0d12',
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

  // 6. NEON DREAMS - Dark with cyan/pink neon accents - Enhanced
  'neon-dreams': {
    id: 'neon-dreams',
    name: 'Neon Dreams',
    description: 'Electric cyberpunk with intense neon glows. Futuristic and vivid.',
    isDark: true,
    colors: {
      background: '#050510',
      backgroundAlt: '#0a1220',
      surface: 'rgba(0, 255, 255, 0.05)',
      surfaceHover: 'rgba(0, 255, 255, 0.08)',
      surfaceActive: 'rgba(0, 255, 255, 0.12)',
      border: 'rgba(0, 255, 255, 0.15)',
      borderHover: 'rgba(0, 255, 255, 0.25)',
      borderActive: 'rgba(0, 255, 255, 0.35)',
      text: '#f0ffff',
      textMuted: 'rgba(240, 255, 255, 0.75)',
      textSubtle: 'rgba(240, 255, 255, 0.5)',
      primary: '#00ffff',
      primaryHover: '#7fffff',
      primaryMuted: 'rgba(0, 255, 255, 0.25)',
      secondary: '#ff00ff',
      secondaryHover: '#ff77ff',
      success: '#00ff88',
      warning: '#ffff00',
      error: '#ff3366',
      info: '#00ccff',
      gradient: 'linear-gradient(135deg, #00ffff 0%, #ff00ff 100%)',
      glow: 'rgba(0, 255, 255, 0.6)',
      overlay: 'rgba(5, 5, 16, 0.88)'
    },
    shadows: {
      sm: '0 1px 2px rgba(0, 0, 0, 0.6)',
      md: '0 4px 12px rgba(0, 0, 0, 0.6), 0 0 20px rgba(0, 255, 255, 0.15)',
      lg: '0 8px 32px rgba(0, 0, 0, 0.7), 0 0 40px rgba(0, 255, 255, 0.2)',
      glow: '0 0 35px rgba(0, 255, 255, 0.5), 0 0 60px rgba(255, 0, 255, 0.3)'
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
      backgroundAlt: '#eee5d4',
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
      backgroundAlt: '#f8dae0',
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

  // ═══════════════════════════════════════════════════════════════════════════
  // NEW LIGHT THEMES
  // ═══════════════════════════════════════════════════════════════════════════

  // ARCTIC - Cool white and ice blue (LIGHT)
  arctic: {
    id: 'arctic',
    name: 'Arctic',
    description: 'Crisp white with ice blue accents. Clean and refreshing.',
    isDark: false,
    colors: {
      background: '#f8fbff',
      backgroundAlt: '#e8f4fc',
      surface: 'rgba(100, 180, 230, 0.06)',
      surfaceHover: 'rgba(100, 180, 230, 0.1)',
      surfaceActive: 'rgba(100, 180, 230, 0.14)',
      border: 'rgba(100, 180, 230, 0.15)',
      borderHover: 'rgba(100, 180, 230, 0.25)',
      borderActive: 'rgba(100, 180, 230, 0.35)',
      text: '#1e3a5f',
      textMuted: 'rgba(30, 58, 95, 0.65)',
      textSubtle: 'rgba(30, 58, 95, 0.45)',
      primary: '#0ea5e9',
      primaryHover: '#38bdf8',
      primaryMuted: 'rgba(14, 165, 233, 0.15)',
      secondary: '#64748b',
      secondaryHover: '#94a3b8',
      success: '#10b981',
      warning: '#f59e0b',
      error: '#ef4444',
      info: '#0ea5e9',
      gradient: 'linear-gradient(135deg, #0ea5e9 0%, #38bdf8 100%)',
      glow: 'rgba(14, 165, 233, 0.3)',
      overlay: 'rgba(248, 251, 255, 0.9)'
    },
    shadows: {
      sm: '0 1px 2px rgba(100, 180, 230, 0.1)',
      md: '0 4px 12px rgba(100, 180, 230, 0.12)',
      lg: '0 8px 32px rgba(100, 180, 230, 0.15)',
      glow: '0 0 20px rgba(14, 165, 233, 0.2)'
    },
    blur: { sm: '8px', md: '16px', lg: '32px' }
  },

  // LINEN - Warm cream and natural beige (LIGHT)
  linen: {
    id: 'linen',
    name: 'Linen',
    description: 'Warm natural tones. Cozy and organic.',
    isDark: false,
    colors: {
      background: '#faf6f1',
      backgroundAlt: '#f0e8dd',
      surface: 'rgba(160, 130, 100, 0.06)',
      surfaceHover: 'rgba(160, 130, 100, 0.1)',
      surfaceActive: 'rgba(160, 130, 100, 0.14)',
      border: 'rgba(160, 130, 100, 0.15)',
      borderHover: 'rgba(160, 130, 100, 0.25)',
      borderActive: 'rgba(160, 130, 100, 0.35)',
      text: '#3d3229',
      textMuted: 'rgba(61, 50, 41, 0.65)',
      textSubtle: 'rgba(61, 50, 41, 0.45)',
      primary: '#8b7355',
      primaryHover: '#a08970',
      primaryMuted: 'rgba(139, 115, 85, 0.15)',
      secondary: '#6b5c4c',
      secondaryHover: '#8b7a68',
      success: '#6b8e23',
      warning: '#d4a017',
      error: '#c75050',
      info: '#5c8a8a',
      gradient: 'linear-gradient(135deg, #8b7355 0%, #c4a77d 100%)',
      glow: 'rgba(139, 115, 85, 0.3)',
      overlay: 'rgba(250, 246, 241, 0.9)'
    },
    shadows: {
      sm: '0 1px 2px rgba(160, 130, 100, 0.1)',
      md: '0 4px 12px rgba(160, 130, 100, 0.12)',
      lg: '0 8px 32px rgba(160, 130, 100, 0.15)',
      glow: '0 0 20px rgba(139, 115, 85, 0.2)'
    },
    blur: { sm: '8px', md: '16px', lg: '32px' }
  },

  // MINT CREAM - Fresh mint green (LIGHT)
  'mint-cream': {
    id: 'mint-cream',
    name: 'Mint Cream',
    description: 'Fresh mint green. Light and refreshing.',
    isDark: false,
    colors: {
      background: '#f5fdf8',
      backgroundAlt: '#e0f5e9',
      surface: 'rgba(80, 200, 140, 0.06)',
      surfaceHover: 'rgba(80, 200, 140, 0.1)',
      surfaceActive: 'rgba(80, 200, 140, 0.14)',
      border: 'rgba(80, 200, 140, 0.15)',
      borderHover: 'rgba(80, 200, 140, 0.25)',
      borderActive: 'rgba(80, 200, 140, 0.35)',
      text: '#1e4d3a',
      textMuted: 'rgba(30, 77, 58, 0.65)',
      textSubtle: 'rgba(30, 77, 58, 0.45)',
      primary: '#10b981',
      primaryHover: '#34d399',
      primaryMuted: 'rgba(16, 185, 129, 0.15)',
      secondary: '#64748b',
      secondaryHover: '#94a3b8',
      success: '#10b981',
      warning: '#f59e0b',
      error: '#ef4444',
      info: '#06b6d4',
      gradient: 'linear-gradient(135deg, #10b981 0%, #6ee7b7 100%)',
      glow: 'rgba(16, 185, 129, 0.3)',
      overlay: 'rgba(245, 253, 248, 0.9)'
    },
    shadows: {
      sm: '0 1px 2px rgba(80, 200, 140, 0.1)',
      md: '0 4px 12px rgba(80, 200, 140, 0.12)',
      lg: '0 8px 32px rgba(80, 200, 140, 0.15)',
      glow: '0 0 20px rgba(16, 185, 129, 0.2)'
    },
    blur: { sm: '8px', md: '16px', lg: '32px' }
  },

  // PEACH BLOSSOM - Soft peachy pink (LIGHT)
  'peach-blossom': {
    id: 'peach-blossom',
    name: 'Peach Blossom',
    description: 'Soft peachy pink. Warm and gentle.',
    isDark: false,
    colors: {
      background: '#fff8f5',
      backgroundAlt: '#ffe8df',
      surface: 'rgba(255, 160, 130, 0.06)',
      surfaceHover: 'rgba(255, 160, 130, 0.1)',
      surfaceActive: 'rgba(255, 160, 130, 0.14)',
      border: 'rgba(255, 160, 130, 0.18)',
      borderHover: 'rgba(255, 160, 130, 0.28)',
      borderActive: 'rgba(255, 160, 130, 0.38)',
      text: '#5c3d36',
      textMuted: 'rgba(92, 61, 54, 0.65)',
      textSubtle: 'rgba(92, 61, 54, 0.45)',
      primary: '#f97316',
      primaryHover: '#fb923c',
      primaryMuted: 'rgba(249, 115, 22, 0.15)',
      secondary: '#ec4899',
      secondaryHover: '#f472b6',
      success: '#22c55e',
      warning: '#f59e0b',
      error: '#ef4444',
      info: '#f97316',
      gradient: 'linear-gradient(135deg, #f97316 0%, #fbbf24 100%)',
      glow: 'rgba(249, 115, 22, 0.3)',
      overlay: 'rgba(255, 248, 245, 0.9)'
    },
    shadows: {
      sm: '0 1px 2px rgba(255, 160, 130, 0.15)',
      md: '0 4px 12px rgba(255, 160, 130, 0.18)',
      lg: '0 8px 32px rgba(255, 160, 130, 0.22)',
      glow: '0 0 20px rgba(249, 115, 22, 0.2)'
    },
    blur: { sm: '8px', md: '16px', lg: '32px' }
  },

  // SKY BLUE - Light airy blue (LIGHT)
  'sky-blue': {
    id: 'sky-blue',
    name: 'Sky Blue',
    description: 'Light airy blue. Open and expansive.',
    isDark: false,
    colors: {
      background: '#f0f9ff',
      backgroundAlt: '#dbeafe',
      surface: 'rgba(59, 130, 246, 0.06)',
      surfaceHover: 'rgba(59, 130, 246, 0.1)',
      surfaceActive: 'rgba(59, 130, 246, 0.14)',
      border: 'rgba(59, 130, 246, 0.15)',
      borderHover: 'rgba(59, 130, 246, 0.25)',
      borderActive: 'rgba(59, 130, 246, 0.35)',
      text: '#1e3a5f',
      textMuted: 'rgba(30, 58, 95, 0.65)',
      textSubtle: 'rgba(30, 58, 95, 0.45)',
      primary: '#3b82f6',
      primaryHover: '#60a5fa',
      primaryMuted: 'rgba(59, 130, 246, 0.15)',
      secondary: '#8b5cf6',
      secondaryHover: '#a78bfa',
      success: '#22c55e',
      warning: '#f59e0b',
      error: '#ef4444',
      info: '#3b82f6',
      gradient: 'linear-gradient(135deg, #3b82f6 0%, #93c5fd 100%)',
      glow: 'rgba(59, 130, 246, 0.3)',
      overlay: 'rgba(240, 249, 255, 0.9)'
    },
    shadows: {
      sm: '0 1px 2px rgba(59, 130, 246, 0.1)',
      md: '0 4px 12px rgba(59, 130, 246, 0.12)',
      lg: '0 8px 32px rgba(59, 130, 246, 0.15)',
      glow: '0 0 20px rgba(59, 130, 246, 0.2)'
    },
    blur: { sm: '8px', md: '16px', lg: '32px' }
  },

  // LAVENDER MIST - Soft purple haze (LIGHT)
  'lavender-mist': {
    id: 'lavender-mist',
    name: 'Lavender Mist',
    description: 'Soft purple haze. Calming and dreamy.',
    isDark: false,
    colors: {
      background: '#faf5ff',
      backgroundAlt: '#ede9fe',
      surface: 'rgba(139, 92, 246, 0.06)',
      surfaceHover: 'rgba(139, 92, 246, 0.1)',
      surfaceActive: 'rgba(139, 92, 246, 0.14)',
      border: 'rgba(139, 92, 246, 0.15)',
      borderHover: 'rgba(139, 92, 246, 0.25)',
      borderActive: 'rgba(139, 92, 246, 0.35)',
      text: '#3b2d5c',
      textMuted: 'rgba(59, 45, 92, 0.65)',
      textSubtle: 'rgba(59, 45, 92, 0.45)',
      primary: '#8b5cf6',
      primaryHover: '#a78bfa',
      primaryMuted: 'rgba(139, 92, 246, 0.15)',
      secondary: '#ec4899',
      secondaryHover: '#f472b6',
      success: '#22c55e',
      warning: '#f59e0b',
      error: '#ef4444',
      info: '#8b5cf6',
      gradient: 'linear-gradient(135deg, #8b5cf6 0%, #c4b5fd 100%)',
      glow: 'rgba(139, 92, 246, 0.3)',
      overlay: 'rgba(250, 245, 255, 0.9)'
    },
    shadows: {
      sm: '0 1px 2px rgba(139, 92, 246, 0.1)',
      md: '0 4px 12px rgba(139, 92, 246, 0.12)',
      lg: '0 8px 32px rgba(139, 92, 246, 0.15)',
      glow: '0 0 20px rgba(139, 92, 246, 0.2)'
    },
    blur: { sm: '8px', md: '16px', lg: '32px' }
  },

  // SAGE - Soft muted green (LIGHT)
  sage: {
    id: 'sage',
    name: 'Sage',
    description: 'Soft muted sage green. Natural and serene.',
    isDark: false,
    colors: {
      background: '#f6f9f4',
      backgroundAlt: '#e4ece0',
      surface: 'rgba(130, 160, 120, 0.06)',
      surfaceHover: 'rgba(130, 160, 120, 0.1)',
      surfaceActive: 'rgba(130, 160, 120, 0.14)',
      border: 'rgba(130, 160, 120, 0.15)',
      borderHover: 'rgba(130, 160, 120, 0.25)',
      borderActive: 'rgba(130, 160, 120, 0.35)',
      text: '#3d4a35',
      textMuted: 'rgba(61, 74, 53, 0.65)',
      textSubtle: 'rgba(61, 74, 53, 0.45)',
      primary: '#65a30d',
      primaryHover: '#84cc16',
      primaryMuted: 'rgba(101, 163, 13, 0.15)',
      secondary: '#78716c',
      secondaryHover: '#a8a29e',
      success: '#22c55e',
      warning: '#eab308',
      error: '#dc2626',
      info: '#65a30d',
      gradient: 'linear-gradient(135deg, #65a30d 0%, #a3e635 100%)',
      glow: 'rgba(101, 163, 13, 0.3)',
      overlay: 'rgba(246, 249, 244, 0.9)'
    },
    shadows: {
      sm: '0 1px 2px rgba(130, 160, 120, 0.1)',
      md: '0 4px 12px rgba(130, 160, 120, 0.12)',
      lg: '0 8px 32px rgba(130, 160, 120, 0.15)',
      glow: '0 0 20px rgba(101, 163, 13, 0.2)'
    },
    blur: { sm: '8px', md: '16px', lg: '32px' }
  },

  // CORAL REEF - Warm coral and turquoise (LIGHT)
  'coral-reef': {
    id: 'coral-reef',
    name: 'Coral Reef',
    description: 'Warm coral tones. Tropical and vibrant.',
    isDark: false,
    colors: {
      background: '#fff5f5',
      backgroundAlt: '#ffe4e6',
      surface: 'rgba(251, 113, 133, 0.06)',
      surfaceHover: 'rgba(251, 113, 133, 0.1)',
      surfaceActive: 'rgba(251, 113, 133, 0.14)',
      border: 'rgba(251, 113, 133, 0.18)',
      borderHover: 'rgba(251, 113, 133, 0.28)',
      borderActive: 'rgba(251, 113, 133, 0.38)',
      text: '#5c2d3a',
      textMuted: 'rgba(92, 45, 58, 0.65)',
      textSubtle: 'rgba(92, 45, 58, 0.45)',
      primary: '#f43f5e',
      primaryHover: '#fb7185',
      primaryMuted: 'rgba(244, 63, 94, 0.15)',
      secondary: '#14b8a6',
      secondaryHover: '#2dd4bf',
      success: '#10b981',
      warning: '#f59e0b',
      error: '#ef4444',
      info: '#14b8a6',
      gradient: 'linear-gradient(135deg, #f43f5e 0%, #fb7185 100%)',
      glow: 'rgba(244, 63, 94, 0.3)',
      overlay: 'rgba(255, 245, 245, 0.9)'
    },
    shadows: {
      sm: '0 1px 2px rgba(251, 113, 133, 0.15)',
      md: '0 4px 12px rgba(251, 113, 133, 0.18)',
      lg: '0 8px 32px rgba(251, 113, 133, 0.22)',
      glow: '0 0 20px rgba(244, 63, 94, 0.2)'
    },
    blur: { sm: '8px', md: '16px', lg: '32px' }
  },

  // 9. MIDNIGHT GARDEN - Dark green and gold
  'midnight-garden': {
    id: 'midnight-garden',
    name: 'Midnight Garden',
    description: 'Dark green and gold. Natural and mysterious.',
    isDark: true,
    colors: {
      background: '#05090a',
      backgroundAlt: '#0a1e16',
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

  // 10. SAPPHIRE - Deep blue with ice blue accents - Enhanced
  sapphire: {
    id: 'sapphire',
    name: 'Sapphire',
    description: 'Royal deep blue with brilliant ice accents. Elegant and striking.',
    isDark: true,
    colors: {
      background: '#020410',
      backgroundAlt: '#081430',
      surface: 'rgba(80, 150, 255, 0.05)',
      surfaceHover: 'rgba(80, 150, 255, 0.09)',
      surfaceActive: 'rgba(80, 150, 255, 0.13)',
      border: 'rgba(80, 150, 255, 0.12)',
      borderHover: 'rgba(80, 150, 255, 0.22)',
      borderActive: 'rgba(80, 150, 255, 0.3)',
      text: '#e8f4ff',
      textMuted: 'rgba(232, 244, 255, 0.7)',
      textSubtle: 'rgba(232, 244, 255, 0.45)',
      primary: '#4d9fff',
      primaryHover: '#80b8ff',
      primaryMuted: 'rgba(77, 159, 255, 0.25)',
      secondary: '#00d4ff',
      secondaryHover: '#66e5ff',
      success: '#20d997',
      warning: '#ffc000',
      error: '#ff5050',
      info: '#00aaff',
      gradient: 'linear-gradient(135deg, #1e3a8a 0%, #4d9fff 50%, #00d4ff 100%)',
      glow: 'rgba(77, 159, 255, 0.5)',
      overlay: 'rgba(2, 4, 16, 0.88)'
    },
    shadows: {
      sm: '0 1px 2px rgba(0, 0, 0, 0.6)',
      md: '0 4px 12px rgba(0, 0, 0, 0.6), 0 0 15px rgba(77, 159, 255, 0.1)',
      lg: '0 8px 32px rgba(0, 0, 0, 0.7), 0 0 30px rgba(77, 159, 255, 0.15)',
      glow: '0 0 25px rgba(77, 159, 255, 0.4), 0 0 50px rgba(0, 212, 255, 0.2)'
    },
    blur: {
      sm: '8px',
      md: '16px',
      lg: '32px'
    }
  },

  // 11. AURORA - Northern lights, teal and green
  aurora: {
    id: 'aurora',
    name: 'Aurora',
    description: 'Northern lights with teal and green shifts.',
    isDark: true,
    colors: {
      background: '#040d0f',
      backgroundAlt: '#082220',
      surface: 'rgba(45, 212, 191, 0.05)',
      surfaceHover: 'rgba(45, 212, 191, 0.08)',
      surfaceActive: 'rgba(45, 212, 191, 0.12)',
      border: 'rgba(45, 212, 191, 0.1)',
      borderHover: 'rgba(45, 212, 191, 0.18)',
      borderActive: 'rgba(45, 212, 191, 0.25)',
      text: '#e0fef6',
      textMuted: 'rgba(224, 254, 246, 0.65)',
      textSubtle: 'rgba(224, 254, 246, 0.4)',
      primary: '#2dd4bf',
      primaryHover: '#5eead4',
      primaryMuted: 'rgba(45, 212, 191, 0.2)',
      secondary: '#34d399',
      secondaryHover: '#6ee7b7',
      success: '#4ade80',
      warning: '#fbbf24',
      error: '#f87171',
      info: '#22d3ee',
      gradient: 'linear-gradient(135deg, #0d9488 0%, #34d399 50%, #2dd4bf 100%)',
      glow: 'rgba(45, 212, 191, 0.4)',
      overlay: 'rgba(4, 13, 15, 0.85)'
    },
    shadows: { sm: '0 1px 2px rgba(0,0,0,0.5)', md: '0 4px 12px rgba(0,0,0,0.5)', lg: '0 8px 32px rgba(0,0,0,0.6)', glow: '0 0 24px rgba(45,212,191,0.3)' },
    blur: { sm: '8px', md: '16px', lg: '32px' }
  },

  // 12. COPPER - Warm bronze and copper tones
  copper: {
    id: 'copper',
    name: 'Copper',
    description: 'Warm bronze and copper tones. Industrial elegance.',
    isDark: true,
    colors: {
      background: '#0c0907',
      backgroundAlt: '#1e1610',
      surface: 'rgba(194, 130, 72, 0.05)',
      surfaceHover: 'rgba(194, 130, 72, 0.08)',
      surfaceActive: 'rgba(194, 130, 72, 0.12)',
      border: 'rgba(194, 130, 72, 0.1)',
      borderHover: 'rgba(194, 130, 72, 0.18)',
      borderActive: 'rgba(194, 130, 72, 0.25)',
      text: '#fde8cd',
      textMuted: 'rgba(253, 232, 205, 0.65)',
      textSubtle: 'rgba(253, 232, 205, 0.4)',
      primary: '#c28248',
      primaryHover: '#d4976a',
      primaryMuted: 'rgba(194, 130, 72, 0.2)',
      secondary: '#a0744a',
      secondaryHover: '#c09060',
      success: '#84cc16',
      warning: '#eab308',
      error: '#ef4444',
      info: '#f59e0b',
      gradient: 'linear-gradient(135deg, #92400e 0%, #c28248 50%, #d4976a 100%)',
      glow: 'rgba(194, 130, 72, 0.35)',
      overlay: 'rgba(12, 9, 7, 0.85)'
    },
    shadows: { sm: '0 1px 2px rgba(0,0,0,0.5)', md: '0 4px 12px rgba(0,0,0,0.5)', lg: '0 8px 32px rgba(0,0,0,0.6)', glow: '0 0 20px rgba(194,130,72,0.3)' },
    blur: { sm: '8px', md: '16px', lg: '32px' }
  },

  // 13. LAVENDER HAZE - Soft purple pastels on dark
  'lavender-haze': {
    id: 'lavender-haze',
    name: 'Lavender Haze',
    description: 'Soft lavender pastels on a dark canvas.',
    isDark: true,
    colors: {
      background: '#0c0a14',
      backgroundAlt: '#1a1430',
      surface: 'rgba(196, 181, 253, 0.05)',
      surfaceHover: 'rgba(196, 181, 253, 0.08)',
      surfaceActive: 'rgba(196, 181, 253, 0.12)',
      border: 'rgba(196, 181, 253, 0.1)',
      borderHover: 'rgba(196, 181, 253, 0.18)',
      borderActive: 'rgba(196, 181, 253, 0.25)',
      text: '#ede9fe',
      textMuted: 'rgba(237, 233, 254, 0.65)',
      textSubtle: 'rgba(237, 233, 254, 0.4)',
      primary: '#c4b5fd',
      primaryHover: '#ddd6fe',
      primaryMuted: 'rgba(196, 181, 253, 0.2)',
      secondary: '#a78bfa',
      secondaryHover: '#c4b5fd',
      success: '#4ade80',
      warning: '#fbbf24',
      error: '#fb7185',
      info: '#a78bfa',
      gradient: 'linear-gradient(135deg, #7c3aed 0%, #c4b5fd 50%, #e9d5ff 100%)',
      glow: 'rgba(196, 181, 253, 0.35)',
      overlay: 'rgba(12, 10, 20, 0.85)'
    },
    shadows: { sm: '0 1px 2px rgba(0,0,0,0.5)', md: '0 4px 12px rgba(0,0,0,0.5)', lg: '0 8px 32px rgba(0,0,0,0.6)', glow: '0 0 24px rgba(196,181,253,0.3)' },
    blur: { sm: '8px', md: '16px', lg: '32px' }
  },

  // 14. DEEP OCEAN - Abyssal blues and bioluminescence
  'deep-ocean': {
    id: 'deep-ocean',
    name: 'Deep Ocean',
    description: 'Abyssal blues with bioluminescent accents.',
    isDark: true,
    colors: {
      background: '#020617',
      backgroundAlt: '#081e3a',
      surface: 'rgba(56, 189, 248, 0.04)',
      surfaceHover: 'rgba(56, 189, 248, 0.07)',
      surfaceActive: 'rgba(56, 189, 248, 0.1)',
      border: 'rgba(56, 189, 248, 0.08)',
      borderHover: 'rgba(56, 189, 248, 0.15)',
      borderActive: 'rgba(56, 189, 248, 0.22)',
      text: '#e0f2fe',
      textMuted: 'rgba(224, 242, 254, 0.65)',
      textSubtle: 'rgba(224, 242, 254, 0.4)',
      primary: '#0ea5e9',
      primaryHover: '#38bdf8',
      primaryMuted: 'rgba(14, 165, 233, 0.2)',
      secondary: '#06b6d4',
      secondaryHover: '#22d3ee',
      success: '#34d399',
      warning: '#fbbf24',
      error: '#f87171',
      info: '#38bdf8',
      gradient: 'linear-gradient(135deg, #0c4a6e 0%, #0369a1 50%, #0ea5e9 100%)',
      glow: 'rgba(14, 165, 233, 0.4)',
      overlay: 'rgba(2, 6, 23, 0.88)'
    },
    shadows: { sm: '0 1px 2px rgba(0,0,0,0.6)', md: '0 4px 12px rgba(0,0,0,0.6)', lg: '0 8px 32px rgba(0,0,0,0.7)', glow: '0 0 24px rgba(14,165,233,0.3)' },
    blur: { sm: '8px', md: '16px', lg: '32px' }
  },

  // 15. BLOODMOON - Deep crimson and dark reds
  bloodmoon: {
    id: 'bloodmoon',
    name: 'Blood Moon',
    description: 'Deep crimson under a blood-red moon.',
    isDark: true,
    colors: {
      background: '#0a0304',
      backgroundAlt: '#200810',
      surface: 'rgba(220, 38, 38, 0.05)',
      surfaceHover: 'rgba(220, 38, 38, 0.08)',
      surfaceActive: 'rgba(220, 38, 38, 0.12)',
      border: 'rgba(220, 38, 38, 0.1)',
      borderHover: 'rgba(220, 38, 38, 0.18)',
      borderActive: 'rgba(220, 38, 38, 0.25)',
      text: '#fee2e2',
      textMuted: 'rgba(254, 226, 226, 0.65)',
      textSubtle: 'rgba(254, 226, 226, 0.4)',
      primary: '#dc2626',
      primaryHover: '#ef4444',
      primaryMuted: 'rgba(220, 38, 38, 0.2)',
      secondary: '#991b1b',
      secondaryHover: '#b91c1c',
      success: '#4ade80',
      warning: '#f59e0b',
      error: '#fca5a5',
      info: '#ef4444',
      gradient: 'linear-gradient(135deg, #450a0a 0%, #991b1b 50%, #dc2626 100%)',
      glow: 'rgba(220, 38, 38, 0.4)',
      overlay: 'rgba(10, 3, 4, 0.88)'
    },
    shadows: { sm: '0 1px 2px rgba(0,0,0,0.6)', md: '0 4px 12px rgba(0,0,0,0.6)', lg: '0 8px 32px rgba(0,0,0,0.7)', glow: '0 0 20px rgba(220,38,38,0.35)' },
    blur: { sm: '8px', md: '16px', lg: '32px' }
  },

  // 16. MINT - Fresh cool greens
  mint: {
    id: 'mint',
    name: 'Mint',
    description: 'Fresh mint greens. Cool and clean.',
    isDark: true,
    colors: {
      background: '#04100c',
      backgroundAlt: '#0a2a1e',
      surface: 'rgba(52, 211, 153, 0.05)',
      surfaceHover: 'rgba(52, 211, 153, 0.08)',
      surfaceActive: 'rgba(52, 211, 153, 0.12)',
      border: 'rgba(52, 211, 153, 0.1)',
      borderHover: 'rgba(52, 211, 153, 0.18)',
      borderActive: 'rgba(52, 211, 153, 0.25)',
      text: '#d1fae5',
      textMuted: 'rgba(209, 250, 229, 0.65)',
      textSubtle: 'rgba(209, 250, 229, 0.4)',
      primary: '#34d399',
      primaryHover: '#6ee7b7',
      primaryMuted: 'rgba(52, 211, 153, 0.2)',
      secondary: '#10b981',
      secondaryHover: '#34d399',
      success: '#4ade80',
      warning: '#fbbf24',
      error: '#f87171',
      info: '#2dd4bf',
      gradient: 'linear-gradient(135deg, #065f46 0%, #10b981 50%, #6ee7b7 100%)',
      glow: 'rgba(52, 211, 153, 0.35)',
      overlay: 'rgba(4, 16, 12, 0.85)'
    },
    shadows: { sm: '0 1px 2px rgba(0,0,0,0.5)', md: '0 4px 12px rgba(0,0,0,0.5)', lg: '0 8px 32px rgba(0,0,0,0.6)', glow: '0 0 20px rgba(52,211,153,0.3)' },
    blur: { sm: '8px', md: '16px', lg: '32px' }
  },

  // 17. SUNSET STRIP - Warm orange to pink gradient
  'sunset-strip': {
    id: 'sunset-strip',
    name: 'Sunset Strip',
    description: 'Golden hour warmth fading into pink dusk.',
    isDark: true,
    colors: {
      background: '#0f0806',
      backgroundAlt: '#241410',
      surface: 'rgba(251, 146, 60, 0.05)',
      surfaceHover: 'rgba(251, 146, 60, 0.08)',
      surfaceActive: 'rgba(251, 146, 60, 0.12)',
      border: 'rgba(251, 146, 60, 0.1)',
      borderHover: 'rgba(251, 146, 60, 0.18)',
      borderActive: 'rgba(251, 146, 60, 0.25)',
      text: '#fff1e6',
      textMuted: 'rgba(255, 241, 230, 0.65)',
      textSubtle: 'rgba(255, 241, 230, 0.4)',
      primary: '#fb923c',
      primaryHover: '#fdba74',
      primaryMuted: 'rgba(251, 146, 60, 0.2)',
      secondary: '#f472b6',
      secondaryHover: '#f9a8d4',
      success: '#4ade80',
      warning: '#fbbf24',
      error: '#ef4444',
      info: '#fb923c',
      gradient: 'linear-gradient(135deg, #ea580c 0%, #fb923c 40%, #f472b6 100%)',
      glow: 'rgba(251, 146, 60, 0.4)',
      overlay: 'rgba(15, 8, 6, 0.85)'
    },
    shadows: { sm: '0 1px 2px rgba(0,0,0,0.5)', md: '0 4px 12px rgba(0,0,0,0.5)', lg: '0 8px 32px rgba(0,0,0,0.6)', glow: '0 0 24px rgba(251,146,60,0.3)' },
    blur: { sm: '8px', md: '16px', lg: '32px' }
  },

  // 18. SLATE - Cool neutral grays with blue undertone
  slate: {
    id: 'slate',
    name: 'Slate',
    description: 'Cool neutral grays. Minimal and focused.',
    isDark: true,
    colors: {
      background: '#0f172a',
      backgroundAlt: '#243448',
      surface: 'rgba(148, 163, 184, 0.06)',
      surfaceHover: 'rgba(148, 163, 184, 0.1)',
      surfaceActive: 'rgba(148, 163, 184, 0.14)',
      border: 'rgba(148, 163, 184, 0.12)',
      borderHover: 'rgba(148, 163, 184, 0.2)',
      borderActive: 'rgba(148, 163, 184, 0.28)',
      text: '#f1f5f9',
      textMuted: 'rgba(241, 245, 249, 0.6)',
      textSubtle: 'rgba(241, 245, 249, 0.4)',
      primary: '#64748b',
      primaryHover: '#94a3b8',
      primaryMuted: 'rgba(100, 116, 139, 0.2)',
      secondary: '#475569',
      secondaryHover: '#64748b',
      success: '#22c55e',
      warning: '#f59e0b',
      error: '#ef4444',
      info: '#3b82f6',
      gradient: 'linear-gradient(135deg, #334155 0%, #64748b 50%, #94a3b8 100%)',
      glow: 'rgba(100, 116, 139, 0.3)',
      overlay: 'rgba(15, 23, 42, 0.88)'
    },
    shadows: { sm: '0 1px 2px rgba(0,0,0,0.4)', md: '0 4px 12px rgba(0,0,0,0.4)', lg: '0 8px 32px rgba(0,0,0,0.5)', glow: '0 0 16px rgba(100,116,139,0.2)' },
    blur: { sm: '8px', md: '16px', lg: '32px' }
  },

  // 19. CHERRY BLOSSOM - Soft pinks on dark
  'cherry-blossom': {
    id: 'cherry-blossom',
    name: 'Cherry Blossom',
    description: 'Delicate pink petals on moonlit darkness.',
    isDark: true,
    colors: {
      background: '#0d060a',
      backgroundAlt: '#22101c',
      surface: 'rgba(244, 114, 182, 0.05)',
      surfaceHover: 'rgba(244, 114, 182, 0.08)',
      surfaceActive: 'rgba(244, 114, 182, 0.12)',
      border: 'rgba(244, 114, 182, 0.1)',
      borderHover: 'rgba(244, 114, 182, 0.18)',
      borderActive: 'rgba(244, 114, 182, 0.25)',
      text: '#fce7f3',
      textMuted: 'rgba(252, 231, 243, 0.65)',
      textSubtle: 'rgba(252, 231, 243, 0.4)',
      primary: '#f472b6',
      primaryHover: '#f9a8d4',
      primaryMuted: 'rgba(244, 114, 182, 0.2)',
      secondary: '#ec4899',
      secondaryHover: '#f472b6',
      success: '#4ade80',
      warning: '#fbbf24',
      error: '#fb7185',
      info: '#f472b6',
      gradient: 'linear-gradient(135deg, #be185d 0%, #ec4899 50%, #fbcfe8 100%)',
      glow: 'rgba(244, 114, 182, 0.35)',
      overlay: 'rgba(13, 6, 10, 0.85)'
    },
    shadows: { sm: '0 1px 2px rgba(0,0,0,0.5)', md: '0 4px 12px rgba(0,0,0,0.5)', lg: '0 8px 32px rgba(0,0,0,0.6)', glow: '0 0 24px rgba(244,114,182,0.3)' },
    blur: { sm: '8px', md: '16px', lg: '32px' }
  },

  // 20. ELECTRIC LIME - Vivid green energy
  'electric-lime': {
    id: 'electric-lime',
    name: 'Electric Lime',
    description: 'High-voltage lime green energy.',
    isDark: true,
    colors: {
      background: '#060a04',
      backgroundAlt: '#122008',
      surface: 'rgba(163, 230, 53, 0.04)',
      surfaceHover: 'rgba(163, 230, 53, 0.07)',
      surfaceActive: 'rgba(163, 230, 53, 0.1)',
      border: 'rgba(163, 230, 53, 0.08)',
      borderHover: 'rgba(163, 230, 53, 0.15)',
      borderActive: 'rgba(163, 230, 53, 0.22)',
      text: '#f7fee7',
      textMuted: 'rgba(247, 254, 231, 0.65)',
      textSubtle: 'rgba(247, 254, 231, 0.4)',
      primary: '#a3e635',
      primaryHover: '#bef264',
      primaryMuted: 'rgba(163, 230, 53, 0.2)',
      secondary: '#84cc16',
      secondaryHover: '#a3e635',
      success: '#4ade80',
      warning: '#fbbf24',
      error: '#ef4444',
      info: '#a3e635',
      gradient: 'linear-gradient(135deg, #3f6212 0%, #84cc16 50%, #a3e635 100%)',
      glow: 'rgba(163, 230, 53, 0.4)',
      overlay: 'rgba(6, 10, 4, 0.85)'
    },
    shadows: { sm: '0 1px 2px rgba(0,0,0,0.5)', md: '0 4px 12px rgba(0,0,0,0.5)', lg: '0 8px 32px rgba(0,0,0,0.6)', glow: '0 0 24px rgba(163,230,53,0.3)' },
    blur: { sm: '8px', md: '16px', lg: '32px' }
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
      backgroundAlt: '#3a1830',
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
      backgroundAlt: '#220e38',
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
      backgroundAlt: '#250808',
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
      backgroundAlt: '#1e0c2c',
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
      backgroundAlt: '#18102a',
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
      backgroundAlt: '#261c08',
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
      backgroundAlt: '#240a04',
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
      backgroundAlt: '#0e0e2c',
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
      backgroundAlt: '#241814',
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
      backgroundAlt: '#0c0c10',
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
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // NEW GOON THEMES
  // ═══════════════════════════════════════════════════════════════════════════

  // SUBMISSIVE - Soft, yielding, devotion
  'submissive': {
    id: 'submissive' as ThemeId,
    name: 'Submissive',
    description: 'Soft, yielding, devoted surrender',
    isDark: true,
    colors: {
      background: '#0f0810',
      backgroundAlt: '#1a1020',
      surface: 'rgba(255, 182, 193, 0.05)',
      surfaceHover: 'rgba(255, 182, 193, 0.08)',
      surfaceActive: 'rgba(255, 182, 193, 0.12)',
      border: 'rgba(255, 182, 193, 0.1)',
      borderHover: 'rgba(255, 182, 193, 0.18)',
      borderActive: 'rgba(255, 182, 193, 0.25)',
      text: '#ffe8ec',
      textMuted: 'rgba(255, 232, 236, 0.7)',
      textSubtle: 'rgba(255, 232, 236, 0.5)',
      primary: '#ffb6c1',
      primaryHover: '#ffc8d0',
      primaryMuted: 'rgba(255, 182, 193, 0.2)',
      secondary: '#dda0dd',
      secondaryHover: '#e8b8e8',
      success: '#90ee90',
      warning: '#ffd700',
      error: '#ff6b6b',
      info: '#ffb6c1',
      gradient: 'linear-gradient(135deg, #ffb6c1 0%, #dda0dd 100%)',
      glow: 'rgba(255, 182, 193, 0.4)',
      overlay: 'rgba(15, 8, 16, 0.9)'
    },
    shadows: {
      sm: '0 1px 2px rgba(0, 0, 0, 0.5)',
      md: '0 4px 12px rgba(0, 0, 0, 0.5)',
      lg: '0 8px 32px rgba(0, 0, 0, 0.6)',
      glow: '0 0 25px rgba(255, 182, 193, 0.35)'
    },
    blur: { sm: '8px', md: '16px', lg: '32px' }
  },

  // DOMINANT - Power, control, authority
  'dominant': {
    id: 'dominant' as ThemeId,
    name: 'Dominant',
    description: 'Power, control, absolute authority',
    isDark: true,
    colors: {
      background: '#080204',
      backgroundAlt: '#180608',
      surface: 'rgba(180, 0, 30, 0.06)',
      surfaceHover: 'rgba(180, 0, 30, 0.1)',
      surfaceActive: 'rgba(180, 0, 30, 0.15)',
      border: 'rgba(180, 0, 30, 0.12)',
      borderHover: 'rgba(180, 0, 30, 0.22)',
      borderActive: 'rgba(180, 0, 30, 0.32)',
      text: '#f5e8e8',
      textMuted: 'rgba(245, 232, 232, 0.7)',
      textSubtle: 'rgba(245, 232, 232, 0.5)',
      primary: '#b4001e',
      primaryHover: '#d40025',
      primaryMuted: 'rgba(180, 0, 30, 0.25)',
      secondary: '#8b0000',
      secondaryHover: '#a50000',
      success: '#228b22',
      warning: '#cd853f',
      error: '#dc143c',
      info: '#b4001e',
      gradient: 'linear-gradient(135deg, #4a0010 0%, #8b0000 50%, #b4001e 100%)',
      glow: 'rgba(180, 0, 30, 0.5)',
      overlay: 'rgba(8, 2, 4, 0.92)'
    },
    shadows: {
      sm: '0 1px 2px rgba(0, 0, 0, 0.7)',
      md: '0 4px 12px rgba(0, 0, 0, 0.7)',
      lg: '0 8px 32px rgba(0, 0, 0, 0.8)',
      glow: '0 0 30px rgba(180, 0, 30, 0.4)'
    },
    blur: { sm: '8px', md: '16px', lg: '32px' }
  },

  // LATEX - Shiny, sleek, fetish
  'latex': {
    id: 'latex' as ThemeId,
    name: 'Latex',
    description: 'Shiny, sleek, glossy fetish',
    isDark: true,
    colors: {
      background: '#050505',
      backgroundAlt: '#101012',
      surface: 'rgba(80, 80, 90, 0.08)',
      surfaceHover: 'rgba(80, 80, 90, 0.14)',
      surfaceActive: 'rgba(80, 80, 90, 0.2)',
      border: 'rgba(100, 100, 110, 0.15)',
      borderHover: 'rgba(100, 100, 110, 0.28)',
      borderActive: 'rgba(100, 100, 110, 0.4)',
      text: '#e8e8f0',
      textMuted: 'rgba(232, 232, 240, 0.7)',
      textSubtle: 'rgba(232, 232, 240, 0.5)',
      primary: '#3a3a45',
      primaryHover: '#505060',
      primaryMuted: 'rgba(58, 58, 69, 0.3)',
      secondary: '#ff0066',
      secondaryHover: '#ff3388',
      success: '#00ff88',
      warning: '#ffcc00',
      error: '#ff0044',
      info: '#8888aa',
      gradient: 'linear-gradient(135deg, #1a1a22 0%, #3a3a45 50%, #505060 100%)',
      glow: 'rgba(255, 255, 255, 0.15)',
      overlay: 'rgba(5, 5, 5, 0.95)'
    },
    shadows: {
      sm: '0 1px 3px rgba(255, 255, 255, 0.05), 0 1px 2px rgba(0, 0, 0, 0.8)',
      md: '0 4px 12px rgba(255, 255, 255, 0.05), 0 4px 12px rgba(0, 0, 0, 0.8)',
      lg: '0 8px 32px rgba(255, 255, 255, 0.08), 0 8px 32px rgba(0, 0, 0, 0.9)',
      glow: '0 0 20px rgba(255, 255, 255, 0.1), 0 0 40px rgba(255, 0, 102, 0.15)'
    },
    blur: { sm: '8px', md: '16px', lg: '32px' }
  },

  // BIMBO - Bubbly, pink, playful
  'bimbo': {
    id: 'bimbo' as ThemeId,
    name: 'Bimbo',
    description: 'Bubbly, pink, totally brainless',
    isDark: true,
    colors: {
      background: '#12060c',
      backgroundAlt: '#220a16',
      surface: 'rgba(255, 20, 147, 0.06)',
      surfaceHover: 'rgba(255, 20, 147, 0.1)',
      surfaceActive: 'rgba(255, 20, 147, 0.15)',
      border: 'rgba(255, 20, 147, 0.15)',
      borderHover: 'rgba(255, 20, 147, 0.28)',
      borderActive: 'rgba(255, 20, 147, 0.4)',
      text: '#ffe0f0',
      textMuted: 'rgba(255, 224, 240, 0.75)',
      textSubtle: 'rgba(255, 224, 240, 0.5)',
      primary: '#ff1493',
      primaryHover: '#ff69b4',
      primaryMuted: 'rgba(255, 20, 147, 0.25)',
      secondary: '#ff69b4',
      secondaryHover: '#ff85c2',
      success: '#00ff7f',
      warning: '#ffd700',
      error: '#ff1493',
      info: '#ff69b4',
      gradient: 'linear-gradient(135deg, #ff1493 0%, #ff69b4 50%, #ffb6c1 100%)',
      glow: 'rgba(255, 20, 147, 0.5)',
      overlay: 'rgba(18, 6, 12, 0.9)'
    },
    shadows: {
      sm: '0 1px 2px rgba(0, 0, 0, 0.5)',
      md: '0 4px 12px rgba(0, 0, 0, 0.5), 0 0 15px rgba(255, 20, 147, 0.15)',
      lg: '0 8px 32px rgba(0, 0, 0, 0.6), 0 0 30px rgba(255, 20, 147, 0.2)',
      glow: '0 0 30px rgba(255, 20, 147, 0.5), 0 0 60px rgba(255, 105, 180, 0.3)'
    },
    blur: { sm: '8px', md: '16px', lg: '32px' }
  },

  // HYPNO - Trance, spiral, mindless
  'hypno': {
    id: 'hypno' as ThemeId,
    name: 'Hypno',
    description: 'Trance, spiral, empty mind',
    isDark: true,
    colors: {
      background: '#08040c',
      backgroundAlt: '#12081a',
      surface: 'rgba(148, 0, 211, 0.06)',
      surfaceHover: 'rgba(148, 0, 211, 0.1)',
      surfaceActive: 'rgba(148, 0, 211, 0.15)',
      border: 'rgba(148, 0, 211, 0.12)',
      borderHover: 'rgba(148, 0, 211, 0.22)',
      borderActive: 'rgba(148, 0, 211, 0.32)',
      text: '#e8d8f8',
      textMuted: 'rgba(232, 216, 248, 0.7)',
      textSubtle: 'rgba(232, 216, 248, 0.5)',
      primary: '#9400d3',
      primaryHover: '#a020f0',
      primaryMuted: 'rgba(148, 0, 211, 0.25)',
      secondary: '#8a2be2',
      secondaryHover: '#9932cc',
      success: '#00fa9a',
      warning: '#ffa500',
      error: '#ff00ff',
      info: '#ba55d3',
      gradient: 'linear-gradient(135deg, #4b0082 0%, #9400d3 40%, #ff00ff 100%)',
      glow: 'rgba(148, 0, 211, 0.5)',
      overlay: 'rgba(8, 4, 12, 0.92)'
    },
    shadows: {
      sm: '0 1px 2px rgba(0, 0, 0, 0.6)',
      md: '0 4px 12px rgba(0, 0, 0, 0.6), 0 0 15px rgba(148, 0, 211, 0.15)',
      lg: '0 8px 32px rgba(0, 0, 0, 0.7), 0 0 30px rgba(148, 0, 211, 0.2)',
      glow: '0 0 35px rgba(148, 0, 211, 0.45), 0 0 70px rgba(255, 0, 255, 0.25)'
    },
    blur: { sm: '8px', md: '16px', lg: '32px' }
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
  document.documentElement.setAttribute('data-theme-mode', theme.isDark ? 'dark' : 'light')
  document.documentElement.style.cssText = getThemeCSS(theme)
}

// Helper to check if current theme is light
export function isLightTheme(themeId: ThemeId): boolean {
  return !getTheme(themeId).isDark
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
    'neon-lust', 'honeypot', 'sinners-paradise', 'wet-dreams', 'flesh', 'void',
    'submissive', 'dominant', 'latex', 'bimbo', 'hypno'
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
  // New goon themes
  { id: 'submissive', name: 'Submissive', vibe: 'devoted' },
  { id: 'dominant', name: 'Dominant', vibe: 'powerful' },
  { id: 'latex', name: 'Latex', vibe: 'fetish' },
  { id: 'bimbo', name: 'Bimbo', vibe: 'brainless' },
  { id: 'hypno', name: 'Hypno', vibe: 'trance' },
] as const

// Goon theme IDs set for filtering
const GOON_IDS = new Set<string>(GOON_THEME_LIST.map(g => g.id))

export const DARK_THEME_LIST = THEME_LIST.filter(t => t.isDark && !GOON_IDS.has(t.id))
export const LIGHT_THEME_LIST = THEME_LIST.filter(t => !t.isDark)
