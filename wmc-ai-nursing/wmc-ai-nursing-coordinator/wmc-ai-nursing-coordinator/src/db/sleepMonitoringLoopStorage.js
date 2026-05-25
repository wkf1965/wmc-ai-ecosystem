/**
 * Simulation storage — Sleep Monitoring Loop (localStorage).
 */

import { MED_LOOP_ROOM_MAP } from '../data/medicationLoopSeed.js'

export const SLEEP_MONITORING_LOOP_KEY = 'wmc_sleep_monitoring_loop_v1'

function hashStr(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function loadRaw() {
  try {
    const raw = localStorage.getItem(SLEEP_MONITORING_LOOP_KEY)
    if (!raw) {
      return {
        instances: {},
        scores: {
          good: 0,
          monitor: 0,
          disturbed: 0,
          highRisk: 0,
          urgentReview: 0,
        },
        baseline: null,
      }
    }
    const p = JSON.parse(raw)
    return {
      instances: p.instances && typeof p.instances === 'object' ? p.instances : {},
      scores: {
        good: p.scores?.good ?? 0,
        monitor: p.scores?.monitor ?? 0,
        disturbed: p.scores?.disturbed ?? 0,
        highRisk: p.scores?.highRisk ?? 0,
        urgentReview: p.scores?.urgentReview ?? 0,
      },
      baseline: p.baseline || null,
    }
  } catch {
    return {
      instances: {},
      scores: {
        good: 0,
        monitor: 0,
        disturbed: 0,
        highRisk: 0,
        urgentReview: 0,
      },
      baseline: null,
    }
  }
}

function saveRaw(data) {
  localStorage.setItem(SLEEP_MONITORING_LOOP_KEY, JSON.stringify(data))
}

export function emitSleepMonitoringLoopUpdate() {
  window.dispatchEvent(new CustomEvent('wmc-sleep-monitoring-loop-updated'))
}

export function ensureSleepMonitoringBaseline() {
  const raw = loadRaw()
  if (raw.baseline) return raw.baseline
  raw.baseline = { good: 42, monitor: 28, disturbed: 14, highRisk: 8, urgentReview: 4 }
  saveRaw(raw)
  return raw.baseline
}

export function readSleepMonitoringLoopRaw() {
  return loadRaw()
}

export function bumpSleepMonitoringScore(field, delta = 1) {
  const raw = loadRaw()
  raw.scores[field] = (raw.scores[field] ?? 0) + delta
  saveRaw(raw)
  emitSleepMonitoringLoopUpdate()
}

function roomForPatient(id, idx) {
  return MED_LOOP_ROOM_MAP[id] || `TBD-${String(idx).padStart(3, '0')}`
}

/** Default observation rhythm — demo offsets hours */
function seedDefaultsForPatient(patientId, idx, assignedNurse) {
  const h = hashStr(`${patientId}|sleep`)
  const now = Date.now()
  const lastObs = new Date(now - (15 + (h % 40)) * 60 * 1000).toISOString()
  const nextObs = new Date(now + (45 + (h % 35)) * 60 * 1000).toISOString()

  const patterns = [
    { hours: 7.25, wakings: 1, wander: false, agit: false, conf: false, pain: false, toilets: 1 },
    { hours: 4.5, wakings: 4, wander: false, agit: true, conf: false, pain: false, toilets: 2 },
    { hours: 6.75, wakings: 2, wander: false, agit: false, conf: false, pain: true, toilets: 1 },
    { hours: 5.25, wakings: 5, wander: true, agit: false, conf: true, pain: false, toilets: 3 },
    { hours: 8.1, wakings: 0, wander: false, agit: false, conf: false, pain: false, toilets: 0 },
    { hours: 6.2, wakings: 3, wander: false, agit: false, conf: true, pain: false, toilets: 2 },
    { hours: 3.75, wakings: 6, wander: false, agit: true, conf: true, pain: true, toilets: 2 },
    { hours: 7.5, wakings: 2, wander: false, agit: false, conf: false, pain: false, toilets: 1 },
  ]
  const pat = patterns[h % patterns.length]

  return {
    patientId,
    patientName: '',
    roomNumber: roomForPatient(patientId, idx + 1),
    sleepStartTime: `${21 + (h % 2)}:${String(h % 4 === 0 ? 15 : 45).padStart(2, '0')}`,
    wakeTime: `${5 + (h % 3)}:${String((h * 7) % 55).padStart(2, '0')}`,
    totalSleepHours: pat.hours,
    nightWakingEpisodes: pat.wakings,
    wanderingBehavior: pat.wander,
    agitationAtNight: pat.agit,
    confusionAtNight: pat.conf,
    painComplaint: pat.pain,
    toiletVisits: pat.toilets,
    nurseAssigned: assignedNurse || 'Charge RN',
    lastNightObservationTime: lastObs,
    nextObservationDueTime: nextObs,
    behaviorEscalated: h % 17 === 0,
    observationNotes: [],
  }
}

export function mergeSleepMonitoringInstances(patients) {
  ensureSleepMonitoringBaseline()
  const raw = loadRaw()
  let instances = { ...(raw.instances || {}) }
  let mutated = false

  const roster = patients?.length ? patients : []

  roster.forEach((p, idx) => {
    const pid = p.id
    if (!instances[pid]) {
      const seeded = seedDefaultsForPatient(pid, idx, p.assignedNurse)
      seeded.patientName = p.fullName || p.name || 'Resident'
      instances[pid] = seeded
      mutated = true
    } else if (!instances[pid].patientName && (p.fullName || p.name)) {
      instances[pid] = { ...instances[pid], patientName: p.fullName || p.name }
      mutated = true
    }
  })

  if (mutated) {
    raw.instances = instances
    saveRaw(raw)
  }

  return roster.map((p, idx) =>
    normalizeSleepRow(instances[p.id] || seedDefaultsForPatient(p.id, idx, p.assignedNurse), p),
  )
}

function normalizeSleepRow(row, patientFallback) {
  const notes = Array.isArray(row.observationNotes) ? row.observationNotes : []
  return {
    ...row,
    patientName: row.patientName || patientFallback?.fullName || 'Resident',
    patientId: row.patientId || patientFallback?.id,
    roomNumber: row.roomNumber || roomForPatient(patientFallback?.id, 1),
    totalSleepHours: typeof row.totalSleepHours === 'number' ? row.totalSleepHours : parseFloat(row.totalSleepHours) || 0,
    nightWakingEpisodes: Math.max(0, Math.round(Number(row.nightWakingEpisodes) || 0)),
    toiletVisits: Math.max(0, Math.round(Number(row.toiletVisits) || 0)),
    wanderingBehavior: Boolean(row.wanderingBehavior),
    agitationAtNight: Boolean(row.agitationAtNight),
    confusionAtNight: Boolean(row.confusionAtNight),
    painComplaint: Boolean(row.painComplaint),
    behaviorEscalated: Boolean(row.behaviorEscalated),
    observationNotes: notes.slice(-14),
  }
}

export function upsertSleepMonitoringInstance(patientId, patch) {
  const raw = loadRaw()
  const instances = { ...raw.instances }
  const prev = instances[patientId] || {}
  instances[patientId] = { ...prev, patientId, ...patch }
  raw.instances = instances
  saveRaw(raw)
  emitSleepMonitoringLoopUpdate()
}

export function appendSleepObservationNote(patientId, text) {
  const trimmed = String(text || '').trim()
  if (!trimmed) return
  const raw = loadRaw()
  const instances = { ...raw.instances }
  const prev = instances[patientId] || { patientId }
  const notes = Array.isArray(prev.observationNotes) ? [...prev.observationNotes] : []
  notes.push({ at: new Date().toISOString(), text: trimmed })
  instances[patientId] = { ...prev, observationNotes: notes.slice(-14) }
  raw.instances = instances
  saveRaw(raw)
  emitSleepMonitoringLoopUpdate()
}
