import { analyzePatientNotes } from './aiRiskDetection.js'
import {
  generateAiNursingNoteDraft,
  parseTelegramNurseMessage,
} from './telegramNurseParser.js'
import {
  noteRowPatientId,
  resolvePatientForTelegramMessage,
  rosterPatientDisplayName,
} from './patientRosterResolve.js'
import { isProductionNursingMode } from './nursingMode.js'

export const TELEGRAM_ENV = {
  mode: typeof import.meta !== 'undefined' ? import.meta.env?.VITE_TELEGRAM_MODE || 'simulation' : 'simulation',
  botTokenSet: typeof import.meta !== 'undefined' ? Boolean(import.meta.env?.VITE_TELEGRAM_BOT_TOKEN) : false,
  chatIdSet: typeof import.meta !== 'undefined' ? Boolean(import.meta.env?.VITE_TELEGRAM_CHAT_ID) : false,
}

function filterNotesForPatient(nursingNotes, patientId) {
  const pid = String(patientId || '')
  return (nursingNotes || []).filter((n) => String(noteRowPatientId(n) || n.patientId || '') === pid)
}

/**
 * After roster match: prefer Sheet patient_name; if missing or Unknown, use name extracted from Telegram.
 */
export function resolveAcknowledgedPatientName(parsed, patient) {
  const rosterRaw = rosterPatientDisplayName(patient)
  const rosterName = String(rosterRaw ?? '').trim()
  if (rosterName && rosterName !== 'Unknown') return rosterName

  const telegramName = String(parsed?.patientNameGuess ?? '').trim()
  if (telegramName) return telegramName

  return rosterName || 'Unknown'
}

/**
 * Build nursing note payload from Telegram parse for a **resolved** roster patient only.
 */
export function buildNursingNotePayloadFromTelegram(parse, patientId, patientNameSnapshot) {
  const t = parse.nursingNoteText.toLowerCase()
  let painScore = 0
  if (/\bpain\s*[-:]?\s*(\d+)/i.test(parse.originalText)) {
    const m = parse.originalText.match(/\bpain\s*[-:]?\s*(\d+)/i)
    painScore = Math.min(10, Math.max(0, parseInt(m[1], 10)))
  } else if (/\b(fell|fall|severe)\b/i.test(t)) painScore = 5

  let appetite = ''
  if (/refused\s+lunch|refused\s+meal|poor\s+appetite|skipped\s+meal/i.test(t)) appetite = 'Reduced intake per Telegram report'
  if (/dark\s+urine|dehydrat/i.test(t)) appetite = appetite ? `${appetite}; fluid concern noted` : 'Fluid intake concern per Telegram report'

  let mood = ''
  if (/confus/i.test(t)) mood = 'Appears confused per quick report'
  else if (/weak\s+mobility|unsteady/i.test(t)) mood = 'Reports weakness / mobility concern'

  let urination = ''
  if (/dark\s+urine/i.test(t)) urination = 'Dark urine reported — verify I/O'

  let skinCondition = ''
  if (/wound|redness/i.test(t)) skinCondition = 'Skin/wound change reported — assess site'

  const abnormalEvents = parse.riskKeywords.slice(0, 8).join('; ') || 'Telegram quick entry'

  const nurseRemarks = generateAiNursingNoteDraft(parse, patientNameSnapshot)

  return {
    patientId: patientId || '',
    patientNameSnapshot: patientNameSnapshot || '',
    date: new Date().toISOString().slice(0, 10),
    shift: 'Day',
    author: 'Telegram Nurse Bot',
    appetite,
    sleep: '',
    painScore,
    mood,
    bloodPressure: '',
    bloodSugar: '',
    urination,
    bowelMovement: '',
    skinCondition,
    abnormalEvents,
    nurseRemarks,
  }
}

/**
 * Run AI risk on latest notes for patient (requires notes sorted newest first for that patient).
 */
export function analyzeTelegramPatientRisk(patientId, allNotes, getPatientById) {
  const mine = filterNotesForPatient(allNotes, patientId)
  mine.sort((a, b) => {
    const da = a.date || ''
    const db = b.date || ''
    if (da !== db) return db.localeCompare(da)
    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
  })
  const patient = getPatientById(patientId)
  return analyzePatientNotes(mine, patient)
}

