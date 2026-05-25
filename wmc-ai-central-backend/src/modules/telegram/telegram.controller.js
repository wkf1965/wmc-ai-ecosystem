const telegramService = require('./telegram.service')

const telegramController = {
  async mockMessage(req, res) {
    try {
      const errors = telegramService.validateMockMessageInput(req.body)
      if (errors.length > 0) {
        res.status(400).json({ error: 'Validation failed', details: errors })
        return
      }

      const result = await telegramService.processMockMessage(req.body)
      const statusCode = result.status === 'processed' ? 200 : 400
      res.status(statusCode).json(result)
    } catch (err) {
      console.error('[telegram/mock-message]', err)
      res.status(500).json({ error: 'Failed to process mock Telegram message' })
    }
  },

  getLogs(req, res) {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : undefined
      const result = telegramService.getTelegramLogs({
        user: req.query.user,
        command: req.query.command,
        limit,
      })
      res.json(result)
    } catch (err) {
      console.error('[telegram/logs]', err)
      res.status(500).json({ error: 'Failed to fetch Telegram logs' })
    }
  },
}

module.exports = { telegramController }
