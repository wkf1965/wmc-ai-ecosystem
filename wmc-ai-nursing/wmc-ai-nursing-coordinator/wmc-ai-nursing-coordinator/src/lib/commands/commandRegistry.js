/**
 * Command Registry — central definition for all WMC AI Nursing Coordinator commands.
 *
 * Each command defines:
 *   name                    — the /command trigger
 *   description             — one-line display text
 *   icon                    — emoji prefix
 *   helpText                — inline usage shown on /help
 *   sheetTab                — primary Google Sheet tab
 *   dbTable                 — future PostgreSQL table name
 *   fields                  — ordered form steps (used by formEngine)
 *   buildConfirmationSummary(data) — formats review before nurse confirms save
 *   buildReply(data)        — confirmation reply after saving
 *   buildDbRow(data, meta)  — maps collected_data → flat DB-ready object
 *
 * Adding a new command: add one entry here + one handler in handlers/ — no other files change.
 */

// ── Validators ───────────────────────────────────────────────────────────────

const req = (label) => (v) =>
  String(v ?? '').trim() ? null : `${label} is required. Please enter a value.`

const roomVal = (v) => {
  const s = String(v ?? '').trim()
  if (!s) return 'Room number is required.'
  if (!/^\d{1,4}[A-Za-z]?$/.test(s)) return 'Enter a valid room number, e.g. 5 or 12A.'
  return null
}

const bpVal = (v) => {
  const s = String(v ?? '').trim()
  if (!s || isSkipToken(s)) return null
  if (!/^\d{2,3}\/\d{2,3}$/.test(s)) return 'Enter BP as systolic/diastolic, e.g. 120/80.'
  return null
}

const numVal = (label, min, max) => (v) => {
  const s = String(v ?? '').trim()
  if (!s || isSkipToken(s)) return null
  const n = parseFloat(s)
  if (isNaN(n)) return `${label} must be a number.`
  if (n < min || n > max) return `${label} must be between ${min} and ${max}.`
  return null
}

const choiceVal = (options) => (v) => {
  const s = String(v ?? '').trim().toLowerCase()
  if (!s) return `Please choose one of: ${options.join(', ')}`
  if (matchChoice(s, options)) return null
  return `Please choose one of: ${options.join(', ')}`
}

const yesNoVal = choiceVal(['yes', 'no'])

// ── Helpers ──────────────────────────────────────────────────────────────────

const SKIP_TOKENS = new Set(['skip', 'n/a', 'na', '-'])

export function isSkipToken(v) {
  return SKIP_TOKENS.has(String(v ?? '').trim().toLowerCase())
}

function matchChoice(input, options) {
  const s = input.toLowerCase().trim()
  return options.some((o) => o.toLowerCase() === s || o.toLowerCase().startsWith(s))
}

export function normalizeChoice(value, options) {
  const s = String(value ?? '').trim().toLowerCase()
  return options.find((o) => o.toLowerCase() === s || o.toLowerCase().startsWith(s)) ?? value
}

function todayDate() {
  return new Date().toLocaleDateString('en-MY', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

function nowTime() {
  return new Date().toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })
}

/**
 * Parse key=value pairs from inline command text.
 * Supports: key=value and key="multi word value"
 */
export function parseInlineArgs(text) {
  const result = {}
  const re = /(\w+)=(?:"([^"]*?)"|'([^']*?)'|(\S+))/g
  let m
  while ((m = re.exec(text)) !== null) {
    result[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? ''
  }
  return result
}

// ── Divider line for summaries ────────────────────────────────────────────────
const DIV = '─────────────────────────'

function row(icon, label, value) {
  if (!value || isSkipToken(value)) return null
  return `${icon} ${label}: ${value}`
}

// ── Command Definitions ──────────────────────────────────────────────────────

