/**
 * Clinical Alert Workflow — Stage 2
 */

const D = '━━━━━━━━━━━━━━━━━━━━━━━━━'

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
    const flag = critical ? '\n🚨 *CRITICAL ALERT — immediate escalation required*' : ''

    return [
      '📋 *Please confirm this clinical alert:*',
      D, '',
      `👤 Patient: ${data.patientName}`,
      `🏥 Room: ${data.room}`,
      `🕐 Alert Time: ${time}`,
      `🚨 Alert Type: ${data.alertType}`,
      `👁️ Observation: ${data.observation}`,
      `💊 Action Taken: ${data.actionTaken}`,
      `👨‍⚕️ Doctor Informed: ${data.doctorInformed}`,
      `📝 Remark: ${data.remark}`,
      flag,
      '', D,
      'Reply *yes* to save  |  *no* to cancel',
    ].filter(l => l !== undefined).join('\n')
  },
}
