import { readFileSync } from 'node:fs'
import path from 'node:path'
import { Router } from 'express'
import { config } from '../../config/env.js'

function readPackageVersion(): string {
  try {
    const pkgPath = path.join(process.cwd(), 'package.json')
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string }
    return pkg.version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
}

export const metaRouter = Router()

/** Service catalog — unauthenticated; use for tooling / smoke checks. */
metaRouter.get('/', (_req, res) => {
  res.json({
    service: 'wmc-ai-backend',
    version: readPackageVersion(),
    apiPrefix: config.apiPrefix,
    docs: {
      openapi: 'not yet (add OpenAPI / Swagger when stabilizing contracts)',
      readme: 'see docs/API.md',
    },
    modules: [
      { name: 'auth', base: `${config.apiPrefix}/auth`, routes: ['POST /login', 'GET /me'] },
      {
        name: 'patients',
        base: `${config.apiPrefix}/patients`,
        routes: ['GET /', 'POST /', 'GET /:id', 'PATCH /:id'],
      },
      {
        name: 'crm',
        base: `${config.apiPrefix}/crm`,
        routes: ['GET /leads', 'POST /leads', 'GET /leads/:id', 'PATCH /leads/:id'],
      },
      {
        name: 'nursing',
        base: `${config.apiPrefix}/nursing`,
        routes: [
          'GET,POST /daily-reports',
          'GET,POST /vitals',
          'GET,POST /records',
          'POST /quick-record',
          'GET,POST /medications',
          'GET,POST /alerts',
          'GET,POST /doctor-review-queue',
          'PATCH /doctor-review-queue/:id',
        ],
      },
      {
        name: 'nurse-shift',
        base: `${config.apiPrefix}/nurse-shift`,
        routes: ['POST /calculate-ot', 'GET /records'],
      },
      {
        name: 'vitals',
        base: `${config.apiPrefix}/vitals`,
        routes: ['POST /analyze'],
      },
      {
        name: 'wound',
        base: `${config.apiPrefix}/wound`,
        routes: ['POST /assessment', 'GET /assessments'],
      },
      {
        name: 'family',
        base: `${config.apiPrefix}/family`,
        routes: ['POST /update', 'GET /communication-queue'],
      },
      {
        name: 'escalation',
        base: `${config.apiPrefix}/escalation`,
        routes: ['POST /check'],
      },
      {
        name: 'dashboard',
        base: `${config.apiPrefix}/dashboard`,
        routes: ['GET /summary'],
      },
      {
        name: 'tasks',
        base: `${config.apiPrefix}/tasks`,
        routes: ['GET /queue'],
      },
      {
        name: 'reminders',
        base: `${config.apiPrefix}/reminders`,
        routes: ['POST /create', 'GET /list'],
      },
      {
        name: 'announcements',
        base: `${config.apiPrefix}/announcements`,
        routes: ['POST /create', 'GET /list', 'POST /acknowledge'],
      },
      {
        name: 'acknowledgements',
        base: `${config.apiPrefix}/acknowledgements`,
        routes: ['POST /confirm', 'GET /list'],
      },
      {
        name: 'supervisor',
        base: `${config.apiPrefix}/supervisor`,
        routes: ['GET /escalation-queue'],
      },
      {
        name: 'night-shift',
        base: `${config.apiPrefix}/night-shift`,
        routes: ['GET /monitor'],
      },
      {
        name: 'incidents',
        base: `${config.apiPrefix}/incidents`,
        routes: ['POST /report', 'GET /reports'],
      },
      {
        name: 'emergency',
        base: `${config.apiPrefix}/emergency`,
        routes: ['POST /respond'],
      },
      {
        name: 'command-center',
        base: `${config.apiPrefix}/command-center`,
        routes: ['GET /status'],
      },
      {
        name: 'reports',
        base: `${config.apiPrefix}/reports`,
        routes: ['GET /daily-facility'],
      },
      {
        name: 'rehabilitation',
        base: `${config.apiPrefix}/rehabilitation`,
        aliases: [`${config.apiPrefix}/rehab`],
        routes: ['GET,POST /sessions', 'GET /sessions/:id', 'PATCH /sessions/:id/ai-summary', 'POST /progress'],
      },
      {
        name: 'turning',
        base: `${config.apiPrefix}/turning`,
        routes: ['GET /records', 'POST /records'],
      },
      {
        name: 'handover',
        base: `${config.apiPrefix}/handover`,
        routes: ['POST /generate', 'GET /auto-generate'],
      },
      {
        name: 'risk',
        base: `${config.apiPrefix}/risk`,
        routes: ['POST /fall-score', 'POST /pressure-ulcer', 'POST /wandering', 'POST /bed-exit'],
      },
      {
        name: 'medication',
        base: `${config.apiPrefix}/medication`,
        routes: ['POST /check-alert'],
      },
      {
        name: 'ai',
        base: `${config.apiPrefix}/ai`,
        routes: [
          'POST /patient-summary',
          'POST /summary',
          'POST /classify-lead',
          'POST /follow-up-message',
          'POST /nursing-alert-summary',
          'POST /rehab-progress-report',
        ],
      },
    ],
  })
})
