/**
 * AI Intelligent Nursing Brain — simulation fusion engine.
 *
 * Ingests demo/storage-backed telemetry from:
 * - Nursing notes
 * - Health check loop · medication · hydration · nutrition · side turning · wound care · mental health
 * - Sleep monitoring · rehabilitation · fall prevention · infection control · doctor review · emergency response
 *
 * Outputs nine intelligent risk scores → decision levels (low → critical) and five recommendation channels.
 * All outputs are simulation-only; verify clinically before operational use.
 */

import { getAllPatients, getPatientById } from '../db/patientStorage.js'
import { getAllNursingNotes } from '../db/nursingNoteStorage.js'
import { getInfectionControlInstancesObject } from '../db/infectionControlLoopStorage.js'
import { getDoctorReviewRecordsSnapshot } from '../db/doctorReviewLoopStorage.js'

import { listHealthLoopRows } from './healthCheckLoopSimulation.js'
import { listMedicationLoopRows } from './medicationLoopSimulation.js'
import { listHydrationLoopRows } from './hydrationLoopSimulation.js'
import { listNutritionLoopRows } from './nutritionLoopSimulation.js'
import { listSideTurningLoopRows } from './sideTurningLoopSimulation.js'
import { listWoundCareLoopRows } from './woundLoopSimulation.js'
import { listMentalHealthLoopRows } from './mentalHealthLoopSimulation.js'
import { listSleepMonitoringRows } from './sleepMonitoringLoopSimulation.js'
import { listRehabilitationLoopRows } from './rehabLoopSimulation.js'
import { listFallPreventionRows } from './fallPreventionLoopSimulation.js'
import {
  computeInfectionControlSnapshots,
  deriveInfectionScoreBand,
  listInfectionControlRows,
} from './infectionControlLoopSimulation.js'
import { listEmergencyRecordsWithBuckets } from './emergencyResponseLoopSimulation.js'
import { listDoctorReviewRows, syncDoctorReviewAutoQueue } from './doctorReviewLoopSimulation.js'
import { infectionRiskPoints } from './woundLoopSimulation.js'

/** @typedef {'low'|'monitor'|'warning'|'high_risk'|'critical'} DecisionLevel */

export const DECISION_LEVEL_ORDER = /** @type {const} */ ([
  'low',
  'monitor',
  'warning',
  'high_risk',
  'critical',
])

export const DECISION_LEVEL_LABELS = {
  low: 'Low',
  monitor: 'Monitor',
  warning: 'Warning',
  high_risk: 'High risk',
  critical: 'Critical',
}

/** Human-readable labels aligned with nursing brain requirements */
export const RISK_DIMENSION_LABELS = {
  fall: 'Fall risk',
  pressureSore: 'Pressure sore risk',
  dehydration: 'Dehydration risk',
  infection: 'Infection risk',
  delirium: 'Delirium risk',
  medication: 'Medication risk',
  nutrition: 'Nutrition risk',
  rehabDecline: 'Rehabilitation decline risk',
  emergencyDeterioration: 'Emergency deterioration risk',
}

/** Fused upstream datasets (simulation) */
export const BRAIN_DATA_SOURCES = [
  { id: 'nursing_notes', label: 'Nursing notes' },
  { id: 'health_check_loop', label: 'Health check loop' },
  { id: 'medication_loop', label: 'Medication loop' },
  { id: 'hydration_loop', label: 'Hydration loop' },
  { id: 'nutrition_loop', label: 'Nutrition loop' },
  { id: 'side_turning_loop', label: 'Side turning loop' },
  { id: 'wound_care_loop', label: 'Wound care loop' },
  { id: 'mental_health_loop', label: 'Mental health loop' },
  { id: 'sleep_monitoring_loop', label: 'Sleep monitoring loop' },
  { id: 'rehabilitation_loop', label: 'Rehabilitation loop' },
  { id: 'fall_prevention_loop', label: 'Fall prevention loop' },
  { id: 'infection_control_loop', label: 'Infection control loop' },
  { id: 'doctor_review_loop', label: 'Doctor review loop' },
  { id: 'emergency_response_loop', label: 'Emergency response loop' },
]

