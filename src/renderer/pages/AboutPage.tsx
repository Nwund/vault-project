// File: src/renderer/pages/AboutPage.tsx
//
// Self-contained About page. First extraction from App.tsx as part of
// task #48 (split App.tsx into per-page files). See
// docs/APP_TSX_SPLIT_PLAN.md for the broader migration plan.
//
// This file inlines its own `cn` helper to avoid touching App.tsx's
// (which is used 100+ times). Phase A of the split plan consolidates
// `cn` into a shared util.

import { useState, useEffect } from 'react'
import { Sparkles, Crown, Zap, BarChart3, Github, MessageCircle, Download, Code, Shield } from 'lucide-react'

function cn(...xs: Array<string | false | null | undefined>): string {
  return xs.filter(Boolean).join(' ')
}

export function AboutPage() {
  // null = still resolving; avoids flashing "Free" on every page load
  // before the IPC returns. Owner mode is the dev default, so users
  // would briefly see the wrong tier on every navigate.
  const [tier, setTier] = useState<string | null>(null)
  const [vaultStats, setVaultStats] = useState<any>(null)
  const [appVersion, setAppVersion] = useState('2.7.1')

  useEffect(() => {
    // Fallback timeout so the UI doesn't sit on "…" forever if the
    // IPC hangs for any reason (renderer subscribed before main
    // registered the handler, etc).
    let resolved = false
    const fallbackTimer = window.setTimeout(() => {
      if (!resolved) setTier('free')
    }, 3000)
    window.api.license?.getTier?.()
      .then((t: any) => {
        resolved = true
        clearTimeout(fallbackTimer)
        setTier(typeof t === 'string' && t ? t : 'free')
      })
      .catch(() => {
        resolved = true
        clearTimeout(fallbackTimer)
        setTier('free')
      })
    window.api.vault?.getStats?.().then((s: any) => setVaultStats(s))
    window.api.app?.getVersion?.().then((v: any) => v && setAppVersion(v))
    return () => clearTimeout(fallbackTimer)
  }, [])

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-8 pb-safe">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Hero */}
          <div className="relative rounded-3xl border border-[var(--border)] bg-gradient-to-br from-[var(--primary)]/20 via-purple-500/10 to-pink-500/10 p-8 text-center overflow-hidden">
            <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-[var(--primary)]/30 to-transparent rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-gradient-to-tr from-purple-500/20 to-transparent rounded-full blur-2xl" />
            <div className="relative">
              <div className="w-24 h-24 mx-auto mb-5 rounded-3xl bg-gradient-to-br from-[var(--primary)] to-pink-600 flex items-center justify-center shadow-2xl shadow-[var(--primary)]/40 transform hover:scale-105 transition-transform">
                <Sparkles size={44} className="text-white" />
              </div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-[var(--text)] to-[var(--text-muted)] bg-clip-text text-transparent">Vault</h1>
              <p className="text-[var(--text-muted)] mt-2 text-lg">Personal Media Experience</p>
              <div className="mt-5 flex items-center justify-center gap-3">
                <span className="px-4 py-1.5 rounded-full text-sm font-medium bg-zinc-800/80 text-zinc-300 border border-[var(--border)]">
                  v{appVersion}
                </span>
                <span
                  className={cn(
                    'px-4 py-1.5 rounded-full text-sm font-medium flex items-center gap-1.5',
                    tier === 'owner' ? 'bg-gradient-to-r from-yellow-500/30 to-amber-500/30 text-yellow-400 border border-yellow-500/30' :
                    tier === 'premium' ? 'bg-gradient-to-r from-[var(--primary)]/30 to-pink-500/30 text-[var(--primary)] border border-[var(--primary)]/30' :
                    tier === null ? 'bg-zinc-800/40 text-zinc-500 border border-[var(--border)] opacity-50' :
                    'bg-zinc-800/80 text-zinc-400 border border-[var(--border)]'
                  )}
                >
                  {tier === 'owner' ? (
                    <><Crown size={14} /> Owner</>
                  ) : tier === 'premium' ? (
                    <><Zap size={14} /> Premium</>
                  ) : tier === null ? (
                    '…'
                  ) : (
                    'Free'
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Stats */}
          {vaultStats && (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)]/50 p-6">
              <div className="text-sm font-semibold mb-4 flex items-center gap-2">
                <BarChart3 size={16} className="text-[var(--primary)]" />
                Your Collection
              </div>
              <div className="grid grid-cols-4 gap-4">
                <div className="text-center p-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 transition-colors">
                  <div className="text-3xl font-bold text-[var(--text)]">{vaultStats.totalMedia?.toLocaleString() || 0}</div>
                  <div className="text-xs text-[var(--text-muted)] mt-1">Total</div>
                </div>
                <div className="text-center p-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 transition-colors">
                  <div className="text-3xl font-bold text-green-400">{vaultStats.videoCount?.toLocaleString() || 0}</div>
                  <div className="text-xs text-zinc-500 mt-1">Videos</div>
                </div>
                <div className="text-center p-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 transition-colors">
                  <div className="text-3xl font-bold text-purple-400">{vaultStats.imageCount?.toLocaleString() || 0}</div>
                  <div className="text-xs text-zinc-500 mt-1">Images</div>
                </div>
                <div className="text-center p-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 transition-colors">
                  <div className="text-3xl font-bold text-blue-400">{vaultStats.tagCount?.toLocaleString() || 0}</div>
                  <div className="text-xs text-zinc-500 mt-1">Tags</div>
                </div>
              </div>
            </div>
          )}

          {/* Primary action grid */}
          <div className="grid grid-cols-3 gap-4">
            <button
              onClick={() => window.api?.shell?.openExternal?.('https://github.com/vault-app/vault')}
              className="flex flex-col items-center gap-2 p-5 rounded-2xl border border-[var(--border)] bg-zinc-900/50 hover:bg-zinc-800 transition-all hover:scale-[1.02] group"
            >
              <Github size={28} className="text-zinc-400 group-hover:text-white transition-colors" />
              <span className="text-sm font-medium">GitHub</span>
              <span className="text-xs text-zinc-500">Source Code</span>
            </button>
            <button
              onClick={() => window.api?.shell?.openExternal?.('https://github.com/vault-app/vault/issues')}
              className="flex flex-col items-center gap-2 p-5 rounded-2xl border border-[var(--border)] bg-zinc-900/50 hover:bg-zinc-800 transition-all hover:scale-[1.02] group"
            >
              <MessageCircle size={28} className="text-zinc-400 group-hover:text-white transition-colors" />
              <span className="text-sm font-medium">Support</span>
              <span className="text-xs text-zinc-500">Report Issues</span>
            </button>
            <button
              onClick={() => window.api?.shell?.openExternal?.('https://github.com/vault-app/vault/releases')}
              className="flex flex-col items-center gap-2 p-5 rounded-2xl border border-[var(--border)] bg-zinc-900/50 hover:bg-zinc-800 transition-all hover:scale-[1.02] group"
            >
              <Download size={28} className="text-zinc-400 group-hover:text-white transition-colors" />
              <span className="text-sm font-medium">Updates</span>
              <span className="text-xs text-zinc-500">Download Latest</span>
            </button>
          </div>

          {/* Built With */}
          <div className="rounded-2xl border border-[var(--border)] bg-zinc-900/50 p-6">
            <div className="text-sm font-semibold mb-4 flex items-center gap-2">
              <Code size={16} className="text-[var(--primary)]" />
              Built With
            </div>
            <div className="flex flex-wrap gap-2">
              {['Electron', 'React', 'TypeScript', 'Vite', 'Tailwind CSS', 'SQLite', 'FFmpeg', 'Lucide Icons'].map((tech) => (
                <span key={tech} className="px-3 py-1.5 rounded-lg bg-zinc-800 text-xs text-zinc-300 border border-[var(--border)]">
                  {tech}
                </span>
              ))}
            </div>
          </div>

          {/* Legal */}
          <div className="rounded-2xl border border-[var(--border)] bg-zinc-900/50 p-6">
            <div className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Shield size={16} className="text-[var(--primary)]" />
              Legal
            </div>
            <div className="space-y-3 text-sm text-zinc-400 leading-relaxed">
              <p>
                Vault is designed for personal use with your own media collection.
                Users are responsible for ensuring they have the rights to any content in their vault.
              </p>
              <p>
                By using this software, you agree that you are of legal adult age in your jurisdiction.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center py-4 text-xs text-zinc-600">
            Made with passion for passionate people
          </div>
        </div>
      </div>
    </div>
  )
}
