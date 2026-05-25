/**
 * WMC AI Event Types
 *
 * Canonical event name registry for the internal event bus.
 * All modules emit and subscribe using these constants.
 * Import from here — never use raw strings in emitEvent/onEvent calls.
 *
 * Naming convention:  <DOMAIN>_<SUBJECT>_<PAST_VERB>
 * e.g.  NURSING_RECORD_CREATED
 */

const EVENT_TYPES = Object.freeze({

  // ── Auth ────────────────────────────────────────────────────────────
  USER_LOGGED_IN:                 'USER_LOGGED_IN',
  USER_LOGGED_OUT:                'USER_LOGGED_OUT',
  USER_TOKEN_REFRESHED:           'USER_TOKEN_REFRESHED',

  // ── Patients ────────────────────────────────────────────────────────
  PATIENT_CREATED:                'PATIENT_CREATED',
  PATIENT_UPDATED:                'PATIENT_UPDATED',
  PATIENT_DISCHARGED:             'PATIENT_DISCHARGED',

  // ── Nursing ─────────────────────────────────────────────────────────
  NURSING_RECORD_CREATED:         'NURSING_RECORD_CREATED',
  NURSING_RECORD_UPDATED:         'NURSING_RECORD_UPDATED',
  SHIFT_HANDOVER_GENERATED:       'SHIFT_HANDOVER_GENERATED',

  // ── Vitals & Alerts ─────────────────────────────────────────────────
  VITAL_ALERT_TRIGGERED:          'VITAL_ALERT_TRIGGERED',
  ALERT_ACKNOWLEDGED:             'ALERT_ACKNOWLEDGED',
  DOCTOR_ESCALATION_TRIGGERED:    'DOCTOR_ESCALATION_TRIGGERED',
  INCIDENT_REPORTED:              'INCIDENT_REPORTED',

  // ── Tasks ───────────────────────────────────────────────────────────
  TASK_CREATED:                   'TASK_CREATED',
  TASK_COMPLETED:                 'TASK_COMPLETED',
  TASK_OVERDUE:                   'TASK_OVERDUE',

  // ── Rehabilitation ──────────────────────────────────────────────────
  REHAB_PROGRESS_UPDATED:         'REHAB_PROGRESS_UPDATED',
  REHAB_SESSION_COMPLETED:        'REHAB_SESSION_COMPLETED',

  // ── CRM ─────────────────────────────────────────────────────────────
  CRM_LEAD_CREATED:               'CRM_LEAD_CREATED',
  CRM_LEAD_CONVERTED:             'CRM_LEAD_CONVERTED',
  APPOINTMENT_BOOKED:             'APPOINTMENT_BOOKED',
  APPOINTMENT_CANCELLED:          'APPOINTMENT_CANCELLED',

  // ── Notifications / Family ──────────────────────────────────────────
  FAMILY_UPDATE_SENT:             'FAMILY_UPDATE_SENT',
  NOTIFICATION_SENT:              'NOTIFICATION_SENT',
  NOTIFICATION_FAILED:            'NOTIFICATION_FAILED',

  // ── AI / Dashboard ──────────────────────────────────────────────────
  AI_SUMMARY_REQUESTED:           'AI_SUMMARY_REQUESTED',
  AI_SUMMARY_COMPLETED:           'AI_SUMMARY_COMPLETED',
  DASHBOARD_REFRESH_REQUESTED:    'DASHBOARD_REFRESH_REQUESTED',

  // ── Audit / System ──────────────────────────────────────────────────
  AUDIT_EVENT_LOGGED:             'AUDIT_EVENT_LOGGED',
  SYSTEM_HEALTH_CHECKED:          'SYSTEM_HEALTH_CHECKED',
})

/**
 * Group labels — for documentation and filtering in event log viewer.
 * Each key maps to an array of EVENT_TYPES members in that domain.
 */
const EVENT_GROUPS = Object.freeze({
  auth:          ['USER_LOGGED_IN', 'USER_LOGGED_OUT', 'USER_TOKEN_REFRESHED'],
  patients:      ['PATIENT_CREATED', 'PATIENT_UPDATED', 'PATIENT_DISCHARGED'],
  nursing:       ['NURSING_RECORD_CREATED', 'NURSING_RECORD_UPDATED', 'SHIFT_HANDOVER_GENERATED'],
  alerts:        ['VITAL_ALERT_TRIGGERED', 'ALERT_ACKNOWLEDGED', 'DOCTOR_ESCALATION_TRIGGERED', 'INCIDENT_REPORTED'],
  tasks:         ['TASK_CREATED', 'TASK_COMPLETED', 'TASK_OVERDUE'],
  rehab:         ['REHAB_PROGRESS_UPDATED', 'REHAB_SESSION_COMPLETED'],
  crm:           ['CRM_LEAD_CREATED', 'CRM_LEAD_CONVERTED', 'APPOINTMENT_BOOKED', 'APPOINTMENT_CANCELLED'],
  notifications: ['FAMILY_UPDATE_SENT', 'NOTIFICATION_SENT', 'NOTIFICATION_FAILED'],
  ai:            ['AI_SUMMARY_REQUESTED', 'AI_SUMMARY_COMPLETED', 'DASHBOARD_REFRESH_REQUESTED'],
  system:        ['AUDIT_EVENT_LOGGED', 'SYSTEM_HEALTH_CHECKED'],
})

module.exports = { EVENT_TYPES, EVENT_GROUPS }
