const express = require('express')
const { getEventLog } = require('../../core/events/event-bus')
const { EVENT_TYPES, EVENT_GROUPS } = require('../../core/events/event-types')
const { requireAuth } = require('../../shared/middleware/auth.middleware')
const { supervisorOrAbove } = require('../../shared/middleware/role.middleware')
const { getPendingRefreshes, getEscalationQueue } = require('../../shared/state/dashboard-state')
const { getPending: getPendingAiJobs, getAll: getAllAiJobs } = require('../../shared/state/ai-summary-queue')

const router = express.Router()

/** GET /api/v1/events — module info */
router.get('/', (_req, res) => {
  res.json({
    module:      'events',
    status:      'active',
    description: 'WMC AI internal event bus — Node EventEmitter (Redis-ready)',
    totalEventTypes: Object.keys(EVENT_TYPES).length,
    groups:      EVENT_GROUPS,
  })
})

/** GET /api/v1/events/recent — recent emitted events (admin/supervisor) */
router.get('/recent', requireAuth, supervisorOrAbove, (req, res) => {
  const logs = getEventLog({
    type:  req.query.type,
    limit: req.query.limit,
  })
  res.json({
    count: logs.length,
    events: logs,
    source: 'in-memory',
    mock:   true,
  })
})

/** GET /api/v1/events/types — all registered event type constants */
router.get('/types', requireAuth, supervisorOrAbove, (_req, res) => {
  res.json({
    total:  Object.keys(EVENT_TYPES).length,
    groups: EVENT_GROUPS,
    types:  EVENT_TYPES,
  })
})

/** GET /api/v1/events/dashboard-state — pending refreshes + escalation queue */
router.get('/dashboard-state', requireAuth, supervisorOrAbove, (req, res) => {
  res.json({
    pendingRefreshes: getPendingRefreshes(Number(req.query.limit ?? 20)),
    escalationQueue:  getEscalationQueue(Number(req.query.limit ?? 20)),
    source: 'in-memory',
    mock:   true,
  })
})

/** GET /api/v1/events/ai-queue — AI summary job queue */
router.get('/ai-queue', requireAuth, supervisorOrAbove, (req, res) => {
  res.json({
    pending: getPendingAiJobs(20),
    all:     getAllAiJobs(50),
    source:  'in-memory',
    mock:    true,
  })
})

module.exports = router
