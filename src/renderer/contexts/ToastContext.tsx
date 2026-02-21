// File: src/renderer/contexts/ToastContext.tsx
import React, { createContext, useContext, useState, useCallback, useMemo, useRef } from 'react'
import { X, CheckCircle2, XCircle, AlertCircle, Info } from 'lucide-react'
import type { Toast, ToastType } from '../types'

type ToastContextValue = {
  toasts: Toast[]
  showToast: (type: ToastType, message: string, duration?: number) => void
  dismissToast: (id: string) => void
}

const ToastContext = createContext<ToastContextValue>({
  toasts: [],
  showToast: () => {},
  dismissToast: () => {}
})

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const showToast = useCallback((type: ToastType, message: string, duration: number = 4000) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`
    setToasts(prev => [...prev, { id, type, message, duration }])
    // Auto-dismiss with tracked timer
    if (duration > 0) {
      const timer = setTimeout(() => {
        toastTimersRef.current.delete(id)
        setToasts(prev => prev.filter(t => t.id !== id))
      }, duration)
      toastTimersRef.current.set(id, timer)
    }
  }, [])

  const dismissToast = useCallback((id: string) => {
    // Clear timer when manually dismissed
    const timer = toastTimersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      toastTimersRef.current.delete(id)
    }
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const value = useMemo(() => ({
    toasts,
    showToast,
    dismissToast
  }), [toasts, showToast, dismissToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
    </ToastContext.Provider>
  )
}

export function ToastContainer() {
  const { toasts, dismissToast } = useToast()

  if (toasts.length === 0) return null

  const getToastStyles = (type: ToastType) => {
    switch (type) {
      case 'success': return 'bg-green-500/90 border-green-400'
      case 'error': return 'bg-red-500/90 border-red-400'
      case 'warning': return 'bg-yellow-500/90 border-yellow-400'
      case 'info': default: return 'bg-blue-500/90 border-blue-400'
    }
  }

  const getToastIcon = (type: ToastType) => {
    switch (type) {
      case 'success': return <CheckCircle2 size={16} />
      case 'error': return <XCircle size={16} />
      case 'warning': return <AlertCircle size={16} />
      case 'info': default: return <Info size={16} />
    }
  }

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex items-center gap-2 px-4 py-3 rounded-xl border backdrop-blur-sm shadow-lg text-white text-sm animate-in slide-in-from-right duration-300 ${getToastStyles(toast.type)}`}
        >
          {getToastIcon(toast.type)}
          <span className="flex-1">{toast.message}</span>
          <button
            onClick={(e) => { e.stopPropagation(); dismissToast(toast.id) }}
            className="p-1 hover:bg-white/20 rounded transition"
            aria-label="Dismiss notification"
            title="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
