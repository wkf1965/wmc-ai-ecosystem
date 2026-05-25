const express = require('express')
const healthRoutes = require('../modules/health/health.routes')
const { createV1Router } = require('./v1')

function createApiRouter() {
  const router = express.Router()

  /** Legacy /api/health — keep for backwards compatibility */
  router.use('/health', healthRoutes)

  /** Versioned API gateway — all modules live under /api/v1 */
  router.use('/v1', createV1Router())

  return router
}

module.exports = { createApiRouter }
