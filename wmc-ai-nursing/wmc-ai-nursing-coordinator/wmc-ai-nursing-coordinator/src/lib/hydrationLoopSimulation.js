import {
  mergeHydrationLoopRows,
  readHydrationLoopRaw,
  ensureHydrationBaseline,
} from '../db/hydrationLoopStorage.js'

const COMPLETED_FRAC = 0.92
const LOW_INTAKE_FRAC = 0.58
const DUE_BEFORE_MS = 25 * 60 * 1000
const DUE_AFTER_MS = 15 * 60 * 1000

export function effectiveNextHydrationDueMs(row, nowMs = Date.now()) {
  const base = new Date(row.nextHydrationDueAt).getTime()
  const snooze = row.snoozeUntil ? new Date(row.snoozeUntil).getTime() : null
  if (snooze != null && snooze > nowMs) return Math.max(base, snooze)
  return base
}

/** Expected cumulative ml by clock for daytime fluid distribution (demo curve). */
export function expectedFluidMlByTime(targetMl, nowMs = Date.now()) {
  const d = new Date(nowMs)
  const hour = d.getHours() + d.getMinutes() / 60
  const wake = 6
  const sleep = 22
  const span = sleep - wake
  let frac = (hour - wake) / span
  if (hour < wake) frac = 0.06
  if (hour > sleep) frac = 1
  return targetMl * Math.max(0.06, Math.min(1, frac))
}

/**
 * @returns {'due_now'|'upcoming'|'low_intake'|'completed_target'}
 */
export function hydrationBoardBucket(row, nowMs = Date.now()) {
  const target = row.fluidTargetMl
  const intake = row.intakeSoFarMl

  if (intake >= target * COMPLETED_FRAC) return 'completed_target'

  const expected = expectedFluidMlByTime(target, nowMs)
  if (expected >= 400 && intake < expected * LOW_INTAKE_FRAC) return 'low_intake'

  const next = effectiveNextHydrationDueMs(row, nowMs)
  if (nowMs >= next - DUE_BEFORE_MS && nowMs <= next + DUE_AFTER_MS) return 'due_now'

  return 'upcoming'
}