export const RECOMMENDATION_CHANNELS = /** @type {const} */ ([
  'nurseAction',
  'supervisorAction',
  'doctorReview',
  'familyUpdate',
  'emergencyEscalation',
])

const RISK_KEYS = /** @type {const} */ ([
  'fall',
  'pressureSore',
  'dehydration',
  'infection',
  'delirium',
  'medication',
  'nutrition',
  'rehabDecline',
  'emergencyDeterioration',
])

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n))
}

/** Map 0–100 composite risk score to decision level */
export function numericRiskToDecisionLevel(score) {
  const s = clamp(score, 0, 100)
  if (s >= 81) return /** @type {DecisionLevel} */ ('critical')
  if (s >= 61) return /** @type {DecisionLevel} */ ('high_risk')
  if (s >= 41) return /** @type {DecisionLevel} */ ('warning')
  if (s >= 21) return /** @type {DecisionLevel} */ ('monitor')
  return /** @type {DecisionLevel} */ ('low')
}

export function maxDecisionLevel(a, b) {
  return DECISION_LEVEL_ORDER.indexOf(a) >= DECISION_LEVEL_ORDER.indexOf(b) ? a : b
}

function notesForPatient(notes, patientId) {
  return (notes || []).filter((n) => n.patientId === patientId)
}

function aggregateNoteText(notes) {
  return notes
    .slice(0, 6)
    .map((n) =>
      [n.abnormalEvents, n.nurseRemarks, n.mood, n.skinCondition, n.appetite].filter(Boolean).join(' · '),
    )
    .join('\n')
}

/**
 * Build a read-only fusion snapshot from all care loops (simulation).
 * @param {Array<object>} patients
 * @param {Array<object>} nursingNotes
 * @param {number} [nowMs]
 */
export function buildNursingBrainSnapshot(patients, nursingNotes, nowMs = Date.now()) {
  const pts = patients?.length ? patients : getAllPatients()
  const notes = nursingNotes ?? getAllNursingNotes()

  const healthRows = listHealthLoopRows(pts)
  const medicationRows = listMedicationLoopRows(pts)
  const hydrationRows = listHydrationLoopRows(pts)
  const nutritionRows = listNutritionLoopRows(pts, nowMs)
  const sideTurningRows = listSideTurningLoopRows(pts)
  const woundRows = listWoundCareLoopRows(pts, nowMs)
  const mentalHealthRows = listMentalHealthLoopRows(pts, nowMs)
  const sleepRows = listSleepMonitoringRows(pts)
  const rehabilitationRows = listRehabilitationLoopRows(pts, nowMs)
  const fallPreventionRows = listFallPreventionRows(pts, nowMs)

  const infectionMap = computeInfectionControlSnapshots(pts, getInfectionControlInstancesObject(), nowMs)
  const infectionRows = listInfectionControlRows(infectionMap)

  const emergencyRows = listEmergencyRecordsWithBuckets(pts)

  const doctorRecordsRaw = [...getDoctorReviewRecordsSnapshot()]
  const doctorRecordsSynced = syncDoctorReviewAutoQueue(pts, notes, doctorRecordsRaw)
  const doctorReviewRows = listDoctorReviewRows(doctorRecordsSynced, nowMs)

  return {
    simulationMode: true,
    nowMs,
    patients: pts,
    nursingNotes: notes,
    healthRows,
    medicationRows,
    hydrationRows,
    nutritionRows,
    sideTurningRows,
    woundRows,
    mentalHealthRows,
    sleepRows,
    rehabilitationRows,
    fallPreventionRows,
    infectionRows,
    emergencyRows,
    doctorReviewRows,
  }
}

function infectionNumericFromBand(band) {
  const b = String(band || '')
  if (b === 'urgent_review') return 93
  if (b === 'isolation_needed') return 80
  if (b === 'suspected_infection') return 62
  if (b === 'monitor') return 34
  return 10
}

