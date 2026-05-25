const roomsService = require('./rooms.service')
const { emitEvent } = require('../../core/events/event-bus')
const { EVENT_TYPES } = require('../../core/events/event-types')

const roomsController = {
  async getRooms(req, res) {
    try {
      const result = roomsService.getRooms({
        ward:   req.query.ward,
        status: req.query.status,
      })
      res.json(result)
    } catch (err) {
      console.error('[rooms GET]', err)
      res.status(500).json({ error: 'Failed to fetch rooms' })
    }
  },

  async getAssignments(req, res) {
    try {
      const result = roomsService.getAssignments({
        patientId:  req.query.patientId,
        roomNumber: req.query.roomNumber,
      })
      res.json(result)
    } catch (err) {
      console.error('[rooms GET /assignments]', err)
      res.status(500).json({ error: 'Failed to fetch assignments' })
    }
  },

  async assignRoom(req, res) {
    try {
      const result = roomsService.assignPatientToRoom(req.body ?? {})

      emitEvent(EVENT_TYPES.PATIENT_UPDATED, {
        patientId:  result.assignment.patientId,
        roomNumber: result.assignment.roomNumber,
        userId:     req.user?.id,
        userRole:   req.user?.role ?? 'admin',
        ipAddress:  req.ip,
      })

      res.status(201).json(result)
    } catch (err) {
      const status = err.status ?? 500
      res.status(status).json({ error: err.message ?? 'Failed to assign room' })
    }
  },
}

module.exports = { roomsController }
