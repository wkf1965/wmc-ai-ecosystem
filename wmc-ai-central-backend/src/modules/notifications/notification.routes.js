const express = require('express')
const { notificationController } = require('./notification.controller')

const router = express.Router()

/** GET /api/v1/notifications — persisted notification entities (Prisma-ready) */
router.get('/', (req, res) => {
  notificationController.list(req, res)
})

/** POST /api/v1/notifications/send — mock Telegram / WhatsApp / dashboard send */
router.post('/send', (req, res) => {
  notificationController.send(req, res)
})

/** GET /api/v1/notifications/logs — in-memory notification history */
router.get('/logs', (req, res) => {
  notificationController.getLogs(req, res)
})

module.exports = router
