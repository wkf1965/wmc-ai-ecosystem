/**
 * Simulation-only composite AI risk prediction from nursing notes + loop signals + vitals.
 * Demo — not a regulated clinical decision support device.
 */

import { aggregateNotesText, analyzeAllPatientsFromNotes } from './aiRiskDetection.js'
import { mergeHydrationLoopRows } from '../db/hydrationLoopStorage.js'
import { mergeNutritionLoopRows } from '../db/nutritionLoopStorage.js'
import { mergeSleepMonitoringInstances } from '../db/sleepMonitoringLoopStorage.js'
import { mergeFallPreventionInstances } from '../db/fallPreventionLoopStorage.js'
import { mergeWoundCareLoopRows } from '../db/woundLoopStorage.js'
import { mergeMentalHealthLoopRows } from '../db/mentalHealthLoopStorage.js'
import { mergeRehabilitationLoopRows } from '../db/rehabLoopStorage.js'
import { mergeMedicationLoopDoses } from '../db/medicationLoopStorage.js'
import { getPatientVitals } from '../db/vitalStorage.js'

export const PREDICTION_RISK_LABELS = [
  'Fall risk',
  'Pressure sore risk',
  'Dehydration',
  'Delirium',
  'Infection / sepsis',
  'Depression risk',
  'Malnutrition',
  'Functional decline',
  'Hospitalization risk',
  'Emergency deterioration',
]

const SIGNALS_ANALYZED = [
  'Nursing notes',
  'Vital signs',
  'Medication history',
  'Sleep data',
  'Hydration',
  'Nutrition',
  'Mobility',
  'Mental health',
  'Fall incidents',
  'Wound care',
  'Rehabilitation progress',
]

