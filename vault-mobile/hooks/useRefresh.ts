// File: vault-mobile/hooks/useRefresh.ts
// Hook for pull-to-refresh with haptics and state management

import { useState, useCallback } from 'react'
import { useHaptics } from './useHaptics'

interface UseRefreshOptions {
  onRefresh: () => Promise<void>
  minDuration?: number // Minimum loading duration in ms
}

export function useRefresh({ onRefresh, minDuration = 500 }: UseRefreshOptions) {
  const [isRefreshing, setIsRefreshing] = useState(false)
  const haptics = useHaptics()

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return

    haptics.light()
    setIsRefreshing(true)

    const startTime = Date.now()

    try {
      await onRefresh()
    } finally {
      // Ensure minimum loading duration for better UX
      const elapsed = Date.now() - startTime
      if (elapsed < minDuration) {
        await new Promise(resolve => setTimeout(resolve, minDuration - elapsed))
      }

      setIsRefreshing(false)
    }
  }, [isRefreshing, onRefresh, minDuration, haptics])

  return {
    isRefreshing,
    handleRefresh,
  }
}
