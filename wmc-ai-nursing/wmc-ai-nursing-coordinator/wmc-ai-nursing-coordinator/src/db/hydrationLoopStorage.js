import { MED_LOOP_ROOM_MAP } from '../data/medicationLoopSeed.js'

export const HYDRATION_LOOP_STORAGE_KEY = 'wmc_hydration_loop_v1'

function todayLocalStr(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function hashStr(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function loadRaw() {
  try {
    const raw = localStorage.getItem(HYDRATION_LOOP_STORAGE_KEY)
    if (!raw) {
      return {
        instances: {},
        scores: { onTarget: 0, belowTarget: 0, highRisk: 0, refused: 0, escalated: 0 },
        baseline: null,
      }
    }
    const p = JSON.parse(raw)
    return {
      instances: p.instances && typeof p.instances === 'object' ? p.instances : {},
      scores: {
        onTarget: p.scores?.onTarget ?? 0,
        belowTarget: p.scores?.belowTarget ?? 0,
        highRisk: p.scores?.highRisk ?? 0,
        refused: p.scores?.refused ?? 0,
        escalated: p.scores?.escalated ?? 0,
      },
      baseline: p.baseline || null,
    }
  } catch {
    return {
      instances: {},
      scores: { onTarget: 0, belowTarget: 0, highRisk: 0, refused: 0, escalated: 0 },
      baseline: null,
    }
  }
}

function saveRaw(data) {
  localStorage.setItem(HYDRATION_LOOP_STORAGE_KEY, JSON.stringify(data))
}

export function emitHydrationLoopUpdate() {
  window.dispatchEvent(new CustomEvent('wmc-hydration-loop-updated'))
}

export function ensureHydrationBaseline() {
  const raw = loadRaw()
  if (raw.baseline) return raw.baseline
  raw.baseline = { onTarget: 36, belowTarget: 14, highRisk: 8, refused: 5, escalated: 4 }
  saveRaw(raw)
  return raw.baseline
}

export function readHydrationLoopRaw() {
  return loadRaw()
}

export function bumpHydrationScore(field, delta = 1) {
  const raw = loadRaw()
  raw.scores[field] = (raw.scores[field] ?? 0) + delta
  saveRaw(raw)
  emitHydrationLoopUpdate()
}

function roomForPatient(id, idx) {
  return MED_LOOP_ROOM_MAP[id] || `TBD-${String(idx).padStart(3, '0')}`
}

export function mergeHydrationLoopRows(patients) {
  ensureHydrationBaseline()
  const raw = loadRaw()
  const today = todayLocalStr()
  const INTERVAL_MIN = 120

  if (!patients?.length) {
    const id = 'demo'
    const over = raw.instances[id] || {}
    return [
      {
        patientId: id,
        patientName: 'Demo Resident',
        room: '100A',
        fluidTargetMl: 2000,
        intakeSoFarMl: over.intakeSoFarMl ?? 640,
        intakeDay: over.intakeDay ?? today,
        lastDrinkAt: over.lastDrinkAt ?? new Date(Date.now() - 90 * 60000).toISOString(),
        nextHydrationDueAt: over.nextHydrationDueAt ?? new Date(Date.now() + 45 * 60000).toISOString(),
        intervalMinutes: INTERVAL_MIN,
        snoozeUntil: over.snoozeUntil ?? null,
        nurseAssigned: over.nurseAssigned ?? 'Demo Nurse',
        swallowingRisk: over.swallowingRisk ?? 'Moderate — thickened liquids PRN',
        dehydrationRiskLevel: over.dehydrationRiskLevel ?? 'Moderate',
        notes: Array.isArray(over.notes) ? over.notes : [],
        escalated: Boolean(over.escalated),
        refusedToday: over.refusedToday ?? 0,
        refusedDay: over.refusedDay ?? today,
        simDryMouthNote: Boolean(over.simDryMouthNote),
        simDizzinessNote: Boolean(over.simDizzinessNote),
        onTargetScoredDay: over.onTargetScoredDay ?? null,
      },
    ]
  }

  return patients.map((patient, idx) => {
    const id = patient.id
    const h = hashStr(`${id}|hyd`)
    const over = raw.instances[id] || {}
    const target = over.fluidTargetMl ?? 1600 + (h % 900)
    let intakeDay = over.intakeDay || today
    let intakeSoFarMl =
      typeof over.intakeSoFarMl === 'number' ? over.intakeSoFarMl : Math.round(target * (0.25 + (h % 50) / 100))

    if (intakeDay !== today) {
      intakeDay = today
      intakeSoFarMl = Math.round(target * (0.15 + (h % 40) / 100))
    }

    const nurse =
      over.nurseAssigned?.trim() ||
      patient.assignedNurse?.trim() ||
      ['R.N. Patel', 'LPN Santos', 'R.N. Kim', 'R.N. Nguyen'][idx % 4]

    const feed = patient.feedingStatus || 'Regular diet'
    const swallowingRisk =
      over.swallowingRisk ||
      (feed.length > 60 ? `${feed.slice(0, 58)}…` : `${feed || 'Regular'} · aspiration precautions per plan`)

    const riskRoll = h % 10
    const dehydrationRiskLevel =
      over.dehydrationRiskLevel || (riskRoll >= 8 ? 'High' : riskRoll >= 4 ? 'Moderate' : 'Low')

    let lastDrinkAt =
      over.lastDrinkAt || new Date(Date.now() - ((h % 90) + 20) * 60000).toISOString()
    let nextHydrationDueAt = over.nextHydrationDueAt
    if (!nextHydrationDueAt) {
      const next = Date.now() + ((h % 25) - 10) * 60000
      nextHydrationDueAt = new Date(next).toISOString()
    }

    let refusedToday = over.refusedToday ?? 0
    let refusedDay = over.refusedDay ?? today
    if (refusedDay !== today) {
      refusedToday = 0
      refusedDay = today
    }

    return {
      patientId: id,
      patientName: patient.fullName || 'Unknown',
      room: over.room || roomForPatient(id, idx + 1),
      fluidTargetMl: target,
      intakeSoFarMl,
      intakeDay,
      lastDrinkAt,
      nextHydrationDueAt,
      intervalMinutes: over.intervalMinutes ?? INTERVAL_MIN,
      snoozeUntil: over.snoozeUntil ?? null,
      nurseAssigned: nurse,
      swallowingRisk,
      dehydrationRiskLevel,
      notes: Array.isArray(over.notes) ? over.notes : [],
      escalated: Boolean(over.escalated),
      refusedToday,
      refusedDay,
      simDryMouthNote: Boolean(over.simDryMouthNote ?? (h % 11 === 0)),
      simDizzinessNote: Boolean(over.simDizzinessNote ?? (h % 13 === 0)),
      onTargetScoredDay: over.onTargetScoredDay ?? null,
    }
  })
}

export function upsertHydrationPatient(patientId, patch) {
  const raw = loadRaw()
  const prev = raw.instances[patientId] || {}
  raw.instances[patientId] = { ...prev, ...patch }
  saveRaw(raw)
  emitHydrationLoopUpdate()
}

export function appendHydrationNote(patientId, text) {
  const trimmed = String(text || '').trim()
  if (!trimmed) return
  const raw = loadRaw()
  const prev = raw.instances[patientId] || {}
  const notes = Array.isArray(prev.notes) ? [...prev.notes] : []
  notes.push({ at: new Date().toISOString(), text: trimmed })
  raw.instances[patientId] = { ...prev, notes: notes.slice(-14) }
  saveRaw(raw)
  emitHydrationLoopUpdate()
}