function computeFallRisk(snapshot, patientId, patient, noteBlob) {
  let score = 8
  const fall = snapshot.fallPreventionRows.find((r) => r.patientId === patientId)
  if (fall) {
    if (fall.bucket === 'overdue_checks') score += 42
    else if (fall.bucket === 'high_fall_risk') score += 36
    else if (fall.bucket === 'night_monitoring') score += 22
    else if (fall.bucket === 'check_due_now') score += 12
    const tier = String(fall.fallRiskLevel || '').toLowerCase()
    if (tier === 'very_high') score += 28
    else if (tier === 'high') score += 20
    else if (tier === 'moderate') score += 10
    if (fall.escalatedFallRisk) score += 18
    if (fall.previousFallHistory) score += 12
  }
  const fr = String(patient?.fallRisk || '').toLowerCase()
  if (fr.includes('very') || fr.includes('high')) score += 24
  else if (fr.includes('moderate')) score += 12

  const em = snapshot.emergencyRows.find((r) => r.patientId === patientId && /fall/i.test(String(r.emergencyType)))
  if (em && String(em.outcomeStatus).toLowerCase() !== 'resolved') score += 30

  if (/\bfall\b|\b slipped\b|\b syncope\b/i.test(noteBlob)) score += 18

  return clamp(score, 0, 100)
}

function computePressureRisk(snapshot, patientId, patient, noteBlob) {
  let score = 6
  const turn = snapshot.sideTurningRows.find((r) => r.patientId === patientId)
  if (turn) {
    if (turn.bucket === 'overdue') score += 44
    else if (turn.bucket === 'due_now') score += 14
    if ((turn.overdueMin || 0) > 45) score += 16
  }
  const wound = snapshot.woundRows.find((r) => r.patientId === patientId)
  if (wound) {
    const wt = String(wound.woundType || '').toLowerCase()
    if (/stage\s*(iii|iv|3|4)|unstageable/i.test(wt)) score += 36
    else if (/stage\s*(ii|2)/i.test(wt)) score += 22
    score += Math.min(28, infectionRiskPoints(wound) * 4)
    if (wound.healingTrend === 'worsening') score += 18
    if (wound.doctorReviewNeeded || wound.escalatedInfection) score += 22
  }
  const pr = String(patient?.pressureSoreRisk || '').toLowerCase()
  if (pr.includes('high')) score += 26
  else if (pr.includes('moderate')) score += 14

  if (/skin tear|breakdown|bruise|erythema|macerat/i.test(noteBlob)) score += 22

  return clamp(score, 0, 100)
}

function computeDehydrationRisk(snapshot, patientId, noteBlob) {
  let score = 5
  const hyd = snapshot.hydrationRows.find((r) => r.patientId === patientId)
  if (hyd) {
    if (hyd.bucket === 'low_intake') score += 38
    else if (hyd.bucket === 'due_now') score += 14
    const lvl = String(hyd.dehydrationRiskLevel || '').toLowerCase()
    if (lvl.includes('high')) score += 28
    else if (lvl.includes('moderate')) score += 14
    const pct = typeof hyd.intakePercent === 'number' ? hyd.intakePercent : 0
    if (pct < 42) score += 26
    else if (pct < 58) score += 12
    if ((hyd.refusedToday || 0) >= 2) score += 16
    if (hyd.escalated) score += 14
  }
  const health = snapshot.healthRows.filter((r) => r.patientId === patientId && r.checkTypeId === 'urine')
  for (const h of health) {
    const v = String(h.lastValue || '').toLowerCase()
    if (/18\s*m|low|decreased|anuria|<\s*20/i.test(v)) score += 26
  }
  if (/dehydrat|dry mucosa|poor po intake/i.test(noteBlob)) score += 20
  const nut = snapshot.nutritionRows.find((r) => r.patientId === patientId)
  if (nut && nut.foodIntakePercent < 40) score += 12

  return clamp(score, 0, 100)
}

function computeInfectionRisk(snapshot, patientId, noteBlob) {
  let score = 5
  const inf = snapshot.infectionRows.find((r) => r.patientId === patientId)
  if (inf) {
    score = Math.max(score, infectionNumericFromBand(deriveInfectionScoreBand(inf)))
    if (inf.isolationStatus === 'active') score += 12
    const t = Number(inf.temperatureC)
    if (Number.isFinite(t) && t >= 38) score += 22
  }
  const temps = snapshot.healthRows.filter((r) => r.patientId === patientId && r.checkTypeId === 'temp')
  for (const t of temps) {
    const n = parseFloat(String(t.lastValue).replace(/[^\d.]/g, ''))
    if (Number.isFinite(n) && n >= 38) score += 24
    else if (Number.isFinite(n) && n >= 37.8) score += 12
  }
  if (/fever|sepsis|uti|respiratory infection|covid|isolate/i.test(noteBlob)) score += 22

  return clamp(score, 0, 100)
}

