import { deriveRiskScore } from '../db/patientSchema.js'
import { getAllPatients, createPatient, updatePatient } from '../db/patientStorage.js'
import { getAllNursingNotes, createNursingNote } from '../db/nursingNoteStorage.js'

const MEDICATION_STORAGE_KEY = 'wmc_medication_tracking_v1'
const VITAL_SIGNS_STORAGE_KEY = 'wmc_vital_signs_v1'
const REHAB_STORAGE_KEY = 'wmc_rehab_tracking_sessions_v1'
const AI_RISK_STORAGE_KEY = 'wmc_ai_risks_v1'
const ESCALATION_STORAGE_KEY = 'wmc_mobile_nurse_escalations_v1'
const SHIFT_HANDOVER_STORAGE_KEY = 'wmc_shift_handover_records_v1'
const DOCTOR_REVIEW_RECORDS_KEY = 'wmc_doctor_review_records_v1'
const SYNC_STATUS_KEY = 'wmc_google_sheet_sync_status_v1'

export const GOOGLE_SHEET_TABLES = {
  patients: 'patientsroom',
  nursing_notes: 'nursing_notes',
  vital_signs: 'vital_signs',
  medications: 'medications',
  ai_risks: 'ai_risks',
  escalations: 'escalations',
  shift_handover: 'shift_handover',
  doctor_review: 'doctor_review',
  rehab_sessions: 'rehab_sessions',
}

const SYNC_LABELS = {
  local_only: 'Local only',
  synced: 'Synced to Google Sheet',
  failed: 'Sync failed',
}

const SYNC_BADGE_VARIANTS = {
  local_only: 'warning',
  synced: 'success',
  failed: 'danger',
}

function nowIso() {
  return new Date().toISOString()
}

function newId(prefix = 'id') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function readRaw(key) {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed
  } catch {
    return null
  }
}

function writeRaw(key, value) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // keep local-only simulation safe
  }
}

function getEnv(name) {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    const env = import.meta.env
    return env[`VITE_${name}`] ?? env[name] ?? ''
  }
  return ''
}

function safeString(value) {
  return String(value || '').trim()
}

function normalizeList(value) {
  if (!Array.isArray(value)) return []
  return value.filter(Boolean)
}

function normalizeWebhookResponsePayload(raw) {
  if (!raw) return null
  if (typeof raw === 'object') return raw
  try {
    return JSON.parse(raw)
  } catch {
    return { message: raw }
  }
}

function selectSummaryStatus(entries) {
  if (entries.some((entry) => entry?.status === 'failed')) return 'failed'
  if (entries.some((entry) => entry?.status === 'local_only')) return 'local_only'
  return 'synced'
}

function selectSummaryMessage(entries) {
  const messages = entries
    .map((entry) => String(entry?.message || '').trim())
    .filter(Boolean)
  if (messages.length === 0) return ''
  return messages.join(' | ')
}

function buildVitalSignRowFromNursingNote(note) {
  const base = {
    patientId: note?.patientId || '',
    patientNameSnapshot: note?.patientNameSnapshot || '',
    recordedAt: note?.recordedAt || note?.createdAt || nowIso(),
    recordedBy: note?.author || 'Nursing staff',
    bloodPressure: note?.bloodPressure || '',
    bloodSugar: note?.bloodSugar || '',
    pulse: note?.pulse || note?.heartRate || '',
    oxygenSaturation: note?.oxygenSaturation || '',
    temperature: note?.temperature || '',
    urination: note?.urination || '',
    bowelMovement: note?.bowelMovement || '',
    noteSource: 'nursing_note',
    sourceCreatedAt: note?.createdAt || '',
  }
  const hasVital = ['bloodPressure', 'bloodSugar', 'pulse', 'oxygenSaturation', 'temperature', 'urination', 'bowelMovement'].some(
    (key) => String(base[key] || '').trim(),
  )
  if (!hasVital) return null
  return {
    id: `${note?.id || newId('nn')}_vitals`,
    ...base,
  }
}

function readSyncState() {
  const raw = readRaw(SYNC_STATUS_KEY)
  if (!raw || typeof raw !== 'object') return {}
  return raw
}

function writeSyncState(next) {
  writeRaw(SYNC_STATUS_KEY, next)
}

function setRecordSyncStatus(table, recordId, status, details) {
  const state = readSyncState()
  if (!state[table] || typeof state[table] !== 'object') {
    state[table] = {}
  }
  state[table][recordId] = {
    status,
    message: details?.message || '',
    updatedAt: nowIso(),
    failure: details?.failure || '',
  }
  writeSyncState(state)
}

