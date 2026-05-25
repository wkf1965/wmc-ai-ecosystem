const crmService = require('./crm.service')

const crmController = {
  createLead(req, res) {
    try {
      const errors = crmService.validateLeadInput(req.body)
      if (errors.length > 0) {
        res.status(400).json({ error: 'Validation failed', details: errors })
        return
      }

      const { lead, followUpTask } = crmService.createLead(req.body)
      res.status(201).json({
        lead,
        followUpTask,
        message: 'Lead created with auto follow-up task',
        mock: true,
      })
    } catch (err) {
      console.error('[crm/leads POST]', err)
      res.status(500).json({ error: 'Failed to create lead' })
    }
  },

  getLeads(req, res) {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : undefined
      const result = crmService.listLeads({
        status: req.query.status,
        priority: req.query.priority,
        limit,
      })
      res.json(result)
    } catch (err) {
      console.error('[crm/leads GET]', err)
      res.status(500).json({ error: 'Failed to list leads' })
    }
  },

  createAppointment(req, res) {
    try {
      const errors = crmService.validateAppointmentInput(req.body)
      if (errors.length > 0) {
        res.status(400).json({ error: 'Validation failed', details: errors })
        return
      }

      const appointment = crmService.createAppointment(req.body)
      res.status(201).json({ appointment, mock: true })
    } catch (err) {
      console.error('[crm/appointments POST]', err)
      res.status(500).json({ error: 'Failed to create appointment' })
    }
  },

  getAppointments(req, res) {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : undefined
      const result = crmService.listAppointments({
        status: req.query.status,
        date: req.query.date,
        limit,
      })
      res.json(result)
    } catch (err) {
      console.error('[crm/appointments GET]', err)
      res.status(500).json({ error: 'Failed to list appointments' })
    }
  },

  getLogs(req, res) {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : undefined
      const result = crmService.getCrmLogs({
        entityType: req.query.entityType,
        limit,
      })
      res.json(result)
    } catch (err) {
      console.error('[crm/logs GET]', err)
      res.status(500).json({ error: 'Failed to fetch CRM logs' })
    }
  },
}

module.exports = { crmController }