export const COMMAND_REGISTRY = {

  // ── /admit ─────────────────────────────────────────────────────────────────
  '/admit': {
    name: '/admit',
    icon: '🏥',
    description: 'New patient admission',
    sheetTab: 'nursing_notes',
    dbTable: 'cmd_admissions',
    helpText: '/admit — Record a new patient admission (guided form)',
    fields: [
      { key: 'patientName',    label: 'Patient Name',    icon: '👤', prompt: '👤 Patient full name?', required: true, validate: req('Patient name') },
      { key: 'age',            label: 'Age',             icon: '📅', prompt: '📅 Age?', required: false, validate: numVal('Age', 0, 120) },
      { key: 'gender',         label: 'Gender',          icon: '⚥',  prompt: '⚥ Gender? (male / female)', required: false, validate: choiceVal(['male', 'female']), normalize: (v) => normalizeChoice(v, ['male', 'female']) },
      { key: 'room',           label: 'Room',            icon: '🏥', prompt: '🏥 Room number? (e.g. 5, 12A)', required: true, validate: roomVal },
      { key: 'diagnosis',      label: 'Diagnosis',       icon: '🩺', prompt: '🩺 Primary diagnosis?', required: true, validate: req('Diagnosis') },
      { key: 'doctor',         label: 'Doctor',          icon: '👨‍⚕️', prompt: '👨‍⚕️ Attending doctor name?', required: false, validate: null },
      { key: 'admissionDate',  label: 'Admission Date',  icon: '📆', prompt: `📆 Admission date? (DD/MM/YYYY or "today")`, required: false, validate: null, transform: (v) => /^today$/i.test(v.trim()) ? todayDate() : v },
      { key: 'remark',         label: 'Remark',          icon: '📝', prompt: '📝 Any remarks? (or "skip")', required: false, validate: null },
    ],
    buildConfirmationSummary(data) {
      return [
        '🏥 *Patient Admission — Please Review*',
        DIV,
        row('👤', 'Patient', data.patientName),
        row('📅', 'Age', data.age),
        row('⚥', 'Gender', data.gender),
        row('🏥', 'Room', data.room),
        row('🩺', 'Diagnosis', data.diagnosis),
        row('👨‍⚕️', 'Doctor', data.doctor),
        row('📆', 'Date', data.admissionDate),
        row('📝', 'Remark', data.remark),
        DIV,
        '✅ Save this record?\nReply *YES* to confirm or *NO* to cancel.',
      ].filter(Boolean).join('\n')
    },
    buildReply(data) {
      return [
        '✅ *Admission Saved*',
        DIV,
        row('👤', 'Patient', data.patientName),
        row('🏥', 'Room', data.room),
        row('🩺', 'Diagnosis', data.diagnosis),
        row('📆', 'Date', data.admissionDate || todayDate()),
        DIV,
        `🕐 Recorded at ${nowTime()}`,
        'Dashboard updated. Nursing record saved.',
      ].filter(Boolean).join('\n')
    },
    buildDbRow(data, meta) {
      return {
        id: meta.id,
        timestamp: meta.timestamp,
        command_name: '/admit',
        chat_id: String(meta.chatId ?? ''),
        nurse_name: String(meta.nurseName ?? ''),
        patient_name: String(data.patientName ?? ''),
        age: data.age ? parseInt(data.age) : null,
        gender: String(data.gender ?? ''),
        room: String(data.room ?? ''),
        diagnosis: String(data.diagnosis ?? ''),
        doctor: String(data.doctor ?? ''),
        admission_date: String(data.admissionDate ?? todayDate()),
        remark: String(data.remark ?? ''),
        source: 'telegram_command',
      }
    },
  },

  // ── /vitals ────────────────────────────────────────────────────────────────
  '/vitals': {
    name: '/vitals',
    icon: '💓',
    description: 'Record patient vital signs',
    sheetTab: 'nursing_notes',
    dbTable: 'cmd_vitals',
    helpText: '/vitals — Record vital signs (guided form)',
    fields: [
      { key: 'patientName',  label: 'Patient Name',  icon: '👤', prompt: '👤 Patient full name?', required: true, validate: req('Patient name') },
      { key: 'room',         label: 'Room',          icon: '🏥', prompt: '🏥 Room number?', required: true, validate: roomVal },
      { key: 'bp',           label: 'BP',            icon: '🩺', prompt: '🩺 Blood pressure? (e.g. 120/80, or "skip")', required: false, validate: bpVal },
      { key: 'pulse',        label: 'Pulse',         icon: '💓', prompt: '💓 Pulse / heart rate (bpm)? (or "skip")', required: false, validate: numVal('Pulse', 20, 300) },
      { key: 'temperature',  label: 'Temperature',   icon: '🌡️', prompt: '🌡️ Temperature (°C)? (or "skip")', required: false, validate: numVal('Temperature', 30, 45) },
      { key: 'spo2',         label: 'SpO2',          icon: '💨', prompt: '💨 SpO2 (%)? (or "skip")', required: false, validate: numVal('SpO2', 50, 100) },
      { key: 'bloodSugar',   label: 'Blood Sugar',   icon: '🩸', prompt: '🩸 Blood sugar (mmol/L or mg/dL)? (or "skip")', required: false, validate: null },
      { key: 'remark',       label: 'Remark',        icon: '📝', prompt: '📝 Any remarks? (or "skip")', required: false, validate: null },
    ],
    buildConfirmationSummary(data) {
      const flags = []
      if (data.spo2 && parseFloat(data.spo2) < 94) flags.push('⚠️ Low SpO2')
      if (data.temperature && parseFloat(data.temperature) >= 38.0) flags.push('⚠️ Fever detected')
      if (data.pulse && parseFloat(data.pulse) > 100) flags.push('⚠️ Tachycardia')
      if (data.bp) { const sys = parseInt(data.bp); if (sys >= 140) flags.push('⚠️ High BP'); if (sys < 90) flags.push('🚨 Low BP') }

      return [
        '💓 *Vital Signs — Please Review*',
        DIV,
        row('👤', 'Patient', data.patientName),
        row('🏥', 'Room', data.room),
        row('🩺', 'BP', data.bp ? `${data.bp} mmHg` : null),
        row('💓', 'Pulse', data.pulse ? `${data.pulse} bpm` : null),
        row('🌡️', 'Temp', data.temperature ? `${data.temperature}°C` : null),
        row('💨', 'SpO2', data.spo2 ? `${data.spo2}%` : null),
        row('🩸', 'Blood Sugar', data.bloodSugar),
        row('📝', 'Remark', data.remark),
        flags.length ? '' : null,
        ...flags,
        DIV,
        '✅ Save this record?\nReply *YES* to confirm or *NO* to cancel.',
      ].filter(Boolean).join('\n')
    },
    buildReply(data) {
      const flags = []
      if (data.spo2 && parseFloat(data.spo2) < 94) flags.push('⚠️ Low SpO2 — monitor closely')
      if (data.temperature && parseFloat(data.temperature) >= 38.0) flags.push('⚠️ Fever — notify doctor if persistent')
      if (data.pulse && parseFloat(data.pulse) > 100) flags.push('⚠️ Tachycardia — assess patient')
      if (data.bp) { const sys = parseInt(data.bp); if (sys >= 140) flags.push('⚠️ High BP — recheck in 30 min'); if (sys < 90) flags.push('🚨 Low BP — notify doctor now') }

      return [
        '✅ *Vitals Saved*',
        DIV,
        row('👤', 'Patient', data.patientName),
        row('🏥', 'Room', data.room),
        row('🩺', 'BP', data.bp ? `${data.bp} mmHg` : null),
        row('💓', 'Pulse', data.pulse ? `${data.pulse} bpm` : null),
        row('🌡️', 'Temp', data.temperature ? `${data.temperature}°C` : null),
        row('💨', 'SpO2', data.spo2 ? `${data.spo2}%` : null),
        row('🩸', 'Blood Sugar', data.bloodSugar),
        flags.length ? DIV : null,
        ...flags,
        DIV,
        `🕐 Recorded at ${nowTime()}`,
      ].filter(Boolean).join('\n')
    },
    buildDbRow(data, meta) {
      return {
        id: meta.id,
        timestamp: meta.timestamp,
        command_name: '/vitals',
        chat_id: String(meta.chatId ?? ''),
        nurse_name: String(meta.nurseName ?? ''),
        patient_name: String(data.patientName ?? ''),
        room: String(data.room ?? ''),
        bp: String(data.bp ?? ''),
        pulse: data.pulse ? parseFloat(data.pulse) : null,
        temperature: data.temperature ? parseFloat(data.temperature) : null,
        spo2: data.spo2 ? parseFloat(data.spo2) : null,
        blood_sugar: String(data.bloodSugar ?? ''),
        remark: String(data.remark ?? ''),
        source: 'telegram_command',
      }
    },
  },

  // ── /fall ──────────────────────────────────────────────────────────────────
  '/fall': {
    name: '/fall',
    icon: '🚨',
    description: 'Fall incident report',
    sheetTab: 'fall_risk',
    dbTable: 'cmd_fall_incidents',
    helpText: '/fall — Report a fall incident (guided form)',
    fields: [
      { key: 'patientName',    label: 'Patient Name',    icon: '👤', prompt: '👤 Patient full name?', required: true, validate: req('Patient name') },
      { key: 'room',           label: 'Room',            icon: '🏥', prompt: '🏥 Room number?', required: true, validate: roomVal },
      { key: 'incidentTime',   label: 'Time',            icon: '🕐', prompt: `🕐 Time of incident? (e.g. 14:30, or "now")`, required: true, validate: req('Time'), transform: (v) => /^now$/i.test(v.trim()) ? nowTime() : v },
      { key: 'location',       label: 'Location',        icon: '📍', prompt: '📍 Where did it happen? (e.g. bathroom, bedside, corridor)', required: true, validate: req('Location') },
      { key: 'whatHappened',   label: 'What happened',   icon: '📋', prompt: '📋 What happened? (describe briefly)', required: true, validate: req('Description') },
      { key: 'injury',         label: 'Injury',          icon: '🩹', prompt: '🩹 Any injuries noted? (e.g. bruise on left knee, or "none")', required: true, validate: req('Injury status') },
      { key: 'actionTaken',    label: 'Action taken',    icon: '🏃', prompt: '🏃 Action taken? (e.g. helped patient up, assessed, applied ice)', required: true, validate: req('Action taken') },
      { key: 'doctorInformed', label: 'Doctor informed', icon: '👨‍⚕️', prompt: '👨‍⚕️ Doctor informed? (yes / no)', required: true, validate: yesNoVal, normalize: (v) => normalizeChoice(v, ['yes', 'no']) },
      { key: 'familyInformed', label: 'Family informed', icon: '👨‍👩‍👧', prompt: '👨‍👩‍👧 Family informed? (yes / no)', required: true, validate: yesNoVal, normalize: (v) => normalizeChoice(v, ['yes', 'no']) },
    ],
    buildConfirmationSummary(data) {
      return [
        '🚨 *Fall Incident — Please Review*',
        DIV,
        row('👤', 'Patient', data.patientName),
        row('🏥', 'Room', data.room),
        row('🕐', 'Time', data.incidentTime),
        row('📍', 'Location', data.location),
        row('📋', 'What happened', data.whatHappened),
        row('🩹', 'Injury', data.injury),
        row('🏃', 'Action taken', data.actionTaken),
        row('👨‍⚕️', 'Doctor informed', data.doctorInformed),
        row('👨‍👩‍👧', 'Family informed', data.familyInformed),
        DIV,
        '✅ Save this record?\nReply *YES* to confirm or *NO* to cancel.',
      ].filter(Boolean).join('\n')
    },
    buildReply(data) {
      const hasInjury = data.injury && !/^none$/i.test(data.injury.trim())
      return [
        hasInjury ? '🚨 *Fall Incident Saved — INJURY REPORTED*' : '⚠️ *Fall Incident Saved*',
        DIV,
        row('👤', 'Patient', data.patientName),
        row('🏥', 'Room', data.room),
        row('🕐', 'Time', data.incidentTime),
        row('📍', 'Location', data.location),
        row('🩹', 'Injury', data.injury),
        row('👨‍⚕️', 'Doctor informed', data.doctorInformed),
        DIV,
        hasInjury
          ? '🔴 Complete incident report. Notify supervisor. Reassess in 1 hour.'
          : '📋 Document in care plan. Monitor fall risk. Increase check frequency.',
        `🕐 Recorded at ${nowTime()}`,
      ].filter(Boolean).join('\n')
    },
    buildDbRow(data, meta) {
      return {
        id: meta.id,
        timestamp: meta.timestamp,
        command_name: '/fall',
        chat_id: String(meta.chatId ?? ''),
        nurse_name: String(meta.nurseName ?? ''),
        patient_name: String(data.patientName ?? ''),
        room: String(data.room ?? ''),
        incident_time: String(data.incidentTime ?? ''),
        location: String(data.location ?? ''),
        what_happened: String(data.whatHappened ?? ''),
        injury: String(data.injury ?? ''),
        action_taken: String(data.actionTaken ?? ''),
        doctor_informed: String(data.doctorInformed ?? ''),
        family_informed: String(data.familyInformed ?? ''),
        source: 'telegram_command',
      }
    },
  },

  // ── /turning ───────────────────────────────────────────────────────────────
  '/turning': {
    name: '/turning',
    icon: '🔄',
    description: 'Side turning / repositioning record',
    sheetTab: 'turning_schedule',
    dbTable: 'cmd_turning_records',
    helpText: '/turning — Record patient repositioning (guided form)',
    fields: [
      { key: 'patientName',   label: 'Patient Name',   icon: '👤', prompt: '👤 Patient full name?', required: true, validate: req('Patient name') },
      { key: 'room',          label: 'Room',           icon: '🏥', prompt: '🏥 Room number?', required: true, validate: roomVal },
      { key: 'position',      label: 'Position',       icon: '🔄', prompt: '🔄 Turned to which position?\n• left\n• right\n• supine (flat on back)\n• prone (face down)', required: true, validate: choiceVal(['left', 'right', 'supine', 'prone']), normalize: (v) => normalizeChoice(v, ['left', 'right', 'supine', 'prone']) },
      { key: 'skinCondition', label: 'Skin condition', icon: '🩺', prompt: '🩺 Skin condition at pressure points? (e.g. intact, redness on sacrum)', required: true, validate: req('Skin condition') },
      { key: 'turningTime',   label: 'Time',           icon: '🕐', prompt: `🕐 Time of turning? (e.g. 14:00, or "now")`, required: true, validate: req('Time'), transform: (v) => /^now$/i.test(v.trim()) ? nowTime() : v },
      { key: 'photoRequired', label: 'Photo required', icon: '📸', prompt: '📸 Photo required for wound/skin documentation? (yes / no)', required: false, validate: yesNoVal, normalize: (v) => normalizeChoice(v, ['yes', 'no']) },
      { key: 'remark',        label: 'Remark',         icon: '📝', prompt: '📝 Any remarks? (or "skip")', required: false, validate: null },
    ],
    buildConfirmationSummary(data) {
      return [
        '🔄 *Side Turning — Please Review*',
        DIV,
        row('👤', 'Patient', data.patientName),
        row('🏥', 'Room', data.room),
        row('🔄', 'Position', data.position),
        row('🩺', 'Skin condition', data.skinCondition),
        row('🕐', 'Time', data.turningTime),
        row('📸', 'Photo required', data.photoRequired),
        row('📝', 'Remark', data.remark),
        DIV,
        '✅ Save this record?\nReply *YES* to confirm or *NO* to cancel.',
      ].filter(Boolean).join('\n')
    },
    buildReply(data) {
      const skinConcern = data.skinCondition && !/intact|normal|clear|good/i.test(data.skinCondition)
      return [
        '✅ *Turning Record Saved*',
        DIV,
        row('👤', 'Patient', data.patientName),
        row('🏥', 'Room', data.room),
        row('🔄', 'Position', data.position),
        row('🩺', 'Skin', data.skinCondition),
        row('🕐', 'Time', data.turningTime),
        skinConcern ? '⚠️ Skin change noted — document and escalate if worsening.' : null,
        data.photoRequired === 'yes' ? '📸 Photo documentation required.' : null,
        DIV,
        'Next turning due in 2 hours. Continue Q2H schedule.',
      ].filter(Boolean).join('\n')
    },
    buildDbRow(data, meta) {
      return {
        id: meta.id,
        timestamp: meta.timestamp,
        command_name: '/turning',
        chat_id: String(meta.chatId ?? ''),
        nurse_name: String(meta.nurseName ?? ''),
        patient_name: String(data.patientName ?? ''),
        room: String(data.room ?? ''),
        position: String(data.position ?? ''),
        skin_condition: String(data.skinCondition ?? ''),
        turning_time: String(data.turningTime ?? ''),
        photo_required: String(data.photoRequired ?? 'no'),
        remark: String(data.remark ?? ''),
        source: 'telegram_command',
      }
    },
  },

  // ── /rehab ─────────────────────────────────────────────────────────────────
  '/rehab': {
    name: '/rehab',
    icon: '🏃',
    description: 'Rehabilitation session progress',
    sheetTab: 'rehab_tracking',
    dbTable: 'cmd_rehab_sessions',
    helpText: '/rehab — Log rehab session progress (guided form)',
    fields: [
      { key: 'patientName',     label: 'Patient Name',     icon: '👤', prompt: '👤 Patient full name?', required: true, validate: req('Patient name') },
      { key: 'room',            label: 'Room',             icon: '🏥', prompt: '🏥 Room number?', required: true, validate: roomVal },
      { key: 'exerciseDone',    label: 'Exercise done',    icon: '🏃', prompt: '🏃 Exercise or activity done?\n(e.g. walking 10m, range of motion, standing practice, stair climbing)', required: true, validate: req('Exercise') },
      { key: 'walkingDistance', label: 'Walking distance', icon: '📏', prompt: '📏 Walking distance achieved? (e.g. 10 metres, or "not applicable")', required: false, validate: null },
      { key: 'painScore',       label: 'Pain score',       icon: '😣', prompt: '😣 Pain score during activity? (0–10, where 0 = no pain)', required: false, validate: numVal('Pain score', 0, 10) },
      { key: 'progress',        label: 'Progress',         icon: '📈', prompt: '📈 Overall progress today?\n• poor\n• fair\n• good\n• excellent', required: true, validate: choiceVal(['poor', 'fair', 'good', 'excellent']), normalize: (v) => normalizeChoice(v, ['poor', 'fair', 'good', 'excellent']) },
      { key: 'therapistRemark', label: 'Therapist remark', icon: '📝', prompt: '📝 Therapist or nurse remarks? (or "skip")', required: false, validate: null },
    ],
    buildConfirmationSummary(data) {
      return [
        '🏃 *Rehab Session — Please Review*',
        DIV,
        row('👤', 'Patient', data.patientName),
        row('🏥', 'Room', data.room),
        row('🏃', 'Exercise', data.exerciseDone),
        row('📏', 'Walking distance', data.walkingDistance),
        row('😣', 'Pain score', data.painScore !== undefined ? `${data.painScore}/10` : null),
        row('📈', 'Progress', data.progress),
        row('📝', 'Remark', data.therapistRemark),
        DIV,
        '✅ Save this record?\nReply *YES* to confirm or *NO* to cancel.',
      ].filter(Boolean).join('\n')
    },
    buildReply(data) {
      const emoji = { poor: '🔴', fair: '🟡', good: '🟢', excellent: '⭐' }[data.progress] ?? '📈'
      const pain = data.painScore ? parseInt(data.painScore) : null
      return [
        '✅ *Rehab Session Saved*',
        DIV,
        row('👤', 'Patient', data.patientName),
        row('🏥', 'Room', data.room),
        row('🏃', 'Activity', data.exerciseDone),
        row('📏', 'Distance', data.walkingDistance),
        row('😣', 'Pain', data.painScore ? `${data.painScore}/10` : null),
        `${emoji} Progress: ${data.progress}`,
        pain !== null && pain >= 7 ? '⚠️ High pain score — reassess and consider analgesia.' : null,
        DIV,
        `🕐 Recorded at ${nowTime()}`,
      ].filter(Boolean).join('\n')
    },
    buildDbRow(data, meta) {
      return {
        id: meta.id,
        timestamp: meta.timestamp,
        command_name: '/rehab',
        chat_id: String(meta.chatId ?? ''),
        nurse_name: String(meta.nurseName ?? ''),
        patient_name: String(data.patientName ?? ''),
        room: String(data.room ?? ''),
        exercise_done: String(data.exerciseDone ?? ''),
        walking_distance: String(data.walkingDistance ?? ''),
        pain_score: data.painScore !== undefined ? parseInt(data.painScore) : null,
        progress: String(data.progress ?? ''),
        therapist_remark: String(data.therapistRemark ?? ''),
        source: 'telegram_command',
      }
    },
  },

  // ── /med ───────────────────────────────────────────────────────────────────
  '/med': {
    name: '/med',
    icon: '💊',
    description: 'Medication administration record (MAR)',
    sheetTab: 'medication',
    dbTable: 'cmd_medications',
    helpText: '/med — Record medication given (guided form)',
    fields: [
      { key: 'patientName',  label: 'Patient Name',  icon: '👤', prompt: '👤 Patient full name?', required: true, validate: req('Patient name') },
      { key: 'room',         label: 'Room',          icon: '🏥', prompt: '🏥 Room number?', required: true, validate: roomVal },
      { key: 'medicineName', label: 'Medicine name', icon: '💊', prompt: '💊 Medicine name?', required: true, validate: req('Medicine name') },
      { key: 'dosage',       label: 'Dosage',        icon: '💉', prompt: '💉 Dosage? (e.g. 500mg, 10ml, 2 units)', required: true, validate: req('Dosage') },
      { key: 'timeGiven',    label: 'Time given',    icon: '🕐', prompt: `🕐 Time given? (e.g. 14:00, or "now")`, required: true, validate: req('Time'), transform: (v) => /^now$/i.test(v.trim()) ? nowTime() : v },
      { key: 'givenBy',      label: 'Given by',      icon: '✍️', prompt: '✍️ Given by (nurse name or initials)?', required: true, validate: req('Nurse name') },
      { key: 'remark',       label: 'Remark',        icon: '📝', prompt: '📝 Any remarks? (e.g. patient refused, given late — or "skip")', required: false, validate: null },
    ],
    buildConfirmationSummary(data) {
      return [
        '💊 *Medication — Please Review*',
        DIV,
        row('👤', 'Patient', data.patientName),
        row('🏥', 'Room', data.room),
        row('💊', 'Medicine', data.medicineName),
        row('💉', 'Dosage', data.dosage),
        row('🕐', 'Time given', data.timeGiven),
        row('✍️', 'Given by', data.givenBy),
        row('📝', 'Remark', data.remark),
        DIV,
        '✅ Save this MAR record?\nReply *YES* to confirm or *NO* to cancel.',
      ].filter(Boolean).join('\n')
    },
    buildReply(data) {
      return [
        '✅ *Medication Record Saved (MAR)*',
        DIV,
        row('👤', 'Patient', data.patientName),
        row('🏥', 'Room', data.room),
        row('💊', 'Medicine', `${data.medicineName} ${data.dosage}`),
        row('🕐', 'Given at', data.timeGiven),
        row('✍️', 'Given by', data.givenBy),
        row('📝', 'Remark', data.remark),
        DIV,
        'MAR updated. Next dose time confirmed in medication schedule.',
      ].filter(Boolean).join('\n')
    },
    buildDbRow(data, meta) {
      return {
        id: meta.id,
        timestamp: meta.timestamp,
        command_name: '/med',
        chat_id: String(meta.chatId ?? ''),
        nurse_name: String(meta.nurseName ?? ''),
        patient_name: String(data.patientName ?? ''),
        room: String(data.room ?? ''),
        medicine_name: String(data.medicineName ?? ''),
        dosage: String(data.dosage ?? ''),
        time_given: String(data.timeGiven ?? ''),
        given_by: String(data.givenBy ?? ''),
        remark: String(data.remark ?? ''),
        source: 'telegram_command',
      }
    },
  },

  // ── /alert ─────────────────────────────────────────────────────────────────
  '/alert': {
    name: '/alert',
    icon: '🚨',
    description: 'Emergency / clinical alert',
    sheetTab: 'risk_alerts',
    dbTable: 'cmd_clinical_alerts',
    helpText: '/alert — Send an urgent clinical alert (guided form)',
    fields: [
      { key: 'patientName',    label: 'Patient Name',    icon: '👤', prompt: '👤 Patient full name?', required: true, validate: req('Patient name') },
      { key: 'room',           label: 'Room',            icon: '🏥', prompt: '🏥 Room number?', required: true, validate: roomVal },
      { key: 'emergencyType',  label: 'Emergency type',  icon: '⚠️', prompt: '⚠️ Emergency type?\n(e.g. desaturation, chest pain, unresponsive, bleeding, fall with injury, seizure)', required: true, validate: req('Emergency type') },
      { key: 'currentCondition', label: 'Current condition', icon: '🩺', prompt: '🩺 Current patient condition?', required: true, validate: req('Current condition') },
      { key: 'actionTaken',    label: 'Action taken',    icon: '🏃', prompt: '🏃 Action taken so far?', required: true, validate: req('Action taken') },
      { key: 'doctorInformed', label: 'Doctor informed', icon: '👨‍⚕️', prompt: '👨‍⚕️ Doctor informed? (yes / no)', required: true, validate: yesNoVal, normalize: (v) => normalizeChoice(v, ['yes', 'no']) },
      { key: 'urgencyLevel',   label: 'Urgency level',   icon: '🔴', prompt: '🔴 Urgency level?\n• low\n• medium\n• high\n• critical', required: true, validate: choiceVal(['low', 'medium', 'high', 'critical']), normalize: (v) => normalizeChoice(v, ['low', 'medium', 'high', 'critical']) },
    ],
    buildConfirmationSummary(data) {
      return [
        '🚨 *Clinical Alert — Please Review*',
        DIV,
        row('👤', 'Patient', data.patientName),
        row('🏥', 'Room', data.room),
        row('⚠️', 'Emergency type', data.emergencyType),
        row('🩺', 'Condition', data.currentCondition),
        row('🏃', 'Action taken', data.actionTaken),
        row('👨‍⚕️', 'Doctor informed', data.doctorInformed),
        row('🔴', 'Urgency', data.urgencyLevel),
        DIV,
        '✅ Save this alert?\nReply *YES* to confirm or *NO* to cancel.',
      ].filter(Boolean).join('\n')
    },
    buildReply(data) {
      const levelEmoji = { low: '🟡', medium: '🟠', high: '🔴', critical: '🚨' }[data.urgencyLevel] ?? '⚠️'
      const nextAction = {
        low: 'Continue monitoring. Document in care notes.',
        medium: 'Notify charge nurse. Reassess in 30 minutes.',
        high: 'Doctor must review immediately. Prepare emergency tray.',
        critical: '🚨 CODE RESPONSE. All hands on deck. Escalate now.',
      }[data.urgencyLevel] ?? 'Assess and escalate as needed.'

      return [
        `${levelEmoji} *ALERT SAVED — ${data.urgencyLevel.toUpperCase()}*`,
        DIV,
        row('👤', 'Patient', data.patientName),
        row('🏥', 'Room', data.room),
        row('⚠️', 'Type', data.emergencyType),
        row('🩺', 'Condition', data.currentCondition),
        row('👨‍⚕️', 'Doctor informed', data.doctorInformed),
        DIV,
        `📋 Next action: ${nextAction}`,
        `🕐 Recorded at ${nowTime()}`,
      ].filter(Boolean).join('\n')
    },
    buildDbRow(data, meta) {
      return {
        id: meta.id,
        timestamp: meta.timestamp,
        command_name: '/alert',
        chat_id: String(meta.chatId ?? ''),
        nurse_name: String(meta.nurseName ?? ''),
        patient_name: String(data.patientName ?? ''),
        room: String(data.room ?? ''),
        emergency_type: String(data.emergencyType ?? ''),
        current_condition: String(data.currentCondition ?? ''),
        action_taken: String(data.actionTaken ?? ''),
        doctor_informed: String(data.doctorInformed ?? ''),
        urgency_level: String(data.urgencyLevel ?? ''),
        source: 'telegram_command',
      }
    },
  },
}

