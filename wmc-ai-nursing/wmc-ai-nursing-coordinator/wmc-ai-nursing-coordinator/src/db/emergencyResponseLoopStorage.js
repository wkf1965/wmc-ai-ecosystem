/**
 * Simulation storage — Emergency Response Loop (localStorage).
 */

import { MED_LOOP_ROOM_MAP } from '../data/medicationLoopSeed.js'

export const EMERGENCY_RESPONSE_LOOP_KEY = 'wmc_emergency_response_loop_v1'

export const EMERGENCY_TYPES = /** @type {const} */ ([
  'Fall incident',
  'Chest pain',
  'Breathing difficulty',
  'Stroke symptoms',
  'Unconscious / collapse',
  'Severe bleeding',
  'Seizure',
  'High fever',
  'Low oxygen',
  'Severe confusion',
  'Aggressive behavior',
  'Medication reaction',
])

/** @typedef {'mild'|'moderate'|'severe'|'critical'|'code_red'} EmergencySeverity */

function hashStr(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function loadRaw() {
  try {
    const raw = localStorage.getItem(EMERGENCY_RESPONSE_LOOP_KEY)
    if (!raw) {
      return {
        records: [],
        scores: {
          mild: 0,
          moderate: 0,
          severe: 0,
          critical: 0,
          codeRed: 0,
        },
        baseline: null,
      }
    }
    const p = JSON.parse(raw)
    return {
      records: Array.isArray(p.records) ? p.records : [],
      scores: {
        mild: p.scores?.mild ?? 0,
        moderate: p.scores?.moderate ?? 0,
        severe: p.scores?.severe ?? 0,
        critical: p.scores?.critical ?? 0,
        codeRed: p.scores?.codeRed ?? 0,
      },
      baseline: p.baseline || null,
    }
  } catch {
    return {
      records: [],
      scores: {
        mild: 0,
        moderate: 0,
        severe: 0,
        critical: 0,
        codeRed: 0,
      },
      baseline: null,
    }
  }
}

function saveRaw(data) {
  localStorage.setItem(EMERGENCY_RESPONSE_LOOP_KEY, JSON.stringify(data))
}

export function emitEmergencyResponseLoopUpdate() {
  window.dispatchEvent(new CustomEvent('wmc-emergency-response-loop-updated'))
}

export function ensureEmergencyResponseBaseline() {
  const raw = loadRaw()
  if (raw.baseline) return raw.baseline
  raw.baseline = { mild: 38, moderate: 22, severe: 12, critical: 6, codeRed: 3 }
  saveRaw(raw)
  return raw.baseline
}

export function readEmergencyResponseLoopRaw() {
  return loadRaw()
}

export function bumpEmergencyResponseScore(field, delta = 1) {
  const raw = loadRaw()
  raw.scores[field] = (raw.scores[field] ?? 0) + delta
  saveRaw(raw)
  emitEmergencyResponseLoopUpdate()
}

function newRecordId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return `em_${crypto.randomUUID()}`
  return `em_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function roomForPatient(id, idx) {
  return MED_LOOP_ROOM_MAP[id] || `TBD-${String(idx).padStart(3, '0')}`
}

function severityFromIdx(idx, typeIdx) {
  const combo = (idx + typeIdx * 7) % 11
  if (combo >= 9) return /** @type {EmergencySeverity} */ ('code_red')
  if (combo >= 7) return /** @type {EmergencySeverity} */ ('critical')
  if (combo >= 5) return /** @type {EmergencySeverity} */ ('severe')
  if (combo >= 2) return /** @type {EmergencySeverity} */ ('moderate')
  return /** @type {EmergencySeverity} */ ('mild')
}

function seedDemoRecords(patients) {
  const list =
    patients?.length > 0
      ? patients.slice(0, 12)
      : []

  const nurses = ['R.N. Patel', 'LPN Santos', 'R.N. Kim', 'Charge: Okonkwo']
  const records = []

  list.slice(0, 10).forEach((p, idx) => {
    const h = hashStr(`${p.id}|em`)
    const typeIdx = h % EMERGENCY_TYPES.length
    const emergencyType = EMERGENCY_TYPES[typeIdx]
    const severityLevel = severityFromIdx(idx, typeIdx)
    const minsAgo = [8, 22, 45, 90, 180, 12, 33, 55][idx % 8]
    const timeDetected = new Date(Date.now() - minsAgo * 60 * 1000).toISOString()

    const doctorNotified = idx % 5 !== 0
    const doctorResponded = doctorNotified && idx % 4 !== 1
    const familyNotified = idx % 3 === 0
    const ambulanceCalled = idx % 7 === 2 || emergencyType === 'Stroke symptoms'
    const supervisorNotified = idx % 2 === 0

    let outcomeStatus = /** @type {'active'|'resolved'|'follow_up'} */ ('active')
    if (idx === 5 || idx === 9) outcomeStatus = 'resolved'
    else if (idx === 4 || idx === 8) outcomeStatus = 'follow_up'

    const injuryRiskFlag = emergencyType === 'Fall incident' && severityLevel !== 'mild'
    const sepsisRiskFlag =
      emergencyType === 'High fever' && (severityLevel === 'severe' || severityLevel === 'critical')

    records.push({
      id: newRecordId(),
      patientId: p.id,
      patientName: p.fullName || p.name || 'Resident',
      roomNumber: p.roomNumber || roomForPatient(p.id, idx + 1),
      emergencyType,
      severityLevel,
      timeDetected,
      nurseInCharge: nurses[h % nurses.length],
      actionTaken:
        idx % 2 === 0
          ? 'Vitals obtained · bedside monitoring · safety precautions'
          : 'Airway assessed · O₂ applied · emergency kit at bedside',
      doctorNotified,
      doctorResponded,
      familyNotified,
      ambulanceCalled,
      supervisorNotified,
      outcomeStatus,
      injuryRiskFlag,
      sepsisRiskFlag,
    })
  })

  return records
}

function normalizeRecord(r) {
  return {
    ...r,
    doctorNotified: Boolean(r.doctorNotified),
    doctorResponded: Boolean(r.doctorResponded),
    familyNotified: Boolean(r.familyNotified),
    ambulanceCalled: Boolean(r.ambulanceCalled),
    supervisorNotified: Boolean(r.supervisorNotified),
    injuryRiskFlag: Boolean(r.injuryRiskFlag),
    sepsisRiskFlag: Boolean(r.sepsisRiskFlag),
    outcomeStatus: ['active', 'resolved', 'follow_up'].includes(r.outcomeStatus) ? r.outcomeStatus : 'active',
  }
}

export function mergeEmergencyResponseRecords(patients) {
  ensureEmergencyResponseBaseline()
  const raw = loadRaw()
  let { records } = raw

  if (!records.length) {
    records = seedDemoRecords(patients)
    raw.records = records
    saveRaw(raw)
  }

  return records.map(normalizeRecord)
}

export function upsertEmergencyRecord(record) {
  const raw = loadRaw()
  const list = Array.isArray(raw.records) ? [...raw.records] : []
  const idx = list.findIndex((x) => x.id === record.id)
  if (idx >= 0) list[idx] = normalizeRecord({ ...list[idx], ...record })
  else list.unshift(normalizeRecord(record))
  raw.records = list
  saveRaw(raw)
  emitEmergencyResponseLoopUpdate()
}

export function addEmergencyIncidentDraft(patch = {}) {
  const severity = patch.severityLevel || /** @type {EmergencySeverity} */ ('moderate')
  const type = patch.emergencyType || EMERGENCY_TYPES[0]
  bumpEmergencyResponseScore(
    severity === 'code_red'
      ? 'codeRed'
      : severity === 'critical'
        ? 'critical'
        : severity === 'severe'
          ? 'severe'
          : severity === 'moderate'
            ? 'moderate'
            : 'mild',
    1,
  )

  const injuryRiskFlag =
    type === 'Fall incident' && severity !== 'mild' ? true : Boolean(patch.injuryRiskFlag)
  const sepsisRiskFlag =
    type === 'High fever' && (severity === 'severe' || severity === 'critical')
      ? true
      : Boolean(patch.sepsisRiskFlag)

  const rec = normalizeRecord({
    id: newRecordId(),
    patientId: patch.patientId || 'demo',
    patientName: patch.patientName || 'Resident',
    roomNumber: patch.roomNumber || '—',
    emergencyType: type,
    severityLevel: severity,
    timeDetected: new Date().toISOString(),
    nurseInCharge: patch.nurseInCharge || 'Charge nurse (sim)',
    actionTaken: patch.actionTaken || 'Initial assessment started',
    doctorNotified: false,
    doctorResponded: false,
    familyNotified: false,
    ambulanceCalled: false,
    supervisorNotified: false,
    outcomeStatus: 'active',
    injuryRiskFlag,
    sepsisRiskFlag,
  })
  upsertEmergencyRecord(rec)
  return rec
}
