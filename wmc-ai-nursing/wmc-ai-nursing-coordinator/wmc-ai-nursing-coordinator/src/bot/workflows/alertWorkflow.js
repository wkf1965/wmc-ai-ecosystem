/**
 * Clinical Alert Workflow — Stage 2
 */

import {
  DIVIDER,
  htmlConfirmHeader,
  htmlConfirmFooter,
  htmlField,
  htmlCritical,
} from '../utils/workflowFormat.js'

export const ALERT_WORKFLOW = {
  name: 'alert',
  command: '/alert',
  icon: '🚨',
  title: 'CLINICAL ALERT',
  purpose: 'Log a clinical alert or critical observation for a patient',

  steps: [
    { key: 'patientName',     question: '👤 Patient Name?' },
    { key: 'room',            question: '🏥 Room Number?' },
    { key: 'time',            question: '🕐 Alert Time? (e.g. 14:30 or "now")' },
    { key: 'alertType',       question: '🚨 Alert Type? (e.g. desaturation, hypotension, seizure, unresponsive)' },
    { key: 'observation',     question: '👁️ What did you observe? (brief description)' },
    { key: 'actionTaken',     question: '💊 Immediate Action Taken?' },
    { key: 'doctorInformed',  question: '👨‍⚕️ Doctor Informed? (yes / no — doctor name if yes)' },
    { key: 'remark',          question: '📝 Additional Remarks? (or "-" to skip)' },
  ],

  fields: ['Patient Name', 'Room', 'Alert Time', 'Alert Type', 'Observation', 'Action Taken', 'Doctor Informed', 'Remarks'],

  buildSummary(data) {
    const time = data.time?.toLowerCase() === 'now'
      ? new Date().toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })
      : data.time

    const critical = /seizure|unresponsive|cardiac|code/i.test(data.alertType ?? '')
    const flag = critical ? htmlCritical('CRITICAL ALERT — immediate escalation required') : ''

    return [
      htmlConfirmHeader('Please confirm this clinical alert:'),
      DIVIDER, '',
      htmlField('👤 Patient:', data.patientName),
      htmlField('🏥 Room:', data.room),
      htmlField('🕐 Alert Time:', time),
      htmlField('🚨 Alert Type:', data.alertType),
      htmlField('👁️ Observation:', data.observation),
      htmlField('💊 Action Taken:', data.actionTaken),
      htmlField('👨‍⚕️ Doctor Informed:', data.doctorInformed),
      htmlField('📝 Remark:', data.remark),
      flag,
      '', DIVIDER,
      htmlConfirmFooter(),
    ].filter(Boolean).join('\n')
  },
}
