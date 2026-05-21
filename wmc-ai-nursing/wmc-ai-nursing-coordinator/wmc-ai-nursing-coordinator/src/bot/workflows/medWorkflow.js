/**
 * Medication Administration Workflow — Stage 2
 */

const D = '━━━━━━━━━━━━━━━━━━━━━━━━━'

export const MED_WORKFLOW = {
  name: 'med',
  command: '/med',
  icon: '💊',
  title: 'MEDICATION RECORD',
  purpose: 'Record medication administration to a patient',

  steps: [
    { key: 'patientName',   question: '👤 Patient Name?' },
    { key: 'room',          question: '🏥 Room Number?' },
    { key: 'time',          question: '🕐 Time of Administration? (e.g. 08:00 or "now")' },
    { key: 'medication',    question: '💊 Medication Name?' },
    { key: 'dose',          question: '💉 Dose & Route? (e.g. 500mg oral / 10mg IV)' },
    { key: 'indication',    question: '🩺 Indication? (e.g. pain, fever, hypertension)' },
    { key: 'response',      question: '📊 Patient Response? (e.g. tolerated well, vomited, or "-" to skip)' },
    { key: 'remark',        question: '📝 Additional Remarks? (or "-" to skip)' },
  ],

  fields: ['Patient Name', 'Room', 'Time', 'Medication', 'Dose & Route', 'Indication', 'Response', 'Remarks'],

  buildSummary(data) {
    const time = data.time?.toLowerCase() === 'now'
      ? new Date().toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })
      : data.time

    return [
      '📋 *Please confirm this medication record:*',
      D, '',
      `👤 Patient: ${data.patientName}`,
      `🏥 Room: ${data.room}`,
      `🕐 Time: ${time}`,
      `💊 Medication: ${data.medication}`,
      `💉 Dose & Route: ${data.dose}`,
      `🩺 Indication: ${data.indication}`,
      `📊 Response: ${data.response}`,
      `📝 Remark: ${data.remark}`,
      '', D,
      'Reply *yes* to save  |  *no* to cancel',
    ].join('\n')
  },
}
