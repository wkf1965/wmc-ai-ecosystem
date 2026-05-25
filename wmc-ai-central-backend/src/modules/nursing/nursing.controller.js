const nursingService = require('./nursing.service')
const { logAuditEvent, AUDIT_ACTIONS } = require('../../shared/utils/audit-logger')
const { emitEvent } = require('../../core/events/event-bus')
const { EVENT_TYPES } = require('../../core/events/event-types')

const nursingController = {
  async listRecords(req, res) {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : undefined
      const result = await nursingService.listRecords({
        patientId: req.query.patientId,
        shift:     req.query.shift,
        limit,
      })

      logAuditEvent(req, {
        action:      AUDIT_ACTIONS.VIEW_NURSING_RECORD,
        module:      'nursing',
        targetId:    req.query.patientId ?? null,
        targetType:  'NursingRecord',
        description: `Nursing records listed (${result.count} records)`,
      })

      res.json(result)
    } catch (err) {
      console.error('[nursing GET /records]', err)
      res.status(500).json({ error: 'Failed to list nursing records' })
    }
  },

  async createRecord(req, res) {
    try {
      const {
        patientId,
        patientName,
        nurseName,
        bloodPressure,
        pulse,
        temperature,
        oxygen,
        painScore,
        appetite,
        mood,
        mobility,
        sideTurning,
        woundCondition,
        notes,
      } = req.body ?? {}

      if (!patientId || !String(patientId).trim()) {
        return res.status(400).json({ error: 'patientId is required' })
      }
      if (!nurseName || !String(nurseName).trim()) {
        return res.status(400).json({ error: 'nurseName is required' })
      }

      const input = {
        patientId:      String(patientId).trim(),
        patientName:    patientName ? String(patientName).trim() : null,
        nurseName:      String(nurseName).trim(),
        shiftDate:      new Date().toISOString().slice(0, 10),
        bloodPressure:  bloodPressure  ?? null,
        pulse:          pulse != null && pulse !== '' ? Number(pulse) : null,
        temperature:    temperature != null && temperature !== '' ? Number(temperature) : null,
        oxygen:         oxygen ?? null,
        painScore:      painScore != null && painScore !== '' ? Number(painScore) : null,
        appetite:       appetite ?? null,
        mood:           mood ?? null,
        mobility:       mobility ?? null,
        sideTurning:    sideTurning ?? null,
        woundCondition: woundCondition ?? null,
        notes:          notes ?? null,
        recordType:     'daily_report',
        status:         'active',
      }

      const result = await nursingService.createRecord(input)

      emitEvent(EVENT_TYPES.NURSING_RECORD_CREATED, {
        patientId,
        nurseName:   input.nurseName,
        recordId:    result.record.id,
        userId:      req.user?.id ?? null,
        userRole:    req.user?.role ?? 'nurse',
        userName:    req.user?.fullName,
        ipAddress:   req.ip,
      })

      res.status(201).json(result)
    } catch (err) {
      console.error('[nursing POST /records]', err)
      res.status(500).json({ error: 'Failed to create nursing record' })
    }
  },
}

module.exports = { nursingController }
