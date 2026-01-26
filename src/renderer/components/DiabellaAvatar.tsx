// File: src/renderer/components/DiabellaAvatar.tsx
// Diabella AI avatar - Full body display with style selection

import React, { useState, useEffect, useCallback } from 'react'

interface DiabellaAvatarProps {
  speaking?: boolean
  className?: string
  onExpressionChange?: (expression: string) => void
}

// Available customization options
const AVATAR_STYLES = {
  anime: 'Anime',
  realistic: 'Realistic',
  fantasy: 'Fantasy',
  cyberpunk: 'Cyberpunk',
  gothic: 'Gothic'
} as const

const AVATAR_OUTFITS = {
  'elegant-dress': 'Elegant Dress',
  'red-dress': 'Red Dress',
  'white-dress': 'White Dress',
  'cocktail-dress': 'Cocktail Dress',
  'casual': 'Casual',
  'swimwear': 'Swimwear',
  'formal': 'Formal',
  'fantasy-gown': 'Fantasy Gown',
  'cyber-suit': 'Cyber Suit',
  'gothic-dress': 'Gothic Dress',
} as const

const AVATAR_EXPRESSIONS = {
  neutral: 'Neutral',
  flirty: 'Flirty',
  happy: 'Happy',
  seductive: 'Seductive',
  mysterious: 'Mysterious',
  confident: 'Confident',
  playful: 'Playful',
  dreamy: 'Dreamy',
} as const

type AvatarStyle = keyof typeof AVATAR_STYLES
type AvatarOutfit = keyof typeof AVATAR_OUTFITS
type AvatarExpression = keyof typeof AVATAR_EXPRESSIONS

