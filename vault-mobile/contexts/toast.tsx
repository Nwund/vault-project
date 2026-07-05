// File: vault-mobile/contexts/toast.tsx
// Toast context for app-wide notifications

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { Toast } from '@/components/Toast'

type ToastType = 'success' | 'error' | 'warning' | 'info'

interface ToastData {
  id: number
  type: ToastType
  title: string
  message?: string
  duration?: number
}

interface ToastContextValue {
  showToast: (options: Omit<ToastData, 'id'>) => void
  success: (title: string, message?: string) => void
  error: (title: string, message?: string) => void
  warning: (title: string, message?: string) => void
  info: (title: string, message?: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

let toastId = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([])

  const showToast = useCallback((options: Omit<ToastData, 'id'>) => {
    const id = ++toastId
    setToasts(prev => [...prev, { ...options, id }])
  }, [])

  const dismissToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const success = useCallback((title: string, message?: string) => {
    showToast({ type: 'success', title, message })
  }, [showToast])

  const error = useCallback((title: string, message?: string) => {
    showToast({ type: 'error', title, message })
  }, [showToast])

  const warning = useCallback((title: string, message?: string) => {
    showToast({ type: 'warning', title, message })
  }, [showToast])

  const info = useCallback((title: string, message?: string) => {
    showToast({ type: 'info', title, message })
  }, [showToast])

  // Only show the most recent toast
  const currentToast = toasts[toasts.length - 1]

  return (
    <ToastContext.Provider value={{ showToast, success, error, warning, info }}>
      {children}
      {currentToast && (
        <Toast
          visible={true}
          type={currentToast.type}
          title={currentToast.title}
          message={currentToast.message}
          duration={currentToast.duration || 3000}
          onDismiss={() => dismissToast(currentToast.id)}
        />
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}
