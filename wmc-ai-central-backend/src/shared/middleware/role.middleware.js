/**
 * requireRole middleware factory
 *
 * Must be used AFTER requireAuth (which attaches req.user).
 * Returns 403 Forbidden if the authenticated user's role is not in the allowed list.
 *
 * Usage:
 *   requireRole('admin')
 *   requireRole(['admin', 'supervisor'])
 *   requireRole(['nurse', 'supervisor', 'doctor'])
 *
 * Roles (healthcare):
 *   admin       — full system access
 *   supervisor  — nursing and ops oversight
 *   nurse       — nursing records, tasks, alerts
 *   therapist   — rehab records only
 *   doctor      — patient records, escalations
 *   frontdesk   — CRM leads, appointments
 */

/** All valid roles in the WMC system */
const ROLES = Object.freeze({
  ADMIN:      'admin',
  SUPERVISOR: 'supervisor',
  NURSE:      'nurse',
  THERAPIST:  'therapist',
  DOCTOR:     'doctor',
  FRONTDESK:  'frontdesk',
})

/**
 * Role hierarchy weights — higher = more access.
 * Used to support "at least this role" checks in future.
 */
const ROLE_WEIGHT = {
  admin:      100,
  supervisor:  80,
  doctor:      70,
  therapist:   60,
  nurse:       50,
  frontdesk:   40,
}

/**
 * Returns an Express middleware that enforces role access.
 * @param {string | string[]} allowedRoles
 */
function requireRole(allowedRoles) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles]

  return function roleGuard(req, res, next) {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'requireAuth must run before requireRole',
      })
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `This route requires one of: [${roles.join(', ')}]. Your role: ${req.user.role}`,
        requiredRoles: roles,
        yourRole: req.user.role,
      })
    }

    return next()
  }
}

/**
 * Convenience: require admin only.
 * @example router.get('/admin-only', requireAuth, adminOnly, handler)
 */
const adminOnly = requireRole([ROLES.ADMIN])

/**
 * Convenience: admin or supervisor.
 */
const supervisorOrAbove = requireRole([ROLES.ADMIN, ROLES.SUPERVISOR])

/**
 * Convenience: clinical staff (nurse, supervisor, doctor, admin).
 */
const clinicalStaff = requireRole([ROLES.ADMIN, ROLES.SUPERVISOR, ROLES.NURSE, ROLES.DOCTOR])

/**
 * Convenience: nursing team (nurse, supervisor, admin).
 */
const nursingTeam = requireRole([ROLES.ADMIN, ROLES.SUPERVISOR, ROLES.NURSE])

/**
 * Convenience: rehab team (therapist, supervisor, admin).
 */
const rehabTeam = requireRole([ROLES.ADMIN, ROLES.SUPERVISOR, ROLES.THERAPIST])

/**
 * Convenience: CRM team (frontdesk, supervisor, admin).
 */
const crmTeam = requireRole([ROLES.ADMIN, ROLES.SUPERVISOR, ROLES.FRONTDESK])

module.exports = {
  requireRole,
  adminOnly,
  supervisorOrAbove,
  clinicalStaff,
  nursingTeam,
  rehabTeam,
  crmTeam,
  ROLES,
  ROLE_WEIGHT,
}
