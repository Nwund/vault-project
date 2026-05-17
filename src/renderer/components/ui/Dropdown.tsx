// File: src/renderer/components/ui/Dropdown.tsx
//
// Custom-styled dropdown replacing native <select> (which can't be styled
// consistently on Windows). Extracted from App.tsx as part of #48 phase A.

import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '../../utils/cn'

export function Dropdown<T extends string>(props: {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string }[]
  className?: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const selectedOption = props.options.find((o) => o.value === props.value)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={dropdownRef} className={cn('relative', props.className)}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[var(--panel)] border border-[var(--border)] text-sm text-white cursor-pointer hover:border-[var(--primary)]/40 outline-none min-w-[100px]"
      >
        <span>{selectedOption?.label ?? 'Select...'}</span>
        <ChevronDown size={12} className={cn('transition-transform', isOpen && 'rotate-180')} />
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-full min-w-[120px] rounded-xl bg-[var(--panel)] border border-[var(--border)] shadow-xl z-50 overflow-hidden">
          {props.options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                props.onChange(option.value)
                setIsOpen(false)
              }}
              className={cn(
                'w-full text-left px-3 py-2 text-sm transition-colors',
                option.value === props.value
                  ? 'bg-[var(--primary)]/20 text-[var(--primary)]'
                  : 'text-white hover:bg-white/10',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
