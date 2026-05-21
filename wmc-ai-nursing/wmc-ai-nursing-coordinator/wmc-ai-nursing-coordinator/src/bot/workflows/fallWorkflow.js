/**
 * Fall Incident Workflow — Stage 2
 */

const D = '━━━━━━━━━━━━━━━━━━━━━━━━━'

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
    const flag = hasInjury ? '\n⚠️ *Injury reported — escalate to doctor immediately*' : ''

    return [
      '📋 *Please confirm this fall incident report:*',
      D, '',
      `👤 Patient: ${data.patientName}`,
      `🏥 Room: ${data.room}`,
      `🕐 Time: ${time}`,
      `📄 What Happened: ${data.whatHappened}`,
      `🩹 Injury: ${data.injury}`,
      `💊 Action Taken: ${data.actionTaken}`,
      `👨‍⚕️ Doctor Informed: ${data.doctorInformed}`,
      `👨‍👩‍👦 Family Informed: ${data.familyInformed}`,
      `📝 Remark: ${data.remark}`,
      flag,
      '', D,
      'Reply *yes* to save  |  *no* to cancel',
    ].filter(l => l !== undefined).join('\n')
  },
}
