/**
 * Dashboard state — lightweight in-memory signal store.
 *
 * Tracks which modules need a data refresh and holds the active escalation queue.
 * In production this would be replaced by Redis keys / WebSocket push.
 *
 * Consumed by:
 *   - GET /api/v1/dashboard (reads pending refreshes + escalations)
 *   - Event listeners (write signals on domain events)
 */

/** @type {Array<{module: string, targetId: string|null, at: string}>} */
const pendingRefreshes = []

/** @type {Array<{patientId: string, reason: string, triggeredBy: string, at: string}>} */
const escalationQueue = []

const MAX_ENTRIES = 100

function markRefreshNeeded(module, targetId = null) {
  pendingRefreshes.unshift({ module, targetId, at: new Date().toISOString() })
  if (pendingRefreshes.length > MAX_ENTRIES) pendingRefreshes.pop()
}

function addEscalation(entry) {
  escalationQueue.unshift({ ...entry, at: entry.at ?? new Date().toISOString() })
  if (escalationQueue.length > MAX_ENTRIES) escalationQueue.pop()
}

function getPendingRefreshes(limit = 20) {
  return pendingRefreshes.slice(0, limit)
}

function getEscalationQueue(limit = 20) {
  return escalationQueue.slice(0, limit)
}

function clearRefreshes() {
  pendingRefreshes.length = 0
}

module.exports = { markRefreshNeeded, addEscalation, getPendingRefreshes, getEscalationQueue, clearRefreshes }
