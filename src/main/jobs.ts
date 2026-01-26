import type { DB } from './db'

export type JobHandler = (db: DB, payload: any) => Promise<void>
export type JobRegistry = Record<string, JobHandler>

export function startJobRunner(db: DB, registry: JobRegistry, onTick?: () => void) {
  let stopped = false
  let running = false

  async function tick() {
    if (stopped || running) return
    running = true
    try {
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
        db.markJobError(job.id, String(e?.message ?? e))
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
