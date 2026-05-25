/**
 * logAuditEvent — reusable audit helper
 *
 * Records a healthcare action to the audit store.
 * In mock mode: appends to in-memory AUDIT_STORE (seeded from MOCK_AUDIT_LOGS).
 * In production: writes to core.audit_logs via Prisma (wire up in audit.repository.js).
 *
 * Usage:
 *   const { logAuditEvent } = require('../../shared/utils/audit-logger')
 *
 *   await logAuditEvent(req, {
 *     action:      'CREATE_NURSING_RECORD',
 *     module:      'nursing',
 *     targetId:    patientId,
 *     targetType:  'Patient',
 *     description: `Nursing record created for patient ${patientId}`,
 *   })
 *
 * `req` is optional — when provided, userId/userRole/ipAddress are extracted automatically.
 * Pass a plain context object if calling from outside an Express handler.
 */

const { MOCK_AUDIT_LOGS } = require('../mocks/audit-mock-data')

/** Canonical action constants — import these in controllers/services */
const AUDIT_ACTIONS = Object.freeze({
  // Auth
  LOGIN:                    'LOGIN',
  LOGOUT:                   'LOGOUT',
  TOKEN_REFRESHED:          'TOKEN_REFRESHED',

  // Patients
  VIEW_PATIENT:             'VIEW_PATIENT',
  CREATE_PATIENT:           'CREATE_PATIENT',
  UPDATE_PATIENT:           'UPDATE_PATIENT',
  DISCHARGE_PATIENT:        'DISCHARGE_PATIENT',

  // Nursing
  CREATE_NURSING_RECORD:    'CREATE_NURSING_RECORD',
  UPDATE_NURSING_RECORD:    'UPDATE_NURSING_RECORD',
  VIEW_NURSING_RECORD:      'VIEW_NURSING_RECORD',

  // Rehab
  CREATE_REHAB_RECORD:      'CREATE_REHAB_RECORD',
  UPDATE_REHAB_RECORD:      'UPDATE_REHAB_RECORD',

  // Alerts
  CREATE_ALERT:             'CREATE_ALERT',
  ACKNOWLEDGE_ALERT:        'ACKNOWLEDGE_ALERT',
  ESCALATION_TRIGGERED:     'ESCALATION_TRIGGERED',

  // Tasks
  CREATE_TASK:              'CREATE_TASK',
  COMPLETE_TASK:            'COMPLETE_TASK',
  UPDATE_TASK:              'UPDATE_TASK',

  // Notifications
  SEND_FAMILY_UPDATE:       'SEND_FAMILY_UPDATE',
  SEND_NOTIFICATION:        'SEND_NOTIFICATION',

  // Handover
  CREATE_HANDOVER_LOG:      'CREATE_HANDOVER_LOG',

  // CRM
  CREATE_CRM_LEAD:          'CREATE_CRM_LEAD',
  UPDATE_CRM_LEAD:          'UPDATE_CRM_LEAD',
  BOOK_APPOINTMENT:         'BOOK_APPOINTMENT',

  // Admin
  VIEW_AUDIT_LOGS:          'VIEW_AUDIT_LOGS',
  DEACTIVATE_USER:          'DEACTIVATE_USER',
})

/**
 * In-memory audit store — append-only.
 * Seeded with MOCK_AUDIT_LOGS; grows at runtime.
 * Replace with Prisma write in production (audit.repository.js).
 */
const AUDIT_STORE = [...MOCK_AUDIT_LOGS]

let _counter = AUDIT_STORE.length + 1

/**
 * Extract caller context from an Express request object.
 * Falls back to anonymous when req is not provided.
 */
function extractContext(req) {
  if (!req) {
    return { userId: null, userRole: 'system', ipAddress: 'internal' }
  }
  return {
    userId:    req.user?.id       ?? null,
    userRole:  req.user?.role     ?? 'anonymous',
    ipAddress: req.ip
                ?? req.headers?.['x-forwarded-for']
                ?? 'unknown',
  }
}

/**
 * @typedef {Object} AuditEventInput
 * @property {string}       action      - One of AUDIT_ACTIONS or a custom string
 * @property {string}       module      - Module name (patients, nursing, auth …)
 * @property {string|null}  [targetId]  - Primary key of the affected record
 * @property {string}       [targetType]- Model name (Patient, NursingRecord …)
 * @property {string}       [description] - Human-readable summary
 * @property {string}       [userId]    - Override (auto-extracted from req.user)
 * @property {string}       [userRole]  - Override
 * @property {string}       [ipAddress] - Override
 */

/**
 * Log a single audit event.
 * @param {import('express').Request|null} req  Express request (or null)
 * @param {AuditEventInput} event
 * @returns {Object} The stored audit entry
 */
function logAuditEvent(req, event) {
  const ctx = extractContext(req)

  const entry = {
    id:          `aud-${String(_counter++).padStart(4, '0')}`,
    userId:      event.userId    ?? ctx.userId,
    userRole:    event.userRole  ?? ctx.userRole,
    action:      event.action,
    module:      event.module,
    targetId:    event.targetId  ?? null,
    targetType:  event.targetType ?? null,
    description: event.description ?? `${event.action} on ${event.module}`,
    ipAddress:   event.ipAddress ?? ctx.ipAddress,
    createdAt:   new Date().toISOString(),
    mock:        true,
  }

  AUDIT_STORE.push(entry)

  // Log to console in development for visibility
  if (process.env.NODE_ENV !== 'production') {
    console.info(
      `[AUDIT] ${entry.createdAt} | ${entry.userRole.padEnd(12)} | ${entry.action.padEnd(28)} | ${entry.module}/${entry.targetId ?? '-'}`
    )
  }

  return entry
}

/**
 * Returns a copy of the full audit store (read-only).
 * Supports optional filters: module, action, userId, from, to.
 */
function getAuditLogs(filters = {}) {
  let logs = [...AUDIT_STORE]

  if (filters.module)   logs = logs.filter((l) => l.module   === filters.module)
  if (filters.action)   logs = logs.filter((l) => l.action   === filters.action)
  if (filters.userId)   logs = logs.filter((l) => l.userId   === filters.userId)
  if (filters.userRole) logs = logs.filter((l) => l.userRole === filters.userRole)
  if (filters.targetId) logs = logs.filter((l) => l.targetId === filters.targetId)

  if (filters.from) {
    const from = new Date(filters.from)
    logs = logs.filter((l) => new Date(l.createdAt) >= from)
  }
  if (filters.to) {
    const to = new Date(filters.to)
    logs = logs.filter((l) => new Date(l.createdAt) <= to)
  }

  // Newest first
  logs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

  const limit = filters.limit ? Math.min(Number(filters.limit), 500) : 100
  return logs.slice(0, limit)
}

module.exports = { logAuditEvent, getAuditLogs, AUDIT_ACTIONS, AUDIT_STORE }
