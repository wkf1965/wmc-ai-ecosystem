const patientService = require('./patient.service')
const { logAuditEvent, AUDIT_ACTIONS } = require('../../shared/utils/audit-logger')
const { emitEvent }  = require('../../core/events/event-bus')
const { EVENT_TYPES } = require('../../core/events/event-types')

// Note: CREATE_PATIENT audit is written by the PATIENT_CREATED event listener.
// VIEW_PATIENT audit is written directly here (no event needed for reads).

const patientController = {
  async list(req, res) {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : undefined
      const result = await patientService.listPatients({
        status: req.query.status,
        search: req.query.search,
        limit,
      })
      res.json(result)
    } catch (err) {
      console.error('[patients GET]', err)
      res.status(500).json({ error: 'Failed to list patients' })
    }
  },

  async getById(req, res) {
    try {
      const result = await patientService.getPatientById(req.params.id)
      if (!result.patient) {
        return res.status(404).json({ error: 'Patient not found', mock: true })
      }

      logAuditEvent(req, {
        action:      AUDIT_ACTIONS.VIEW_PATIENT,
        module:      'patients',
        targetId:    req.params.id,
        targetType:  'Patient',
        description: `Patient record ${req.params.id} viewed`,
      })

      res.json(result)
    } catch (err) {
      console.error('[patients GET :id]', err)
      res.status(500).json({ error: 'Failed to fetch patient' })
    }
  },

  async create(req, res) {
    try {
      const {
        patientId,
        fullName,
        gender,
        age,
        diagnosis,
        roomNumber,
        mobilityStatus,
        fallRiskLevel,
        phone,
        mrn,
      } = req.body ?? {}

      // Validation
      if (!fullName || !String(fullName).trim()) {
        return res.status(400).json({ error: 'fullName is required' })
      }
      if (!age || isNaN(Number(age)) || Number(age) <= 0) {
        return res.status(400).json({ error: 'age must be a positive number' })
      }

      const input = {
        mrn:            mrn ?? patientId ?? `MRN-${Date.now()}`,
        fullName:       String(fullName).trim(),
        gender:         gender ?? 'unknown',
        age:            Number(age),
        diagnosis:      diagnosis ? String(diagnosis).trim() : null,
        roomNumber:     roomNumber ? String(roomNumber).trim() : null,
        mobilityStatus: mobilityStatus ?? 'unknown',
        fallRiskLevel:  fallRiskLevel ?? 'low',
        phone:          phone ?? null,
        status:         'active',
      }

      const result = await patientService.createPatient(input)

      // Emit event — the PATIENT_CREATED listener writes the audit entry
      emitEvent(EVENT_TYPES.PATIENT_CREATED, {
        patientId:  result.patient.id,
        fullName:   result.patient.fullName,
        userId:     req.user?.id ?? null,
        userRole:   req.user?.role ?? 'admin',
        userName:   req.user?.fullName,
        ipAddress:  req.ip,
      })

      res.status(201).json(result)
    } catch (err) {
      console.error('[patients POST]', err)
      res.status(500).json({ error: 'Failed to create patient' })
    }
  },
}

module.exports = { patientController }