function computeDeliriumRisk(snapshot, patientId, patient, noteBlob) {
  let score = 4
  const mh = snapshot.mentalHealthRows.find((r) => r.patientId === patientId)
  if (mh) {
    if (mh.bucket === 'doctor_counsellor_review_needed') score += 42
    else if (mh.bucket === 'confusion_delirium_risk') score += 36
    else if (mh.bucket === 'agitated_patients') score += 28
    else if (mh.bucket === 'depression_concern') score += 18
    const shr = String(mh.selfHarmRiskObs || '').toLowerCase()
    if (shr === 'high') score += 32
    else if (shr === 'moderate') score += 18
  }
  const mentalChecks = snapshot.healthRows.filter((r) => r.patientId === patientId && r.checkTypeId === 'mental')
  for (const m of mentalChecks) {
    const st = String(m.lastValue || '')
    if (/aox\s*[12]|confus|combative|unrespons/i.test(st)) score += 36
    else if (/aox\s*3|restless|agitat/i.test(st)) score += 18
  }
  const ms = String(patient?.mentalStatus || '')
  if (/aox\s*[12]|confus|disorient/i.test(ms)) score += 28
  else if (/aox\s*3/i.test(ms)) score += 12

  if (/delirium|sundown|hallucin|paranoia|altered mental/i.test(noteBlob)) score += 26

  const sleep = snapshot.sleepRows.find((r) => r.patientId === patientId)
  if (sleep) {
    const h = Number(sleep.totalSleepHours) || 0
    const w = Number(sleep.nightWakingEpisodes) || 0
    if (sleep.confusionAtNight || sleep.bucket === 'confusion_risk') score += 22
    if (h < 4 && w >= 4) score += 18
    else if (h < 5.5 && w >= 3) score += 12
  }

  return clamp(score, 0, 100)
}

function computeMedicationRisk(snapshot, patientId) {
  let score = 4
  const doses = snapshot.medicationRows.filter((r) => r.patientId === patientId)
  let missed = 0
  let refused = 0
  let delayed = 0
  for (const d of doses) {
    if (d.bucket === 'missed') missed += 1
    if (d.displayStatus === 'refused') refused += 1
    if (d.displayStatus === 'delayed' || d.displayStatus === 'missed') delayed += 1
  }
  score += missed * 22 + refused * 18 + Math.min(24, delayed * 6)
  if (missed >= 2) score += 20
  return clamp(score, 0, 100)
}

function computeNutritionRisk(snapshot, patientId, noteBlob) {
  let score = 5
  const nut = snapshot.nutritionRows.find((r) => r.patientId === patientId)
  if (nut) {
    if (nut.bucket === 'poor_intake' || nut.bucket === 'weight_loss_concern') score += 34
    else if (nut.bucket === 'swallowing_risk') score += 26
    if (nut.foodIntakePercent < 45) score += 22
    if (/aspiration|pureed|nectar thick/i.test(String(nut.dietTexture))) score += 10
  }
  if (/poor appetite|nausea|vomit|refusing meals/i.test(noteBlob)) score += 18

  return clamp(score, 0, 100)
}

function computeRehabDeclineRisk(snapshot, patientId) {
  let score = 6
  const rh = snapshot.rehabilitationRows.find((r) => r.patientId === patientId)
  if (rh) {
    if (rh.progressTrend === 'declining') score += 40
    if (rh.rehabPlateau) score += 22
    if (rh.bucket === 'missed_rehab') score += 30
    if (rh.escalatedDoctorReview) score += 16
    if (rh.painScore >= 8) score += 12
  }
  return clamp(score, 0, 100)
}

