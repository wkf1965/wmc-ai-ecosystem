/**
 * Admit Workflow — Stage 2
 */

import {
  DIVIDER,
  htmlConfirmHeader,
  htmlConfirmFooter,
  htmlField,
} from '../utils/workflowFormat.js'

export const ADMIT_WORKFLOW = {
  name: 'admit',
  command: '/admit',
  icon: '🏥',
  title: 'PATIENT ADMISSION',
  purpose: 'Record a new patient admission',

  steps: [
    { key: 'patientName',    question: '👤 Patient Name?' },
    { key: 'age',            question: '📅 Age?' },
    { key: 'gender',         question: '⚥ Gender? (male / female)' },
    { key: 'room',           question: '🏥 Room Number?' },
    { key: 'diagnosis',      question: '🩺 Primary Diagnosis?' },
    { key: 'doctor',         question: '👨‍⚕️ Attending Doctor?' },
    { key: 'admissionDate',  question: '📆 Admission Date? (DD/MM/YYYY or "today")' },
    { key: 'remark',         question: '📝 Additional Remarks? (or "-" to skip)' },
  ],

  fields: ['Patient Name', 'Age', 'Gender', 'Room Number', 'Diagnosis', 'Doctor', 'Admission Date', 'Remarks'],

  buildSummary(data) {
    const date = data.admissionDate?.toLowerCase() === 'today'
      ? new Date().toLocaleDateString('en-GB')
      : data.admissionDate

    return [
      htmlConfirmHeader('Please confirm this admission record:'),
      DIVIDER, '',
      htmlField('👤 Patient Name:', data.patientName),
      htmlField('📅 Age:', data.age),
      htmlField('⚥ Gender:', data.gender),
      htmlField('🏥 Room:', data.room),
      htmlField('🩺 Diagnosis:', data.diagnosis),
      htmlField('👨‍⚕️ Doctor:', data.doctor),
      htmlField('📆 Admission Date:', date),
      htmlField('📝 Remark:', data.remark),
      '', DIVIDER,
      htmlConfirmFooter(),
    ].join('\n')
  },
}
