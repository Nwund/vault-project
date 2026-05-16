// File: src/renderer/components/WindowsHelloCard.tsx
//
// #194 — Windows Hello / platform-authenticator enrollment + a single
// "Require biometric to reveal API keys" toggle that gates the
// existing safeStorage-reveal flow. Builds on the useWindowsHello
// hook (WebAuthn).
//
// Lives in Settings → Services next to the other security cards.

import { useEffect, useState } from 'react'
import { Fingerprint, Shield, Check, X, Loader2 } from 'lucide-react'
import { useToast } from '../contexts'
import { useWindowsHello } from '../hooks/useWindowsHello'

const SETTING_KEY = 'vault_require_biometric_api_reveal'

export function WindowsHelloCard() {
  const { showToast } = useToast()
  const { available, verify, forget } = useWindowsHello()
  const [supported, setSupported] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [requireForReveal, setRequireForReveal] = useState<boolean>(() => {
    try { return localStorage.getItem(SETTING_KEY) === 'true' } catch { return false }
  })

  useEffect(() => {
    void available().then(setSupported)
  }, [available])

  const test = async () => {
    setBusy(true)
    try {
      const ok = await verify()
      showToast?.(ok ? 'success' : 'error', ok ? 'Windows Hello verified' : 'Verification cancelled or failed')
    } finally {
      setBusy(false)
    }
  }

  const toggleRequire = (next: boolean) => {
    setRequireForReveal(next)
    try { localStorage.setItem(SETTING_KEY, String(next)) } catch { /* quota */ }
  }

  if (supported === null) return null

  return (
    <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5 mt-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <Fingerprint size={20} className="text-cyan-400" />
          <div>
            <div className="text-sm font-semibold">Windows Hello / Touch ID</div>
            <div className="text-[11px] text-[var(--muted)] mt-0.5">
              Gate sensitive actions behind a fingerprint / PIN / face check.
            </div>
          </div>
        </div>
        <div className={`px-2 py-1 rounded text-[10px] font-medium ${supported ? 'bg-emerald-500/20 text-emerald-300' : 'bg-zinc-700/40 text-zinc-400'}`}>
          {supported ? 'Available' : 'Not available'}
        </div>
      </div>

      {!supported ? (
        <div className="text-xs text-amber-300">
          No platform authenticator on this device. Set up Windows Hello (Settings → Accounts → Sign-in options) or use a Touch ID Mac.
        </div>
      ) : (
        <div className="space-y-3">
          {/* Test enrollment */}
          <button
            disabled={busy}
            onClick={test}
            className="w-full px-3 py-2 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-100 text-sm transition flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Shield size={14} />}
            {busy ? 'Waiting for Hello…' : 'Enroll / test Windows Hello'}
          </button>

          {/* Setting toggle */}
          <label className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] cursor-pointer">
            <div>
              <div className="text-sm">Require biometric to reveal API keys</div>
              <div className="text-[11px] text-[var(--muted)] mt-0.5">
                Show / copy buttons on credential cards prompt for Hello first.
              </div>
            </div>
            <div
              role="switch"
              aria-checked={requireForReveal}
              onClick={() => toggleRequire(!requireForReveal)}
              className={`w-10 h-5 rounded-full relative transition ${requireForReveal ? 'bg-cyan-500' : 'bg-white/15'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${requireForReveal ? 'left-5' : 'left-0.5'}`} />
            </div>
          </label>

          <button
            onClick={() => { forget(); showToast?.('info', 'Enrollment forgotten on this device') }}
            className="text-[11px] text-[var(--muted)] hover:text-red-300 transition"
          >
            Forget enrollment on this device
          </button>
        </div>
      )}
    </div>
  )
}