function computeEmergencyRisk(snapshot, patientId) {
  let score = 3
  const rows = snapshot.emergencyRows.filter((r) => r.patientId === patientId)
  for (const r of rows) {
    if (String(r.outcomeStatus).toLowerCase() === 'resolved') continue
    const sev = String(r.severityLevel || '').toLowerCase()
    if (sev === 'code_red' || sev === 'critical') score += 55
    else if (sev === 'severe') score += 40
    else if (sev === 'moderate') score += 26
    else score += 14
    if (r.ambulanceCalled) score += 18
    if (r.sepsisRiskFlag) score += 22
  }
  return clamp(score, 0, 100)
}

/**
 * Per-dimension scores + levels for one patient.
 */
export function computePatientRiskProfile(snapshot, patientId) {
  const patient = snapshot.patients.find((p) => p.id === patientId) || getPatientById(patientId)
  const pn = notesForPatient(snapshot.nursingNotes, patientId)
  const blob = aggregateNoteText(pn)

  const dims = {
    fall: computeFallRisk(snapshot, patientId, patient, blob),
    pressureSore: computePressureRisk(snapshot, patientId, patient, blob),
    dehydration: computeDehydrationRisk(snapshot, patientId, blob),
    infection: computeInfectionRisk(snapshot, patientId, blob),
    delirium: computeDeliriumRisk(snapshot, patientId, patient, blob),
    medication: computeMedicationRisk(snapshot, patientId),
    nutrition: computeNutritionRisk(snapshot, patientId, blob),
    rehabDecline: computeRehabDeclineRisk(snapshot, patientId),
    emergencyDeterioration: computeEmergencyRisk(snapshot, patientId),
  }

  const enriched = {}
  let overall = 0
  for (const k of RISK_KEYS) {
    const score = dims[k]
    overall = Math.max(overall, score)
    enriched[k] = {
      score,
      level: numericRiskToDecisionLevel(score),
    }
  }

  return {
    patientId,
    patientName: patient?.fullName || patient?.name || 'Unknown',
    room:
      snapshot.fallPreventionRows.find((r) => r.patientId === patientId)?.roomNumber ||
      snapshot.healthRows.find((r) => r.patientId === patientId)?.room ||
      snapshot.hydrationRows.find((r) => r.patientId === patientId)?.room ||
      '—',
    dimensions: enriched,
    overallScore: overall,
    overallLevel: numericRiskToDecisionLevel(overall),
  }
}

function buildRecommendations(profile, snapshot) {
  const { dimensions, patientId } = profile
  const nurse = []
  const supervisor = []
  const doctor = []
  const family = []
  const emergency = []

  if (dimensions.fall.score >= 41) {
    nurse.push('Increase mobility supervision; verify gait belt, non-slip footwear, and environment cues.')
    supervisor.push('Audit fall bundle compliance and staffing coverage around high-risk mobilization windows.')
  }
  if (dimensions.pressureSore.score >= 41) {
    nurse.push('Reposition per protocol; inspect skin and offload heels; document wound/skin changes.')
    supervisor.push('Ensure turning schedule adherence and supplies for pressure injury prevention.')
  }
  if (dimensions.dehydration.score >= 41) {
    nurse.push('Offer fluids q opportunity; reconcile I/O; escalate poor PO intake per protocol.')
    family.push('Brief family on encouraging small frequent fluids if appropriate to care plan.')
  }
  if (dimensions.infection.score >= 41) {
    nurse.push('Follow isolation/PPE cues; monitor vitals trend; obtain cultures/tests per standing orders.')
    doctor.push('Review infectious symptoms, antimicrobials, and need for acute work-up.')
  }
  if (dimensions.delirium.score >= 41) {
    nurse.push('Orient × reorientation cues; minimize stimuli; ensure glasses/hearing aids; avoid unnecessary restraint.')
    doctor.push('Evaluate reversible causes (infection, meds, metabolic) if delirium suspected.')
  }
  if (dimensions.medication.score >= 41) {
    nurse.push('Reconcile MAR delays/refusals; clarify orders; observe for adverse reactions after doses.')
    doctor.push('Review high-risk medication interactions and PRN effectiveness if misses recur.')
  }
  if (dimensions.nutrition.score >= 41) {
    nurse.push('Offer preference-driven meals; monitor weights; involve dietitian per facility workflow.')
    family.push('Suggest family bring approved supplements or preferred items when diet allows.')
  }
  if (dimensions.rehabDecline.score >= 41) {
    nurse.push('Coordinate with therapy on tolerance; pain control prior to mobility; document barriers.')
    doctor.push('Discuss rehab plateau or decline if persistent despite therapy adjustments.')
  }
  if (dimensions.emergencyDeterioration.score >= 61) {
    emergency.push('Activate emergency protocol per facility policy; repeat vitals; prepare for escalation/EMS.')
    doctor.push('Immediate physician awareness for active emergency record.')
  }

  const docRow = snapshot.doctorReviewRows.find((r) => r.patientId === patientId)
  if (docRow && ['pending_review', 'urgent_cases', 'follow_up_needed'].includes(docRow.bucket)) {
    doctor.push(`Doctor review queue: ${docRow.triggerReason || 'Pending review'} (${docRow.severityLevel || '—'}).`)
  }

  return {
    nurseAction: [...new Set(nurse)],
    supervisorAction: [...new Set(supervisor)],
    doctorReview: [...new Set(doctor)],
    familyUpdate: [...new Set(family)],
    emergencyEscalation: [...new Set(emergency)],
  }
}

