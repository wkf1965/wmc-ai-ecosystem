/**
 * Rehab Progress Workflow — Stage 2
 */

import {
  DIVIDER,
  htmlConfirmHeader,
  htmlConfirmFooter,
  htmlField,
} from '../utils/workflowFormat.js'

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
      htmlConfirmHeader('Please confirm this rehab record:'),
      DIVIDER, '',
      htmlField('👤 Patient:', data.patientName),
      htmlField('🏥 Room:', data.room),
      htmlField('📆 Date:', date),
      htmlField('🧑‍⚕️ Therapist:', data.therapist),
      htmlField('🏃 Session Type:', data.sessionType),
      htmlField('📈 Progress:', data.progress),
      htmlField('🎯 Next Goal:', data.nextGoal),
      htmlField('📝 Remark:', data.remark),
      '', DIVIDER,
      htmlConfirmFooter(),
    ].join('\n')
  },
}