export const DiabellaAvatar: React.FC<DiabellaAvatarProps> = ({
  speaking = false,
  className = '',
  onExpressionChange,
}) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Customization state
  const [currentStyle, setCurrentStyle] = useState<AvatarStyle>('anime')
  const [currentOutfit, setCurrentOutfit] = useState<AvatarOutfit>('elegant-dress')
  const [currentExpression, setCurrentExpression] = useState<AvatarExpression>('flirty')

  // UI state
  const [showStyleMenu, setShowStyleMenu] = useState(false)
  const [showOutfitMenu, setShowOutfitMenu] = useState(false)
  const [showExpressionMenu, setShowExpressionMenu] = useState(false)

  // Load saved preferences
  useEffect(() => {
    const savedStyle = localStorage.getItem('diabella-style') as AvatarStyle | null
    const savedOutfit = localStorage.getItem('diabella-outfit') as AvatarOutfit | null
    const savedExpression = localStorage.getItem('diabella-expression') as AvatarExpression | null

    if (savedStyle && AVATAR_STYLES[savedStyle]) setCurrentStyle(savedStyle)
    if (savedOutfit && AVATAR_OUTFITS[savedOutfit]) setCurrentOutfit(savedOutfit)
    if (savedExpression && AVATAR_EXPRESSIONS[savedExpression]) setCurrentExpression(savedExpression)

    // Generate initial avatar
    generateAvatar(
      savedStyle || 'anime',
      savedOutfit || 'elegant-dress',
      savedExpression || 'flirty',
      false
    )
  }, [])

  const generateAvatar = useCallback(async (
    style: AvatarStyle,
    outfit: AvatarOutfit,
    expression: AvatarExpression,
    regenerate: boolean
  ) => {
    setLoading(true)
    setError(null)

    try {
      console.log('[DiabellaAvatar] Requesting generation:', { style, outfit, expression, regenerate })

      const result = await window.api.ai.generateAvatar({
        style,
        outfit,
        expression,
        regenerate
      })

      console.log('[DiabellaAvatar] Result:', result)

      if (result.success && result.path) {
        // Use vault:// protocol to serve the image
        const vaultUrl = `vault://media?path=${encodeURIComponent(result.path)}`
        // Add cache buster to force reload when regenerating
        setImageUrl(regenerate ? `${vaultUrl}&t=${Date.now()}` : vaultUrl)

        // Save preferences
        localStorage.setItem('diabella-style', style)
        localStorage.setItem('diabella-outfit', outfit)
        localStorage.setItem('diabella-expression', expression)

        setCurrentStyle(style)
        setCurrentOutfit(outfit)
        setCurrentExpression(expression)

        onExpressionChange?.(expression)
      } else {
        setError(result.error || 'Failed to generate avatar')
      }
    } catch (e: any) {
      console.error('[DiabellaAvatar] Error:', e)
      setError(e.message || 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [onExpressionChange])

  const changeStyle = (style: AvatarStyle) => {
    setShowStyleMenu(false)
    generateAvatar(style, currentOutfit, currentExpression, true)
  }

  const changeOutfit = (outfit: AvatarOutfit) => {
    setShowOutfitMenu(false)
    generateAvatar(currentStyle, outfit, currentExpression, true)
  }

  const changeExpression = (expression: AvatarExpression) => {
    setShowExpressionMenu(false)
    generateAvatar(currentStyle, currentOutfit, expression, true)
  }

  const regenerate = () => {
    generateAvatar(currentStyle, currentOutfit, currentExpression, true)
  }

  // Close menus when clicking outside
  useEffect(() => {
    const handleClick = () => {
      setShowStyleMenu(false)
      setShowOutfitMenu(false)
      setShowExpressionMenu(false)
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])

  if (loading) {
    return (
      <div className={`diabella-avatar w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-pink-900/30 to-black ${className}`}>
        <div className="animate-spin text-5xl mb-4">✨</div>
        <div className="text-lg text-pink-300">Generating Diabella...</div>
        <div className="text-sm text-white/50 mt-2">{AVATAR_STYLES[currentStyle]} style</div>
      </div>
    )
  }

  if (error || !imageUrl) {
    return (
      <div className={`diabella-avatar w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-pink-900/30 to-black ${className}`}>
        <div className="text-6xl mb-4">💋</div>
        <div className="text-white/70 mb-2">Failed to generate avatar</div>
        <div className="text-sm text-red-400 mb-4 max-w-[300px] text-center">{error}</div>
        <button
          onClick={regenerate}
          className="px-6 py-3 bg-pink-600 hover:bg-pink-500 rounded-xl text-white font-medium transition"
        >
          Try Again
        </button>
      </div>
    )
  }

  return (
    <div className={`diabella-avatar relative w-full h-full ${className}`}>
      {/* Main image container - NO blur/filters */}
      <div className="absolute inset-0 overflow-hidden">
        <img
          src={imageUrl}
          alt="Diabella"
          className="w-full h-full object-cover object-top"
          style={{
            filter: 'none',
            WebkitFilter: 'none',
            imageRendering: 'auto',
          }}
          onError={() => {
            console.error('[DiabellaAvatar] Image failed to load')
            setError('Image failed to load')
          }}
        />
      </div>

      {/* Top controls bar */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-20">
        {/* Style selector */}
        <div className="relative" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => setShowStyleMenu(!showStyleMenu)}
            className="px-3 py-2 bg-black/70 hover:bg-black/90 rounded-lg text-white text-sm font-medium flex items-center gap-2 border border-white/20 transition"
          >
            🎨 {AVATAR_STYLES[currentStyle]}
          </button>

          {showStyleMenu && (
            <div className="absolute top-12 left-0 bg-black/95 rounded-xl border border-white/20 overflow-hidden min-w-[150px] shadow-xl">
              {(Object.keys(AVATAR_STYLES) as AvatarStyle[]).map((key) => (
                <button
                  key={key}
                  onClick={() => changeStyle(key)}
                  className={`w-full px-4 py-3 text-left text-sm hover:bg-pink-600/50 transition ${
                    key === currentStyle ? 'bg-pink-600/30 text-pink-300' : 'text-white'
                  }`}
                >
                  {AVATAR_STYLES[key]}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Regenerate button */}
        <button
          onClick={regenerate}
          className="px-3 py-2 bg-pink-600/80 hover:bg-pink-500 rounded-lg text-white text-sm font-medium transition"
        >
          🔄 New Look
        </button>
      </div>

      {/* Bottom controls bar */}
      <div className="absolute bottom-4 left-4 right-4 flex items-center gap-3 z-20">
        {/* Outfit selector */}
        <div className="relative flex-1" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => setShowOutfitMenu(!showOutfitMenu)}
            className="w-full px-3 py-2 bg-black/70 hover:bg-black/90 rounded-lg text-white text-sm font-medium flex items-center justify-center gap-2 border border-white/20 transition"
          >
            👗 {AVATAR_OUTFITS[currentOutfit]}
          </button>

          {showOutfitMenu && (
            <div className="absolute bottom-12 left-0 right-0 bg-black/95 rounded-xl border border-white/20 overflow-hidden max-h-[300px] overflow-y-auto shadow-xl">
              {(Object.keys(AVATAR_OUTFITS) as AvatarOutfit[]).map((key) => (
                <button
                  key={key}
                  onClick={() => changeOutfit(key)}
                  className={`w-full px-4 py-3 text-left text-sm hover:bg-pink-600/50 transition ${
                    key === currentOutfit ? 'bg-pink-600/30 text-pink-300' : 'text-white'
                  }`}
                >
                  {AVATAR_OUTFITS[key]}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Expression selector */}
        <div className="relative flex-1" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => setShowExpressionMenu(!showExpressionMenu)}
            className="w-full px-3 py-2 bg-black/70 hover:bg-black/90 rounded-lg text-white text-sm font-medium flex items-center justify-center gap-2 border border-white/20 transition"
          >
            😊 {AVATAR_EXPRESSIONS[currentExpression]}
          </button>

          {showExpressionMenu && (
            <div className="absolute bottom-12 left-0 right-0 bg-black/95 rounded-xl border border-white/20 overflow-hidden shadow-xl">
              {(Object.keys(AVATAR_EXPRESSIONS) as AvatarExpression[]).map((key) => (
                <button
                  key={key}
                  onClick={() => changeExpression(key)}
                  className={`w-full px-4 py-3 text-left text-sm hover:bg-pink-600/50 transition ${
                    key === currentExpression ? 'bg-pink-600/30 text-pink-300' : 'text-white'
                  }`}
                >
                  {AVATAR_EXPRESSIONS[key]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Speaking indicator */}
      {speaking && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 px-4 py-2 bg-green-600/90 rounded-full text-white text-sm flex items-center gap-2 z-20">
          <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
          Speaking
        </div>
      )}
    </div>
  )
}

export default DiabellaAvatar
