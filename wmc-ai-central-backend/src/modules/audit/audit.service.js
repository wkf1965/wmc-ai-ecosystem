/**
 * Audit service
 *
 * Business logic layer for audit log retrieval and statistics.
 * Write path lives in src/shared/utils/audit-logger.js (logAuditEvent).
 * Read path here queries the in-memory AUDIT_STORE (mock) or Prisma (production).
 */

const { getAuditLogs, AUDIT_ACTIONS } = require('../../shared/utils/audit-logger')

/**
 * List audit log entries with optional filters.
 * @param {Object} filters
 */
async function listLogs(filters = {}) {
  const logs = getAuditLogs(filters)
  return {
    total:   logs.length,
    count:   logs.length,
    filters: {
      module:   filters.module   ?? null,
      action:   filters.action   ?? null,
      userId:   filters.userId   ?? null,
      userRole: filters.userRole ?? null,
      from:     filters.from     ?? null,
      to:       filters.to       ?? null,
      limit:    filters.limit    ?? 100,
    },
    logs,
    source: 'mock',
    mock:   true,
  }
}

/**
 * Summary statistics — useful for supervisor compliance dashboards.
 * Returns action counts grouped by module and role.
 */
async function getSummary() {
  const all = getAuditLogs({ limit: 500 })

  const byModule = {}
  const byRole   = {}
  const byAction = {}

  for (const log of all) {
    byModule[log.module]   = (byModule[log.module]   ?? 0) + 1
    byRole[log.userRole]   = (byRole[log.userRole]   ?? 0) + 1
    byAction[log.action]   = (byAction[log.action]   ?? 0) + 1
  }

  return {
    totalEvents: all.length,
    byModule,
    byRole,
    byAction,
    source: 'mock',
    mock:   true,
  }
}

module.exports = { listLogs, getSummary, AUDIT_ACTIONS }
