// File: src/renderer/components/KeyboardNavigationHint.tsx
// Visual hint for keyboard navigation mode

import React, { useState, useEffect } from 'react'
import { Keyboard, X, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from 'lucide-react'

interface KeyboardNavigationHintProps {
  isActive: boolean
  onDismiss?: () => void
  position?: 'bottom-left' | 'bottom-right' | 'top-right'
  compact?: boolean
  className?: string
}

export function KeyboardNavigationHint({
  isActive,
  onDismiss,
  position = 'bottom-right',
  compact = false,
  className = ''
}: KeyboardNavigationHintProps) {
  const [visible, setVisible] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (isActive && !dismissed) {
      setVisible(true)
    } else {
      setVisible(false)
    }
  }, [isActive, dismissed])

  if (!visible) return null

  const positionClasses = {
    'bottom-left': 'bottom-4 left-4',
    'bottom-right': 'bottom-4 right-4',
    'top-right': 'top-4 right-4'
  }

  const handleDismiss = () => {
    setDismissed(true)
    setVisible(false)
    onDismiss?.()
  }

  if (compact) {
    return (
      <div
        className={`fixed ${positionClasses[position]} z-50 flex items-center gap-2 px-3 py-2 bg-zinc-900/95 backdrop-blur-xl rounded-xl border border-zinc-700 shadow-xl ${className}`}
      >
        <Keyboard size={16} className="text-[var(--primary)]" />
        <span className="text-xs text-zinc-300">Keyboard navigation active</span>
        <button
          onClick={handleDismiss}
          className="p-1 rounded hover:bg-zinc-800 transition"
        >
          <X size={12} />
        </button>
      </div>
    )
  }

  return (
    <div
      className={`fixed ${positionClasses[position]} z-50 bg-zinc-900/95 backdrop-blur-xl rounded-2xl border border-zinc-700 shadow-2xl overflow-hidden ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Keyboard size={16} className="text-[var(--primary)]" />
          <span className="font-semibold text-sm">Keyboard Navigation</span>
        </div>
        <button
          onClick={handleDismiss}
          className="p-1 rounded hover:bg-zinc-800 transition"
        >
          <X size={14} />
        </button>
      </div>

      {/* Keys */}
      <div className="p-4 space-y-3">
        {/* Navigation */}
        <div>
          <div className="text-[10px] uppercase text-zinc-500 mb-2">Navigate</div>
          <div className="grid grid-cols-3 gap-1 w-fit mx-auto">
            <div />
            <KeyBadge keys={['↑', 'K']} />
            <div />
            <KeyBadge keys={['←', 'H']} />
            <KeyBadge keys={['↓', 'J']} />
            <KeyBadge keys={['→', 'L']} />
          </div>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-2">
            <KeyBadge keys={['Enter']} small />
            <span className="text-zinc-400">Open</span>
          </div>
          <div className="flex items-center gap-2">
            <KeyBadge keys={['Space']} small />
            <span className="text-zinc-400">Select</span>
          </div>
          <div className="flex items-center gap-2">
            <KeyBadge keys={['F']} small />
            <span className="text-zinc-400">Favorite</span>
          </div>
          <div className="flex items-center gap-2">
            <KeyBadge keys={['X']} small />
            <span className="text-zinc-400">Delete</span>
          </div>
          <div className="flex items-center gap-2">
            <KeyBadge keys={['G']} small />
            <span className="text-zinc-400">Go to top</span>
          </div>
          <div className="flex items-center gap-2">
            <KeyBadge keys={['⇧G']} small />
            <span className="text-zinc-400">Go to end</span>
          </div>
          <div className="flex items-center gap-2">
            <KeyBadge keys={['Esc']} small />
            <span className="text-zinc-400">Exit</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function KeyBadge({ keys, small = false }: { keys: string[]; small?: boolean }) {
  return (
    <div className={`flex items-center gap-0.5 ${small ? 'justify-start' : 'justify-center'}`}>
      {keys.map((key, i) => (
        <React.Fragment key={key}>
          {i > 0 && <span className="text-zinc-600 text-[10px]">/</span>}
          <span
            className={`bg-zinc-800 border border-zinc-700 rounded font-mono ${
              small ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs'
            }`}
          >
            {key}
          </span>
        </React.Fragment>
      ))}
    </div>
  )
}

// Inline keyboard shortcut indicator
export function ShortcutBadge({
  keys,
  className = ''
}: {
  keys: string[]
  className?: string
}) {
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`}>
      {keys.map((key, i) => (
        <React.Fragment key={key}>
          {i > 0 && <span className="text-zinc-600">+</span>}
          <kbd className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-[10px] font-mono">
            {key}
          </kbd>
        </React.Fragment>
      ))}
    </span>
  )
}

// Focus ring component for keyboard navigation
export function FocusRing({
  focused,
  className = '',
  children
}: {
  focused: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={`relative ${focused ? 'ring-2 ring-[var(--primary)] ring-offset-2 ring-offset-zinc-900' : ''} ${className}`}
    >
      {children}
      {focused && (
        <div className="absolute inset-0 pointer-events-none border-2 border-[var(--primary)] rounded-lg animate-pulse opacity-50" />
      )}
    </div>
  )
}

// Vim-style command palette indicator
export function VimCommandIndicator({
  command,
  className = ''
}: {
  command: string
  className?: string
}) {
  if (!command) return null

  return (
    <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 ${className}`}>
      <div className="bg-zinc-900/95 backdrop-blur-xl px-4 py-2 rounded-lg border border-zinc-700 shadow-xl">
        <span className="text-zinc-400 mr-2">:</span>
        <span className="font-mono text-white">{command}</span>
        <span className="animate-blink ml-0.5">|</span>
      </div>
    </div>
  )
}

export default KeyboardNavigationHint