function buildSyncStatusLabel(rows) {
  if (!rows.length) return 'local_only'
  const hasFailed = rows.some((row) => row.status === 'failed')
  if (hasFailed) return 'failed'
  const allSynced = rows.every((row) => row.status === 'synced')
  return allSynced ? 'synced' : 'local_only'
}

function readRecords(key, fallback = []) {
  const raw = readRaw(key)
  if (!Array.isArray(raw)) return [...fallback]
  return raw
}

function writeRecords(key, rows) {
  writeRaw(key, normalizeList(rows))
}

function makeSyncMeta(status, message = '') {
  return {
    googleSheetSyncStatus: status,
    googleSheetSyncMessage: message,
    googleSheetSyncUpdatedAt: nowIso(),
  }
}

function appendRecordToStorage(key, candidate) {
  const rows = readRecords(key, [])
  rows.push(candidate)
  writeRecords(key, rows)
  return rows
}

function upsertRecordById(key, candidate, idField = 'id') {
  const rows = readRecords(key, [])
  if (!candidate || !candidate[idField]) {
    const next = [...rows, candidate]
    writeRecords(key, next)
    return candidate
  }
  const idx = rows.findIndex((item) => item[idField] === candidate[idField])
  if (idx === -1) {
    rows.push(candidate)
  } else {
    rows[idx] = { ...rows[idx], ...candidate }
  }
  writeRecords(key, rows)
  return candidate
}

function buildConnectionConfig() {
  const mode = safeString(getEnv('GOOGLE_SHEET_MODE') || 'simulation').toLowerCase() || 'simulation'
  return {
    webhookUrl: safeString(getEnv('GOOGLE_SHEET_WEBHOOK_URL')),
    sheetId: safeString(getEnv('GOOGLE_SHEET_ID')),
    mode,
    isSimulation: mode !== 'live' && mode !== 'production',
  }
}

export function getGoogleSheetConfig() {
  return buildConnectionConfig()
}

export async function postToGoogleSheet(table, record) {
  const config = buildConnectionConfig()
  if (!config.webhookUrl) {
    return {
      ok: false,
      status: 'local_only',
      message: 'Webhook URL not configured. Records remain local-only.',
    }
  }
  if (config.isSimulation) {
    return {
      ok: false,
      status: 'local_only',
      message: `Simulation mode active (${config.mode}). No outbound POST in simulation.`,
    }
  }

  try {
    const response = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: config.mode,
        sheetId: config.sheetId || null,
        table,
        recordedAt: nowIso(),
        payload: record,
      }),
    })
    const bodyText = await response.text()
    console.log('[Google Sheet Webhook Response]', {
      table,
      status: response.status,
      ok: response.ok,
      body: normalizeWebhookResponsePayload(bodyText),
    })
    if (!response.ok) {
      return {
        ok: false,
        status: 'failed',
        message: `HTTP ${response.status}: ${bodyText || 'Webhook returned an error.'}`,
      }
    }
    const parsed = normalizeWebhookResponsePayload(bodyText)
    const msg =
      typeof parsed === 'object' && parsed != null && parsed.message
        ? safeString(parsed.message)
        : safeString(bodyText)
    return {
      ok: true,
      status: 'synced',
      message: msg || 'Synced to Google Sheet.',
      inserted: typeof parsed === 'object' && parsed != null ? parsed.inserted : undefined,
      updated: typeof parsed === 'object' && parsed != null ? parsed.updated : undefined,
    }
  } catch (error) {
    console.error('[Google Sheet Webhook Response]', {
      table,
      message: error instanceof Error ? error.message : String(error),
    })
    return {
      ok: false,
      status: 'failed',
      message: error instanceof Error ? error.message : 'Network error while sending to webhook.',
    }
  }
}

