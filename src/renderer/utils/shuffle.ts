// File: src/renderer/utils/shuffle.ts
// Fisher-Yates shuffle algorithm - unbiased random shuffling

/**
 * Shuffle and take the first n items
 * Uses partial Fisher-Yates - O(n) where n is count, unbiased
 * More efficient than shuffling entire array when you only need a subset
 */
export function shuffleTake<T>(array: T[], count: number): T[] {
  const result = [...array]
  const n = Math.min(count, result.length)

  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(Math.random() * (result.length - i))
    ;[result[i], result[j]] = [result[j], result[i]]
  }

  return result.slice(0, n)
}
