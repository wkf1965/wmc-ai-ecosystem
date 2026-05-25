const medicineService = require('./medicine.service')
const { logAuditEvent, AUDIT_ACTIONS } = require('../../shared/utils/audit-logger')

const medicineController = {
  async getAll(req, res) {
    try {
      const result = medicineService.getRecords({
        patientId:    req.query.patientId,
        status:       req.query.status,
        medicineName: req.query.medicineName,
        limit:        req.query.limit,
      })
      res.json(result)
    } catch (err) {
      console.error('[medicine GET]', err)
      res.status(500).json({ error: 'Failed to fetch medication records' })
    }
  },

  async getSchedules(req, res) {
    try {
      const result = medicineService.getSchedules({ patientId: req.query.patientId })
      res.json(result)
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch schedules' })
    }
  },

  async getPending(req, res) {
    try {
      const result = medicineService.getPendingMedications()
      res.json(result)
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch pending medications' })
    }
  },

  async getSummary(_req, res) {
    try {
      const result = medicineService.getMedicineSummary()
      res.json(result)
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch medicine summary' })
    }
  },

  async giveMedication(req, res) {
    try {
      const result = medicineService.giveMedication(req.body ?? {})

      logAuditEvent(req, {
        action:      AUDIT_ACTIONS.CREATE_NURSING_RECORD,
        module:      'medicine',
        targetId:    result.record.patientId,
        targetType:  'Patient',
        description: `${result.record.medicineName} ${result.record.dosage ?? ''} given to patient ${result.record.patientName ?? result.record.patientId} by ${result.record.givenBy}`,
      })

      res.status(201).json(result)
    } catch (err) {
      const status = err.status ?? 500
      res.status(status).json({ error: err.message ?? 'Failed to record medication' })
    }
  },
}

module.exports = { medicineController }
