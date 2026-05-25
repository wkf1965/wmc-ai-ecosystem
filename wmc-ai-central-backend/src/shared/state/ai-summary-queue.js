/**
 * AI Summary Queue — lightweight in-memory job queue stub.
 *
 * Collects triggers for AI summary generation.
 * In production: replaced by Redis BullMQ or RabbitMQ queue.
 *
 * Consumed by:
 *   - GET /api/v1/ai-summary/queue (admin view)
 *   - AI Summary Engine worker (future)
 */

/** @type {Array<{id:string, trigger:string, module:string, patientId?:string, handoverId?:string, priority:string, queuedAt:string, processed:boolean}>} */
const jobQueue = []
const MAX_JOBS = 200
let _jobSeq = 1

function enqueue(job) {
  const entry = {
    id:        `job-${String(_jobSeq++).padStart(5, '0')}`,
    trigger:   job.trigger,
    module:    job.module,
    patientId: job.patientId ?? null,
    handoverId: job.handoverId ?? null,
    priority:  job.priority ?? 'normal',
    queuedAt:  new Date().toISOString(),
    processed: false,
  }
  jobQueue.unshift(entry)
  if (jobQueue.length > MAX_JOBS) jobQueue.pop()
  console.info(`[AI-Queue] Job ${entry.id} enqueued — trigger: ${entry.trigger}`)
  return entry
}

function getPending(limit = 20) {
  return jobQueue.filter((j) => !j.processed).slice(0, limit)
}

function getAll(limit = 50) {
  return jobQueue.slice(0, limit)
}

function markProcessed(id) {
  const job = jobQueue.find((j) => j.id === id)
  if (job) job.processed = true
  return job ?? null
}

module.exports = { enqueue, getPending, getAll, markProcessed }
