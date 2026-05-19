/**
 * Simulation storage — Infection Control Loop (localStorage).
 */

import { computeInfectionControlSnapshots } from '../lib/infectionControlLoopSimulation.js'

export const INFECTION_CONTROL_LOOP_KEY = 'wmc_infection_control_loop_v1'

function loadRaw() {
  try {
    const raw = localStorage.getItem(INFECTION_CONTROL_LOOP_KEY)
    if (!raw) {
      return {
        instances: {},
        scores: {
          clear: 0,
          monitor: 0,
          suspectedInfection: 0,
          isolationNeeded: 0,
          urgentReview: 0,
        },
        baseline: null,
      }
    }
    const p = JSON.parse(raw)
    return {
      instances: p.instances && typeof p.instances === 'object' ? p.instances : {},
      scores: {
        clear: p.scores?.clear ?? 0,
        monitor: p.scores?.monitor ?? 0,
        suspectedInfection: p.scores?.suspectedInfection ?? 0,
        isolationNeeded: p.scores?.isolationNeeded ?? 0,
        urgentReview: p.scores?.urgentReview ?? 0,
      },
      baseline: p.baseline || null,
    }
  } catch {
    return {
      instances: {},
      scores: {
        clear: 0,
        monitor: 0,
        suspectedInfection: 0,
        isolationNeeded: 0,
        urgentReview: 0,
      },
      baseline: null,
    }
  }
}

function saveRaw(data) {
  localStorage.setItem(INFECTION_CONTROL_LOOP_KEY, JSON.stringify(data))
}

export function emitInfectionControlLoopUpdate() {
  window.dispatchEvent(new CustomEvent('wmc-infection-control-loop-updated'))
}

export function ensureInfectionControlBaseline() {
  const raw = loadRaw()
  if (raw.baseline) return raw.baseline
  raw.baseline = {
    clear: 48,
    monitor: 26,
    suspectedInfection: 12,
    isolationNeeded: 8,
    urgentReview: 5,
  }
  saveRaw(raw)
  return raw.baseline
}

export function readInfectionControlLoopRaw() {
  return loadRaw()
}

export function bumpInfectionControlScore(field, delta = 1) {
  const raw = loadRaw()
  raw.scores[field] = (raw.scores[field] ?? 0) + delta
  saveRaw(raw)
  emitInfectionControlLoopUpdate()
}

export function infectionControlScoreTotalsDisplay(tallies = {}) {
  const raw = readInfectionControlLoopRaw()
  ensureInfectionControlBaseline()
  const b = raw.baseline || {
    clear: 0,
    monitor: 0,
    suspectedInfection: 0,
    isolationNeeded: 0,
    urgentReview: 0,
  }
  const s = raw.scores || {}
  const t = tallies || {}
  return {
    clear: b.clear + (s.clear ?? 0) + (t.clear ?? 0),
    monitor: b.monitor + (s.monitor ?? 0) + (t.monitor ?? 0),
    suspectedInfection: b.suspectedInfection + (s.suspectedInfection ?? 0) + (t.suspectedInfection ?? 0),
    isolationNeeded: b.isolationNeeded + (s.isolationNeeded ?? 0) + (t.isolationNeeded ?? 0),
    urgentReview: b.urgentReview + (s.urgentReview ?? 0) + (t.urgentReview ?? 0),
  }
}

export function getInfectionControlInstancesObject() {
  ensureInfectionControlBaseline()
  return loadRaw().instances || {}
}

export function mergeInfectionControlInstances(patients = [], nowMs = Date.now()) {
  ensureInfectionControlBaseline()
  const raw = loadRaw()
  const prev = raw.instances || {}
  const nextMap = computeInfectionControlSnapshots(patients || [], prev, nowMs)
  raw.instances = nextMap
  saveRaw(raw)
  return Object.values(nextMap)
}

export function upsertInfectionControlInstance(patientId, patch) {
  const raw = loadRaw()
  const instances = { ...(raw.instances || {}) }
  const prev = instances[patientId] || {}
  instances[patientId] = { ...prev, patientId, ...patch }
  raw.instances = instances
  saveRaw(raw)
  emitInfectionControlLoopUpdate()
}