function missedLoopsForPatient(snapshot, patientId) {
  const items = []
  for (const r of snapshot.healthRows) {
    if (r.patientId !== patientId) continue
    if (r.overdue) items.push(`Health check overdue · ${r.checkTypeLabel}`)
  }
  for (const r of snapshot.medicationRows) {
    if (r.patientId !== patientId) continue
    if (r.bucket === 'missed') items.push(`Medication missed · ${r.medicationName}`)
  }
  for (const r of snapshot.sideTurningRows) {
    if (r.patientId !== patientId) continue
    if (r.bucket === 'overdue') items.push('Side turning overdue')
  }
  for (const r of snapshot.fallPreventionRows) {
    if (r.patientId !== patientId) continue
    if (r.bucket === 'overdue_checks') items.push('Fall prevention check overdue')
  }
  for (const r of snapshot.hydrationRows) {
    if (r.patientId !== patientId) continue
    if (r.bucket === 'low_intake' || (typeof r.intakePercent === 'number' && r.intakePercent < 40)) {
      items.push('Hydration / fluid targets behind')
    }
  }
  for (const r of snapshot.nutritionRows) {
    if (r.patientId !== patientId) continue
    if (r.bucket === 'meal_due_now' && r.foodIntakePercent < 35) items.push('Meal due with poor intake logged')
  }
  return items
}

function narrativeForPatient(profile) {
  const hot = RISK_KEYS.map((k) => ({ k, ...profile.dimensions[k] }))
    .filter((x) => x.score >= 31)
    .sort((a, b) => b.score - a.score)
  if (!hot.length) return 'Simulation fusion: no elevated risk axes on current loop snapshots for this resident.'
  const parts = hot
    .slice(0, 4)
    .map(
      (x) =>
        `${RISK_DIMENSION_LABELS[x.k] || x.k} (${DECISION_LEVEL_LABELS[x.level]}, score ${x.score})`,
    )
  return `Fusion highlights: ${parts.join('; ')}. All signals are simulated aggregates — verify clinically.`
}

/**
 * Compose intelligence packet from an existing snapshot (preferred when UI holds canonical patient/note context).
 */
export function composePatientIntelligenceSummary(patientId, snapshot) {
  const profile = computePatientRiskProfile(snapshot, patientId)
  const recommendations = buildRecommendations(profile, snapshot)
  const missedCareLoops = missedLoopsForPatient(snapshot, patientId)

  return {
    simulationMode: true,
    generatedAt: new Date(snapshot.nowMs).toISOString(),
    patientId,
    patientName: profile.patientName,
    room: profile.room,
    overallScore: profile.overallScore,
    overallLevel: profile.overallLevel,
    overallLevelLabel: DECISION_LEVEL_LABELS[profile.overallLevel],
    dimensions: profile.dimensions,
    recommendations,
    missedCareLoops,
    narrativeSummary: narrativeForPatient(profile),
  }
}

/**
 * Primary export — full intelligence packet for one patient (reads patients + notes from storage).
 */
export function generatePatientIntelligenceSummary(patientId) {
  const pts = getAllPatients()
  const notes = getAllNursingNotes()
  const snapshot = buildNursingBrainSnapshot(pts, notes)
  return composePatientIntelligenceSummary(patientId, snapshot)
}