export async function testGoogleSheetConnection() {
  const config = buildConnectionConfig()
  if (!config.webhookUrl) {
    return {
      ok: false,
      status: 'failed',
      message: 'Missing GOOGLE_SHEET_WEBHOOK_URL.',
      table: 'connection_test',
    }
  }
  if (config.isSimulation) {
    return {
      ok: false,
      status: 'local_only',
      message: `Simulation mode only (${config.mode}). Configure GOOGLE_SHEET_MODE=live to send test request.`,
      table: 'connection_test',
    }
  }
  try {
    const response = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: config.mode,
        sheetId: config.sheetId || null,
        table: 'connection_test',
        action: 'ping',
        recordedAt: nowIso(),
      }),
    })
    const bodyText = await response.text()
    console.log('[Google Sheet Webhook Test]', {
      status: response.status,
      ok: response.ok,
      body: normalizeWebhookResponsePayload(bodyText),
    })
    if (!response.ok) {
      return {
        ok: false,
        status: 'failed',
        message: `HTTP ${response.status}: ${bodyText || 'Test request rejected'}`,
        table: 'connection_test',
      }
    }
    return {
      ok: true,
      status: 'synced',
      message: safeString(bodyText) || 'Webhook connection succeeded.',
      table: 'connection_test',
    }
  } catch (error) {
    console.error('[Google Sheet Webhook Test]', {
      message: error instanceof Error ? error.message : String(error),
    })
    return {
      ok: false,
      status: 'failed',
      message: error instanceof Error ? error.message : 'Unable to reach Google webhook.',
      table: 'connection_test',
    }
  }
}

export async function sendSampleNursingNoteToGoogleSheet() {
  const list = getAllPatients()
  const samplePatient = list[0]
  if (!samplePatient?.id) {
    return {
      ok: false,
      status: 'failed',
      message: 'No patients in local roster — add a real patient before sending a sample nursing row.',
    }
  }
  const sampleNote = {
    id: newId('sample_note'),
    patientId: samplePatient.id,
    patientNameSnapshot: samplePatient.fullName || '',
    patientRoom: samplePatient.room || '',
    note: 'Patient received fluids and appeared calm, with improved appetite and hydration status.',
    bloodPressure: '118/76',
    bloodSugar: '102',
    temperature: '36.8',
    pulse: '74',
    oxygenSaturation: '98',
    mood: 'Stable',
    confusionLevel: 'Low',
    createdAt: nowIso(),
    createdBy: 'Test User',
    source: 'google_sheet_sample_test',
    ...makeSyncMeta('local_only', 'Sample row created for Google Sheet webhook test.'),
  }
  const sync = await postToGoogleSheet(GOOGLE_SHEET_TABLES.nursing_notes, sampleNote)
  setRecordSyncStatus(GOOGLE_SHEET_TABLES.nursing_notes, sampleNote.id, sync.status, {
    message: sync.message || 'No response message',
  })
  return {
    ...sync,
    noteId: sampleNote.id,
  }
}

/** Fields align with Sheet tab Patientsroom (snake_case headers). */
export function emptyPatientsroomRegistrationForm() {
  return {
    room_number: '',
    patients_name: '',
    gender: 'Female',
    age: '',
    diagnosis: '',
    mobility_status: '',
    appetite_status: '',
    fall_risk: 'Moderate',
    turning_required: '',
    rehab_required: '',
    ot_required: '',
    family_contact: '',
    status: 'Active',
    notes: '',
  }
}

export function patientsroomRegistrationPayload(form) {
  return {
    room_number: safeString(form.room_number),
    patients_name: safeString(form.patients_name),
    gender: safeString(form.gender),
    age: safeString(form.age),
    diagnosis: safeString(form.diagnosis),
    mobility_status: safeString(form.mobility_status),
    appetite_status: safeString(form.appetite_status),
    fall_risk: safeString(form.fall_risk),
    turning_required: safeString(form.turning_required),
    rehab_required: safeString(form.rehab_required),
    ot_required: safeString(form.ot_required),
    family_contact: safeString(form.family_contact),
    status: safeString(form.status),
    notes: safeString(form.notes),
  }
}

export async function savePatientsroomRegistration(formFields) {
  const payload = patientsroomRegistrationPayload(formFields)
  const sync = await postToGoogleSheet(GOOGLE_SHEET_TABLES.patients, payload)
  return { payload, sync }
}

export async function savePatient(payload) {
  const record = {
    ...payload,
    id: payload?.id ? payload.id : newId('p'),
    updatedAt: nowIso(),
  }
  const existing = getAllPatients().find((patient) => patient.id === record.id)
  const saved = existing ? updatePatient(record.id, record) : createPatient(record)
  const withMeta = { ...saved, ...makeSyncMeta('local_only', 'Saved locally'), googleSheetSyncPatientRisk: deriveRiskScore(saved) }
  setRecordSyncStatus(GOOGLE_SHEET_TABLES.patients, withMeta.id, 'local_only', { message: 'Saved locally in simulation mode.' })
  const sync = await postToGoogleSheet(GOOGLE_SHEET_TABLES.patients, withMeta)
  setRecordSyncStatus(GOOGLE_SHEET_TABLES.patients, withMeta.id, sync.status, { message: sync.message })
  const final = { ...withMeta, googleSheetSyncStatus: sync.status, googleSheetSyncMessage: sync.message, googleSheetSyncUpdatedAt: nowIso() }
  return final
}

