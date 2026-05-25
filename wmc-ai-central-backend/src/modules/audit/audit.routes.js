const express = require('express')
const { auditController } = require('./audit.controller')
const { requireAuth } = require('../../shared/middleware/auth.middleware')
const { supervisorOrAbove } = require('../../shared/middleware/role.middleware')

const router = express.Router()

/**
 * All audit routes require authentication.
 * Viewing logs requires at least supervisor role.
 */

/** GET /api/v1/audit/actions — list known action constants (admin/supervisor) */
router.get('/actions', requireAuth, supervisorOrAbove, (req, res) =>
  auditController.listActions(req, res)
)

/** GET /api/v1/audit/summary — aggregated stats (admin/supervisor) */
router.get('/summary', requireAuth, supervisorOrAbove, (req, res) =>
  auditController.getSummary(req, res)
)

/** GET /api/v1/audit/logs — full log list with filters (admin/supervisor) */
router.get('/logs', requireAuth, supervisorOrAbove, (req, res) =>
  auditController.listLogs(req, res)
)

module.exports = router
