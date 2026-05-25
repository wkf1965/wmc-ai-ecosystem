const notificationService = require('./notification.service')

const notificationController = {
  async send(req, res) {
    try {
      const errors = notificationService.validateSendInput(req.body)
      if (errors.length > 0) {
        res.status(400).json({ error: 'Validation failed', details: errors })
        return
      }

      const { channel, target, type, message } = req.body
      const entry = await notificationService.sendNotification({
        channel,
        target,
        type,
        message,
      })

      const body = notificationService.toPublicResponse(entry)
      const statusCode = entry.status === 'failed' ? 502 : 201
      res.status(statusCode).json(body)
    } catch (err) {
      console.error('[notifications/send]', err)
      res.status(500).json({ error: 'Failed to send notification' })
    }
  },

  async list(req, res) {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : undefined
      const result = await notificationService.listNotifications({
        channel: req.query.channel,
        status: req.query.status,
        limit,
      })
      res.json(result)
    } catch (err) {
      console.error('[notifications GET]', err)
      res.status(500).json({ error: 'Failed to list notifications' })
    }
  },

  getLogs(req, res) {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : undefined
      const result = notificationService.getNotificationLogs({
        channel: req.query.channel,
        status: req.query.status,
        limit,
      })

      res.json({
        total: result.total,
        count: result.count,
        logs: result.logs.map(notificationService.toPublicResponse),
      })
    } catch (err) {
      console.error('[notifications/logs]', err)
      res.status(500).json({ error: 'Failed to fetch notification logs' })
    }
  },
}

module.exports = { notificationController }
