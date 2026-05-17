// File: src/renderer/hooks/useOptimisticMutation.ts
//
// #343 F-119 — useOptimistic-wrapped mutation hook for tag / rating
// / favorite / progress mutations. Mirrors the React 19 useOptimistic
// signature while sequencing an IPC call behind it. The optimistic
// state is shown immediately; if the IPC fails the state rolls back
// and an error is surfaced.
//
// Usage:
//
//   const [tags, setOptimistic, mutate] = useOptimisticMutation<string[], string>({
//     base: video.tags,
//     reducer: (current, newTag) => [...current, newTag],
//     mutate: async (newTag) => window.api.media.addTag(video.id, newTag),
//   })
//
//   <button onClick={() => mutate(newTag)}>+</button>

import { startTransition, useCallback, useState } from 'react'
import * as React from 'react'
// React 19's useOptimistic. On React 18 this is undefined; we fall back
// to the confirmed value directly (no optimistic UI, but no crash).
const reactUseOptimistic = (React as any).useOptimistic as
  | (<S, A>(passthrough: S, reducer: (state: S, action: A) => S) => [S, (action: A) => void])
  | undefined
function useOptimistic<S, A>(passthrough: S, reducer: (state: S, action: A) => S): [S, (action: A) => void] {
  if (reactUseOptimistic) return reactUseOptimistic(passthrough, reducer)
  return [passthrough, () => { /* React 18 fallback: no optimistic state */ }]
}

export interface UseOptimisticMutationOptions<TState, TInput> {
  base: TState
  reducer: (current: TState, input: TInput) => TState
  mutate: (input: TInput) => Promise<{ ok: boolean; error?: string }>
  /** Called on failure with the input + error. */
  onError?: (input: TInput, error: string) => void
}

export function useOptimisticMutation<TState, TInput>(
  options: UseOptimisticMutationOptions<TState, TInput>,
): [TState, (input: TInput) => Promise<void>, { pending: boolean; lastError: string | null }] {
  const [confirmed, setConfirmed] = useState(options.base)
  const [optimistic, addOptimistic] = useOptimistic(confirmed, options.reducer)
  const [pending, setPending] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)

  const mutate = useCallback(async (input: TInput) => {
    setPending(true); setLastError(null)
    startTransition(() => addOptimistic(input))
    try {
      const r = await options.mutate(input)
      if (r.ok) {
        // Commit the optimistic value as the new confirmed base.
        setConfirmed((c) => options.reducer(c, input))
      } else {
        const err = r.error ?? 'mutation failed'
        setLastError(err)
        options.onError?.(input, err)
        // No need to manually revert: useOptimistic auto-resets when
        // the underlying base hasn't changed.
      }
    } catch (err: any) {
      const msg = String(err?.message ?? err)
      setLastError(msg)
      options.onError?.(input, msg)
    } finally {
      setPending(false)
    }
  }, [options.mutate, options.reducer, options.onError, addOptimistic])

  return [optimistic, mutate, { pending, lastError }]
}
