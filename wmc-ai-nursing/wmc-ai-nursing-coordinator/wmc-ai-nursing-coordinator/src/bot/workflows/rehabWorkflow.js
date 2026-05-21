/**
 * Rehab Progress Workflow — Stage 2
 */

const D = '━━━━━━━━━━━━━━━━━━━━━━━━━'

export const REHAB_WORKFLOW = {
  name: 'rehab',
  command: '/rehab',
  icon: '🏃',
  title: 'REHAB PROGRESS',
  purpose: 'Record patient physiotherapy or rehabilitation session progress',

  steps: [
    { key: 'patientName',   question: '👤 Patient Name?' },
    { key: 'room',          question: '🏥 Room Number?' },
    { key: 'date',          question: '📆 Session Date? (DD/MM/YYYY or "today")' },
    { key: 'therapist',     question: '🧑‍⚕️ Physiotherapist / Staff?' },
    { key: 'sessionType',   question: '🏃 Session Type? (e.g. walking, strengthening, stretching)' },
    { key: 'progress',      question: '📈 Progress / Response? (e.g. able to walk 5 steps, tolerated well)' },
    { key: 'nextGoal',      question: '🎯 Next Goal? (or "-" to skip)' },
    { key: 'remark',        question: '📝 Additional Remarks? (or "-" to skip)' },
  ],

  fields: ['Patient Name', 'Room', 'Date', 'Therapist', 'Session Type', 'Progress', 'Next Goal', 'Remarks'],

  buildSummary(data) {
    const date = data.date?.toLowerCase() === 'today'
      ? new Date().toLocaleDateString('en-GB')
      : data.date

    return [
      '📋 *Please confirm this rehab record:*',
      D, '',
      `👤 Patient: ${data.patientName}`,
      `🏥 Room: ${data.room}`,
      `📆 Date: ${date}`,
      `🧑‍⚕️ Therapist: ${data.therapist}`,
      `🏃 Session Type: ${data.sessionType}`,
      `📈 Progress: ${data.progress}`,
      `🎯 Next Goal: ${data.nextGoal}`,
      `📝 Remark: ${data.remark}`,
      '', D,
      'Reply *yes* to save  |  *no* to cancel',
    ].join('\n')
  },
}