export function recommendedActionFromAnalysis(analysis, parse = null) {
  if (analysis?.telegramPatientUnresolved) return ''
  if (!analysis || analysis.insufficientData) {
    return 'Continue routine monitoring per protocol.'
  }
  const top = [...(analysis.categories || [])].sort((a, b) => b.score - a.score)[0]
  if (!top) return 'Continue routine surveillance.'
  const base = `${top.label}: ${top.recommendedAction}`
  if (isProductionNursingMode()) return base
  return `${base} (Overall score ${analysis.overallScore})`
}

export function buildTelegramProcessingErrorIntegration(parsed) {
  return buildUnresolvedTelegramIntegration(parsed, 'processing_error')
}

function buildUnresolvedTelegramIntegration(parsed, code) {
  return {
    parsed,
    patientId: null,
    patientNameResolved: null,
    patientResolution: code,
    nursingPayload: null,
    analysis: {
      patientId: null,
      patientName: '',
      noteCount: 0,
      lastNoteDate: null,
      overallScore: null,
      anyEscalation: false,
      categories: [],
      insufficientData: true,
      telegramPatientUnresolved: true,
      unresolvedReason: code,
    },
    recommendedAction: '',
    aiNursingNoteDraft: '',
  }
}

/**
 * @param {object} parsed — from parseTelegramNurseMessage(rawText)
 * @param {object} rosterCtx
 * @param {object[]} rosterCtx.patients — roster rows (normalized or raw Sheet rows)
 * @param {object[]} [rosterCtx.nursingNotes]
 * @param {{ patient: object|null, error: null|string }} rosterCtx.resolution — from resolvePatientForTelegramMessage, or { error: 'roster_unavailable' }
 */
export function processTelegramNurseMessageForIntegration(parsed, rosterCtx) {
  const { nursingNotes = [], resolution } = rosterCtx || {}

  if (resolution?.error === 'roster_unavailable') {
    return buildUnresolvedTelegramIntegration(parsed, 'roster_unavailable')
  }
  if (resolution?.error === 'room_not_found') {
    return buildUnresolvedTelegramIntegration(parsed, 'patient_room_not_found')
  }
  if (resolution?.error === 'room_required') {
    return buildUnresolvedTelegramIntegration(parsed, 'room_required')
  }
  if (resolution?.error === 'ambiguous') {
    return buildUnresolvedTelegramIntegration(parsed, 'ambiguous_patient')
  }
  if (!resolution?.patient) {
    return buildUnresolvedTelegramIntegration(parsed, 'patient_not_found')
  }

  const patient = resolution.patient
  const patientId = patient.id
  /** Prefer Patientsroom sheet name; if empty/Unknown, use Telegram-extracted name (e.g. "Room 2 patient Ali …"). */
  const patientNameSnapshot = resolveAcknowledgedPatientName(parsed, patient)
  const resolvedRoom =
    patient.room != null && String(patient.room).trim() !== '' ? String(patient.room).trim() : null

  const nursingPayload = buildNursingNotePayloadFromTelegram(parsed, patientId, patientNameSnapshot)

  const historical = filterNotesForPatient(nursingNotes, patientId)
  const hypotheticalNotes = [
    {
      ...nursingPayload,
      id: '__telegram_preview__',
      createdAt: new Date().toISOString(),
    },
    ...historical,
  ]
  hypotheticalNotes.sort((a, b) => {
    const da = a.date || ''
    const db = b.date || ''
    if (da !== db) return db.localeCompare(da)
    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
  })

  const analysis = analyzePatientNotes(hypotheticalNotes, patient)

  return {
    parsed,
    patientId,
    patientNameResolved: patientNameSnapshot,
    resolvedRoom,
    patientResolution: null,
    nursingPayload,
    analysis,
    recommendedAction: recommendedActionFromAnalysis(analysis, parsed),
    aiNursingNoteDraft: nursingPayload.nurseRemarks,
  }
}

/**
 * Browser / local roster: respects {@link NURSING_MODE}=production when set via env (same rules as webhook).
 */
export function runTelegramIntegrationFromLocalState(rawText, patients, nursingNotes) {
  const parsed = parseTelegramNurseMessage(rawText)
  const resolution = resolvePatientForTelegramMessage(patients, parsed, {
    production: isProductionNursingMode(),
  })
  return processTelegramNurseMessageForIntegration(parsed, { patients, nursingNotes, resolution })
}
