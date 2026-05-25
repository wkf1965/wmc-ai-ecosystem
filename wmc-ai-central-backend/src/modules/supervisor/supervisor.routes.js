const express = require('express')
const { requireAuth } = require('../../shared/middleware/auth.middleware')
const { supervisorOrAbove } = require('../../shared/middleware/role.middleware')
const { getEscalationQueue, getPendingRefreshes } = require('../../shared/state/dashboard-state')
const { getAuditLogs } = require('../../shared/utils/audit-logger')

const router = express.Router()

/** GET /api/v1/supervisor — module info */
router.get('/', requireAuth, supervisorOrAbove, (_req, res) => {
  res.json({
    module:  'supervisor',
    status:  'active',
    description: 'Supervisor command-center endpoints',
    endpoints: [
      'GET /api/v1/supervisor/escalation-queue',
      'GET /api/v1/supervisor/recent-activity',
    ],
  })
})

/**
 * GET /api/v1/supervisor/escalation-queue
 * Returns the live in-process escalation queue and pending dashboard refreshes.
 * Populated by DOCTOR_ESCALATION_TRIGGERED events via the event bus.
 */
router.get('/escalation-queue', requireAuth, supervisorOrAbove, (req, res) => {
  try {
    const limit = Number(req.query.limit ?? 20)
    const escalations = getEscalationQueue(limit)
    const refreshes   = getPendingRefreshes(limit)

    res.json({
      totalEscalations: escalations.length,
      escalationQueue:  escalations,
      pendingRefreshes: refreshes,
      timestamp: new Date().toISOString(),
      source: 'in-memory',
      mock:   true,
    })
  } catch (err) {
    console.error('[supervisor/escalation-queue]', err)
    res.status(500).json({ error: 'Failed to retrieve escalation queue' })
  }
})

/**
 * GET /api/v1/supervisor/recent-activity
 * Latest audit log entries for shift monitoring.
 */
router.get('/recent-activity', requireAuth, supervisorOrAbove, (req, res) => {
  try {
    const limit  = Math.min(Number(req.query.limit ?? 20), 100)
    const module = req.query.module

    const logs = getAuditLogs({ module, limit })

    res.json({
      count:    logs.length,
      activity: logs,
      source:   'mock',
      mock:     true,
    })
  } catch (err) {
    console.error('[supervisor/recent-activity]', err)
    res.status(500).json({ error: 'Failed to retrieve recent activity' })
  }
})

module.exports = router
