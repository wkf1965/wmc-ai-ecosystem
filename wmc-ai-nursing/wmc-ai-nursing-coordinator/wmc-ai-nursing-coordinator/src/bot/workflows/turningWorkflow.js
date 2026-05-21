/**
 * Side Turning Workflow — Stage 2
 */

const D = '━━━━━━━━━━━━━━━━━━━━━━━━━'

export const TURNING_WORKFLOW = {
  name: 'turning',
  command: '/turning',
  icon: '🔄',
  title: 'SIDE TURNING RECORD',
  purpose: 'Record a 2-hourly side turning for bed-bound patients',

  steps: [
    { key: 'patientName',   question: '👤 Patient Name?' },
    { key: 'room',          question: '🏥 Room Number?' },
    { key: 'time',          question: '🕐 Time of Turning? (e.g. 08:00 or "now")' },
    { key: 'position',      question: '🔄 Position Turned To? (e.g. left side / right side / supine / prone)' },
    { key: 'skinCondition', question: '🩺 Skin Condition? (e.g. intact, redness at sacrum, stage 1 pressure sore)' },
    { key: 'remark',        question: '📝 Additional Remarks? (or "-" to skip)' },
  ],

  fields: ['Patient Name', 'Room', 'Time', 'Position', 'Skin Condition', 'Remarks'],

  buildSummary(data) {
    const time = data.time?.toLowerCase() === 'now'
      ? new Date().toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })
      : data.time

    const flag = /redness|sore|wound|broken/i.test(data.skinCondition ?? '')
      ? '\n⚠️ *Skin issue noted — document and escalate if required*'
      : ''

    return [
      '📋 *Please confirm this turning record:*',
      D, '',
      `👤 Patient: ${data.patientName}`,
      `🏥 Room: ${data.room}`,
      `🕐 Time: ${time}`,
      `🔄 Position: ${data.position}`,
      `🩺 Skin Condition: ${data.skinCondition}`,
      `📝 Remark: ${data.remark}`,
      flag,
      '', D,
      'Reply *yes* to save  |  *no* to cancel',
    ].filter(l => l !== undefined).join('\n')
  },
}
