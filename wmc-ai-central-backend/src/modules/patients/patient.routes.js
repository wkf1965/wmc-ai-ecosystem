const express = require('express')
const { patientController } = require('./patient.controller')

const router = express.Router()

router.get('/',    (req, res) => patientController.list(req, res))
router.post('/',   (req, res) => patientController.create(req, res))
router.get('/:id', (req, res) => patientController.getById(req, res))

module.exports = router
