const express = require('express')
const { crmController } = require('./crm.controller')
const { requireAuth } = require('../../shared/middleware/auth.middleware')
const { crmTeam } = require('../../shared/middleware/role.middleware')

const router = express.Router()

router.post('/leads',    (req, res) => crmController.createLead(req, res))
router.get('/leads',     (req, res) => crmController.getLeads(req, res))

router.post('/appointments', (req, res) => crmController.createAppointment(req, res))
router.get('/appointments',  (req, res) => crmController.getAppointments(req, res))

router.get('/logs', (req, res) => crmController.getLogs(req, res))

/**
 * GET /api/v1/crm/protected-example
 * Demonstrates frontdesk/supervisor/admin guard.
 */
router.get('/protected-example', requireAuth, crmTeam, (req, res) => {
  res.json({
    route:      '/crm/protected-example',
    access:     'frontdesk, supervisor, admin',
    callerRole: req.user.role,
    caller:     req.user.fullName,
    message:    'You have CRM access',
    mock:       true,
  })
})

module.exports = router
