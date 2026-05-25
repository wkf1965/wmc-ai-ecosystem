const express = require('express')
const { nursingController } = require('./nursing.controller')
const { requireAuth } = require('../../shared/middleware/auth.middleware')
const { nursingTeam } = require('../../shared/middleware/role.middleware')

const router = express.Router()

router.get('/records',  (req, res) => nursingController.listRecords(req, res))
router.post('/records', requireAuth, nursingTeam, (req, res) => nursingController.createRecord(req, res))

router.get('/protected-example', requireAuth, nursingTeam, (req, res) => {
  res.json({
    route:      '/nursing/protected-example',
    access:     'nurse, supervisor, admin',
    callerRole: req.user.role,
    caller:     req.user.fullName,
    message:    'You have nursing access',
    mock:       true,
  })
})

module.exports = router