export async function saveNursingNote(payload) {
  const saved = createNursingNote({
    ...payload,
    id: payload?.id || undefined,
  })
  const withMeta = {
    ...saved,
    ...makeSyncMeta('local_only', 'Saved locally in simulation mode.'),
  }
  setRecordSyncStatus(GOOGLE_SHEET_TABLES.nursing_notes, withMeta.id, 'local_only', { message: 'Saved locally in simulation mode.' })
  const sync = await postToGoogleSheet(GOOGLE_SHEET_TABLES.nursing_notes, withMeta)
  setRecordSyncStatus(GOOGLE_SHEET_TABLES.nursing_notes, withMeta.id, sync.status, { message: sync.message })
  const vitalPayload = buildVitalSignRowFromNursingNote(withMeta)
  const vitalSync = vitalPayload ? await saveVitalSigns(vitalPayload) : null
  const combinedStatus = selectSummaryStatus([
    { status: sync.status, message: sync.message },
    vitalSync ? { status: vitalSync.googleSheetSyncStatus, message: vitalSync.googleSheetSyncMessage } : null,
  ])
  const combinedMessage = selectSummaryMessage([
    { status: sync.status, message: sync.message },
    vitalSync ? { status: vitalSync.googleSheetSyncStatus, message: vitalSync.googleSheetSyncMessage } : null,
  ])
  if (vitalPayload) {
    setRecordSyncStatus(GOOGLE_SHEET_TABLES.vital_signs, vitalPayload.id, vitalSync?.googleSheetSyncStatus || 'local_only', {
      message: vitalSync?.googleSheetSyncMessage || 'Saved to local vital-signs cache.',
    })
  }
  return {
    ...withMeta,
    googleSheetSyncStatus: combinedStatus,
    googleSheetSyncMessage: combinedMessage || 'Saved to Google Sheet database',
    vitalSignSync: vitalSync,
    vitalSignRecordId: vitalPayload?.id || null,
  }
}

export async function saveVitalSigns(payload) {
  const record = {
    id: payload?.id || newId('vs'),
    recordedAt: payload?.recordedAt || nowIso(),
    ...payload,
    ...makeSyncMeta('local_only', 'Saved locally in simulation mode.'),
  }
  appendRecordToStorage(VITAL_SIGNS_STORAGE_KEY, record)
  setRecordSyncStatus(GOOGLE_SHEET_TABLES.vital_signs, record.id, 'local_only', {
    message: 'Saved locally in simulation mode.',
  })
  const sync = await postToGoogleSheet(GOOGLE_SHEET_TABLES.vital_signs, record)
  setRecordSyncStatus(GOOGLE_SHEET_TABLES.vital_signs, record.id, sync.status, { message: sync.message })
  return { ...record, googleSheetSyncStatus: sync.status, googleSheetSyncMessage: sync.message }
}

export async function saveMedicationUpdate(payload) {
  const records = readRecords(MEDICATION_STORAGE_KEY, [])
  const id = payload?.id || newId('med')
  const candidate = {
    ...payload,
    id,
    recordedAt: payload?.recordedAt || nowIso(),
    ...makeSyncMeta('local_only', 'Saved locally in simulation mode.'),
  }
  upsertRecordById(MEDICATION_STORAGE_KEY, candidate)
  setRecordSyncStatus(GOOGLE_SHEET_TABLES.medications, id, 'local_only', { message: 'Saved locally in simulation mode.' })
  const sync = await postToGoogleSheet(GOOGLE_SHEET_TABLES.medications, candidate)
  setRecordSyncStatus(GOOGLE_SHEET_TABLES.medications, id, sync.status, { message: sync.message })
  return { ...candidate, googleSheetSyncStatus: sync.status, googleSheetSyncMessage: sync.message }
}

export async function saveRehabSession(payload) {
  const record = {
    ...payload,
    id: payload?.id || newId('rehab'),
    recordedAt: payload?.recordedAt || nowIso(),
    ...makeSyncMeta('local_only', 'Saved locally in simulation mode.'),
  }
  setRecordSyncStatus(GOOGLE_SHEET_TABLES.rehab_sessions, record.id, 'local_only', {
    message: 'Saved locally in simulation mode.',
  })
  const sync = await postToGoogleSheet(GOOGLE_SHEET_TABLES.rehab_sessions, record)
  setRecordSyncStatus(GOOGLE_SHEET_TABLES.rehab_sessions, record.id, sync.status, { message: sync.message })
  return { ...record, googleSheetSyncStatus: sync.status, googleSheetSyncMessage: sync.message }
}

