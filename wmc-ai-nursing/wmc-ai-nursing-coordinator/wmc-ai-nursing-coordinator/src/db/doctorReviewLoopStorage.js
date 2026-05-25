/**
 * Simulation storage — Doctor Review Loop (localStorage).
 */

import { MED_LOOP_ROOM_MAP } from '../data/medicationLoopSeed.js'
import { syncDoctorReviewAutoQueue } from '../lib/doctorReviewLoopSimulation.js'

export const DOCTOR_REVIEW_LOOP_KEY = 'wmc_doctor_review_loop_v1'

export const DOCTOR_REVIEW_TRIGGERS = /** @type {const} */ ([
  'High AI risk score',
  'Repeated fever',
  'Fall incident',
  'Medication concern',
  'Worsening vitals',
  'Confusion / delirium',
  'Poor intake / dehydration',
  'Wound deterioration',
  'Rehabilitation decline',
  'Emergency escalation',
])

function hashStr(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function loadRaw() {
  try {
    const raw = localStorage.getItem(DOCTOR_REVIEW_LOOP_KEY)
    if (!raw) {
      return {
        records: [],
        scores: {
          stable: 0,
          monitor: 0,
          moderateConcern: 0,
          highRisk: 0,
          criticalReview: 0,
        },
        baseline: null,
      }
    }
    const p = JSON.parse(raw)
    return {
      records: Array.isArray(p.records) ? p.records : [],
      scores: {
        stable: p.scores?.stable ?? 0,
        monitor: p.scores?.monitor ?? 0,
        moderateConcern: p.scores?.moderateConcern ?? 0,
        highRisk: p.scores?.highRisk ?? 0,
        criticalReview: p.scores?.criticalReview ?? 0,
      },
      baseline: p.baseline || null,
    }
  } catch {
    return {
      records: [],
      scores: {
        stable: 0,
        monitor: 0,
        moderateConcern: 0,
        highRisk: 0,
        criticalReview: 0,
      },
      baseline: null,
    }
  }
}

function saveRaw(data) {
  localStorage.setItem(DOCTOR_REVIEW_LOOP_KEY, JSON.stringify(data))
}

export function emitDoctorReviewLoopUpdate() {
  window.dispatchEvent(new CustomEvent('wmc-doctor-review-loop-updated'))
}

export function ensureDoctorReviewLoopBaseline() {
  const raw = loadRaw()
  if (raw.baseline) return raw.baseline
  raw.baseline = { stable: 40, monitor: 28, moderateConcern: 16, highRisk: 10, criticalReview: 6 }
  saveRaw(raw)
  return raw.baseline
}

export function getDoctorReviewRecordsSnapshot() {
  ensureDoctorReviewLoopBaseline()
  const raw = loadRaw()
  return (Array.isArray(raw.records) ? raw.records : []).map(normalizeRecord)
}

export function readDoctorReviewLoopRaw() {
  return loadRaw()
}

export function doctorReviewScoreTotalsDisplay() {
  const raw = readDoctorReviewLoopRaw()
  ensureDoctorReviewLoopBaseline()
  const b = raw.baseline || { stable: 0, monitor: 0, moderateConcern: 0, highRisk: 0, criticalReview: 0 }
  const s = raw.scores || {}
  return {
    stable: b.stable + (s.stable ?? 0),
    monitor: b.monitor + (s.monitor ?? 0),
    moderateConcern: b.moderateConcern + (s.moderateConcern ?? 0),
    highRisk: b.highRisk + (s.highRisk ?? 0),
    criticalReview: b.criticalReview + (s.criticalReview ?? 0),
  }
}

export function bumpDoctorReviewLoopScore(field, delta = 1) {
  const raw = loadRaw()
  raw.scores[field] = (raw.scores[field] ?? 0) + delta
  saveRaw(raw)
  emitDoctorReviewLoopUpdate()
}

function newRecordId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return `drv_${crypto.randomUUID()}`
  return `drv_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function roomForPatient(id, idx) {
  return MED_LOOP_ROOM_MAP[id] || `TBD-${String(idx).padStart(3, '0')}`
}

function seedDemoRecords(patients) {
  const roster = patients?.length ? patients.slice(0, 14) : []
  const doctors = ['Dr. Rivera', 'Dr. Okonkwo', 'Dr. Matsuda', 'NP Singh']
  const statuses = /** @type {const} */ ([
    'pending',
    'pending',
    'urgent',
    'urgent',
    'reviewed',
    'follow_up',
    'resolved',
    'pending',
    'reviewed',
    'follow_up',
    'pending',
    'urgent',
    'resolved',
    'pending',
  ])

  const now = Date.now()
  const records = []

  roster.forEach((p, idx) => {
    const h = hashStr(`${p.id}|drv`)
    const trig = DOCTOR_REVIEW_TRIGGERS[h % DOCTOR_REVIEW_TRIGGERS.length]
    const status = statuses[idx % statuses.length]
    const sevRoll = (idx + h) % 10
    const severityLevel =
      sevRoll >= 8 ? 'critical' : sevRoll >= 6 ? 'high' : sevRoll >= 4 ? 'moderate' : 'low'

    const flaggedMs = now - (2 + (idx % 48)) * 60 * 60 * 1000
    const reviewedAt =
      status === 'reviewed' || status === 'follow_up' || status === 'resolved'
        ? new Date(now - (idx % 10) * 3 * 60 * 60 * 1000).toISOString()
        : null

    records.push({
      id: newRecordId(),
      patientId: p.id,
      patientName: p.fullName || p.name || 'Resident',
      roomNumber: roomForPatient(p.id, idx + 1),
      triggerReason: trig,
      severityLevel,
      latestNursingNote: `Shift narrative (sim): appetite stable; mood ${idx % 2 ? 'anxious' : 'calm'}; vitals reviewed; remarks tied to ${trig.toLowerCase()} surveillance.`,
      assignedNurse: p.assignedNurse || 'Charge RN',
      timeFlagged: new Date(flaggedMs).toISOString(),
      doctorAssigned: doctors[h % doctors.length],
      reviewStatus: status,
      reviewedAt,
      escalatedUrgent: status === 'urgent' && h % 3 === 0,
      familyNotified: status !== 'pending' && h % 4 === 0,
      doctorNotes: [],
      followUpActions:
        status === 'follow_up'
          ? [{ at: new Date(now).toISOString(), text: 'Repeat CBC · wound photo · PT tolerance check (sim)' }]
          : [],
      unresolvedRepeats: h % 13 === 0 ? 2 : 0,
    })
  })

  return records
}

function normalizeRecord(r) {
  return {
    ...r,
    doctorNotes: Array.isArray(r.doctorNotes) ? r.doctorNotes.slice(-20) : [],
    followUpActions: Array.isArray(r.followUpActions) ? r.followUpActions.slice(-16) : [],
    escalatedUrgent: Boolean(r.escalatedUrgent),
    familyNotified: Boolean(r.familyNotified),
    unresolvedRepeats: Math.max(0, Number(r.unresolvedRepeats) || 0),
    severityLevel: ['low', 'moderate', 'high', 'critical'].includes(r.severityLevel) ? r.severityLevel : 'moderate',
    reviewStatus: ['pending', 'urgent', 'reviewed', 'follow_up', 'resolved'].includes(r.reviewStatus)
      ? r.reviewStatus
      : 'pending',
  }
}

export function mergeDoctorReviewLoopRecords(patients, notes = []) {
  ensureDoctorReviewLoopBaseline()
  const raw = loadRaw()
  let records = Array.isArray(raw.records) ? [...raw.records] : []

  if (!records.length) {
    records = seedDemoRecords(patients)
    raw.records = records
    saveRaw(raw)
  }

  records = syncDoctorReviewAutoQueue(patients || [], notes || [], records)

  records = records.map((r, idx) => {
    const p = (patients || []).find((x) => x.id === r.patientId)
    if (!p) return normalizeRecord(r)
    return normalizeRecord({
      ...r,
      patientName: r.patientName || p.fullName || p.name,
      roomNumber: r.roomNumber || roomForPatient(p.id, idx + 1),
      assignedNurse: r.assignedNurse || p.assignedNurse || 'Charge RN',
    })
  })

  raw.records = records
  saveRaw(raw)

  return records.map(normalizeRecord)
}

export function upsertDoctorReviewRecord(record) {
  const raw = loadRaw()
  const list = Array.isArray(raw.records) ? [...raw.records] : []
  const idx = list.findIndex((x) => x.id === record.id)
  if (idx >= 0) list[idx] = normalizeRecord({ ...list[idx], ...record })
  else list.unshift(normalizeRecord(record))
  raw.records = list
  saveRaw(raw)
  emitDoctorReviewLoopUpdate()
}

export function appendDoctorReviewDoctorNote(recordId, text) {
  const trimmed = String(text || '').trim()
  if (!trimmed) return
  const raw = loadRaw()
  const list = [...(raw.records || [])]
  const idx = list.findIndex((x) => x.id === recordId)
  if (idx < 0) return
  const notes = Array.isArray(list[idx].doctorNotes) ? [...list[idx].doctorNotes] : []
  notes.push({ at: new Date().toISOString(), text: trimmed })
  list[idx] = normalizeRecord({ ...list[idx], doctorNotes: notes.slice(-20) })
  raw.records = list
  saveRaw(raw)
  emitDoctorReviewLoopUpdate()
}

export function appendDoctorReviewFollowUp(recordId, text) {
  const trimmed = String(text || '').trim()
  if (!trimmed) return
  const raw = loadRaw()
  const list = [...(raw.records || [])]
  const idx = list.findIndex((x) => x.id === recordId)
  if (idx < 0) return
  const fu = Array.isArray(list[idx].followUpActions) ? [...list[idx].followUpActions] : []
  fu.push({ at: new Date().toISOString(), text: trimmed })
  list[idx] = normalizeRecord({ ...list[idx], followUpActions: fu.slice(-16), reviewStatus: 'follow_up' })
  raw.records = list
  saveRaw(raw)
  emitDoctorReviewLoopUpdate()
}
