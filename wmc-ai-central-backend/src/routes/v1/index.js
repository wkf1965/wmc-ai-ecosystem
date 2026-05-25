const express = require('express')

// Auth, Users, Audit, Events & Supervisor
const authRoutes       = require('../../modules/auth/auth.routes')
const userRoutes       = require('../../modules/users/user.routes')
const auditRoutes      = require('../../modules/audit/audit.routes')
const eventsRoutes     = require('../../modules/events/events.routes')
const supervisorRoutes = require('../../modules/supervisor/supervisor.routes')

// Domain modules
const roomsRoutes        = require('../../modules/rooms/rooms.routes')
const medicineRoutes     = require('../../modules/medicine/medicine.routes')
const patientRoutes      = require('../../modules/patients/patient.routes')
const nursingRoutes      = require('../../modules/nursing/nursing.routes')
const rehabRoutes        = require('../../modules/rehabilitation/rehabilitation.routes')
const crmRoutes          = require('../../modules/crm/crm.routes')
const taskRoutes         = require('../../modules/tasks/task.routes')
const alertRoutes        = require('../../modules/alerts/alert.routes')
const notificationRoutes = require('../../modules/notifications/notification.routes')
const telegramRoutes     = require('../../modules/telegram/telegram.routes')
const whatsappRoutes     = require('../../modules/whatsapp/whatsapp.routes')
const dashboardRoutes    = require('../../modules/dashboard/dashboard.routes')
const aiSummaryRoutes    = require('../../modules/ai-summary/ai-summary.routes')
const reportsRoutes      = require('../../modules/reports/reports.routes')

const MODULES = [
  { name: 'auth',          path: '/auth',          status: 'active', description: 'Login, refresh, logout, /me'        },
  { name: 'users',         path: '/users',         status: 'active', description: 'User identity and roles'            },
  { name: 'audit',         path: '/audit',         status: 'active', description: 'Healthcare audit logs (admin/sup)'  },
  { name: 'events',        path: '/events',        status: 'active', description: 'Internal event bus log + state'       },
  { name: 'supervisor',    path: '/supervisor',    status: 'active', description: 'Escalation queue, recent activity'      },
  { name: 'rooms',         path: '/rooms',         status: 'active', description: 'Room assignment and bed tracking'   },
  { name: 'medicine',     path: '/medicine',      status: 'active', description: 'Medication administration records' },
  { name: 'patients',     path: '/patients',      status: 'active', description: 'Patient master records'            },
  { name: 'nursing',       path: '/nursing',       status: 'active', description: 'Nursing records, vitals, shifts' },
  { name: 'rehab',         path: '/rehab',         status: 'stub',   description: 'Rehabilitation progress'       },
  { name: 'crm',           path: '/crm',           status: 'active', description: 'CRM leads and appointments'    },
  { name: 'tasks',         path: '/tasks',         status: 'active', description: 'Cross-domain task queue'       },
  { name: 'alerts',        path: '/alerts',        status: 'active', description: 'Clinical and operational alerts' },
  { name: 'notifications', path: '/notifications', status: 'active', description: 'Outbound notification log'     },
  { name: 'telegram',      path: '/telegram',      status: 'active', description: 'Telegram bot mock bridge'      },
  { name: 'whatsapp',      path: '/whatsapp',      status: 'active', description: 'WhatsApp mock send'            },
  { name: 'dashboard',     path: '/dashboard',     status: 'stub',   description: 'Command center aggregation'    },
  { name: 'ai-summary',    path: '/ai-summary',    status: 'stub',   description: 'AI summary job engine'         },
  { name: 'reports',       path: '/reports',       status: 'stub',   description: 'Facility and shift reports'    },
]

function createV1Router() {
  const router = express.Router()

  /** GET /api/v1 — gateway info + module manifest */
  router.get('/', (_req, res) => {
    res.json({
      service:    'WMC AI Central Backend',
      version:    '1.0.0',
      apiVersion: 'v1',
      baseUrl:    '/api/v1',
      uptime:     Math.floor(process.uptime()),
      authMode:   process.env.AUTH_MODE ?? 'mock',
      modules:    MODULES,
    })
  })

  /** GET /api/v1/health — liveness check */
  router.get('/health', (_req, res) => {
    res.json({
      status:    'ok',
      service:   'WMC AI Central Backend',
      version:   '1.0.0',
      timestamp: new Date().toISOString(),
      uptime:    Math.floor(process.uptime()),
    })
  })

  // Auth, users, audit, events & supervisor
  router.use('/auth',          authRoutes)
  router.use('/users',         userRoutes)
  router.use('/audit',         auditRoutes)
  router.use('/events',        eventsRoutes)
  router.use('/supervisor',    supervisorRoutes)

  // Domain modules
  router.use('/rooms',         roomsRoutes)
  router.use('/medicine',      medicineRoutes)
  router.use('/patients',      patientRoutes)
  router.use('/nursing',       nursingRoutes)
  router.use('/rehab',         rehabRoutes)
  router.use('/crm',           crmRoutes)
  router.use('/tasks',         taskRoutes)
  router.use('/alerts',        alertRoutes)
  router.use('/notifications', notificationRoutes)
  router.use('/telegram',      telegramRoutes)
  router.use('/whatsapp',      whatsappRoutes)
  router.use('/dashboard',     dashboardRoutes)
  router.use('/ai-summary',    aiSummaryRoutes)
  router.use('/reports',       reportsRoutes)

  return router
}

module.exports = { createV1Router, MODULES }