export async function saveAIRisk(payload) {
  const record = {
    id: payload?.id || newId('ar'),
    capturedAt: payload?.capturedAt || nowIso(),
    ...payload,
    ...makeSyncMeta('local_only', 'Saved locally in simulation mode.'),
  }
  appendRecordToStorage(AI_RISK_STORAGE_KEY, record)
  setRecordSyncStatus(GOOGLE_SHEET_TABLES.ai_risks, record.id, 'local_only', { message: 'Saved locally in simulation mode.' })
  const sync = await postToGoogleSheet(GOOGLE_SHEET_TABLES.ai_risks, record)
  setRecordSyncStatus(GOOGLE_SHEET_TABLES.ai_risks, record.id, sync.status, { message: sync.message })
  return { ...record, googleSheetSyncStatus: sync.status, googleSheetSyncMessage: sync.message }
}

export async function saveEscalation(payload) {
  const record = {
    id: payload?.id || newId('es'),
    escalatedAt: payload?.escalatedAt || nowIso(),
    ...payload,
    ...makeSyncMeta('local_only', 'Saved locally in simulation mode.'),
  }
  appendRecordToStorage(ESCALATION_STORAGE_KEY, record)
  setRecordSyncStatus(GOOGLE_SHEET_TABLES.escalations, record.id, 'local_only', { message: 'Saved locally in simulation mode.' })
  const sync = await postToGoogleSheet(GOOGLE_SHEET_TABLES.escalations, record)
  setRecordSyncStatus(GOOGLE_SHEET_TABLES.escalations, record.id, sync.status, { message: sync.message })
  return { ...record, googleSheetSyncStatus: sync.status, googleSheetSyncMessage: sync.message }
}

export function getPatients() {
  return getAllPatients()
}

export function getNursingNotes() {
  return getAllNursingNotes()
}

export function getVitalSigns() {
  return readRecords(VITAL_SIGNS_STORAGE_KEY, [])
}

export function getMedicationRecords() {
  return readRecords(MEDICATION_STORAGE_KEY, [])
}

export function getAIRiskRecords() {
  return readRecords(AI_RISK_STORAGE_KEY, [])
}

export function getEscalationRecords() {
  return readRecords(ESCALATION_STORAGE_KEY, [])
}

function deriveVitalSignRowsFromNotes() {
  return getNursingNotes().map((note) => ({
    id: `vs_from_note_${note.id}`,
    patientId: note.patientId,
    patientNameSnapshot: note.patientNameSnapshot || '',
    recordedAt: note.date || note.createdAt || nowIso(),
    bloodPressure: note.bloodPressure || '',
    bloodSugar: note.bloodSugar || '',
    noteSource: `nursing_note_${note.id}`,
    sourceCreatedAt: note.createdAt || '',
  }))
}

export function getShiftHandoverRecords() {
  const raw = readRecords(SHIFT_HANDOVER_STORAGE_KEY, [])
  const notes = getNursingNotes()
  const snapshot = {
    id: `handover_${Date.now()}`,
    generatedAt: nowIso(),
    source: 'dashboard_snapshot',
    totalNotes: notes.length,
    patientCount: getPatients().length,
  }
  if (raw.length > 0) return raw
  return [snapshot]
}

export function getDoctorReviewRecords() {
  const raw = readRecords(DOCTOR_REVIEW_RECORDS_KEY, [])
  if (raw.length) return raw
  const statusMap = readRaw('doctor_review_queue_statuses_v2') || {}
  const notes = getNursingNotes()
  const grouped = {}
  for (const note of notes) {
    if (!note?.patientId) continue
    if (!grouped[note.patientId]) grouped[note.patientId] = []
    grouped[note.patientId].push(note)
  }
  return Object.entries(statusMap).map(([patientId, status]) => ({
    id: `dr_${patientId}_${Date.now()}`,
    patientId,
    status: status || 'Pending review',
    noteCount: (grouped[patientId] || []).length,
    flaggedAt: nowIso(),
    source: 'doctor_review_status_store',
  }))
}

