import type { Request, Response, NextFunction } from 'express'
import type { AuthPayload } from './auth.js'
import { authenticate } from './auth.js'
import { config } from '../config/env.js'

/**
 * Pathname relative to configured `API_PREFIX` (e.g. `/nursing/records`), no trailing slash
 * unless root. Handles full `originalUrl` and router `req.path` differences.
 */
export function normalizeApiRelativePath(req: Request): string {
  const pathname = req.originalUrl.split(/[?#]/)[0] || ''
  let p = pathname
  const prefix = config.apiPrefix.endsWith('/')
    ? config.apiPrefix.slice(0, -1)
    : config.apiPrefix
  if (p.startsWith(prefix)) {
    p = p.slice(prefix.length) || '/'
  }
  if (!p.startsWith('/')) {
    p = `/${p}`
  }
  if (p.length > 1 && p.endsWith('/')) {
    p = p.slice(0, -1)
  }
  return p
}

/**
 * Routes that skip real Bearer verification during local testing.
 * Keeps downstream `requireRoles` happy via a synthetic principal.
 */
const DEV_TESTING_ROUTES: ReadonlyArray<{ method: string; path: string }> = [
  { method: 'GET', path: '/patients' },
  { method: 'POST', path: '/patients' },
  { method: 'POST', path: '/crm/leads' },
  { method: 'GET', path: '/nursing/records' },
  { method: 'POST', path: '/nursing/records' },
  { method: 'POST', path: '/nursing/parse' },
  { method: 'POST', path: '/nursing/quick-record' },
  { method: 'POST', path: '/rehab/progress' },
  { method: 'POST', path: '/rehabilitation/progress' },
  { method: 'POST', path: '/ai/summary' },
  { method: 'POST', path: '/handover/generate' },
  { method: 'GET', path: '/handover/auto-generate' },
  { method: 'POST', path: '/risk/fall-score' },
  { method: 'POST', path: '/risk/pressure-ulcer' },
  { method: 'POST', path: '/risk/wandering' },
  { method: 'POST', path: '/risk/bed-exit' },
  { method: 'POST', path: '/medication/check-alert' },
  { method: 'GET', path: '/turning/records' },
  { method: 'POST', path: '/turning/records' },
  { method: 'POST', path: '/nurse-shift/calculate-ot' },
  { method: 'GET', path: '/nurse-shift/records' },
  { method: 'POST', path: '/vitals/analyze' },
  { method: 'POST', path: '/wound/assessment' },
  { method: 'GET', path: '/wound/assessments' },
  { method: 'POST', path: '/family/update' },
  { method: 'GET', path: '/family/communication-queue' },
  { method: 'POST', path: '/escalation/check' },
  { method: 'GET', path: '/dashboard' },
  { method: 'GET', path: '/dashboard/summary' },
  { method: 'GET', path: '/tasks/queue' },
  { method: 'POST', path: '/reminders/create' },
  { method: 'GET', path: '/reminders/list' },
  { method: 'POST', path: '/announcements/create' },
  { method: 'GET', path: '/announcements/list' },
  { method: 'POST', path: '/announcements/acknowledge' },
  { method: 'POST', path: '/acknowledgements/confirm' },
  { method: 'GET', path: '/acknowledgements/list' },
  { method: 'GET', path: '/supervisor/escalation-queue' },
  { method: 'GET', path: '/night-shift/monitor' },
  { method: 'POST', path: '/incidents/report' },
  { method: 'GET', path: '/incidents/reports' },
  { method: 'POST', path: '/emergency/respond' },
  { method: 'GET', path: '/command-center/status' },
  { method: 'GET', path: '/reports/daily-facility' },
  { method: 'POST', path: '/admin/clear-records' },
  { method: 'DELETE', path: '/admin/reset' },
  { method: 'DELETE', path: '/admin/reset-patients' },
]

const DEV_SYNTH_PRINCIPAL: AuthPayload = {
  sub: 'dev-bypass-synthetic-admin',
  email: 'dev-bypass@wmc.local',
  role: 'admin',
}

function isDevTestingRoute(req: Request): boolean {
  const rel = normalizeApiRelativePath(req)
  return DEV_TESTING_ROUTES.some((r) => r.method === req.method && rel === r.path)
}

/** Local dev: explicit `development`, or unset/empty (tsx without cross-env). Never in production/test. */
function isDevelopmentApiBypassEnabled(): boolean {
  const n = process.env.NODE_ENV
  if (n === 'production' || n === 'test') return false
  if (n === 'development') return true
  return n === undefined || n === ''
}

function isDevTestingRouteAndBypass(req: Request): boolean {
  if (!isDevelopmentApiBypassEnabled()) return false
  return isDevTestingRoute(req)
}

/**
 * Apply once on the `/api/v1` router: every route requires a Bearer token except
 * `GET /` (service catalog), `POST /auth/login`,
 * or (in development only) the allow-listed testing routes below.
 */
export function apiAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const rel = normalizeApiRelativePath(req)

  if (req.method === 'GET' && rel === '/') {
    return next()
  }
  if (req.method === 'POST' && rel === '/auth/login') {
    return next()
  }

  // Development-only API testing bypass (JWT / Bearer not required).
  if (isDevTestingRouteAndBypass(req)) {
    if (!req.auth) req.auth = { ...DEV_SYNTH_PRINCIPAL }
    return next()
  }

  void authenticate(req, res, next)
}