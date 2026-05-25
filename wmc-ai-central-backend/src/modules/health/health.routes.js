const express = require('express')

const router = express.Router()

router.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'WMC AI Central Backend',
    message: 'Central backend is running',
  })
})

module.exports = router
