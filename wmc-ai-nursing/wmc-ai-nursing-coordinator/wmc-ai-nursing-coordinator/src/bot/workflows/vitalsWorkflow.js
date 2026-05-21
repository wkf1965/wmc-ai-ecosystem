/**
 * Vitals Workflow — Stage 2
 */

const D = '━━━━━━━━━━━━━━━━━━━━━━━━━'

export const VITALS_WORKFLOW = {
  name: 'vitals',
  command: '/vitals',
  icon: '💓',
  title: 'VITAL SIGNS RECORD',
  purpose: 'Record patient vital signs at the bedside',

  steps: [
    { key: 'patientName',  question: '👤 Patient Name?' },
    { key: 'room',         question: '🏥 Room Number?' },
    { key: 'bp',           question: '🩺 Blood Pressure? (e.g. 120/80, or "-" to skip)' },
    { key: 'pulse',        question: '💓 Pulse / Heart Rate? (bpm, or "-" to skip)' },
    { key: 'temperature',  question: '🌡️ Temperature? (°C, or "-" to skip)' },
    { key: 'spo2',         question: '💨 SpO2? (%, or "-" to skip)' },
    { key: 'bloodSugar',   question: '🩸 Blood Sugar? (mmol/L, or "-" to skip)' },
    { key: 'remark',       question: '📝 Remark? (or "-" to skip)' },
  ],

  fields: ['Patient Name', 'Room Number', 'Blood Pressure', 'Pulse', 'Temperature', 'SpO2', 'Blood Sugar', 'Remark'],

  buildSummary(data) {
    const lines = [
      '📋 *Please confirm this vitals record:*',
      D, '',
      `👤 Patient Name: ${data.patientName}`,
      `🏥 Room: ${data.room}`,
      `🩺 BP: ${data.bp}`,
      `💓 Pulse: ${data.pulse}`,
      `🌡️ Temperature: ${data.temperature}`,
      `💨 SpO2: ${data.spo2}`,
      `🩸 Blood Sugar: ${data.bloodSugar}`,
      `📝 Remark: ${data.remark}`,
      '', D,
      'Reply *yes* to save  |  *no* to cancel',
    ]

    // Flag abnormal values
    const flags = []
    if (data.spo2 && parseFloat(data.spo2) < 94) flags.push('⚠️ Low SpO2 — monitor closely')
    if (data.temperature && parseFloat(data.temperature) >= 38.0) flags.push('⚠️ Fever detected')
    if (data.pulse && parseFloat(data.pulse) > 100) flags.push('⚠️ Tachycardia')
    if (data.bp) {
      const sys = parseInt(data.bp)
      if (sys >= 140) flags.push('⚠️ High blood pressure')
      if (sys < 90) flags.push('🚨 Low blood pressure')
    }
    if (flags.length) {
      lines.splice(lines.length - 2, 0, '', ...flags)
    }

    return lines.join('\n')
  },
}
