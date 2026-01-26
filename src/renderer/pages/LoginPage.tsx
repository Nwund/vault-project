// File: src/renderer/pages/LoginPage.tsx
// License activation and welcome page

import React, { useState, useEffect } from 'react'

interface LoginPageProps {
  onActivate: (key: string) => Promise<boolean>
  onSkip?: () => void
}

export const LoginPage: React.FC<LoginPageProps> = ({ onActivate, onSkip }) => {
  const [licenseKey, setLicenseKey] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleActivate = async () => {
    if (!licenseKey.trim()) {
      setError('Please enter a license key')
      return
    }

    // Validate format: VAULT-XXXX-XXXX-XXXX-XXXX
    const parts = licenseKey.toUpperCase().split('-')
    if (parts.length !== 5 || parts[0] !== 'VAULT') {
      setError('Invalid format. Use: VAULT-XXXX-XXXX-XXXX-XXXX')
      return
    }

    setLoading(true)
    setError('')

    try {
      const result = await onActivate(licenseKey.trim())
      if (result) {
        setSuccess(true)
        setTimeout(() => {
          onSkip?.()
        }, 1500)
      } else {
        setError('Invalid license key. Please check and try again.')
      }
    } catch (e: any) {
      setError(e.message || 'Failed to activate license')
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading) {
      handleActivate()
    }
  }

  // Format input as user types
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '')

    // Auto-add dashes
    if (value.length > 0 && !value.startsWith('VAULT-')) {
      if (value.startsWith('VAULT')) {
        value = 'VAULT-' + value.slice(5)
      }
    }

    // Limit length
    if (value.length <= 24) {
      setLicenseKey(value)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
        <div className="text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-500/20 flex items-center justify-center">
            <span className="text-4xl">✓</span>
          </div>
          <h1 className="text-2xl font-bold text-green-400">Premium Activated!</h1>
          <p className="text-[var(--muted)] mt-2">Welcome to the full Vault experience</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex bg-[var(--bg)]">
      {/* Left side - Branding */}
      <div className="hidden lg:flex flex-1 flex-col items-center justify-center p-12 bg-gradient-to-br from-[var(--primary-muted)] to-transparent">
        <div className="w-24 h-24 mb-6 rounded-3xl bg-gradient-to-br from-[var(--primary)] to-[var(--secondary)] flex items-center justify-center">
          <span className="text-4xl">✨</span>
        </div>
        <h1 className="text-4xl font-bold mb-4">Vault</h1>
        <p className="text-xl text-[var(--muted)] mb-8">Your Private Media Sanctuary</p>

        <div className="space-y-4 text-left max-w-sm">
          <Feature icon="📚" text="Organize your private collection" />
          <Feature icon="💋" text="Meet Diabella, your AI companion" />
          <Feature icon="🔥" text="Goon Wall for immersive sessions" />
          <Feature icon="📊" text="Track your stats and achievements" />
          <Feature icon="🎨" text="10 sensual themes to match your mood" />
          <Feature icon="🔒" text="100% private, all data stays local" />
        </div>

        {/* Diabella teaser */}
        <div className="mt-12 p-4 rounded-2xl bg-black/20 border border-[var(--border)] max-w-sm">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[var(--primary)] to-[var(--secondary)] flex items-center justify-center shrink-0">
              <span className="text-xl">D</span>
            </div>
            <div>
              <div className="font-medium text-[var(--primary)]">Diabella</div>
              <p className="text-sm text-[var(--muted)] mt-1 italic">
                "I'm waiting to meet you... Premium unlocks all my features..."
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Right side - Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-[var(--primary)] to-[var(--secondary)] flex items-center justify-center">
              <span className="text-2xl">✨</span>
            </div>
            <h1 className="text-2xl font-bold">Vault</h1>
          </div>

          {/* Card */}
          <div className="rounded-3xl border border-[var(--border)] bg-[var(--panel)] p-8">
            <h2 className="text-xl font-semibold mb-2">Welcome to Vault</h2>
            <p className="text-[var(--muted)] text-sm mb-6">
              Enter your license key to unlock premium features, or continue with the free version.
            </p>

            {/* License Input */}
            <div className="mb-4">
              <label className="text-sm text-[var(--muted)] mb-2 block">License Key</label>
              <input
                type="text"
                value={licenseKey}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="VAULT-XXXX-XXXX-XXXX-XXXX"
                className="w-full px-4 py-3 rounded-xl bg-black/20 border border-[var(--border)] focus:border-[var(--primary)] outline-none text-center font-mono tracking-wider text-lg"
                maxLength={24}
                disabled={loading}
              />
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* Activate Button */}
            <button
              onClick={handleActivate}
              disabled={loading || !licenseKey.trim()}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-[var(--primary)] to-[var(--secondary)] text-white font-medium hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed mb-4"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Activating...
                </span>
              ) : (
                'Activate Premium'
              )}
            </button>

            {/* Divider */}
            <div className="flex items-center gap-4 my-6">
              <div className="flex-1 h-px bg-[var(--border)]" />
              <span className="text-xs text-[var(--muted)]">or</span>
              <div className="flex-1 h-px bg-[var(--border)]" />
            </div>

            {/* Skip Button */}
            {onSkip && (
              <button
                onClick={onSkip}
                className="w-full py-3 rounded-xl border border-[var(--border)] hover:bg-white/5 transition text-sm"
              >
                Continue with Free Version
              </button>
            )}

            {/* Free vs Premium */}
            <div className="mt-6 text-xs text-[var(--muted)] text-center">
              <p>Free: 3 playlists, 4 Goon Wall tiles, basic themes</p>
              <p className="text-[var(--primary)]">
                Premium: Unlimited playlists, 16 tiles, Diabella AI, all themes
              </p>
            </div>
          </div>

          {/* Get License Link */}
          <div className="text-center mt-6">
            <p className="text-sm text-[var(--muted)]">
              Don't have a license?{' '}
              <button
                onClick={() => window.api?.shell?.openExternal?.('https://vault.app/premium')}
                className="text-[var(--primary)] hover:underline"
              >
                Get Premium
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// Feature item for branding side
const Feature: React.FC<{ icon: string; text: string }> = ({ icon, text }) => (
  <div className="flex items-center gap-3">
    <span className="text-xl">{icon}</span>
    <span className="text-[var(--muted)]">{text}</span>
  </div>
)

export default LoginPage
