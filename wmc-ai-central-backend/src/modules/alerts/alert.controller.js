const alertService = require('./alert.service')
const { logAuditEvent, AUDIT_ACTIONS } = require('../../shared/utils/audit-logger')
const { emitEvent } = require('../../core/events/event-bus')
const { EVENT_TYPES } = require('../../core/events/event-types')

const alertController = {
  async list(req, res) {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : undefined
      const result = await alertService.listAlerts({
        status:    req.query.status,
        patientId: req.query.patientId,
        severity:  req.query.severity,
        limit,
      })
      res.json(result)
    } catch (err) {
      console.error('[alerts GET]', err)
      res.status(500).json({ error: 'Failed to list alerts' })
    }
  },

  async acknowledge(req, res) {
    try {
      const { id } = req.params

      emitEvent(EVENT_TYPES.ALERT_ACKNOWLEDGED, {
        alertId:   id,
        userId:    req.user?.id,
        userRole:  req.user?.role ?? 'nurse',
        userName:  req.user?.fullName,
        ipAddress: req.ip,
      })

      res.json({
        alertId:        id,
        acknowledged:   true,
        acknowledgedBy: req.user?.id ?? null,
        mock:           true,
      })
    } catch (err) {
      console.error('[alerts PATCH /acknowledge]', err)
      res.status(500).json({ error: 'Failed to acknowledge alert' })
    }
  },

  async escalate(req, res) {
    try {
      const { id } = req.params
      const { reason } = req.body ?? {}

      emitEvent(EVENT_TYPES.DOCTOR_ESCALATION_TRIGGERED, {
        alertId:         id,
        patientId:       req.body?.patientId ?? id,
        reason:          reason ?? 'Escalation requested',
        userId:          req.user?.id,
        userRole:        req.user?.role ?? 'doctor',
        userName:        req.user?.fullName,
        ipAddress:       req.ip,
        doctorChatId:    req.body?.doctorChatId,
        supervisorPhone: req.body?.supervisorPhone,
      })

      res.json({
        alertId:     id,
        escalated:   true,
        escalatedBy: req.user?.id ?? null,
        mock:        true,
      })
    } catch (err) {
      console.error('[alerts POST /escalate]', err)
      res.status(500).json({ error: 'Failed to escalate alert' })
    }
  },
}

module.exports = { alertController }
