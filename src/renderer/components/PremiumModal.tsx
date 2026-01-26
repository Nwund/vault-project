// File: src/renderer/components/PremiumModal.tsx
// Premium upgrade modal and Diabella teaser for free users

import React, { useState, useEffect } from 'react'
import { X, Heart, Sparkles, MessageCircle, Mic, Target, Zap, Crown } from 'lucide-react'

interface PremiumModalProps {
  isOpen: boolean
  onClose: () => void
  onActivate: (key: string) => Promise<boolean>
}

export const PremiumModal: React.FC<PremiumModalProps> = ({ isOpen, onClose, onActivate }) => {
  const [mode, setMode] = useState<'features' | 'activate'>('features')
  const [licenseKey, setLicenseKey] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (!isOpen) return null

  const handleActivate = async () => {
    if (!licenseKey.trim()) {
      setError('Please enter a license key')
      return
    }

    setLoading(true)
    setError('')

    try {
      const success = await onActivate(licenseKey.trim())
      if (success) {
        onClose()
      } else {
        setError('Invalid license key. Please check and try again.')
      }
    } catch (err) {
      setError('Failed to activate license. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg mx-4 bg-[var(--panel)] rounded-3xl border border-[var(--border)] shadow-2xl overflow-hidden">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/10 transition z-10"
        >
          <X size={20} />
        </button>

        {/* Header with gradient */}
        <div
          className="p-8 text-center"
          style={{
            background: 'linear-gradient(135deg, rgba(255,107,157,0.2) 0%, rgba(196,69,105,0.2) 100%)',
          }}
        >
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-[var(--primary)] to-[var(--secondary)] flex items-center justify-center">
            <Crown size={40} className="text-white" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Unlock Premium</h2>
          <p className="text-[var(--muted)]">Get the full Vault experience</p>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--border)]">
          <button
            onClick={() => setMode('features')}
            className={`flex-1 py-3 text-sm font-medium transition ${
              mode === 'features'
                ? 'text-[var(--primary)] border-b-2 border-[var(--primary)]'
                : 'text-[var(--muted)] hover:text-white'
            }`}
          >
            Features
          </button>
          <button
            onClick={() => setMode('activate')}
            className={`flex-1 py-3 text-sm font-medium transition ${
              mode === 'activate'
                ? 'text-[var(--primary)] border-b-2 border-[var(--primary)]'
                : 'text-[var(--muted)] hover:text-white'
            }`}
          >
            Enter License
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {mode === 'features' ? (
            <div className="space-y-4">
              <FeatureItem
                icon={Heart}
                title="Diabella AI Companion"
                description="She watches with you and reacts to everything"
              />
              <FeatureItem
                icon={MessageCircle}
                title="Explicit Dirty Talk"
                description="5 spice levels from flirty to unhinged"
              />
              <FeatureItem
                icon={Mic}
                title="Voice & Moans"
                description="Audio reactions while you watch"
              />
              <FeatureItem
                icon={Target}
                title="Smart Recommendations"
                description="AI learns what gets you off"
              />
              <FeatureItem
                icon={Sparkles}
                title="All Goon Themes"
                description="10 erotic themes to match your mood"
              />
              <FeatureItem
                icon={Zap}
                title="Unlimited Everything"
                description="Playlists, goon wall tiles, achievements"
              />

              <div className="pt-4 space-y-3">
                <button
                  onClick={() => setMode('activate')}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-[var(--primary)] to-[var(--secondary)] text-white font-medium hover:opacity-90 transition"
                >
                  I Have a License Key
                </button>
                <button
                  onClick={() => window.api?.shell?.openExternal?.('https://vault.app/premium')}
                  className="w-full py-3 rounded-xl border border-[var(--border)] hover:border-white/20 transition text-sm"
                >
                  Get Premium - $9.99/mo
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-[var(--muted)]">
                Enter your license key to unlock premium features:
              </p>

              <input
                type="text"
                value={licenseKey}
                onChange={(e) => setLicenseKey(e.target.value.toUpperCase())}
                placeholder="VAULT-XXXX-XXXX-XXXX-XXXX"
                className="w-full px-4 py-3 rounded-xl bg-black/20 border border-[var(--border)] focus:border-[var(--primary)] outline-none text-center font-mono tracking-wider"
                maxLength={24}
              />

              {error && (
                <p className="text-sm text-red-400 text-center">{error}</p>
              )}

              <button
                onClick={handleActivate}
                disabled={loading}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-[var(--primary)] to-[var(--secondary)] text-white font-medium hover:opacity-90 transition disabled:opacity-50"
              >
                {loading ? 'Activating...' : 'Activate License'}
              </button>

              <p className="text-xs text-[var(--muted)] text-center">
                Don't have a key?{' '}
                <button
                  onClick={() => window.api?.shell?.openExternal?.('https://vault.app/premium')}
                  className="text-[var(--primary)] hover:underline"
                >
                  Get Premium
                </button>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Feature item component
const FeatureItem: React.FC<{
  icon: React.FC<any>
  title: string
  description: string
}> = ({ icon: Icon, title, description }) => (
  <div className="flex items-start gap-3">
    <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/20 flex items-center justify-center shrink-0">
      <Icon size={20} className="text-[var(--primary)]" />
    </div>
    <div>
      <div className="font-medium">{title}</div>
      <div className="text-sm text-[var(--muted)]">{description}</div>
    </div>
  </div>
)

// Diabella teaser for free users
export const DiabellaTeaser: React.FC<{
  onUpgrade: () => void
}> = ({ onUpgrade }) => {
  const [messageIndex, setMessageIndex] = useState(0)

  const teaserMessages = [
    "I'm waiting for you... upgrade to meet me...",
    "I have so much I want to show you...",
    "Unlock me and I'll make your sessions unforgettable...",
    "I can help you find exactly what you're craving...",
    "Premium members get to play with me... don't you want to play?",
    "I'm lonely in here... let me out...",
  ]

  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((i) => (i + 1) % teaserMessages.length)
    }, 6000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="rounded-3xl border border-[var(--border)] bg-gradient-to-br from-[var(--primary-muted)] to-transparent p-6">
      {/* Locked avatar */}
      <div className="relative w-32 h-32 mx-auto mb-6">
        <div className="w-full h-full rounded-full overflow-hidden blur-sm">
          <div className="w-full h-full bg-gradient-to-br from-[var(--primary)] to-[var(--secondary)]" />
        </div>
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 rounded-full">
          <Crown size={32} className="text-white/80" />
          <span className="text-xs text-white/60 mt-1">Premium</span>
        </div>
      </div>

      {/* Name */}
      <h3 className="text-xl font-semibold text-center mb-2">Diabella</h3>
      <p className="text-sm text-[var(--muted)] text-center mb-4">Your AI Companion</p>

      {/* Teaser message */}
      <div
        className="text-center italic text-[var(--primary)] mb-6 min-h-[3rem] transition-opacity duration-500"
        key={messageIndex}
        style={{ animation: 'fadeIn 0.5s ease' }}
      >
        "{teaserMessages[messageIndex]}"
      </div>

      {/* Upgrade button */}
      <button
        onClick={onUpgrade}
        className="w-full py-3 rounded-xl bg-gradient-to-r from-[var(--primary)] to-[var(--secondary)] text-white font-medium hover:opacity-90 transition flex items-center justify-center gap-2"
      >
        <Sparkles size={18} />
        Unlock Diabella
      </button>

      {/* Preview button */}
      <button
        onClick={onUpgrade}
        className="w-full py-2 mt-2 text-sm text-[var(--muted)] hover:text-white transition"
      >
        See what you're missing
      </button>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

export default PremiumModal
