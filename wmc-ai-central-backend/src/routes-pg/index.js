/**
 * Stage 4 — direct pg route index.
 * Mounts at /api/* (no /v1 prefix) so these are clean, flat endpoints.
 *
 * Route map:
 *   GET/POST  /api/patients
 *   GET/POST  /api/nursing/records
 *   GET/POST  /api/side-turning
 *   GET/POST  /api/ot
 *   GET/POST  /api/rehab/progress
 *   GET/POST  /api/crm/leads
 *   GET/POST  /api/ai/memory
 *   GET       /api/dashboard
 */
const express = require('express')

const patientsRouter    = require('./patients')
const nursingRouter     = require('./nursing')
const sideTurningRouter = require('./side-turning')
const otRouter          = require('./ot')
const rehabRouter       = require('./rehab')
const crmRouter         = require('./crm')
const aiMemoryRouter    = require('./ai-memory')
const dashboardRouter   = require('./dashboard')

function createPgApiRouter() {
  const router = express.Router()

  router.use('/patients',     patientsRouter)
  router.use('/nursing',      nursingRouter)
  router.use('/side-turning', sideTurningRouter)
  router.use('/ot',           otRouter)
  router.use('/rehab',        rehabRouter)
  router.use('/crm',          crmRouter)
  router.use('/ai',           aiMemoryRouter)
  router.use('/dashboard',    dashboardRouter)

  /** GET /api — Stage 4 endpoint manifest */
  router.get('/', (_req, res) => {
    res.json({
      layer:   'Stage 4 — Direct PostgreSQL API',
      version: '1.0.0',
      baseUrl: '/api',
      endpoints: [
        { method: 'GET',  path: '/api/patients'        },
        { method: 'POST', path: '/api/patients'        },
        { method: 'GET',  path: '/api/nursing/records' },
        { method: 'POST', path: '/api/nursing/records' },
        { method: 'GET',  path: '/api/side-turning'    },
        { method: 'POST', path: '/api/side-turning'    },
        { method: 'GET',  path: '/api/ot'              },
        { method: 'POST', path: '/api/ot'              },
        { method: 'GET',  path: '/api/rehab/progress'  },
        { method: 'POST', path: '/api/rehab/progress'  },
        { method: 'GET',  path: '/api/crm/leads'       },
        { method: 'POST', path: '/api/crm/leads'       },
        { method: 'GET',  path: '/api/ai/memory'       },
        { method: 'POST', path: '/api/ai/memory'       },
        { method: 'GET',  path: '/api/dashboard'       },
      ],
    })
  })

  return router
}

module.exports = { createPgApiRouter }
