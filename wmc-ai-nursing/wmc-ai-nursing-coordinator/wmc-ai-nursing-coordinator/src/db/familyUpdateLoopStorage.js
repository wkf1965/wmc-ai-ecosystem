/**
 * Simulation storage — Family Update Loop (localStorage).
 */

import { computeFamilyUpdateSnapshots } from '../lib/familyUpdateLoopSimulation.js'

export const FAMILY_UPDATE_LOOP_KEY = 'wmc_family_update_loop_v1'

function loadRaw() {
  try {
    const raw = localStorage.getItem(FAMILY_UPDATE_LOOP_KEY)
    if (!raw) {
      return {
        instances: {},
        scores: {
          upToDate: 0,
          pending: 0,
          overdue: 0,
          urgent: 0,
          supervisorReviewNeeded: 0,
        },
        baseline: null,
      }
    }
    const p = JSON.parse(raw)
    return {
      instances: p.instances && typeof p.instances === 'object' ? p.instances : {},
      scores: {
        upToDate: p.scores?.upToDate ?? 0,
        pending: p.scores?.pending ?? 0,
        overdue: p.scores?.overdue ?? 0,
        urgent: p.scores?.urgent ?? 0,
        supervisorReviewNeeded: p.scores?.supervisorReviewNeeded ?? 0,
      },
      baseline: p.baseline || null,
    }
  } catch {
    return {
      instances: {},
      scores: {
        upToDate: 0,
        pending: 0,
        overdue: 0,
        urgent: 0,
        supervisorReviewNeeded: 0,
      },
      baseline: null,
    }
  }
}

function saveRaw(data) {
  localStorage.setItem(FAMILY_UPDATE_LOOP_KEY, JSON.stringify(data))
}

export function emitFamilyUpdateLoopUpdate() {
  window.dispatchEvent(new CustomEvent('wmc-family-update-loop-updated'))
}

export function ensureFamilyUpdateBaseline() {
  const raw = loadRaw()
  if (raw.baseline) return raw.baseline
  raw.baseline = {
    upToDate: 42,
    pending: 26,
    overdue: 11,
    urgent: 7,
    supervisorReviewNeeded: 9,
  }
  saveRaw(raw)
  return raw.baseline
}

export function readFamilyUpdateLoopRaw() {
  return loadRaw()
}

export function bumpFamilyUpdateScore(field, delta = 1) {
  const raw = loadRaw()
  raw.scores[field] = (raw.scores[field] ?? 0) + delta
  saveRaw(raw)
  emitFamilyUpdateLoopUpdate()
}

export function familyUpdateScoreTotalsDisplay(rowTallies = {}) {
  const raw = readFamilyUpdateLoopRaw()
  ensureFamilyUpdateBaseline()
  const b = raw.baseline || {
    upToDate: 0,
    pending: 0,
    overdue: 0,
    urgent: 0,
    supervisorReviewNeeded: 0,
  }
  const s = raw.scores || {}
  const t = rowTallies || {}
  return {
    upToDate: b.upToDate + (s.upToDate ?? 0) + (t.upToDate ?? 0),
    pending: b.pending + (s.pending ?? 0) + (t.pending ?? 0),
    overdue: b.overdue + (s.overdue ?? 0) + (t.overdue ?? 0),
    urgent: b.urgent + (s.urgent ?? 0) + (t.urgent ?? 0),
    supervisorReviewNeeded:
      b.supervisorReviewNeeded + (s.supervisorReviewNeeded ?? 0) + (t.supervisorReviewNeeded ?? 0),
  }
}

export function getFamilyUpdateInstancesObject() {
  ensureFamilyUpdateBaseline()
  return loadRaw().instances || {}
}

export function mergeFamilyUpdateInstances(patients, notes = [], nowMs = Date.now()) {
  ensureFamilyUpdateBaseline()
  const raw = loadRaw()
  const prev = raw.instances || {}
  const nextMap = computeFamilyUpdateSnapshots(patients || [], notes || [], prev, nowMs)
  raw.instances = nextMap
  saveRaw(raw)
  emitFamilyUpdateLoopUpdate()
  return Object.values(nextMap)
}

export function upsertFamilyUpdateInstance(patientId, patch) {
  const raw = loadRaw()
  const instances = { ...(raw.instances || {}) }
  const prev = instances[patientId] || {}
  instances[patientId] = { ...prev, patientId, ...patch }
  raw.instances = instances
  saveRaw(raw)
  emitFamilyUpdateLoopUpdate()
}
