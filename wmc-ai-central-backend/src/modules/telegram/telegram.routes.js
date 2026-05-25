const express = require('express')
const { telegramController } = require('./telegram.controller')

const router = express.Router()

/** POST /api/v1/telegram/mock-message — simulate inbound bot command */
router.post('/mock-message', (req, res) => {
  telegramController.mockMessage(req, res)
})

/** GET /api/v1/telegram/logs — interaction history */
router.get('/logs', (req, res) => {
  telegramController.getLogs(req, res)
})

module.exports = router
