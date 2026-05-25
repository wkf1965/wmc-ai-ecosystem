const express = require('express')
const cors = require('cors')
const { config } = require('./config/env')
const { createApiRouter } = require('./routes')
const { createPgApiRouter } = require('./routes-pg')
const { errorHandler } = require('./shared/middleware/error-handler')
const { notFound } = require('./shared/middleware/not-found')

function createApp() {
  const app = express()

  app.use(cors())
  app.use(express.json())

  // Stage 4: direct PostgreSQL routes at /api/* (no /v1 prefix)
  // These sit before the v1 router so /api/patients etc. are matched first.
  app.use('/api', createPgApiRouter())

  // Existing Prisma + mock routes at /api/v1/*
  app.use(config.apiPrefix, createApiRouter())

  app.use(notFound)
  app.use(errorHandler)

  return app
}

module.exports = { createApp }
