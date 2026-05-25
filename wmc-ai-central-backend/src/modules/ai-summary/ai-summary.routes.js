const express = require('express')

const router = express.Router()

/** GET /api/v1/ai-summary — module status + planned endpoints */
router.get('/', (_req, res) => {
  res.json({
    module: 'ai-summary',
    status: 'stub',
    message: 'AI Summary Engine — job queue and results pending',
    plannedEndpoints: [
      'POST /api/v1/ai-summary/jobs',
      'GET  /api/v1/ai-summary/jobs/:id',
      'GET  /api/v1/ai-summary/results',
      'GET  /api/v1/ai-summary/results/:patientId',
    ],
    mock: true,
  })
})

module.exports = router
