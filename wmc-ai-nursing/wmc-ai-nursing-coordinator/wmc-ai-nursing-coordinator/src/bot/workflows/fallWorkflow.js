/**
 * Fall Incident Workflow — Stage 2
 */

import {
  DIVIDER,
  htmlConfirmHeader,
  htmlConfirmFooter,
  htmlField,
  htmlWarning,
} from '../utils/workflowFormat.js'

export const FALL_WORKFLOW = {
  name: 'fall',
  command: '/fall',
  icon: '⚠️',
  title: 'FALL INCIDENT REPORT',
  purpose: 'Report and document a patient fall incident',

  steps: [
    { key: 'patientName',       question: '👤 Patient Name?' },
    { key: 'room',              question: '🏥 Room Number?' },
    { key: 'time',              question: '🕐 Time of Incident? (e.g. 14:30 or "now")' },
    { key: 'whatHappened',      question: '📄 What Happened? (brief description)' },
    { key: 'injury',            question: '🩹 Any Injury? (yes / no — describe if yes)' },
    { key: 'actionTaken',       question: '💊 Action Taken? (e.g. assessed vitals, applied ice)' },
    { key: 'doctorInformed',    question: '👨‍⚕️ Doctor Informed? (yes / no — doctor name if yes)' },
    { key: 'familyInformed',    question: '👨‍👩‍👦 Family Informed? (yes / no)' },
    { key: 'remark',            question: '📝 Additional Remarks? (or "-" to skip)' },
  ],

  fields: [
    'Patient Name', 'Room', 'Incident Time', 'What Happened',
    'Injury', 'Action Taken', 'Doctor Informed', 'Family Informed', 'Remarks',
  ],

  buildSummary(data) {
    const time = data.time?.toLowerCase() === 'now'
      ? new Date().toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })
      : data.time

    const hasInjury = /^yes/i.test(data.injury ?? '')
    const flag = hasInjury ? htmlWarning('Injury reported — escalate to doctor immediately') : ''

    return [
      htmlConfirmHeader('Please confirm this fall incident report:'),
      DIVIDER, '',
      htmlField('👤 Patient:', data.patientName),
      htmlField('🏥 Room:', data.room),
      htmlField('🕐 Time:', time),
      htmlField('📄 What Happened:', data.whatHappened),
      htmlField('🩹 Injury:', data.injury),
      htmlField('💊 Action Taken:', data.actionTaken),
      htmlField('👨‍⚕️ Doctor Informed:', data.doctorInformed),
      htmlField('👨‍👩‍👦 Family Informed:', data.familyInformed),
      htmlField('📝 Remark:', data.remark),
      flag,
      '', DIVIDER,
      htmlConfirmFooter(),
    ].filter(Boolean).join('\n')
  },
}