function hashStr(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function clamp(n, lo = 0, hi = 100) {
  return Math.min(hi, Math.max(lo, Math.round(n)))
}

function formatDayLocal(ms) {
  const d = new Date(ms)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function severityFromScore(score) {
  if (score >= 92) return 'emergency'
  if (score >= 75) return 'critical'
  if (score >= 55) return 'high'
  if (score >= 35) return 'moderate'
  return 'low'
}

/** Exclusive bucket for prediction board columns */
export function predictionBoardBucket(row) {
  const s = row.riskScore
  const t = row.trend
  const sev = row.severityLevel
  if (sev === 'emergency' || s >= 85) return 'immediate_action_needed'
  if (t === 'worsening' && s >= 40) return 'worsening_trends'
  if (s >= 56) return 'high_risk_patients'
  if (s < 40 && t !== 'worsening') return 'stable_patients'
  return 'escalation_recommendations'
}

function vitalBoostForPatient(patientId) {
  const vitals = getPatientVitals(patientId, 4)
  let bump = 0
  for (const v of vitals) {
    if (v.overallRiskLevel === 'critical') bump += 22
    else if (v.overallRiskLevel === 'high') bump += 12
  }
  return clamp(bump, 0, 38)
}

function fallTierBoost(level) {
  const s = String(level || '').toLowerCase()
  if (s.includes('very')) return 26
  if (s.includes('high')) return 16
  if (s.includes('moder')) return 8
  return 0
}

function dehydrationTierBoost(level) {
  const s = String(level || '').toLowerCase()
  if (s.includes('high')) return 22
  if (s.includes('moder')) return 12
  return 0
}

function tierRank(str) {
  const s = String(str || '').toLowerCase()
  if (s.includes('severe')) return 3
  if (s.includes('moder')) return 2
  if (s.includes('mild')) return 1
  return 0
}

function buildScoreHistory(pid, prevHist, currentScore, nowMs) {
  const today = formatDayLocal(nowMs)
  let rows = Array.isArray(prevHist) ? prevHist.filter((r) => r.day !== today) : []
  rows.push({ day: today, score: currentScore })
  rows.sort((a, b) => a.day.localeCompare(b.day))

  if (rows.length < 7) {
    const first = rows[0]
    const anchorMs = first ? new Date(`${first.day}T12:00:00`).getTime() : nowMs
    const need = 7 - rows.length
    for (let k = need; k >= 1; k--) {
      const d = formatDayLocal(anchorMs - k * 86400000)
      if (!rows.some((r) => r.day === d)) {
        const delta = (hashStr(`${pid}|${d}`) % 15) - 7
        const neighbor = rows.find((r) => r.day > d)?.score ?? currentScore
        rows.push({ day: d, score: clamp(neighbor + delta) })
      }
    }
    rows.sort((a, b) => a.day.localeCompare(b.day))
  }
  return rows.slice(-14)
}

function pickSuggestedAction(predictedRisk, severity) {
  const map = {
    'Fall risk':
      severity === 'emergency' || severity === 'critical'
        ? 'Immediate bedside safety sweep; notify provider; falls bundle and enhanced supervision until reassessed.'
        : 'Reinforce mobility plan, footwear, lighting, and timed toileting; update PT/OT per protocol.',
    'Pressure sore risk':
      severity === 'critical' || severity === 'emergency'
        ? 'Hold pressure on compromised sites; wound/skin RN and provider notification now.'
        : 'Verify turning schedule and surface; photograph and measure; optimize nutrition and moisture control.',
    Dehydration:
      severity === 'high' || severity === 'critical' || severity === 'emergency'
        ? 'Strict I&O; orthostatic checks; provider notification for sustained deficit or hemodynamic symptoms.'
        : 'Structured fluid offers q1–2h; review diuretics and swallow strategy with pharmacy/MD.',
    Delirium:
      'Orient ×3 each encounter; sleep hygiene; minimize anticholinergic burden; provider review for reversible causes.',
    'Infection / sepsis':
      severity === 'emergency' || severity === 'critical'
        ? 'Sepsis screen per policy; vitals q15–30m; provider / rapid response per facility protocol.'
        : 'Trend vitals and labs if ordered; infection precautions and wound surveillance.',
    'Depression risk':
      'Increase therapeutic engagement; SW/psych consult per policy; safety environment review.',
    Malnutrition:
      'RD notify; calorie counts or supplements; swallow reassessment if coughing or wet voice.',
    'Functional decline':
      'PT/OT same-day touchpoint; reassess devices and caregiver assists; MD review for new neurological deficit.',
    'Hospitalization risk':
      'Care conference; reconcile meds and goals of care; proactive outreach to MD with summarized risks.',
    'Emergency deterioration':
      'Activate emergency response per policy; continuous monitoring until evaluated.',
  }
  return map[predictedRisk] || 'Continue interdisciplinary monitoring and document response to interventions.'
}

function confidenceFromSignals(noteCount, hasVitals) {
  let c = 0.52 + Math.min(0.28, noteCount * 0.035)
  if (hasVitals) c += 0.06
  c += (hashStr(`${noteCount}|conf`) % 7) / 100
  return Math.min(0.93, Math.round(c * 100) / 100)
}

/**
 * @returns {Record<string, object>} keyed by patientId
 */
export function computeAiPredictionSnapshots(patients, notes, prevInstances, nowMs = Date.now()) {
  const roster = patients?.length ? patients : []

  const getPatientById = (id) => roster.find((p) => p.id === id) || null
  const analyses = analyzeAllPatientsFromNotes(roster, notes, getPatientById)
  const analysisById = Object.fromEntries(analyses.map((a) => [a.patientId, a]))

  const hydRows = mergeHydrationLoopRows(roster)
  const nutRows = mergeNutritionLoopRows(roster, nowMs)
  const sleepRows = mergeSleepMonitoringInstances(roster)
  const fallRows = mergeFallPreventionInstances(roster)
  const woundRows = mergeWoundCareLoopRows(roster, nowMs)
  const mentalRows = mergeMentalHealthLoopRows(roster, nowMs)
  const rehabRows = mergeRehabilitationLoopRows(roster, nowMs)
  const medRows = mergeMedicationLoopDoses(roster)

  const ix = (rows, pid) => rows.find((r) => r.patientId === pid) || {}

  const out = {}

  for (const p of roster) {
    const pid = p.id
    const prev = prevInstances[pid] || {}
    const a = analysisById[pid] || {
      patientId: pid,
      patientName: p.fullName || 'Unknown',
      noteCount: 0,
      categories: [],
      insufficientData: true,
    }

    const catMap = Object.fromEntries((a.categories || []).map((c) => [c.id, c]))
    const recentNotes = (notes || [])
      .filter((n) => n.patientId === pid)
      .sort((x, y) => {
        const da = x.date || ''
        const db = y.date || ''
        if (da !== db) return db.localeCompare(da)
        return (y.createdAt || '').localeCompare(x.createdAt || '')
      })
      .slice(0, 12)
    const noteText = aggregateNotesText(recentNotes)

    const hyd = ix(hydRows, pid)
    const nut = ix(nutRows, pid)
    const sleep = ix(sleepRows, pid)
    const fall = ix(fallRows, pid)
    const wound = ix(woundRows, pid)
    const mental = ix(mentalRows, pid)
    const rehab = ix(rehabRows, pid)
    const med = ix(medRows, pid)

    const roomNumber =
      p.room || hyd.room || nut.room || wound.room || rehab.room || mental.room || fall.roomNumber || '—'

    let fallScore = clamp((catMap.fall_risk?.score ?? 0) + fallTierBoost(fall.fallRiskLevel))
    if (fall.nightWanderingRisk) fallScore += 10
    if (fall.confusionWalkingAttempt) fallScore += 14
    if (fall.repeatedWanderingFlag) fallScore += 8
    if (fall.escalatedFallRisk) fallScore += 12

    let pressureScore = clamp((catMap.pressure_sore_risk?.score ?? 0))
    if (String(wound.healingTrend || '').toLowerCase() === 'worsening') pressureScore += 18
    if (/pressure|stage\s*[12]|sacrum|heel/i.test(`${wound.woundType || ''} ${wound.woundLocation || ''}`))
      pressureScore += 8

    let dehydrationScore = clamp((catMap.dehydration?.score ?? 0) + dehydrationTierBoost(hyd.dehydrationRiskLevel))
    const pctFluid =
      hyd.fluidTargetMl > 0 ? clamp((100 * (hyd.intakeSoFarMl ?? 0)) / hyd.fluidTargetMl, 0, 150) : 50
    if (pctFluid < 42) dehydrationScore += 16
    else if (pctFluid < 58) dehydrationScore += 8
    if ((hyd.refusedToday || 0) >= 2) dehydrationScore += 12

    let infectionScore = clamp(catMap.infection_risk?.score ?? 0)
    const dischargeLow = String(wound.discharge || '').toLowerCase()
    if (dischargeLow.includes('purulent')) infectionScore += 24
    if (String(wound.odor || '').toLowerCase().includes('foul')) infectionScore += 14
    if (wound.escalatedInfection) infectionScore += 18

    let malnutritionScore = clamp(catMap.poor_appetite?.score ?? 0)
    const intakePct = typeof nut.foodIntakePercent === 'number' ? nut.foodIntakePercent : 55
    if (intakePct < 35) malnutritionScore += 22
    else if (intakePct < 50) malnutritionScore += 12
    if (String(nut.appetiteLevel || '').toLowerCase() === 'poor') malnutritionScore += 14
    if (String(nut.swallowingRiskTier || '').toLowerCase().includes('high')) malnutritionScore += 10

    let functionalScore = clamp(catMap.sudden_weakness?.score ?? 0)
    if (String(rehab.progressTrend || '').toLowerCase() === 'declining') functionalScore += 20
    if (rehab.rehabPlateau) functionalScore += 10
    if ((rehab.missedSessionsWeek || 0) >= 2) functionalScore += 14
    const adl = typeof rehab.adlIndependence === 'number' ? rehab.adlIndependence : 60
    if (adl < 42) functionalScore += 16

    let deliriumScore = 0
    if (/confus|disorient|sundown|hallucinat|acute confus/i.test(noteText)) deliriumScore += 30
    deliriumScore += tierRank(mental.confusionLevel) * 14
    if (sleep.confusionAtNight) deliriumScore += 18
    if (sleep.agitationAtNight) deliriumScore += 10
    const sleepH = typeof sleep.totalSleepHours === 'number' ? sleep.totalSleepHours : 6
    if (sleepH < 3.5) deliriumScore += 22
    else if (sleepH < 5.5) deliriumScore += 12
    if (sleep.behaviorEscalated) deliriumScore += 12
    deliriumScore += Math.round((catMap.emotional_distress?.score ?? 0) * 0.22)
    deliriumScore = clamp(deliriumScore)

    let depressionScore = Math.round((catMap.emotional_distress?.score ?? 0) * 0.72)
    if (/hopeless|withdrawn|depressed|isolat|tearful/i.test(noteText)) depressionScore += 16
    if (String(mental.moodStatus || '').toLowerCase().includes('low')) depressionScore += 14
    if (String(mental.socialInteraction || '').toLowerCase().includes('withdraw')) depressionScore += 18
    if (tierRank(mental.anxietyLevel) >= 2) depressionScore += 8
    depressionScore = clamp(depressionScore)

    let medStress = 0
    if (String(med.adminStatus || '').toLowerCase() === 'pending') medStress += 8
    if (med.simAbnormalPostDose) medStress += 14
    infectionScore = clamp(infectionScore + Math.round(medStress * 0.35))
    dehydrationScore = clamp(dehydrationScore + Math.round(medStress * 0.45))

    const vitalB = vitalBoostForPatient(pid)

    const breakdown = {
      'Fall risk': clamp(fallScore),
      'Pressure sore risk': clamp(pressureScore),
      Dehydration: clamp(dehydrationScore),
      Delirium: clamp(deliriumScore),
      'Infection / sepsis': clamp(infectionScore),
      'Depression risk': clamp(depressionScore),
      Malnutrition: clamp(malnutritionScore),
      'Functional decline': clamp(functionalScore),
      'Hospitalization risk': 0,
      'Emergency deterioration': 0,
    }

    const vals = Object.entries(breakdown)
      .filter(([k]) => k !== 'Hospitalization risk' && k !== 'Emergency deterioration')
      .map(([, v]) => v)
    vals.sort((x, y) => y - x)
    const top = vals[0] ?? 0
    const second = vals[1] ?? 0
    const third = vals[2] ?? 0

    breakdown['Hospitalization risk'] = clamp(top * 0.42 + second * 0.28 + third * 0.18 + (a.anyEscalation ? 12 : 0))
    breakdown['Emergency deterioration'] = clamp(top + vitalB * 0.85)

    const clinicalLabels = PREDICTION_RISK_LABELS.filter(
      (x) => x !== 'Hospitalization risk' && x !== 'Emergency deterioration',
    )
    let predictedRisk = clinicalLabels[0]
    let clinicalMax = -1
    for (const label of clinicalLabels) {
      const v = breakdown[label] ?? 0
      if (v > clinicalMax) {
        clinicalMax = v
        predictedRisk = label
      }
    }
    const emerg = breakdown['Emergency deterioration'] ?? 0
    const hosp = breakdown['Hospitalization risk'] ?? 0
    if (emerg >= clinicalMax + 18) predictedRisk = 'Emergency deterioration'
    else if (hosp >= clinicalMax + 12 && hosp >= 62) predictedRisk = 'Hospitalization risk'

    const riskScore = clamp(Math.max(...Object.values(breakdown)))
    const severityLevel = severityFromScore(riskScore)

    const prevScore = typeof prev.lastCompositeScore === 'number' ? prev.lastCompositeScore : riskScore
    let trend = 'stable'
    if (riskScore > prevScore + 4) trend = 'worsening'
    else if (riskScore < prevScore - 4) trend = 'improving'

    const hasVitals = getPatientVitals(pid, 1).length > 0
    const aiConfidence = confidenceFromSignals(a.noteCount || recentNotes.length, hasVitals)
    const suggestedAction = pickSuggestedAction(predictedRisk, severityLevel)

    const historyScores = buildScoreHistory(pid, prev.historyScores, riskScore, nowMs)

    const boardBucket = predictionBoardBucket({
      riskScore,
      trend,
      severityLevel,
    })

    out[pid] = {
      patientId: pid,
      patientName: p.fullName || a.patientName || 'Unknown',
      roomNumber,
      predictedRisk,
      riskScore,
      severityLevel,
      trend,
      aiConfidence,
      suggestedAction,
      timeGenerated: new Date(nowMs).toISOString(),
      boardBucket,
      riskBreakdown: breakdown,
      signalsAnalyzed: [...SIGNALS_ANALYZED],
      nursingNotesReviewed: a.noteCount ?? recentNotes.length,
      compositeHint: `Dominant clinical signal: ${predictedRisk} (${clinicalMax}). Composite peak ${riskScore}.`,
      lastCompositeScore: riskScore,
      historyScores,
      reviewedAt: prev.reviewedAt ?? null,
      escalatedToDoctor: Boolean(prev.escalatedToDoctor),
      supervisorNotified: Boolean(prev.supervisorNotified),
    }
  }

  return out
}

export function listPredictionRows(instanceMap) {
  const rows = Object.values(instanceMap || {})
  rows.sort((a, b) => {
    if (b.riskScore !== a.riskScore) return b.riskScore - a.riskScore
    return a.patientName.localeCompare(b.patientName)
  })
  return rows.map((r) => ({ ...r, boardBucket: predictionBoardBucket(r) }))
}

export function buildPredictionAiAlerts(rows) {
  const alerts = []
  for (const row of rows) {
    const b = row.riskBreakdown || {}
    const pid = row.patientId
    if (row.severityLevel === 'emergency' || b['Emergency deterioration'] >= 88) {
      alerts.push({
        id: `${pid}-crit`,
        category: 'Critical deterioration',
        title: `Critical deterioration pattern — ${row.patientName}`,
        detail: `Rm ${row.roomNumber} · composite ${row.riskScore} · ${row.predictedRisk}`,
        severity: 'critical',
      })
    }
    if (b['Hospitalization risk'] >= 72 || (row.predictedRisk === 'Hospitalization risk' && row.riskScore >= 62)) {
      alerts.push({
        id: `${pid}-hosp`,
        category: 'High hospitalization risk',
        title: `Hospitalization risk elevated — ${row.patientName}`,
        detail: `Score ${b['Hospitalization risk'] ?? row.riskScore} · trend ${row.trend}`,
        severity: 'high',
      })
    }
    if (b['Fall risk'] >= 68 && (b.Delirium >= 45 || row.trend === 'worsening')) {
      alerts.push({
        id: `${pid}-fall24`,
        category: 'Fall likely within 24h',
        title: `Fall surveillance priority — ${row.patientName}`,
        detail: `Fall model ${b['Fall risk']} with cognition/sleep stressors.`,
        severity: 'high',
      })
    }
    if (b.Dehydration >= 70 || (row.predictedRisk === 'Dehydration' && row.riskScore >= 58)) {
      alerts.push({
        id: `${pid}-dehyd`,
        category: 'Severe dehydration risk',
        title: `Fluid deficit pattern — ${row.patientName}`,
        detail: `Hydration model ${b.Dehydration} · confirm intake and orthostasis.`,
        severity: row.severityLevel === 'critical' ? 'critical' : 'high',
      })
    }
    if (b.Delirium >= 62 || row.predictedRisk === 'Delirium') {
      alerts.push({
        id: `${pid}-delir`,
        category: 'Delirium warning',
        title: `Cognitive fluctuation risk — ${row.patientName}`,
        detail: `Delirium score ${b.Delirium} · review meds, infection, sleep.`,
        severity: b.Delirium >= 78 ? 'critical' : 'moderate',
      })
    }
    if (b['Infection / sepsis'] >= 68) {
      alerts.push({
        id: `${pid}-sepsis`,
        category: 'Sepsis warning',
        title: `Infection burden — ${row.patientName}`,
        detail: `Infection model ${b['Infection / sepsis']} · vitals and wound correlation.`,
        severity: b['Infection / sepsis'] >= 82 ? 'critical' : 'high',
      })
    }
  }
  const seen = new Set()
  return alerts.filter((a) => {
    if (seen.has(a.id)) return false
    seen.add(a.id)
    return true
  })
}

export function predictionMasterAiSummary(rows) {
  const top = [...rows].sort((a, b) => b.riskScore - a.riskScore).slice(0, 4)
  const worsening = rows.filter((r) => r.trend === 'worsening')
  const names = (arr) => arr.map((r) => `${r.patientName} (Rm ${r.roomNumber})`).join('; ')
  return [
    `Top high-risk watchlist: ${names(top) || '—'}.`,
    `Worsening trajectories (${worsening.length}): ${names(worsening) || 'none flagged on this pass.'}`,
    `Preventive themes: reinforce mobility bundles where fall/walking flags cluster; optimize fluids where hydration scores lag; pair sleep hygiene with delirium precautions.`,
    `Nursing checklist snapshot: vitals trend · intake/output · skin checks · infection cues · mood/safety · therapy adherence.`,
    `Provider review: prioritize patients with composite ≥70, infection/sepsis scores ≥65, or emergency severity band.`,
    `Supervisor escalation: route moderate-high hospitalization scores not yet MD-contacted; verify staffing for 1:1 fall watches where flagged.`,
  ].join(' ')
}

export function predictionAiSummaryBlocks(rows) {
  const top = [...rows].sort((a, b) => b.riskScore - a.riskScore).slice(0, 5)
  const worsening = rows.filter((r) => r.trend === 'worsening')
  return {
    topHighRisk: top.map((r) => `${r.patientName} — ${r.predictedRisk} (${r.riskScore})`).join('\n') || 'No patients on roster.',
    deteriorationTrends:
      worsening.map((r) => `${r.patientName}: ${r.trend} · ${r.predictedRisk}`).join('\n') ||
      'No worsening trends on this snapshot.',
    preventiveActions:
      'Mobility supervision where gait confusion clusters · Structured fluids · Sleep protection · Skin/wound surveillance · Med reconciliation after abnormal dose flags.',
    nursingChecklist:
      '□ Chart vitals and orthostasis\n□ Intake totals vs target\n□ Pain and cognition checks\n□ Turn/offload compliance\n□ Escalation pathway documented',
    doctorReview:
      'Patients with emergency/critical severity or infection scores ≥70 should have same-shift provider awareness.',
    supervisorEscalation:
      'Staff contingencies for likely fall clusters; verify ancillary coverage when multiple delirium warnings fire.',
  }
}

export function buildWardRiskTrendChart(rows) {
  const dayMap = {}
  for (const row of rows) {
    for (const pt of row.historyScores || []) {
      dayMap[pt.day] = dayMap[pt.day] || { sum: 0, n: 0 }
      dayMap[pt.day].sum += pt.score
      dayMap[pt.day].n += 1
    }
  }
  return Object.entries(dayMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, v]) => ({
      day: day.slice(5),
      avgScore: v.n ? Math.round(v.sum / v.n) : 0,
    }))
}

