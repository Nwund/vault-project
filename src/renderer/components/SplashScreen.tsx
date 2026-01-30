// File: src/renderer/components/SplashScreen.tsx
// Splash screen for app startup with glowing vault logo
import React, { useEffect, useState } from 'react'

// Static Vault Logo SVG with glow animation
const VaultLogo: React.FC = () => {
  return (
    <svg
      viewBox="0 0 120 120"
      className="w-32 h-32 vault-glow"
    >
      {/* Outer vault door ring */}
      <circle
        cx="60"
        cy="60"
        r="55"
        fill="none"
        stroke="url(#vaultGradient)"
        strokeWidth="4"
      />

      {/* Inner ring */}
      <circle
        cx="60"
        cy="60"
        r="45"
        fill="none"
        stroke="url(#vaultGradient)"
        strokeWidth="2"
        opacity="0.6"
      />

      {/* Vault handle - horizontal bar */}
      <rect
        x="35"
        y="57"
        width="50"
        height="6"
        rx="3"
        fill="url(#vaultGradient)"
      />

      {/* Vault handle - knob */}
      <circle
        cx="60"
        cy="60"
        r="12"
        fill="none"
        stroke="url(#vaultGradient)"
        strokeWidth="3"
      />

      {/* Center dot */}
      <circle
        cx="60"
        cy="60"
        r="4"
        fill="url(#vaultGradient)"
      />

      {/* Locking pins */}
      {[0, 60, 120, 180, 240, 300].map((angle) => {
        const rad = (angle * Math.PI) / 180
        const x1 = 60 + Math.cos(rad) * 35
        const y1 = 60 + Math.sin(rad) * 35
        const x2 = 60 + Math.cos(rad) * 42
        const y2 = 60 + Math.sin(rad) * 42
        return (
          <line
            key={angle}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="url(#vaultGradient)"
            strokeWidth="3"
            strokeLinecap="round"
          />
        )
      })}

      <defs>
        <linearGradient id="vaultGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--accent, #ff6b9d)" />
          <stop offset="50%" stopColor="var(--text, #ffffff)" />
          <stop offset="100%" stopColor="var(--accent, #ff6b9d)" />
        </linearGradient>
      </defs>
    </svg>
  )
}

interface SplashScreenProps {
  onComplete: () => void
  minDuration?: number
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
  onComplete,
  minDuration = 1500
}) => {
  const [fadeOut, setFadeOut] = useState(false)
  const [canSkip, setCanSkip] = useState(false)

  // Skip handler
  const handleSkip = () => {
    if (!canSkip) return
    setFadeOut(true)
    setTimeout(onComplete, 300)
  }

  useEffect(() => {
    const timers: NodeJS.Timeout[] = []

    // Allow skipping after a short delay
    timers.push(setTimeout(() => setCanSkip(true), 500))

    // Start fade out
    timers.push(setTimeout(() => {
      setFadeOut(true)
    }, minDuration - 300))

    // Complete
    timers.push(setTimeout(() => {
      onComplete()
    }, minDuration))

    return () => {
      timers.forEach(t => clearTimeout(t))
    }
  }, [minDuration, onComplete])

  return (
    <div
      onClick={handleSkip}
      className={`
        fixed inset-0 z-[9999] flex flex-col items-center justify-center
        transition-opacity duration-500
        ${fadeOut ? 'opacity-0' : 'opacity-100'}
        ${canSkip ? 'cursor-pointer' : ''}
      `}
      style={{
        background: 'linear-gradient(135deg, var(--bg, #0a0a0f) 0%, var(--panel, #12121a) 50%, var(--bg, #0a0a0f) 100%)'
      }}
    >
      {/* Ambient glow effect */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          background: 'radial-gradient(circle at 50% 50%, var(--glow, rgba(255,100,150,0.3)) 0%, transparent 60%)'
        }}
      />

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center gap-8">
        {/* Logo with glow animation */}
        <VaultLogo />

        {/* App name */}
        <div
          className="text-4xl font-bold tracking-wider"
          style={{
            background: 'linear-gradient(135deg, var(--text, #fff), var(--accent, #ff6b9d))',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            textShadow: '0 0 40px var(--glow, rgba(255,100,150,0.5))'
          }}
        >
          VAULT
        </div>

        {/* Skip hint */}
        <div
          className={`
            text-xs text-[var(--muted)] mt-8
            transition-all duration-500
            ${canSkip ? 'opacity-50' : 'opacity-0'}
          `}
        >
          Click anywhere to skip
        </div>
      </div>

      {/* Glow animation */}
      <style>{`
        @keyframes glow {
          0%, 100% {
            filter: drop-shadow(0 0 20px var(--glow, rgba(255,100,150,0.4)));
          }
          50% {
            filter: drop-shadow(0 0 40px var(--glow, rgba(255,100,150,0.8)));
          }
        }
        .vault-glow {
          animation: glow 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  )
}

export default SplashScreen
