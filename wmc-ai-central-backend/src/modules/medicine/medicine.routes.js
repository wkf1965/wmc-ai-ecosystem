const express = require('express')
const { medicineController } = require('./medicine.controller')

const router = express.Router()

/** GET /api/v1/medicine          — administration records */
router.get('/',           (req, res) => medicineController.getAll(req, res))

/** GET /api/v1/medicine/schedules — active prescriptions */
router.get('/schedules',  (req, res) => medicineController.getSchedules(req, res))

/** GET /api/v1/medicine/pending   — doses not yet given today */
router.get('/pending',    (req, res) => medicineController.getPending(req, res))

/** GET /api/v1/medicine/summary   — counts for dashboard card */
router.get('/summary',    (req, res) => medicineController.getSummary(req, res))

/** POST /api/v1/medicine/give     — record a dose given */
router.post('/give',      (req, res) => medicineController.giveMedication(req, res))

module.exports = router
