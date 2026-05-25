const express = require('express')
const { requireAuth } = require('../../shared/middleware/auth.middleware')
const { rehabTeam } = require('../../shared/middleware/role.middleware')

const router = express.Router()

/** GET /api/v1/rehab — public stub info */
router.get('/', (_req, res) => {
  res.json({
    module:  'rehab',
    status:  'stub',
    message: 'Rehabilitation module — Prisma implementation pending',
    plannedEndpoints: [
      'GET  /api/v1/rehab/progress    [therapist, supervisor, admin]',
      'POST /api/v1/rehab/progress    [therapist, supervisor, admin]',
      'GET  /api/v1/rehab/progress/:id',
      'GET  /api/v1/rehab/sessions',
    ],
    mock: true,
  })
})

/**
 * GET /api/v1/rehab/protected-example
 * Demonstrates therapist/supervisor/admin guard.
 */
router.get('/protected-example', requireAuth, rehabTeam, (req, res) => {
  res.json({
    route:      '/rehab/protected-example',
    access:     'therapist, supervisor, admin',
    callerRole: req.user.role,
    caller:     req.user.fullName,
    message:    'You have rehab access',
    mock:       true,
  })
})

module.exports = router
