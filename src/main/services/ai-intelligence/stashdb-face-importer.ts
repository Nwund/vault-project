// File: src/main/services/ai-intelligence/stashdb-face-importer.ts
//
// "Bootstrap a performer face cluster from StashDB photos" (#24).
// Pairs with the TpDB importer (#23) — same workflow, different
// metadata source. StashDB tends to have higher-quality editorial
// data (community-moderated) but smaller coverage than TpDB,
// especially for indie / cam / OnlyFans-style performers.
//
// Reuses the shared photo-face-clusterer pipeline so any future
// "import faces from X" importer drops in via the same shape.

import type { DB } from '../../db'

export interface StashDBFaceImportRequest {
  /** Performer name (lowercase canonical). */
  performerName: string
  /** StashDB performer id when already known. */
  performerId?: string
  /** Cap photos processed (default 12). */
  maxPhotos?: number
}

export interface StashDBFaceImportResult {
  ok: boolean
  error?: string
  performerName: string
  performerId?: string
  photosFetched: number
  photosWithFace: number
  embeddingsExtracted: number
  clusterId?: string
  clusterCreated?: boolean
  warnings: string[]
}

export async function importStashDBPerformerFaces(
  db: DB,
  req: StashDBFaceImportRequest
): Promise<StashDBFaceImportResult> {
  const name = req.performerName.trim().toLowerCase()
  const base: StashDBFaceImportResult = {
    ok: false,
    performerName: name,
    photosFetched: 0,
    photosWithFace: 0,
    embeddingsExtracted: 0,
    warnings: [],
  }
  if (!name) {
    base.error = 'performerName required'
    return base
  }

  const { getStashDBClient } = await import('./stashdb-client')
  const client = await getStashDBClient()
  if (!client) {
    base.error = 'StashDB API key not configured'
    return base
  }

  // Resolve performer id.
  let performerId = req.performerId
  if (!performerId) {
    const candidates = await client.searchPerformers(name, 5)
    const match = candidates.find((p) => p.name?.toLowerCase() === name)
      ?? candidates.find((p) => (p.aliases ?? []).some((a) => a.toLowerCase() === name))
      ?? candidates[0]
    if (!match) {
      base.error = `No StashDB performer named "${name}"`
      return base
    }
    performerId = match.id
  }
  base.performerId = performerId!

  // Fetch image URLs.
  const urls = await client.getPerformerImageUrls(performerId!)
  if (urls.length === 0) {
    base.error = 'StashDB has no photos for this performer'
    return base
  }

  const { clusterPhotosIntoFaceCluster } = await import('./photo-face-clusterer')
  const clustered = await clusterPhotosIntoFaceCluster(db, {
    performerName: name,
    photoUrls: urls,
    maxPhotos: req.maxPhotos,
    sourceTag: 'stashdb',
  })
  return {
    ...clustered,
    performerName: name,
    performerId,
  }
}
