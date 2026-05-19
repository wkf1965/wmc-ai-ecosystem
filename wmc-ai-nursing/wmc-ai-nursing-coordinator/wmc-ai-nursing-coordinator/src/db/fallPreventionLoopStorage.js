/**
 * Simulation storage — Fall Prevention Loop (localStorage).
 */

import { MED_LOOP_ROOM_MAP } from '../data/medicationLoopSeed.js'

export const FALL_PREVENTION_LOOP_KEY = 'wmc_fall_prevention_loop_v1'

function hashStr(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function loadRaw() {
  try {
    const raw = localStorage.getItem(FALL_PREVENTION_LOOP_KEY)
    if (!raw) {
      return {
        instances: {},
        scores: {
          safe: 0,
          monitor: 0,
          moderateRisk: 0,
          highRisk: 0,
          urgentSupervision: 0,
        },
        baseline: null,
      }
    }
    const p = JSON.parse(raw)
    return {
      instances: p.instances && typeof p.instances === 'object' ? p.instances : {},
      scores: {
        safe: p.scores?.safe ?? 0,
        monitor: p.scores?.monitor ?? 0,
        moderateRisk: p.scores?.moderateRisk ?? 0,
        highRisk: p.scores?.highRisk ?? 0,
        urgentSupervision: p.scores?.urgentSupervision ?? 0,
      },
      baseline: p.baseline || null,
    }
  } catch {
    return {
      instances: {},
      scores: {
        safe: 0,
        monitor: 0,
        moderateRisk: 0,
        highRisk: 0,
        urgentSupervision: 0,
      },
      baseline: null,
    }
  }
}

function saveRaw(data) {
  localStorage.setItem(FALL_PREVENTION_LOOP_KEY, JSON.stringify(data))
}

export function emitFallPreventionLoopUpdate() {
  window.dispatchEvent(new CustomEvent('wmc-fall-prevention-loop-updated'))
}

export function ensureFallPreventionBaseline() {
  const raw = loadRaw()
  if (raw.baseline) return raw.baseline
  raw.baseline = { safe: 46, monitor: 26, moderateRisk: 14, highRisk: 9, urgentSupervision: 5 }
  saveRaw(raw)
  return raw.baseline
}

export function readFallPreventionLoopRaw() {
  return loadRaw()
}

export function bumpFallPreventionScore(field, delta = 1) {
  const raw = loadRaw()
  raw.scores[field] = (raw.scores[field] ?? 0) + delta
  saveRaw(raw)
  emitFallPreventionLoopUpdate()
}

function roomForPatient(id, idx) {
  return MED_LOOP_ROOM_MAP[id] || `TBD-${String(idx).padStart(3, '0')}`
}

/** Map chart fallRisk string to simulation tier */
function tierFromPatientFallRisk(fr) {
  const s = String(fr || '').toLowerCase()
  if (s.includes('high')) return /** @type {'low'|'moderate'|'high'|'very_high'} */ ('high')
  if (s.includes('moder')) return 'moderate'
  return 'low'
}

function seedDefaultsForPatient(patientId, idx, patientRow) {
  const h = hashStr(`${patientId}|fall`)
  const now = Date.now()

  const tierFromSeed = [ 'moderate', 'high', 'low', 'very_high', 'moderate', 'low', 'high', 'moderate' ][h % 8]
  const tier = patientRow?.fallRisk ? tierFromPatientFallRisk(patientRow.fallRisk) : tierFromSeed

  const aids = ['None', 'Single-point cane', 'Rolling walker', 'WCH standby', '4-wheel walker']
  const rails = ['Raised per protocol', 'Half-rail ×1', 'Low bed — rails per order', 'Full rails both sides']
  const overdueBias = h % 11 === 0
  const soonBias = h % 7 === 2 && !overdueBias

  let nextDue = new Date(now + (35 + (h % 50)) * 60 * 1000).toISOString()
  let lastCheck = new Date(now - (90 + (h % 120)) * 60 * 1000).toISOString()
  if (overdueBias) {
    nextDue = new Date(now - (40 + (h % 15)) * 60 * 1000).toISOString()
    lastCheck = new Date(now - 6 * 60 * 60 * 1000).toISOString()
  } else if (soonBias) {
    nextDue = new Date(now + (8 + (h % 12)) * 60 * 1000).toISOString()
  }

  const wander = tier !== 'low' && (h % 5 === 0 || h % 9 === 1)
  const prevFall = tier !== 'low' && (h % 6 === 0 || patientRow?.fallRisk?.toLowerCase().includes('high'))

  return {
    patientId,
    patientName: '',
    roomNumber: roomForPatient(patientId, idx + 1),
    fallRiskLevel: tier,
    mobilityStatus: patientRow?.mobilityStatus || 'Independent with assist PRN',
    walkingAid: aids[h % aids.length],
    bedRailStatus: rails[h % rails.length],
    callBellWithinReach: h % 7 !== 2,
    nonSlipSocks: h % 8 !== 3,
    nightWanderingRisk: wander,
    previousFallHistory: prevFall,
    lastFallCheckTime: lastCheck,
    nextFallCheckDueTime: nextDue,
    nurseAssigned: patientRow?.assignedNurse || 'Charge RN',
    environmentMarkedSafe: h % 10 !== 4,
    escalatedFallRisk: h % 17 === 3,
    confusionWalkingAttempt: tier !== 'low' && h % 13 === 5,
    repeatedWanderingFlag: wander && h % 11 === 0,
    riskNotes: [],
  }
}

export function mergeFallPreventionInstances(patients) {
  ensureFallPreventionBaseline()
  const raw = loadRaw()
  let instances = { ...(raw.instances || {}) }
  let mutated = false

  const roster = patients?.length ? patients : [{ id: 'demo', fullName: 'Demo Resident', assignedNurse: 'R.N. Patel', fallRisk: 'Moderate', mobilityStatus: 'Walker' }]

  roster.forEach((p, idx) => {
    const pid = p.id
    if (!instances[pid]) {
      const seeded = seedDefaultsForPatient(pid, idx, p)
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

  return roster.map((p, idx) => normalizeFallRow(instances[p.id] || seedDefaultsForPatient(p.id, idx, p), p))
}

function normalizeFallRow(row, patientFallback) {
  const notes = Array.isArray(row.riskNotes) ? row.riskNotes : []
  const tier = ['low', 'moderate', 'high', 'very_high'].includes(row.fallRiskLevel) ? row.fallRiskLevel : 'moderate'
  return {
    ...row,
    patientName: row.patientName || patientFallback?.fullName || 'Resident',
    patientId: row.patientId || patientFallback?.id,
    roomNumber: row.roomNumber || roomForPatient(patientFallback?.id, 1),
    fallRiskLevel: tier,
    mobilityStatus: row.mobilityStatus || patientFallback?.mobilityStatus || '—',
    walkingAid: row.walkingAid || '—',
    bedRailStatus: row.bedRailStatus || '—',
    callBellWithinReach: Boolean(row.callBellWithinReach),
    nonSlipSocks: Boolean(row.nonSlipSocks),
    nightWanderingRisk: Boolean(row.nightWanderingRisk),
    previousFallHistory: Boolean(row.previousFallHistory),
    environmentMarkedSafe: Boolean(row.environmentMarkedSafe),
    escalatedFallRisk: Boolean(row.escalatedFallRisk),
    confusionWalkingAttempt: Boolean(row.confusionWalkingAttempt),
    repeatedWanderingFlag: Boolean(row.repeatedWanderingFlag),
    riskNotes: notes.slice(-14),
  }
}

export function upsertFallPreventionInstance(patientId, patch) {
  const raw = loadRaw()
  const instances = { ...raw.instances }
  const prev = instances[patientId] || {}
  instances[patientId] = { ...prev, patientId, ...patch }
  raw.instances = instances
  saveRaw(raw)
  emitFallPreventionLoopUpdate()
}

export function appendFallRiskNote(patientId, text) {
  const trimmed = String(text || '').trim()
  if (!trimmed) return
  const raw = loadRaw()
  const instances = { ...raw.instances }
  const prev = instances[patientId] || { patientId }
  const notes = Array.isArray(prev.riskNotes) ? [...prev.riskNotes] : []
  notes.push({ at: new Date().toISOString(), text: trimmed })
  instances[patientId] = { ...prev, riskNotes: notes.slice(-14) }
  raw.instances = instances
  saveRaw(raw)
  emitFallPreventionLoopUpdate()
}
