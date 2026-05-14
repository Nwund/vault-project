// File: src/main/services/ai-intelligence/tpdb-face-importer.ts
//
// "Bootstrap a performer face cluster from TpDB photos" (#23). Pairs
// with the StashDB importer (#24); both delegate to the shared
// photo-face-clusterer pipeline.

import type { DB } from '../../db'

export interface TpDBFaceImportRequest {
  performerName: string
  performerId?: string
  maxPhotos?: number
}

export interface TpDBFaceImportResult {
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

export async function importTpDBPerformerFaces(
  db: DB,
  req: TpDBFaceImportRequest
): Promise<TpDBFaceImportResult> {
  const name = req.performerName.trim().toLowerCase()
  const base: TpDBFaceImportResult = {
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

  const { getTpDBClient } = await import('./tpdb-client')
  const client = await getTpDBClient()
  if (!client) {
    base.error = 'TpDB API key not configured'
    return base
  }

  let performerId = req.performerId
  if (!performerId) {
    const candidates = await client.searchPerformers(name, 5)
    const match = candidates.find((p) => p.name?.toLowerCase() === name) ?? candidates[0]
    if (!match) {
      base.error = `No TpDB performer named "${name}"`
      return base
    }
    performerId = match.id
  }
  base.performerId = performerId!

  const urls = await client.getPerformerImageUrls(performerId!)
  if (urls.length === 0) {
    base.error = 'TpDB has no photos for this performer'
    return base
  }

  const { clusterPhotosIntoFaceCluster } = await import('./photo-face-clusterer')
  const clustered = await clusterPhotosIntoFaceCluster(db, {
    performerName: name,
    photoUrls: urls,
    maxPhotos: req.maxPhotos,
    sourceTag: 'tpdb',
  })
  return {
    ...clustered,
    performerName: name,
    performerId,
  }
}
