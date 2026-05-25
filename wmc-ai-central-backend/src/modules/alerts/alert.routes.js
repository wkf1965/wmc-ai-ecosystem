const express = require('express')
const { alertController } = require('./alert.controller')
const { requireAuth } = require('../../shared/middleware/auth.middleware')
const { clinicalStaff } = require('../../shared/middleware/role.middleware')

const router = express.Router()

router.get('/', (req, res) => alertController.list(req, res))

/** PATCH /api/v1/alerts/:id/acknowledge — clinical staff only, audited */
router.patch('/:id/acknowledge', requireAuth, clinicalStaff, (req, res) =>
  alertController.acknowledge(req, res)
)

/** POST /api/v1/alerts/:id/escalate — doctor/supervisor/admin, audited */
router.post('/:id/escalate', requireAuth, clinicalStaff, (req, res) =>
  alertController.escalate(req, res)
)

module.exports = router
