import type { DB } from './db'

export type JobHandler = (db: DB, payload: any) => Promise<void>
export type JobRegistry = Record<string, JobHandler>

const MAX_RETRIES = 3

export function startJobRunner(db: DB, registry: JobRegistry, onTick?: () => void) {
  let stopped = false
  let running = false
  let tickCount = 0

  async function tick() {
    if (stopped || running) return
    running = true
    try {
      // Periodically recover stale running jobs (crash recovery)
      tickCount++
      if (tickCount % 100 === 0) {
        const recovered = db.resetStaleRunningJobs()
        if (recovered > 0) {
          console.log(`[Jobs] Recovered ${recovered} stale running job(s)`)
        }
      }

      const job = db.claimNextJob()
      if (!job) return
      db.markJobRunning(job.id)
      try {
        const payload = JSON.parse(job.payloadJson)
        const handler = registry[job.type]
        if (!handler) throw new Error(`No handler for job type: ${job.type}`)
        await handler(db, payload)
        db.markJobDone(job.id)
      } catch (e: any) {
        const payload = JSON.parse(job.payloadJson)
        const retryCount = payload._retryCount ?? 0

        if (retryCount < MAX_RETRIES) {
          // Re-enqueue with incremented retry count and lower priority
          const retryPayload = { ...payload, _retryCount: retryCount + 1 }
          const priority = Math.max(0, (job.priority ?? 0) - 1)
          db.enqueueJob(job.type, retryPayload, priority)
          db.markJobDone(job.id) // Mark original as done to avoid duplicate error entries
          console.warn(`[Jobs] Retrying job ${job.type} (attempt ${retryCount + 1}/${MAX_RETRIES}): ${e?.message ?? e}`)
        } else {
          db.markJobError(job.id, String(e?.message ?? e))
          // Mark media as permanently failed so it's hidden from listings
          if (job.type === 'media:analyze' && payload.mediaId) {
            db.markAnalyzeError(payload.mediaId)
          }
          console.error(`[Jobs] Job ${job.type} permanently failed after ${MAX_RETRIES} retries: ${e?.message ?? e}`)
        }
      } finally {
        onTick?.()
      }
    } finally {
      running = false
    }
  }

  const interval = setInterval(() => void tick(), 250)

  return {
    stop() {
      stopped = true
      clearInterval(interval)
    },
    poke() {
      void tick()
    }
  }
}
