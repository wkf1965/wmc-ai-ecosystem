/**
 * Admit Workflow — Stage 2
 */

const D = '━━━━━━━━━━━━━━━━━━━━━━━━━'

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
      '📋 *Please confirm this admission record:*',
      D, '',
      `👤 Patient Name: ${data.patientName}`,
      `📅 Age: ${data.age}`,
      `⚥ Gender: ${data.gender}`,
      `🏥 Room: ${data.room}`,
      `🩺 Diagnosis: ${data.diagnosis}`,
      `👨‍⚕️ Doctor: ${data.doctor}`,
      `📆 Admission Date: ${date}`,
      `📝 Remark: ${data.remark}`,
      '', D,
      'Reply *yes* to save  |  *no* to cancel',
    ].join('\n')
  },
}