export function buildDailyPredictionChangeBars(rows, nowMs = Date.now()) {
  const days = []
  for (let i = 6; i >= 0; i--) {
    const dStr = formatDayLocal(nowMs - i * 86400000)
    let increased = 0
    let decreased = 0
    for (const row of rows) {
      const hist = [...(row.historyScores || [])].sort((a, b) => a.day.localeCompare(b.day))
      const idx = hist.findIndex((h) => h.day === dStr)
      if (idx <= 0) continue
      const delta = hist[idx].score - hist[idx - 1].score
      if (delta >= 4) increased += 1
      else if (delta <= -4) decreased += 1
    }
    days.push({
      label: dStr.slice(5),
      increased,
      decreased,
      net: increased - decreased,
    })
  }
  return days
}

export function buildRiskHeatmapMatrix(rows, maxPatients = 14) {
  const sorted = [...rows].sort((a, b) => b.riskScore - a.riskScore).slice(0, maxPatients)
  return sorted.map((row) => ({
    patientId: row.patientId,
    label: `${row.patientName.slice(0, 18)}${row.patientName.length > 18 ? '…' : ''}`,
    cells: PREDICTION_RISK_LABELS.map((label) => ({
      label,
      value: row.riskBreakdown?.[label] ?? 0,
    })),
  }))
}

export function exportPredictionReportCsv(rows, generatedAtIso) {
  function esc(s) {
    const t = String(s ?? '').replace(/"/g, '""')
    return `"${t}"`
  }

  const scoreCols = PREDICTION_RISK_LABELS.map((x) => esc(x))
  const header = [
    'patientName',
    'roomNumber',
    'predictedRisk',
    'riskScore',
    'severityLevel',
    'trend',
    'aiConfidence',
    'suggestedAction',
    'timeGenerated',
    'boardBucket',
    ...scoreCols,
  ].join(',')

  const lines = rows.map((row) => {
    const b = row.riskBreakdown || {}
    const parts = [
      esc(row.patientName),
      esc(row.roomNumber),
      esc(row.predictedRisk),
      row.riskScore,
      esc(row.severityLevel),
      esc(row.trend),
      row.aiConfidence,
      esc(row.suggestedAction),
      esc(row.timeGenerated),
      esc(row.boardBucket),
      ...PREDICTION_RISK_LABELS.map((lab) => b[lab] ?? 0),
    ]
    return parts.join(',')
  })

  return [`AI Risk Prediction Loop — simulation export · ${generatedAtIso}`, header, ...lines].join('\n')
}