export function getGoogleSheetSyncSummary() {
  const state = readSyncState()
  const output = {}
  for (const table of Object.values(GOOGLE_SHEET_TABLES)) {
    const entries = Object.values(state[table] || {})
    const status = buildSyncStatusLabel(entries.map((entry) => ({ status: entry.status || 'local_only' })))
    output[table] = {
      status,
      statusLabel: SYNC_LABELS[status],
      statusVariant: SYNC_BADGE_VARIANTS[status],
      totalRows: entries.length,
      updatedAt: entries.reduce((latest, entry) => {
        if (!entry.updatedAt) return latest
        return !latest || entry.updatedAt > latest ? entry.updatedAt : latest
      }, null),
      lastMessage: entries.reduce((latest, entry) => {
        if (!entry.message) return latest
        return entry.updatedAt >= (latest?.at ?? '') ? { at: entry.updatedAt, message: entry.message } : latest
      }, null)?.message || '',
    }
  }
  return output
}

export async function syncRowsToSheet(table, rows) {
  const rowsArray = normalizeList(rows).map((row) => ({
    ...row,
    ...makeSyncMeta('local_only', 'Queued for sync.'),
  }))
  let syncedCount = 0
  let failedCount = 0
  let skippedCount = 0
  for (const row of rowsArray) {
    const id = row.id || `${table}_${nowIso()}`
    const prepared = { ...row, id }
    const result = await postToGoogleSheet(table, prepared)
    setRecordSyncStatus(table, id, result.status, { message: result.message })
    if (result.status === 'synced') syncedCount += 1
    if (result.status === 'failed') failedCount += 1
    if (result.status === 'local_only') skippedCount += 1
  }
  return {
    syncedCount,
    failedCount,
    skippedCount,
    totalCount: rowsArray.length,
    status: failedCount > 0 ? 'failed' : skippedCount > 0 ? 'local_only' : 'synced',
  }
}

export async function syncAllMockData() {
  const payloadByTable = {
    [GOOGLE_SHEET_TABLES.patients]: getPatients(),
    [GOOGLE_SHEET_TABLES.nursing_notes]: getNursingNotes(),
    [GOOGLE_SHEET_TABLES.vital_signs]: [...getVitalSigns(), ...deriveVitalSignRowsFromNotes()],
    [GOOGLE_SHEET_TABLES.medications]: getMedicationRecords(),
    [GOOGLE_SHEET_TABLES.ai_risks]: getAIRiskRecords(),
    [GOOGLE_SHEET_TABLES.escalations]: getEscalationRecords(),
    [GOOGLE_SHEET_TABLES.shift_handover]: getShiftHandoverRecords(),
    [GOOGLE_SHEET_TABLES.doctor_review]: getDoctorReviewRecords(),
  }
  const perTable = {}
  let hasAnyFailure = false
  for (const [table, rows] of Object.entries(payloadByTable)) {
    perTable[table] = await syncRowsToSheet(table, rows)
    if (perTable[table].status === 'failed') hasAnyFailure = true
  }
  return {
    ok: !hasAnyFailure,
    perTable,
    overall: hasAnyFailure ? 'failed' : 'completed',
    syncedTables: Object.values(perTable).filter((item) => item.status === 'synced').length,
    failedTables: Object.values(perTable).filter((item) => item.status === 'failed').length,
  }
}

export function exportCurrentData() {
  const data = {
    patients: getPatients(),
    nursing_notes: getNursingNotes(),
    vital_signs: [...getVitalSigns(), ...deriveVitalSignRowsFromNotes()],
    medications: getMedicationRecords(),
    rehab_sessions: readRecords(REHAB_STORAGE_KEY, []),
    ai_risks: getAIRiskRecords(),
    escalations: getEscalationRecords(),
    shift_handover: getShiftHandoverRecords(),
    doctor_review: getDoctorReviewRecords(),
    exportedAt: nowIso(),
  }
  return data
}

export function getGoogleSheetStatusBadges() {
  const state = readSyncState()
  const labels = {}
  for (const table of Object.values(GOOGLE_SHEET_TABLES)) {
    const rows = Object.values(state[table] || {})
    const status = buildSyncStatusLabel(rows.map((entry) => ({ status: entry.status || 'local_only' })))
    labels[table] = {
      status,
      label: SYNC_LABELS[status],
      variant: SYNC_BADGE_VARIANTS[status],
      count: rows.length,
      updatedAt: rows.length ? rows.reduce((latest, row) => (!latest || row.updatedAt > latest ? row.updatedAt : latest), null) : null,
    }
  }
  return labels
}