/**
 * Same as generatePatientIntelligenceSummary but uses caller-supplied roster + notes (e.g. React hooks context).
 */
export function generatePatientIntelligenceSummaryFrom(patientId, patients, nursingNotes, nowMs = Date.now()) {
  const snapshot = buildNursingBrainSnapshot(patients, nursingNotes, nowMs)
  return composePatientIntelligenceSummary(patientId, snapshot)
}

function buildWardExecutiveSummary(meta) {
  const {
    patientCount,
    highRiskCount,
    deteriorationCount,
    missedResidents,
    doctorQueueCount,
    emergencyCount,
  } = meta
  return (
    `Simulation ward intelligence: ${patientCount} resident(s) in fusion scope. ` +
    `${highRiskCount} in High risk / Critical overall; ${deteriorationCount} flagged for multi-axis deterioration pattern; ` +
    `${missedResidents} with missed/delayed loop signals; ${doctorQueueCount} doctor-review queue item(s); ` +
    `${emergencyCount} active emergency escalation suggestion(s). Verify all cues at the bedside.`
  )
}

function wardNursingActions(topProfiles, snapshot) {
  const set = new Set()
  for (const p of topProfiles.slice(0, 8)) {
    const rec = buildRecommendations(p, snapshot)
    rec.nurseAction.forEach((x) => set.add(x))
  }
  return [...set].slice(0, 12)
}

/**
 * Ward-level fusion — uses seeded/demo storage for patients + notes.
 */
export function generateWardIntelligenceSummary() {
  const pts = getAllPatients()
  const notes = getAllNursingNotes()
  return generateWardIntelligenceSummaryFrom(pts, notes)
}

/**
 * Roll up recent Telegram webhook rows (mock store / API) for ward summary text + dashboard panels.
 * @param {Array<object>} entries — newest-first rows from telegram-mock-store.json API
 */
export function summarizeTelegramMockEntries(entries) {
  const list = Array.isArray(entries) ? entries : []
  const recentTelegramNursingNotes = list.slice(0, 15).map((e) => ({
    receivedAt: e.receivedAt ?? null,
    room: e.nursingRecord?.room ?? null,
    patient: e.nursingRecord?.patient ?? null,
    category: e.nursingRecord?.category ?? null,
    workflowRisk: e.nursingRecord?.workflowRiskLabel ?? e.nursingRecord?.riskLevel ?? null,
    notePreview: e.nursingRecord?.note ? String(e.nursingRecord.note).slice(0, 200) : null,
    botReplyPreview: e.replyText ? String(e.replyText).slice(0, 240) : null,
  }))

  const riskSet = new Set()
  const actionSet = new Set()
  for (const e of list.slice(0, 40)) {
    const kw = e.nursingRecord?.riskKeywords ?? e.parsePreview?.riskKeywords
    if (Array.isArray(kw)) {
      for (const x of kw) {
        if (x) riskSet.add(String(x))
      }
    }
    const ra = e.nursingRecord?.recommendedAction
    if (ra) actionSet.add(String(ra))
    const rt = e.replyText ? String(e.replyText) : ''
    const actMatch = /Action:\s*(.+)$/i.exec(rt.replace(/\s+/g, ' ').trim())
    if (actMatch) actionSet.add(actMatch[1].replace(/\.\s*$/, '').trim())
  }

  const telegramDetectedRisks = [...riskSet].slice(0, 40)
  const telegramSuggestedActions = [...actionSet].slice(0, 25)

  let telegramExecutiveAppend = ''
  if (list.length) {
    const bits = recentTelegramNursingNotes.slice(0, 3).map((r) => {
      const roomBit = r.room ? `Room ${r.room}` : 'Room —'
      const cat = r.category || '—'
      const risk = r.workflowRisk || '—'
      return `${roomBit} (${cat}, ${risk})`
    })
    telegramExecutiveAppend =
      ` Telegram nursing channel: ${list.length} recent entr${list.length === 1 ? 'y' : 'ies'} — ${bits.join('; ')}.` +
      (telegramDetectedRisks.length
        ? ` Keyword cues: ${telegramDetectedRisks.slice(0, 8).join(', ')}.`
        : '')
  }

  return {
    recentTelegramNursingNotes,
    telegramDetectedRisks,
    telegramSuggestedActions,
    telegramExecutiveAppend,
  }
}