// ── Registry helpers ─────────────────────────────────────────────────────────

export const COMMAND_NAMES = new Set(Object.keys(COMMAND_REGISTRY))

/** @param {string} name */
export function getCommandDef(name) {
  return COMMAND_REGISTRY[String(name).toLowerCase()] ?? null
}

/**
 * Detect a /command at the start of text.
 * @param {string} text
 * @returns {{ commandName: string, argText: string }|null}
 */
export function detectCommand(text) {
  const s = String(text ?? '').trim()
  const m = s.match(/^(\/[a-zA-Z]+)(?:\s+(.*))?$/s)
  if (!m) return null
  const commandName = m[1].toLowerCase()
  if (!COMMAND_NAMES.has(commandName)) return null
  return { commandName, argText: (m[2] ?? '').trim() }
}

/**
 * Build the /start welcome message.
 */
export function buildStartMessage(nurseName) {
  const name = nurseName ? ` ${nurseName.split(' ')[0]}` : ''
  return [
    `👋 *Welcome${name} to WMC AI Nursing Coordinator*`,
    '',
    'I help you submit structured nursing records step by step.',
    'Every record is saved to the dashboard and Google Sheets.',
    '',
    '📋 *Available Commands:*',
    '',
    '🏥 /admit — New patient admission',
    '💓 /vitals — Record vital signs',
    '🚨 /fall — Fall incident report',
    '🔄 /turning — Side turning record',
    '🏃 /rehab — Rehab session progress',
    '💊 /med — Medication record (MAR)',
    '🆘 /alert — Emergency clinical alert',
    '',
    '📊 /handover — AI shift handover summary',
    '📈 /timeline — Patient condition timeline',
    '',
    'Type any command to begin.',
    'Send /cancel at any time to stop a form.',
  ].join('\n')
}

/**
 * Build the /help command reply.
 */
export function buildCommandHelpReply() {
  const lines = [
    '📋 *WMC AI Nursing Coordinator — Command Reference*',
    '',
  ]
  for (const def of Object.values(COMMAND_REGISTRY)) {
    lines.push(`${def.icon} ${def.helpText}`)
  }
  lines.push('')
  lines.push('📊 /handover — AI shift handover summary (no form needed)')
  lines.push('📈 /timeline — Patient condition timeline (no form needed)')
  lines.push('/cancel — Cancel current form')
  lines.push('/help — Show this help')
  lines.push('')
  lines.push('💡 *Tip:* You can fill fields inline or answer prompts step by step.')
  lines.push('Example: /vitals room=5 bp=120/80 pulse=72')
  return lines.join('\n')
}
