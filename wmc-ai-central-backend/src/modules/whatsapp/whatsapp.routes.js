const express = require('express')
const { whatsappController } = require('./whatsapp.controller')

const router = express.Router()

/** POST /api/v1/whatsapp/mock-send — simulate outbound WhatsApp message */
router.post('/mock-send', (req, res) => {
  whatsappController.mockSend(req, res)
})

/** GET /api/v1/whatsapp/logs — in-memory message history */
router.get('/logs', (req, res) => {
  whatsappController.getLogs(req, res)
})

module.exports = router
