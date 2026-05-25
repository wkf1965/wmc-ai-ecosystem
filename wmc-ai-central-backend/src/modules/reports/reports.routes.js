const express = require('express')

const router = express.Router()

/** GET /api/v1/reports — module status + planned endpoints */
router.get('/', (_req, res) => {
  res.json({
    module: 'reports',
    status: 'stub',
    message: 'Reports module — SQL view aggregation pending',
    plannedEndpoints: [
      'GET /api/v1/reports/daily-facility',
      'GET /api/v1/reports/shift-handover',
      'GET /api/v1/reports/crm-pipeline',
      'GET /api/v1/reports/patient-census',
    ],
    mock: true,
  })
})

module.exports = router
