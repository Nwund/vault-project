// File: src/renderer/utils/schedule-task.ts
//
// #340 — Thin wrapper around Chrome's prioritized `scheduler.postTask`
// API with a graceful fallback for environments that don't ship it.
// Lets non-urgent work (thumbnail decode, analytics, idle CLIP scan)
// yield to user interactions without blocking the main thread.
//
// Priorities map directly to the spec:
//   - 'user-blocking' — runs as soon as possible (rarely needed here)
//   - 'user-visible'  — default; comparable to setTimeout(0)
//   - 'background'    — yields to anything else; use for big sweeps
//
// Falls back to MessageChannel-based microtask for user-visible work
// and requestIdleCallback for background work when scheduler is absent.

export type TaskPriority = 'user-blocking' | 'user-visible' | 'background'

interface SchedulerLike {
  postTask<T>(callback: () => T | Promise<T>, options?: { priority?: TaskPriority; signal?: AbortSignal; delay?: number }): Promise<T>
}

function getScheduler(): SchedulerLike | null {
  return (globalThis as any).scheduler ?? null
}

export function scheduleTask<T>(
  callback: () => T | Promise<T>,
  options: { priority?: TaskPriority; signal?: AbortSignal; delay?: number } = {},
): Promise<T> {
  const scheduler = getScheduler()
  if (scheduler) {
    return scheduler.postTask(callback, options)
  }
  // Fallback paths.
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      if (options.signal?.aborted) {
        reject(new DOMException('Aborted', 'AbortError'))
        return
      }
      try {
        Promise.resolve(callback()).then(resolve, reject)
      } catch (err) {
        reject(err)
      }
    }
    const delay = options.delay ?? 0
    if (options.priority === 'background' && 'requestIdleCallback' in globalThis && delay === 0) {
      ;(globalThis as any).requestIdleCallback(run, { timeout: 5000 })
    } else if (delay > 0) {
      setTimeout(run, delay)
    } else {
      // Microtask + macrotask hop so the caller's stack unwinds first.
      Promise.resolve().then(() => setTimeout(run, 0))
    }
  })
}

// Convenience: yield the main thread without scheduling new work.
// Use inside long loops (e.g. "for each item: do stuff; await yieldToMain()").
export function yieldToMain(): Promise<void> {
  const scheduler = getScheduler()
  if (scheduler && typeof (scheduler as any).yield === 'function') {
    return (scheduler as any).yield()
  }
  return new Promise<void>((resolve) => setTimeout(resolve, 0))
}
