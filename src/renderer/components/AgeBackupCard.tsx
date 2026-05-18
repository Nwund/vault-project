// File: src/renderer/components/AgeBackupCard.tsx
//
// #191 — Settings card for age-encrypted backups.
//
// Two-state UI:
//   - `age` binary not on PATH → install instructions
//   - `age` binary present → "Encrypt selected file" form with
//     recipients textarea (one age1... line each, supports
//     YubiKey-PIV via age-plugin-yubikey identity strings) +
//     destination path picker
//
// The actual encryption shells out to `age` per IPC — see
// `age-backup-service.ts`.

import React, { useCallback, useEffect, useState } from 'react'
import { Lock, FileCheck, AlertTriangle, FolderOpen, RefreshCw } from 'lucide-react'

export function AgeBackupCard(): React.JSX.Element {
  const [installed, setInstalled] = useState<boolean | null>(null)
  const [version, setVersion] = useState<string | null>(null)
  const [srcPath, setSrcPath] = useState('')
  const [dstPath, setDstPath] = useState('')
  const [recipients, setRecipients] = useState('')
  const [busy, setBusy] = useState(false)
  const [info, setInfo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const api: any = (window as any).api
    if (!api?.ageStatus) return
    try {
      const r = await api.ageStatus()
      setInstalled(!!r?.installed)
      setVersion(r?.version ?? null)
    } catch {
      setInstalled(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const pickSource = useCallback(async () => {
    const api: any = (window as any).api
    try {
      const r = await api?.dialogOpenFile?.({ title: 'Select file to encrypt' })
      if (r) {
        setSrcPath(r)
        // Auto-suggest a `.age`-suffixed destination next to the source.
        if (!dstPath.trim()) setDstPath(`${r}.age`)
      }
    } catch { /* user can paste path */ }
  }, [dstPath])

  const pickDest = useCallback(async () => {
    const api: any = (window as any).api
    try {
      const r = await api?.dialogSaveFile?.({
        title: 'Save encrypted file as',
        defaultPath: srcPath ? `${srcPath}.age` : 'backup.age',
        filters: [{ name: 'age encrypted', extensions: ['age'] }],
      })
      if (r) setDstPath(r)
    } catch { /* noop */ }
  }, [srcPath])

  const encrypt = useCallback(async () => {
    setError(null)
    setInfo(null)
    if (!srcPath.trim()) { setError('Source path is required'); return }
    if (!dstPath.trim()) { setError('Destination path is required'); return }
    const recList = recipients.split('\n').map((l) => l.trim()).filter(Boolean)
    if (recList.length === 0) { setError('At least one recipient (age1... or ssh-ed25519 ...) is required'); return }
    setBusy(true)
    try {
      const api: any = (window as any).api
      const r = await api.ageEncryptFile({
        srcPath: srcPath.trim(),
        dstPath: dstPath.trim(),
        recipients: recList,
      })
      if (r?.ok) setInfo(`Wrote encrypted file to ${dstPath.trim()}`)
      else setError(r?.error ?? 'Encryption failed')
    } finally { setBusy(false) }
  }, [srcPath, dstPath, recipients])

  return (
    <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5 mt-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Lock size={16} className="text-[var(--primary)]" />
          <div className="text-sm font-semibold">age-encrypted backups</div>
        </div>
        <button
          onClick={refresh}
          className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
        >
          <RefreshCw size={11} /> Refresh
        </button>
      </div>

      {installed === null ? (
        <div className="text-[11px] text-zinc-500">Checking…</div>
      ) : !installed ? (
        <div className="space-y-2">
          <div className="flex items-start gap-1.5 text-[11px] text-amber-400">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            <span>The <code className="px-1 bg-zinc-900 rounded">age</code> binary isn't on your PATH.</span>
          </div>
          <div className="text-[11px] text-zinc-400 space-y-1">
            <div>Install instructions:</div>
            <div className="font-mono text-[10px] pl-3 space-y-0.5">
              <div>Windows: <code className="text-zinc-300">winget install --id FiloSottile.age</code></div>
              <div>macOS:   <code className="text-zinc-300">brew install age</code></div>
              <div>Linux:   <code className="text-zinc-300">apt install age</code> (or your distro equivalent)</div>
            </div>
            <div className="mt-2">
              Optional: install <code className="px-1 bg-zinc-900 rounded">age-plugin-yubikey</code> for hardware-key recipients.
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-300">
            <FileCheck size={12} />
            <span>Installed · {version ?? 'version unknown'}</span>
          </div>

          <div>
            <label className="text-[11px] text-zinc-400 uppercase tracking-wide block mb-1">Source file</label>
            <div className="flex gap-1.5">
              <input
                value={srcPath}
                onChange={(e) => setSrcPath(e.target.value)}
                placeholder="C:\path\to\catalog.tar.zst"
                className="flex-1 bg-zinc-900 border border-[var(--border)] rounded px-2 py-1.5 text-sm font-mono outline-none"
              />
              <button
                onClick={pickSource}
                className="px-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                title="Browse"
              >
                <FolderOpen size={12} />
              </button>
            </div>
          </div>

          <div>
            <label className="text-[11px] text-zinc-400 uppercase tracking-wide block mb-1">Output (.age)</label>
            <div className="flex gap-1.5">
              <input
                value={dstPath}
                onChange={(e) => setDstPath(e.target.value)}
                placeholder="C:\path\to\catalog.tar.zst.age"
                className="flex-1 bg-zinc-900 border border-[var(--border)] rounded px-2 py-1.5 text-sm font-mono outline-none"
              />
              <button
                onClick={pickDest}
                className="px-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                title="Browse"
              >
                <FolderOpen size={12} />
              </button>
            </div>
          </div>

          <div>
            <label className="text-[11px] text-zinc-400 uppercase tracking-wide block mb-1">
              Recipients (one per line)
            </label>
            <textarea
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
              placeholder={`age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg5sfn9aqmcac8p\nage1yubikey1qg... (from age-plugin-yubikey)\nssh-ed25519 AAAA...`}
              className="w-full h-24 bg-zinc-900 border border-[var(--border)] rounded px-2 py-1.5 text-xs font-mono outline-none resize-y"
            />
            <div className="text-[10px] text-zinc-500 mt-1">
              age recipients (age1...), SSH pubkeys, or hardware-key strings from age-plugin-yubikey.
            </div>
          </div>

          <button
            onClick={encrypt}
            disabled={busy}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-[var(--primary)] text-white disabled:opacity-50"
          >
            <Lock size={11} />
            {busy ? 'Encrypting…' : 'Encrypt with age'}
          </button>
        </div>
      )}

      {error && (
        <div className="mt-3 flex items-start gap-1.5 text-[11px] text-amber-400">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {info && !error && (
        <div className="mt-3 flex items-start gap-1.5 text-[11px] text-emerald-300">
          <FileCheck size={12} className="mt-0.5 shrink-0" />
          <span>{info}</span>
        </div>
      )}
    </div>
  )
}
