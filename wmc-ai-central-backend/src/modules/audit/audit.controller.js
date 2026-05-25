const auditService = require('./audit.service')
const { logAuditEvent, AUDIT_ACTIONS } = require('../../shared/utils/audit-logger')

const auditController = {
  /**
   * GET /api/v1/audit/logs
   * Query params: module, action, userId, userRole, targetId, from, to, limit
   */
  async listLogs(req, res) {
    try {
      const result = await auditService.listLogs({
        module:   req.query.module,
        action:   req.query.action,
        userId:   req.query.userId,
        userRole: req.query.userRole,
        targetId: req.query.targetId,
        from:     req.query.from,
        to:       req.query.to,
        limit:    req.query.limit,
      })

      // Track that someone viewed the audit logs (meta-audit)
      logAuditEvent(req, {
        action:      AUDIT_ACTIONS.VIEW_AUDIT_LOGS,
        module:      'audit',
        description: `Audit log viewed by ${req.user?.role ?? 'unknown'} (${result.count} entries returned)`,
      })

      res.json(result)
    } catch (err) {
      console.error('[audit GET /logs]', err)
      res.status(500).json({ error: 'Failed to retrieve audit logs' })
    }
  },

  /**
   * GET /api/v1/audit/summary
   * Aggregated event counts by module, role, and action.
   */
  async getSummary(req, res) {
    try {
      const result = await auditService.getSummary()
      res.json(result)
    } catch (err) {
      console.error('[audit GET /summary]', err)
      res.status(500).json({ error: 'Failed to retrieve audit summary' })
    }
  },

  /**
   * GET /api/v1/audit/actions
   * Returns the canonical list of known action constants.
   */
  listActions(_req, res) {
    res.json({
      actions: Object.keys(AUDIT_ACTIONS),
      total:   Object.keys(AUDIT_ACTIONS).length,
    })
  },
}

module.exports = { auditController }