/**
 * @param {object} [options]
 * @param {Array<object>} [options.telegramEntries] — optional newest-first webhook rows for Telegram intel panel
 */
export function generateWardIntelligenceSummaryFrom(patients, nursingNotes, nowMs = Date.now(), options = {}) {
  const snapshot = buildNursingBrainSnapshot(patients, nursingNotes, nowMs)
  const profiles = snapshot.patients.map((p) => computePatientRiskProfile(snapshot, p.id))
  profiles.sort((a, b) => b.overallScore - a.overallScore)

  const topHighRiskPatients = profiles
    .filter((p) => p.overallLevel === 'high_risk' || p.overallLevel === 'critical')
    .slice(0, 12)

  const predictedDeterioration = profiles.filter((p) => {
    let warn = 0
    for (const k of RISK_KEYS) {
      if (['warning', 'high_risk', 'critical'].includes(p.dimensions[k].level)) warn += 1
    }
    const rehab = snapshot.rehabilitationRows.find((r) => r.patientId === p.patientId)
    const healthBad = snapshot.healthRows.some(
      (r) => r.patientId === p.patientId && r.readingStatus === 'critical',
    )
    return warn >= 3 || (rehab?.progressTrend === 'declining' && warn >= 2) || healthBad
  })

  const missedCareLoops = []
  for (const p of snapshot.patients) {
    const items = missedLoopsForPatient(snapshot, p.id)
    if (items.length) missedCareLoops.push({ patientId: p.id, patientName: p.fullName, items })
  }

  const doctorReviewQueue = snapshot.doctorReviewRows
    .filter((r) => ['pending_review', 'urgent_cases', 'follow_up_needed'].includes(r.bucket))
    .slice(0, 20)

  const familySuggestions = profiles
    .filter((p) => p.dimensions.infection.level !== 'low' || p.dimensions.dehydration.level !== 'low')
    .slice(0, 8)
    .map((p) => ({
      patientId: p.patientId,
      patientName: p.patientName,
      suggestion: `Simulation draft: share stability updates on ${p.patientName}; emphasize hydration and infection precautions without diagnosing.`,
    }))

  const emergencySuggestions = []
  for (const r of snapshot.emergencyRows) {
    if (String(r.outcomeStatus).toLowerCase() === 'resolved') continue
    emergencySuggestions.push({
      patientId: r.patientId,
      patientName: r.patientName,
      detail: `${r.emergencyType || 'Emergency'} · ${r.severityLevel || '—'} — maintain monitoring per emergency loop.`,
    })
  }

  const emergencyEscalationSuggestions = emergencySuggestions.slice(0, 12)
  const loopsIncluded = BRAIN_DATA_SOURCES.map((s) => s.id)

  const telegramIntel = summarizeTelegramMockEntries(options.telegramEntries || [])

  const executiveSummary =
    buildWardExecutiveSummary({
      patientCount: snapshot.patients.length,
      highRiskCount: topHighRiskPatients.length,
      deteriorationCount: predictedDeterioration.length,
      missedResidents: missedCareLoops.length,
      doctorQueueCount: doctorReviewQueue.length,
      emergencyCount: emergencyEscalationSuggestions.length,
    }) + (telegramIntel.telegramExecutiveAppend || '')

  return {
    simulationMode: true,
    generatedAt: new Date(snapshot.nowMs).toISOString(),
    executiveSummary,
    topHighRiskPatients,
    predictedDeterioration,
    missedCareLoops,
    recommendedNursingActions: wardNursingActions(profiles, snapshot),
    doctorReviewQueue,
    familyUpdateSuggestions: familySuggestions,
    emergencyEscalationSuggestions,
    snapshotMeta: {
      patientCount: snapshot.patients.length,
      loopsIncluded,
      dataSources: BRAIN_DATA_SOURCES,
    },
    recentTelegramNursingNotes: telegramIntel.recentTelegramNursingNotes,
    telegramDetectedRisks: telegramIntel.telegramDetectedRisks,
    telegramSuggestedActions: telegramIntel.telegramSuggestedActions,
  }
}
