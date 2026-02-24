// File: src/renderer/contexts/ToastContext.tsx
import React, { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { X, CheckCircle2, XCircle, AlertCircle, Info } from 'lucide-react'
import type { Toast, ToastType, ToastAction } from '../types'

type ShowToastOptions = {
  action?: ToastAction
}

type ToastContextValue = {
  toasts: Toast[]
  showToast: (type: ToastType, message: string, duration?: number, options?: ShowToastOptions) => void
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

  const showToast = useCallback((
    type: ToastType,
    message: string,
    duration: number = 4000,
    options?: ShowToastOptions
  ) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const createdAt = Date.now()
    setToasts(prev => [...prev, { id, type, message, duration, createdAt, action: options?.action }])
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

// Individual toast item with progress bar
const ToastItem: React.FC<{
  toast: Toast
  index: number
  onDismiss: () => void
}> = ({ toast, index, onDismiss }) => {
  const [isExiting, setIsExiting] = useState(false)

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

  const handleDismiss = useCallback(() => {
    setIsExiting(true)
    setTimeout(onDismiss, 200)
  }, [onDismiss])

  const handleAction = useCallback(() => {
    if (toast.action?.onClick) {
      toast.action.onClick()
      handleDismiss()
    }
  }, [toast.action, handleDismiss])

  // Stack offset calculation
  const stackOffset = Math.min(index, 3) * -4
  const stackScale = 1 - Math.min(index, 3) * 0.02
  const stackOpacity = 1 - Math.min(index, 3) * 0.1

  return (
    <div
      className={`
        pointer-events-auto flex items-center gap-2 px-4 py-3 rounded-xl border
        backdrop-blur-sm shadow-lg text-white text-sm relative overflow-hidden
        ${isExiting ? 'toast-exit' : 'toast-enter'}
        ${getToastStyles(toast.type)}
      `}
      style={{
        transform: `translateY(${stackOffset}px) scale(${stackScale})`,
        opacity: stackOpacity,
        zIndex: 100 - index
      }}
    >
      {getToastIcon(toast.type)}
      <span className="flex-1">{toast.message}</span>

      {/* Action button */}
      {toast.action && (
        <button
          onClick={handleAction}
          className="toast-action-btn"
        >
          {toast.action.label}
        </button>
      )}

      <button
        onClick={(e) => { e.stopPropagation(); handleDismiss() }}
        className="p-1 hover:bg-white/20 rounded transition btn-press"
        aria-label="Dismiss notification"
        title="Dismiss"
      >
        <X size={14} />
      </button>

      {/* Progress bar countdown */}
      {toast.duration && toast.duration > 0 && toast.createdAt && (
        <div
          className="toast-progress-bar"
          style={{
            animation: `toastProgress ${toast.duration}ms linear forwards`
          }}
        />
      )}
    </div>
  )
}

export function ToastContainer() {
  const { toasts, dismissToast } = useToast()

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none toast-stack">
      {toasts.slice(0, 5).map((toast, index) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          index={index}
          onDismiss={() => dismissToast(toast.id)}
        />
      ))}
    </div>
  )
}
