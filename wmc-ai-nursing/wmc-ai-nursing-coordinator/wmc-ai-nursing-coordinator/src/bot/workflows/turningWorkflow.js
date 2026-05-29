/**
 * Side Turning Workflow — Stage 2
 */

import {
  DIVIDER,
  htmlConfirmHeader,
  htmlConfirmFooter,
  htmlField,
  htmlWarning,
} from '../utils/workflowFormat.js'

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
    { key: 'turning_position', question: '🔄 Turning Position? Right / Left / Supine' },
    { key: 'skinCondition', question: '🩺 Skin Condition? (e.g. intact, redness at sacrum, stage 1 pressure sore)' },
    { key: 'remark',        question: '📝 Additional Remarks? (or "-" to skip)' },
  ],

  fields: ['Patient Name', 'Room', 'Time', 'Position', 'Skin Condition', 'Remarks'],

  buildSummary(data) {
    const time = data.time?.toLowerCase() === 'now'
      ? new Date().toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })
      : data.time
    const turningPosition = String(data.turning_position ?? data.position ?? '').trim()
    const skinCondition = String(data.skinCondition ?? '').trim()
    const remark = String(data.remark ?? '').trim()

    const flag = /redness|sore|wound|broken/i.test(skinCondition)
      ? htmlWarning('Skin issue noted — document and escalate if required')
      : ''

    return [
      htmlConfirmHeader('Please confirm this turning record:'),
      DIVIDER, '',
      htmlField('Patient:', data.patientName || '-'),
      htmlField('Room:', data.room || '-'),
      htmlField('Time:', time || '-'),
      htmlField('Position:', turningPosition || '-'),
      htmlField('Skin Condition:', skinCondition || '-'),
      htmlField('Remark:', remark || '-'),
      flag,
      '', DIVIDER,
      htmlConfirmFooter(),
    ].filter(Boolean).join('\n')
  },
}
