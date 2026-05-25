const whatsappService = require('./whatsapp.service')

const whatsappController = {
  async mockSend(req, res) {
    try {
      const errors = whatsappService.validateMockSendInput(req.body)
      if (errors.length > 0) {
        res.status(400).json({ error: 'Validation failed', details: errors })
        return
      }

      const entry = await whatsappService.mockSend(req.body)
      const body = whatsappService.toPublicResponse(entry)
      const statusCode = entry.status === 'failed' ? 502 : 201
      res.status(statusCode).json(body)
    } catch (err) {
      console.error('[whatsapp/mock-send]', err)
      res.status(500).json({ error: 'Failed to send mock WhatsApp message' })
    }
  },

  getLogs(req, res) {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : undefined
      const result = whatsappService.getWhatsAppLogs({
        messageType: req.query.messageType,
        recipientType: req.query.recipientType,
        status: req.query.status,
        limit,
      })
      res.json(result)
    } catch (err) {
      console.error('[whatsapp/logs]', err)
      res.status(500).json({ error: 'Failed to fetch WhatsApp logs' })
    }
  },
}

module.exports = { whatsappController }
