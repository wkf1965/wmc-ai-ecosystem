/**
 * WMC AI Event Listeners
 *
 * Central registration point for all domain event handlers.
 * Called once at server startup: bootstrapEventListeners()
 *
 * Each listener is async — errors are caught by the bus wrapper and logged,
 * never crashing the emitting thread.
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  Event                        Listeners                             │
 * ├─────────────────────────────────────────────────────────────────────┤
 * │  NURSING_RECORD_CREATED       audit, dashboard refresh, AI summary  │
 * │  VITAL_ALERT_TRIGGERED        audit, Telegram stub, WhatsApp stub   │
 * │  DOCTOR_ESCALATION_TRIGGERED  audit, Telegram, WhatsApp, dashboard  │
 * │  ALERT_ACKNOWLEDGED           audit                                 │
 * │  TASK_COMPLETED               audit, dashboard refresh              │
 * │  SHIFT_HANDOVER_GENERATED     audit, AI summary, notification stub  │
 * │  PATIENT_CREATED              audit, dashboard refresh              │
 * │  PATIENT_DISCHARGED           audit, notification stub              │
 * │  REHAB_PROGRESS_UPDATED       audit, AI summary                     │
 * │  CRM_LEAD_CREATED             audit, notification stub              │
 * │  FAMILY_UPDATE_SENT           audit                                 │
 * │  USER_LOGGED_IN               audit                                 │
 * │  USER_LOGGED_OUT              audit                                 │
 * └─────────────────────────────────────────────────────────────────────┘
 */

const { onEvent }    = require('./event-bus')
const { EVENT_TYPES } = require('./event-types')
const { logAuditEvent, AUDIT_ACTIONS } = require('../../shared/utils/audit-logger')

// ---------------------------------------------------------------------------
// Lazy-loaded stubs (avoid circular requires at module load time)
// ---------------------------------------------------------------------------

function getNotificationService() {
  return require('../../modules/notifications/notification.service')
}

function getDashboardState() {
  return require('../../shared/state/dashboard-state')
}

