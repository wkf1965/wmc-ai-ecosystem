import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import { config } from './config/env.js'
import { apiAuthMiddleware } from './middleware/apiAuth.middleware.js'
import { errorHandler } from './middleware/errorHandler.js'
import { authRouter } from './modules/auth/auth.routes.js'
import { patientsRouter } from './modules/patients/patients.routes.js'
import { crmRouter } from './modules/crm/crm.routes.js'
import { medicationRouter } from './modules/medication/medication.routes.js'
import { nurseShiftRouter } from './modules/nurseShift/nurseShift.routes.js'
import { nursingRouter } from './modules/nursing/nursing.routes.js'
import { rehabRouter } from './modules/rehabilitation/rehab.routes.js'
import { turningRouter } from './modules/turning/turning.routes.js'
import { vitalsRouter } from './modules/vitals/vitals.routes.js'
import { woundRouter } from './modules/wound/wound.routes.js'
import { familyRouter } from './modules/family/family.routes.js'
import { escalationRouter } from './modules/escalation/escalation.routes.js'
import { dashboardRouter } from './modules/dashboard/dashboard.routes.js'
import { tasksRouter } from './modules/tasks/tasks.routes.js'
import { remindersRouter } from './modules/reminders/reminders.routes.js'
import { announcementsRouter } from './modules/announcements/announcements.routes.js'
import { acknowledgementsRouter } from './modules/acknowledgements/acknowledgements.routes.js'
import { supervisorRouter } from './modules/supervisor/supervisor.routes.js'
import { nightShiftRouter } from './modules/nightShift/nightShift.routes.js'
import { incidentsRouter } from './modules/incidents/incident.routes.js'
import { aiRouter } from './modules/ai/ai.routes.js'
import { handoverRouter } from './modules/handover/handover.routes.js'
import { metaRouter } from './modules/meta/meta.routes.js'
import { riskRouter } from './modules/risk/risk.routes.js'
import { emergencyRouter } from './modules/emergency/emergency.routes.js'
import { commandCenterRouter } from './modules/commandCenter/commandCenter.routes.js'
import { reportsRouter } from './modules/reports/reports.routes.js'

export function createApp() {
  const app = express()
  app.use(helmet())
  app.use(cors({ origin: true, credentials: true }))
  app.use(express.json({ limit: '2mb' }))
  app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'))

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'wmc-ai-backend', env: config.nodeEnv })
  })

  const api = express.Router()
  api.use(apiAuthMiddleware)
  api.use(metaRouter)
  api.use('/auth', authRouter)
  api.use('/patients', patientsRouter)
  api.use('/crm', crmRouter)
  api.use('/nursing', nursingRouter)
  api.use('/nurse-shift', nurseShiftRouter)
  api.use('/medication', medicationRouter)
  api.use('/rehabilitation', rehabRouter)
  api.use('/rehab', rehabRouter)
  api.use('/ai', aiRouter)
  api.use('/handover', handoverRouter)
  api.use('/risk', riskRouter)
  api.use('/turning', turningRouter)
  api.use('/vitals', vitalsRouter)
  api.use('/wound', woundRouter)
  api.use('/family', familyRouter)
  api.use('/escalation', escalationRouter)
  api.use('/dashboard', dashboardRouter)
  api.use('/tasks', tasksRouter)
  api.use('/reminders', remindersRouter)
  api.use('/announcements', announcementsRouter)
  api.use('/acknowledgements', acknowledgementsRouter)
  api.use('/supervisor', supervisorRouter)
  api.use('/night-shift', nightShiftRouter)
  api.use('/incidents', incidentsRouter)
  api.use('/emergency', emergencyRouter)
  api.use('/command-center', commandCenterRouter)
  api.use('/reports', reportsRouter)

  app.use(config.apiPrefix, api)

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' })
  })

  app.use(errorHandler)

  return app
}
