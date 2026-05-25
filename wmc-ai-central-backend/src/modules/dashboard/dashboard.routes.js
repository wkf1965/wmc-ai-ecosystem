const express = require('express')
const { requireAuth } = require('../../shared/middleware/auth.middleware')
const { adminOnly, supervisorOrAbove } = require('../../shared/middleware/role.middleware')
const { getPendingRefreshes, getEscalationQueue } = require('../../shared/state/dashboard-state')

const router = express.Router()

/** GET /api/v1/dashboard — public module info */
router.get('/', (_req, res) => {
  res.json({
    module:  'dashboard',
    status:  'active',
    message: 'Dashboard module — command center aggregation',
    endpoints: [
      'GET /api/v1/dashboard/summary         [admin, supervisor]',
      'GET /api/v1/dashboard/admin           [admin]',
      'GET /api/v1/dashboard/command-center  [admin, supervisor]',
    ],
    mock: true,
  })
})

/**
 * GET /api/v1/dashboard/summary
 * Aggregated facility snapshot — used by frontend dashboard.
 */
router.get('/summary', requireAuth, supervisorOrAbove, async (_req, res) => {
  try {
    const patientRepo = require('../../repositories/patient.repository')
    const alertRepo   = require('../../repositories/alert.repository')
    const taskRepo    = require('../../repositories/task.repository')

    const [{ data: patients }, { data: alerts }, { data: tasks }] = await Promise.all([
      patientRepo.getAll({}),
      alertRepo.getAll({}),
      taskRepo.getAll({}),
    ])

    const highRisk     = patients.filter((p) => p.fallRiskLevel === 'high').length
    const openAlerts   = alerts.filter((a) => !a.resolved).length
    const pendingTasks = tasks.filter((t) => !t.completed).length
    const escalations  = getEscalationQueue(10)

    const facilityStatus =
      openAlerts > 5 ? 'High Alert'
      : highRisk > 2  ? 'Needs Attention'
      : 'Stable'

    res.json({
      facilityStatus,
      totalPatients:    patients.length,
      highRiskPatients: highRisk,
      openAlerts,
      pendingTasks,
      activeEscalations: escalations.length,
      escalations,
      pendingRefreshes:  getPendingRefreshes(5),
      timestamp: new Date().toISOString(),
      source: 'mock',
      mock: true,
    })
  } catch (err) {
    console.error('[dashboard/summary]', err)
    res.status(500).json({ error: 'Failed to build dashboard summary' })
  }
})

/**
 * GET /api/v1/dashboard/admin — admin-only overview.
 */
router.get('/admin', requireAuth, adminOnly, (_req, res) => {
  res.json({
    route:   '/dashboard/admin',
    access:  'admin only',
    message: 'Admin dashboard — stub placeholder',
    mock:    true,
  })
})

module.exports = router