function getAiSummaryQueue() {
  return require('../../shared/state/ai-summary-queue')
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a context-like object from an event envelope for audit logging */
function eventCtx(envelope) {
  const { payload } = envelope
  return {
    user: {
      id:       payload.userId   ?? null,
      role:     payload.userRole ?? 'system',
      fullName: payload.userName ?? 'System',
    },
    ip: payload.ipAddress ?? 'event-bus',
  }
}

// ---------------------------------------------------------------------------
// Bootstrap — call once on server startup
// ---------------------------------------------------------------------------

function bootstrapEventListeners() {

  // ── NURSING_RECORD_CREATED ──────────────────────────────────────────
  onEvent(EVENT_TYPES.NURSING_RECORD_CREATED, async ({ payload }) => {
    logAuditEvent(null, {
      userId:      payload.userId,
      userRole:    payload.userRole ?? 'nurse',
      action:      AUDIT_ACTIONS.CREATE_NURSING_RECORD,
      module:      'nursing',
      targetId:    payload.patientId,
      targetType:  'Patient',
      description: `Nursing record created for patient ${payload.patientId} by ${payload.nurseName ?? 'unknown'}`,
      ipAddress:   payload.ipAddress ?? 'event-bus',
    })
  })

  onEvent(EVENT_TYPES.NURSING_RECORD_CREATED, async ({ payload }) => {
    getDashboardState().markRefreshNeeded('nursing', payload.patientId)
  })

  onEvent(EVENT_TYPES.NURSING_RECORD_CREATED, async ({ payload }) => {
    getAiSummaryQueue().enqueue({
      trigger:   EVENT_TYPES.NURSING_RECORD_CREATED,
      patientId: payload.patientId,
      module:    'nursing',
    })
  })

  // ── NURSING_RECORD_UPDATED ──────────────────────────────────────────
  onEvent(EVENT_TYPES.NURSING_RECORD_UPDATED, async ({ payload }) => {
    logAuditEvent(null, {
      userId:      payload.userId,
      userRole:    payload.userRole ?? 'nurse',
      action:      AUDIT_ACTIONS.UPDATE_NURSING_RECORD,
      module:      'nursing',
      targetId:    payload.recordId ?? payload.patientId,
      targetType:  'NursingRecord',
      description: `Nursing record updated for patient ${payload.patientId}`,
      ipAddress:   payload.ipAddress ?? 'event-bus',
    })
  })

  // ── VITAL_ALERT_TRIGGERED ────────────────────────────────────────────
  onEvent(EVENT_TYPES.VITAL_ALERT_TRIGGERED, async ({ payload }) => {
    logAuditEvent(null, {
      userId:      payload.userId,
      userRole:    payload.userRole ?? 'system',
      action:      AUDIT_ACTIONS.CREATE_ALERT,
      module:      'alerts',
      targetId:    payload.patientId,
      targetType:  'Patient',
      description: `Vital alert triggered for patient ${payload.patientId}: ${payload.alertType ?? 'unknown'}`,
      ipAddress:   payload.ipAddress ?? 'event-bus',
    })
  })

  onEvent(EVENT_TYPES.VITAL_ALERT_TRIGGERED, async ({ payload }) => {
    // Notify nursing supervisor via Telegram (mock)
    getNotificationService().sendNotification({
      channel: 'telegram',
      target:  payload.supervisorChatId ?? 'supervisor-chat',
      type:    'VITAL_ALERT',
      message: `⚠️ Vital alert for patient ${payload.patientId}: ${payload.alertType ?? 'Alert triggered'}. Severity: ${payload.severity ?? 'unknown'}`,
    }).catch(() => {}) // non-blocking
  })

  onEvent(EVENT_TYPES.VITAL_ALERT_TRIGGERED, async ({ payload }) => {
    getDashboardState().markRefreshNeeded('alerts', payload.patientId)
  })

  // ── ALERT_ACKNOWLEDGED ───────────────────────────────────────────────
  onEvent(EVENT_TYPES.ALERT_ACKNOWLEDGED, async ({ payload }) => {
    logAuditEvent(null, {
      userId:      payload.userId,
      userRole:    payload.userRole ?? 'nurse',
      action:      AUDIT_ACTIONS.ACKNOWLEDGE_ALERT,
      module:      'alerts',
      targetId:    payload.alertId,
      targetType:  'Alert',
      description: `Alert ${payload.alertId} acknowledged`,
      ipAddress:   payload.ipAddress ?? 'event-bus',
    })
  })

  // ── DOCTOR_ESCALATION_TRIGGERED ──────────────────────────────────────
  onEvent(EVENT_TYPES.DOCTOR_ESCALATION_TRIGGERED, async ({ payload }) => {
    logAuditEvent(null, {
      userId:      payload.userId,
      userRole:    payload.userRole ?? 'doctor',
      action:      AUDIT_ACTIONS.ESCALATION_TRIGGERED,
      module:      'alerts',
      targetId:    payload.patientId,
      targetType:  'Patient',
      description: `Doctor escalation triggered for patient ${payload.patientId}`,
      ipAddress:   payload.ipAddress ?? 'event-bus',
    })
  })

  onEvent(EVENT_TYPES.DOCTOR_ESCALATION_TRIGGERED, async ({ payload }) => {
    // Telegram alert to on-call doctor
    getNotificationService().sendNotification({
      channel: 'telegram',
      target:  payload.doctorChatId ?? 'doctor-oncall-chat',
      type:    'ESCALATION',
      message: `🚨 ESCALATION: Patient ${payload.patientId} requires immediate attention. Triggered by ${payload.userRole ?? 'clinical staff'}. Reason: ${payload.reason ?? 'Unspecified'}`,
    }).catch(() => {})
  })

  onEvent(EVENT_TYPES.DOCTOR_ESCALATION_TRIGGERED, async ({ payload }) => {
    // WhatsApp alert to supervisor
    getNotificationService().sendNotification({
      channel: 'whatsapp',
      target:  payload.supervisorPhone ?? '+60100000000',
      type:    'ESCALATION',
      message: `ESCALATION: Patient ${payload.patientId} — ${payload.reason ?? 'Immediate review required'}`,
    }).catch(() => {})
  })

  onEvent(EVENT_TYPES.DOCTOR_ESCALATION_TRIGGERED, async ({ payload }) => {
    getDashboardState().addEscalation({
      patientId:  payload.patientId,
      reason:     payload.reason,
      triggeredBy: payload.userRole ?? 'unknown',
      at:         new Date().toISOString(),
    })
  })

  // ── TASK_COMPLETED ────────────────────────────────────────────────────
  onEvent(EVENT_TYPES.TASK_COMPLETED, async ({ payload }) => {
    logAuditEvent(null, {
      userId:      payload.userId,
      userRole:    payload.userRole ?? 'nurse',
      action:      AUDIT_ACTIONS.COMPLETE_TASK,
      module:      'tasks',
      targetId:    payload.taskId,
      targetType:  'Task',
      description: `Task ${payload.taskId} completed by ${payload.userName ?? 'unknown'}`,
      ipAddress:   payload.ipAddress ?? 'event-bus',
    })
  })

  onEvent(EVENT_TYPES.TASK_COMPLETED, async ({ payload }) => {
    getDashboardState().markRefreshNeeded('tasks', payload.taskId)
  })

  // ── SHIFT_HANDOVER_GENERATED ──────────────────────────────────────────
  onEvent(EVENT_TYPES.SHIFT_HANDOVER_GENERATED, async ({ payload }) => {
    logAuditEvent(null, {
      userId:      payload.userId,
      userRole:    payload.userRole ?? 'supervisor',
      action:      AUDIT_ACTIONS.CREATE_HANDOVER_LOG,
      module:      'nursing',
      targetId:    payload.handoverId,
      targetType:  'HandoverLog',
      description: `Shift handover generated — ${payload.shift ?? 'unknown'} shift by ${payload.nurseInCharge ?? 'unknown'}`,
      ipAddress:   payload.ipAddress ?? 'event-bus',
    })
  })

  onEvent(EVENT_TYPES.SHIFT_HANDOVER_GENERATED, async ({ payload }) => {
    getAiSummaryQueue().enqueue({
      trigger:   EVENT_TYPES.SHIFT_HANDOVER_GENERATED,
      handoverId: payload.handoverId,
      module:    'nursing',
      priority:  'high',
    })
  })

  onEvent(EVENT_TYPES.SHIFT_HANDOVER_GENERATED, async ({ payload }) => {
    getNotificationService().sendNotification({
      channel: 'telegram',
      target:  payload.incomingNurseChatId ?? 'nursing-group',
      type:    'HANDOVER',
      message: `📋 Shift handover ready for ${payload.shift ?? 'next'} shift. Prepared by ${payload.nurseInCharge ?? 'supervisor'}.`,
    }).catch(() => {})
  })

  // ── PATIENT_CREATED ────────────────────────────────────────────────────
  onEvent(EVENT_TYPES.PATIENT_CREATED, async ({ payload }) => {
    logAuditEvent(null, {
      userId:      payload.userId,
      userRole:    payload.userRole ?? 'admin',
      action:      AUDIT_ACTIONS.CREATE_PATIENT,
      module:      'patients',
      targetId:    payload.patientId,
      targetType:  'Patient',
      description: `New patient admitted: ${payload.fullName ?? payload.patientId}`,
      ipAddress:   payload.ipAddress ?? 'event-bus',
    })
  })

  onEvent(EVENT_TYPES.PATIENT_CREATED, async ({ payload }) => {
    getDashboardState().markRefreshNeeded('patients', payload.patientId)
  })

  // ── PATIENT_DISCHARGED ─────────────────────────────────────────────────
  onEvent(EVENT_TYPES.PATIENT_DISCHARGED, async ({ payload }) => {
    logAuditEvent(null, {
      userId:      payload.userId,
      userRole:    payload.userRole ?? 'admin',
      action:      AUDIT_ACTIONS.DISCHARGE_PATIENT,
      module:      'patients',
      targetId:    payload.patientId,
      targetType:  'Patient',
      description: `Patient ${payload.patientId} discharged`,
      ipAddress:   payload.ipAddress ?? 'event-bus',
    })
  })

  onEvent(EVENT_TYPES.PATIENT_DISCHARGED, async ({ payload }) => {
    getNotificationService().sendNotification({
      channel: 'whatsapp',
      target:  payload.familyPhone ?? '+60100000000',
      type:    'DISCHARGE',
      message: `Your family member ${payload.fullName ?? payload.patientId} has been discharged. Please collect them at the reception.`,
    }).catch(() => {})
  })

  // ── REHAB_PROGRESS_UPDATED ─────────────────────────────────────────────
  onEvent(EVENT_TYPES.REHAB_PROGRESS_UPDATED, async ({ payload }) => {
    logAuditEvent(null, {
      userId:      payload.userId,
      userRole:    payload.userRole ?? 'therapist',
      action:      AUDIT_ACTIONS.UPDATE_REHAB_RECORD,
      module:      'rehab',
      targetId:    payload.patientId,
      targetType:  'Patient',
      description: `Rehab progress updated for patient ${payload.patientId} by ${payload.therapistName ?? 'unknown'}`,
      ipAddress:   payload.ipAddress ?? 'event-bus',
    })
  })

  onEvent(EVENT_TYPES.REHAB_PROGRESS_UPDATED, async ({ payload }) => {
    getAiSummaryQueue().enqueue({
      trigger:   EVENT_TYPES.REHAB_PROGRESS_UPDATED,
      patientId: payload.patientId,
      module:    'rehab',
    })
  })

  // ── CRM_LEAD_CREATED ──────────────────────────────────────────────────
  onEvent(EVENT_TYPES.CRM_LEAD_CREATED, async ({ payload }) => {
    logAuditEvent(null, {
      userId:      payload.userId,
      userRole:    payload.userRole ?? 'frontdesk',
      action:      AUDIT_ACTIONS.CREATE_CRM_LEAD,
      module:      'crm',
      targetId:    payload.leadId,
      targetType:  'CrmLead',
      description: `New CRM lead: ${payload.fullName ?? 'Unknown'} — ${payload.inquiryType ?? 'General inquiry'}`,
      ipAddress:   payload.ipAddress ?? 'event-bus',
    })
  })

  onEvent(EVENT_TYPES.CRM_LEAD_CREATED, async ({ payload }) => {
    getNotificationService().sendNotification({
      channel: 'telegram',
      target:  'crm-team-chat',
      type:    'NEW_LEAD',
      message: `📞 New lead: ${payload.fullName ?? 'Unknown'} | ${payload.inquiryType ?? 'General'} | ${payload.phoneNumber ?? '-'}`,
    }).catch(() => {})
  })

  // ── FAMILY_UPDATE_SENT ────────────────────────────────────────────────
  onEvent(EVENT_TYPES.FAMILY_UPDATE_SENT, async ({ payload }) => {
    logAuditEvent(null, {
      userId:      payload.userId,
      userRole:    payload.userRole ?? 'frontdesk',
      action:      AUDIT_ACTIONS.SEND_FAMILY_UPDATE,
      module:      'notifications',
      targetId:    payload.patientId,
      targetType:  'Patient',
      description: `Family update sent for patient ${payload.patientId} via ${payload.channel ?? 'unknown'}`,
      ipAddress:   payload.ipAddress ?? 'event-bus',
    })
  })

  // ── USER_LOGGED_IN / OUT ───────────────────────────────────────────────
  onEvent(EVENT_TYPES.USER_LOGGED_IN, async ({ payload }) => {
    logAuditEvent(null, {
      userId:      payload.userId,
      userRole:    payload.userRole,
      action:      AUDIT_ACTIONS.LOGIN,
      module:      'auth',
      targetType:  'User',
      description: `${payload.fullName ?? payload.email} (${payload.userRole}) logged in`,
      ipAddress:   payload.ipAddress ?? 'event-bus',
    })
  })

  onEvent(EVENT_TYPES.USER_LOGGED_OUT, async ({ payload }) => {
    logAuditEvent(null, {
      userId:      payload.userId,
      userRole:    payload.userRole,
      action:      AUDIT_ACTIONS.LOGOUT,
      module:      'auth',
      targetType:  'User',
      description: `${payload.fullName ?? payload.email} (${payload.userRole}) logged out`,
      ipAddress:   payload.ipAddress ?? 'event-bus',
    })
  })

  // Print listener summary on startup
  const registeredEvents = Object.values(EVENT_TYPES)
  const activeListeners = registeredEvents.filter((t) => {
    const { listenerCount } = require('./event-bus')
    return listenerCount(t) > 0
  })

  console.info(`[EventBus] Bootstrap complete — ${activeListeners.length} event types with listeners`)
}

module.exports = { bootstrapEventListeners }