export function formatHydrationTime(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function listHydrationLoopRows(patients) {
  const merged = mergeHydrationLoopRows(patients)
  const now = Date.now()
  return merged.map((row) => {
    const bucket = hydrationBoardBucket(row, now)
    const expected = expectedFluidMlByTime(row.fluidTargetMl, now)
    const pct = row.fluidTargetMl > 0 ? Math.round((100 * row.intakeSoFarMl) / row.fluidTargetMl) : 0
    return {
      ...row,
      bucket,
      expectedSoFarMl: Math.round(expected),
      intakePercent: pct,
      effectiveNextDueMs: effectiveNextHydrationDueMs(row, now),
    }
  })
}

function poorAppetiteSignal(notes, patientId) {
  return notes.some((n) => {
    if (n.patientId !== patientId) return false
    const a = String(n.appetite || '')
    const m = a.match(/(\d+)\s*%/)
    if (m && Number(m[1]) < 45) return true
    return /\b(minimal|poor|skipped|25%|30%|35%|40%)\b/i.test(a)
  })
}

export function buildHydrationLoopAiAlerts(rows, nursingNotes = []) {
  const alerts = []
  const seen = new Set()
  function add(id, severity, category, title, detail) {
    if (seen.has(id)) return
    seen.add(id)
    alerts.push({ id, severity, category, title, detail })
  }

  for (const row of rows) {
    const tag = `${row.patientName} · Rm ${row.room}`

    if (row.bucket === 'low_intake') {
      add(`low-${row.patientId}`, 'high', 'Low fluid intake', `Behind schedule (${row.intakeSoFarMl}/${row.fluidTargetMl} mL)`, tag)
    }

    if ((row.refusedToday || 0) >= 1) {
      add(`ref-${row.patientId}`, 'medium', 'Patient refused drinks', `${row.refusedToday} refusal(s) logged today`, tag)
    }

    if (row.simDryMouthNote || row.notes.some((n) => /dry\s*mouth|xerostom/i.test(n.text))) {
      add(`dry-${row.patientId}`, 'medium', 'Dry mouth / dizziness note', `Oral hydration cues needed`, tag)
    }

    if (row.simDizzinessNote || row.notes.some((n) => /dizz|lightheaded/i.test(n.text))) {
      add(`dz-${row.patientId}`, 'high', 'Dry mouth / dizziness note', `Consider VS check & provider ping`, tag)
    }

    if (poorAppetiteSignal(nursingNotes, row.patientId) && row.bucket === 'low_intake') {
      add(`app-${row.patientId}`, 'high', 'Poor appetite + low hydration', `Clustered nutrition/fluid risk`, tag)
    }

    if (row.dehydrationRiskLevel === 'High' && row.intakeSoFarMl < row.fluidTargetMl * 0.65) {
      add(`dehyd-${row.patientId}`, 'critical', 'Dehydration risk', `High-risk patient below fluid curve`, tag)
    }

    if (row.escalated || (row.dehydrationRiskLevel === 'High' && row.bucket === 'low_intake')) {
      add(`doc-${row.patientId}`, row.escalated ? 'high' : 'medium', 'Doctor review needed', `Escalation / fluid deficit`, tag)
    }
  }

  return alerts
}

export function hydrationScoreTotalsDisplay() {
  const raw = readHydrationLoopRaw()
  ensureHydrationBaseline()
  const b = raw.baseline || { onTarget: 0, belowTarget: 0, highRisk: 0, refused: 0, escalated: 0 }
  const s = raw.scores || {}
  return {
    onTarget: b.onTarget + (s.onTarget ?? 0),
    belowTarget: b.belowTarget + (s.belowTarget ?? 0),
    highRisk: b.highRisk + (s.highRisk ?? 0),
    refused: b.refused + (s.refused ?? 0),
    escalated: b.escalated + (s.escalated ?? 0),
  }
}

export function hydrationLoopAiSummary(rows, nursingNotes = []) {
  const lowIntakePatients = new Set()
  rows.forEach((r) => {
    if (r.bucket === 'low_intake') lowIntakePatients.add(r.patientId)
  })

  const highDehyd = rows.filter((r) => r.dehydrationRiskLevel === 'High' && r.bucket !== 'completed_target').length

  const checklist = [
    'Offer preferred fluids qround + document mL in loop.',
    'Review thickened liquid orders for swallowing-risk residents.',
    'Re-assess I&O if vomiting, fever, or new diuretics.',
    'Notify provider if orthostatic symptoms or ↓ UOP reported.',
  ].join(' ')

  const underFamilies = rows
    .filter((r) => r.bucket === 'low_intake' || r.dehydrationRiskLevel === 'High')
    .slice(0, 4)
    .map((r) => r.patientName)

  const appetiteBridge = rows.filter((r) => poorAppetiteSignal(nursingNotes, r.patientId) && r.bucket === 'low_intake').length

  let familySuggestion =
    underFamilies.length > 0
      ? `Send proactive updates for: ${underFamilies.join(', ')} — emphasize fluid goals, preferred cups/straws, and any swallow precautions (simulation wording).`
      : 'No mandatory family pings from current fluid snapshot — continue routine updates.'

  if (appetiteBridge > 0) {
    familySuggestion += ` ${appetiteBridge} patient(s) tie low fluids to poor appetite in notes — suggest meal-time pairing strategy.`
  }

  return {
    patientsLowIntake: lowIntakePatients.size,
    highDehydrationRiskCount: highDehyd,
    nurseActionChecklist: checklist,
    familyUpdateSuggestion: familySuggestion,
  }
}

export function nextHydrationDueAfter(intervalMinutes, fromMs = Date.now()) {
  return new Date(fromMs + intervalMinutes * 60 * 1000).toISOString()
}
