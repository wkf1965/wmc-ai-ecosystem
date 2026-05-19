/**
 * Simulation storage — AI Risk Prediction Loop (localStorage).
 */

import { computeAiPredictionSnapshots } from '../lib/aiRiskPredictionLoopSimulation.js'

export const AI_RISK_PREDICTION_LOOP_KEY = 'wmc_ai_risk_prediction_loop_v1'

function loadRaw() {
  try {
    const raw = localStorage.getItem(AI_RISK_PREDICTION_LOOP_KEY)
    if (!raw) {
      return {
        instances: {},
        scores: {
          lowRisk: 0,
          moderateRisk: 0,
          highRisk: 0,
          critical: 0,
          emergencyEscalation: 0,
        },
        baseline: null,
      }
    }
    const p = JSON.parse(raw)
    return {
      instances: p.instances && typeof p.instances === 'object' ? p.instances : {},
      scores: {
        lowRisk: p.scores?.lowRisk ?? 0,
        moderateRisk: p.scores?.moderateRisk ?? 0,
        highRisk: p.scores?.highRisk ?? 0,
        critical: p.scores?.critical ?? 0,
        emergencyEscalation: p.scores?.emergencyEscalation ?? 0,
      },
      baseline: p.baseline || null,
    }
  } catch {
    return {
      instances: {},
      scores: {
        lowRisk: 0,
        moderateRisk: 0,
        highRisk: 0,
        critical: 0,
        emergencyEscalation: 0,
      },
      baseline: null,
    }
  }
}

function saveRaw(data) {
  localStorage.setItem(AI_RISK_PREDICTION_LOOP_KEY, JSON.stringify(data))
}

export function emitAiRiskPredictionLoopUpdate() {
  window.dispatchEvent(new CustomEvent('wmc-ai-risk-prediction-loop-updated'))
}

export function ensureAiRiskPredictionBaseline() {
  const raw = loadRaw()
  if (raw.baseline) return raw.baseline
  raw.baseline = {
    lowRisk: 48,
    moderateRisk: 32,
    highRisk: 18,
    critical: 9,
    emergencyEscalation: 4,
  }
  saveRaw(raw)
  return raw.baseline
}

export function readAiRiskPredictionLoopRaw() {
  return loadRaw()
}

export function bumpAiRiskPredictionScore(field, delta = 1) {
  const raw = loadRaw()
  raw.scores[field] = (raw.scores[field] ?? 0) + delta
  saveRaw(raw)
  emitAiRiskPredictionLoopUpdate()
}

export function aiRiskPredictionScoreTotalsDisplay() {
  const raw = readAiRiskPredictionLoopRaw()
  ensureAiRiskPredictionBaseline()
  const b = raw.baseline || {
    lowRisk: 0,
    moderateRisk: 0,
    highRisk: 0,
    critical: 0,
    emergencyEscalation: 0,
  }
  const s = raw.scores || {}
  return {
    lowRisk: b.lowRisk + (s.lowRisk ?? 0),
    moderateRisk: b.moderateRisk + (s.moderateRisk ?? 0),
    highRisk: b.highRisk + (s.highRisk ?? 0),
    critical: b.critical + (s.critical ?? 0),
    emergencyEscalation: b.emergencyEscalation + (s.emergencyEscalation ?? 0),
  }
}

export function getAiRiskPredictionInstancesObject() {
  ensureAiRiskPredictionBaseline()
  return loadRaw().instances || {}
}

export function mergeAiRiskPredictionInstances(patients, notes = [], nowMs = Date.now()) {
  ensureAiRiskPredictionBaseline()
  const raw = loadRaw()
  const prev = raw.instances || {}
  const nextMap = computeAiPredictionSnapshots(patients || [], notes || [], prev, nowMs)
  raw.instances = nextMap
  saveRaw(raw)
  emitAiRiskPredictionLoopUpdate()
  return Object.values(nextMap)
}

export function upsertAiRiskPredictionInstance(patientId, patch) {
  const raw = loadRaw()
  const instances = { ...(raw.instances || {}) }
  const prev = instances[patientId] || {}
  instances[patientId] = { ...prev, patientId, ...patch }
  raw.instances = instances
  saveRaw(raw)
  emitAiRiskPredictionLoopUpdate()
}
