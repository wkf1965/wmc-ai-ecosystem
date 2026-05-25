const express = require('express')
const { roomsController } = require('./rooms.controller')

const router = express.Router()

/** GET /api/v1/rooms — all rooms + occupancy summary */
router.get('/',            (req, res) => roomsController.getRooms(req, res))

/** GET /api/v1/rooms/assignments — active patient assignments */
router.get('/assignments', (req, res) => roomsController.getAssignments(req, res))

/** POST /api/v1/rooms/assign — assign patient to room */
router.post('/assign',     (req, res) => roomsController.assignRoom(req, res))

module.exports = router
