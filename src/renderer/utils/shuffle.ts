// File: src/renderer/utils/shuffle.ts
// Fisher-Yates shuffle algorithm - unbiased random shuffling

/**
 * Fisher-Yates (Knuth) shuffle algorithm
 * This is the correct way to shuffle an array - O(n) time, unbiased
 * The naive sort(() => Math.random() - 0.5) has statistical bias
 */
export function fisherYatesShuffle<T>(array: T[]): T[] {
  const result = [...array]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

/**
 * Shuffle and take the first n items
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

/**
 * Pick a random item from an array
 */
export function randomPick<T>(array: T[]): T | undefined {
  if (array.length === 0) return undefined
  return array[Math.floor(Math.random() * array.length)]
}

/**
 * Pick n random items from an array (without replacement)
 */
export function randomPickN<T>(array: T[], n: number): T[] {
  return shuffleTake(array, n)
}
