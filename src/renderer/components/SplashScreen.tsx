// File: src/renderer/components/SplashScreen.tsx
// Animated splash screen for app startup
import React, { useEffect, useState } from 'react'

// Time-based greetings from Diabella
const getTimeGreeting = (): string => {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 12) {
    return "Good morning, gorgeous... Ready to start your day right?"
  } else if (hour >= 12 && hour < 17) {
    return "Afternoon delight awaits... Let's get lost together."
  } else if (hour >= 17 && hour < 21) {
    return "Evening, lover... Time to unwind and indulge."
  } else {
    return "Late night cravings? I'm here for you, always..."
  }
}

// Animated Vault Logo SVG
const VaultLogo: React.FC<{ animate: boolean }> = ({ animate }) => {
  return (
    <svg
      viewBox="0 0 120 120"
      className="w-32 h-32"
      style={{
        filter: 'drop-shadow(0 0 30px var(--glow, rgba(255,100,150,0.5)))'
      }}
    >
      {/* Outer vault door ring */}
      <circle
        cx="60"
        cy="60"
        r="55"
        fill="none"
        stroke="url(#vaultGradient)"
        strokeWidth="4"
        className={animate ? 'animate-draw-ring' : ''}
        style={{
          strokeDasharray: animate ? '345' : '0',
          strokeDashoffset: animate ? '345' : '0',
          animation: animate ? 'drawRing 1.5s ease-out forwards' : 'none'
        }}
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
        style={{
          strokeDasharray: animate ? '283' : '0',
          strokeDashoffset: animate ? '283' : '0',
          animation: animate ? 'drawRing 1.2s ease-out 0.3s forwards' : 'none'
        }}
      />

      {/* Vault handle - horizontal bar */}
      <rect
        x="35"
        y="57"
        width="50"
        height="6"
        rx="3"
        fill="url(#vaultGradient)"
        style={{
          opacity: animate ? 0 : 1,
          animation: animate ? 'fadeIn 0.5s ease-out 0.8s forwards' : 'none'
        }}
      />

      {/* Vault handle - knob */}
      <circle
        cx="60"
        cy="60"
        r="12"
        fill="none"
        stroke="url(#vaultGradient)"
        strokeWidth="3"
        style={{
          opacity: animate ? 0 : 1,
          animation: animate ? 'fadeIn 0.5s ease-out 1s forwards, spinKnob 2s ease-in-out 1.2s infinite' : 'spinKnob 2s ease-in-out infinite'
        }}
      />

      {/* Center dot */}
      <circle
        cx="60"
        cy="60"
        r="4"
        fill="url(#vaultGradient)"
        style={{
          opacity: animate ? 0 : 1,
          animation: animate ? 'fadeIn 0.3s ease-out 1.2s forwards, pulse 2s ease-in-out 1.5s infinite' : 'pulse 2s ease-in-out infinite'
        }}
      />

      {/* Locking pins */}
      {[0, 60, 120, 180, 240, 300].map((angle, i) => {
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
            style={{
              opacity: animate ? 0 : 1,
              animation: animate ? `fadeIn 0.3s ease-out ${0.6 + i * 0.1}s forwards` : 'none'
            }}
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

// Loading bar component
const LoadingBar: React.FC<{ progress: number }> = ({ progress }) => {
  return (
    <div className="w-64 h-1 bg-white/10 rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-300 ease-out"
        style={{
          width: `${progress}%`,
          background: 'linear-gradient(90deg, var(--accent, #ff6b9d), var(--text, #fff), var(--accent, #ff6b9d))',
          boxShadow: '0 0 20px var(--glow, rgba(255,100,150,0.5))'
        }}
      />
    </div>
  )
}

type SplashPhase = 'logo' | 'tagline' | 'greeting' | 'complete'

interface SplashScreenProps {
  onComplete: () => void
  minDuration?: number
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
  onComplete,
  minDuration = 2500
}) => {
  const [phase, setPhase] = useState<SplashPhase>('logo')
  const [progress, setProgress] = useState(0)
  const [greeting] = useState(getTimeGreeting)
  const [fadeOut, setFadeOut] = useState(false)
  const [canSkip, setCanSkip] = useState(false)

  // Skip handler
  const handleSkip = () => {
    if (!canSkip) return
    setFadeOut(true)
    setTimeout(onComplete, 300)
  }

  useEffect(() => {
    // Phase transitions
    const timers: NodeJS.Timeout[] = []

    // Progress animation
    const progressInterval = setInterval(() => {
      setProgress(p => Math.min(p + 2, 100))
    }, minDuration / 50)
    timers.push(progressInterval as unknown as NodeJS.Timeout)

    // Allow skipping after logo animation
    timers.push(setTimeout(() => setCanSkip(true), 1000))

    // Logo phase complete
    timers.push(setTimeout(() => setPhase('tagline'), 800))

    // Tagline phase complete
    timers.push(setTimeout(() => setPhase('greeting'), 1600))

    // Ready to complete
    timers.push(setTimeout(() => {
      setPhase('complete')
      setFadeOut(true)
    }, minDuration - 500))

    // Final complete
    timers.push(setTimeout(() => {
      onComplete()
    }, minDuration))

    return () => {
      timers.forEach(t => clearTimeout(t))
      clearInterval(progressInterval)
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
        {/* Animated logo */}
        <div className={`transition-transform duration-700 ${phase !== 'logo' ? 'scale-90' : 'scale-100'}`}>
          <VaultLogo animate={true} />
        </div>

        {/* App name */}
        <div
          className={`
            text-4xl font-bold tracking-wider
            transition-all duration-500
            ${phase === 'logo' ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'}
          `}
          style={{
            background: 'linear-gradient(135deg, var(--text, #fff), var(--accent, #ff6b9d))',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            textShadow: '0 0 40px var(--glow, rgba(255,100,150,0.5))'
          }}
        >
          VAULT
        </div>

        {/* Tagline */}
        <div
          className={`
            text-sm text-[var(--muted)] tracking-widest uppercase
            transition-all duration-500 delay-100
            ${phase === 'logo' || phase === 'tagline' ? 'opacity-0' : 'opacity-100'}
          `}
        >
          Your Private Pleasure Palace
        </div>

        {/* Diabella greeting */}
        <div
          className={`
            max-w-md text-center text-[var(--muted)] italic
            transition-all duration-500 delay-200
            ${phase === 'greeting' || phase === 'complete' ? 'opacity-100' : 'opacity-0'}
          `}
          style={{ minHeight: '3rem' }}
        >
          "{greeting}"
          <div className="text-xs mt-2 text-[var(--accent)]">— Diabella</div>
        </div>

        {/* Loading bar */}
        <div className="mt-4">
          <LoadingBar progress={progress} />
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

      {/* Keyframe animations */}
      <style>{`
        @keyframes drawRing {
          to {
            stroke-dashoffset: 0;
          }
        }
        @keyframes fadeIn {
          to {
            opacity: 1;
          }
        }
        @keyframes spinKnob {
          0%, 100% {
            transform-origin: center;
            transform: rotate(0deg);
          }
          25% {
            transform: rotate(15deg);
          }
          75% {
            transform: rotate(-15deg);
          }
        }
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.7;
            transform: scale(1.2);
          }
        }
      `}</style>
    </div>
  )
}

export default SplashScreen
