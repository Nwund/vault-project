// File: src/renderer/components/DebouncedField.tsx
//
// Self-buffering input/textarea components for the review pane. The
// problem they solve: AiTaggerPage holds title/description state at
// the top level; a controlled input that fires setState on every
// keystroke triggers a full-page re-render through ~22k lines of
// React. On underpowered hardware (or while the tagger is running and
// flooding the page with progress events), each keystroke gets
// >100ms of lag, making typing near-impossible.
//
// These components hold their own internal state and only call
// onChange after a typing pause (`debounceMs`), or on blur. The
// outer page sees one update per pause instead of one per keystroke.
// Visually identical from the user's perspective; perceptually 10×
// snappier.

import { useEffect, useRef, useState } from 'react'

interface DebouncedInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: string
  onChange: (next: string) => void
  /** Milliseconds of typing-quiet before propagating to parent. Default 250. */
  debounceMs?: number
  /** Also commit immediately on blur, even if debounce hasn't fired. */
  commitOnBlur?: boolean
}

export function DebouncedInput({
  value,
  onChange,
  debounceMs = 250,
  commitOnBlur = true,
  ...rest
}: DebouncedInputProps) {
  const [local, setLocal] = useState(value)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastPropValue = useRef(value)

  // Sync prop → local when the parent value changes externally
  // (e.g. "Regenerate" populated a new title). Don't clobber the
  // user's in-progress typing — only sync when prop differs from
  // both the local value AND from the last prop seen.
  useEffect(() => {
    if (value !== lastPropValue.current && value !== local) {
      setLocal(value)
    }
    lastPropValue.current = value
  }, [value, local])

  const commit = (next: string) => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    if (next !== lastPropValue.current) {
      lastPropValue.current = next
      onChange(next)
    }
  }

  return (
    <input
      {...rest}
      value={local}
      onChange={(e) => {
        const next = e.target.value
        setLocal(next)
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => commit(next), debounceMs)
      }}
      onBlur={(e) => {
        if (commitOnBlur) commit(e.target.value)
        rest.onBlur?.(e)
      }}
    />
  )
}

interface DebouncedTextareaProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> {
  value: string
  onChange: (next: string) => void
  debounceMs?: number
  commitOnBlur?: boolean
}

export function DebouncedTextarea({
  value,
  onChange,
  debounceMs = 250,
  commitOnBlur = true,
  ...rest
}: DebouncedTextareaProps) {
  const [local, setLocal] = useState(value)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastPropValue = useRef(value)

  useEffect(() => {
    if (value !== lastPropValue.current && value !== local) {
      setLocal(value)
    }
    lastPropValue.current = value
  }, [value, local])

  const commit = (next: string) => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    if (next !== lastPropValue.current) {
      lastPropValue.current = next
      onChange(next)
    }
  }

  return (
    <textarea
      {...rest}
      value={local}
      onChange={(e) => {
        const next = e.target.value
        setLocal(next)
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => commit(next), debounceMs)
      }}
      onBlur={(e) => {
        if (commitOnBlur) commit(e.target.value)
        rest.onBlur?.(e)
      }}
    />
  )
}
