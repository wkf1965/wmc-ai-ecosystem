import {
  mergeNutritionLoopRows,
  readNutritionLoopRaw,
  ensureNutritionBaseline,
} from '../db/nutritionLoopStorage.js'

const DUE_BEFORE_MS = 32 * 60 * 1000
const DUE_AFTER_MS = 72 * 60 * 1000

/** @returns {'breakfast'|'lunch'|'dinner'|'snack'} */
export function currentMealTypeFromClock(nowMs = Date.now()) {
  const d = new Date(nowMs)
  const h = d.getHours() + d.getMinutes() / 60
  if (h >= 6 && h < 11) return 'breakfast'
  if (h >= 11 && h < 14.5) return 'lunch'
  if (h >= 14.5 && h < 17) return 'snack'
  if (h >= 17 && h < 21) return 'dinner'
  return 'snack'
}

export function formatNutritionTime(iso) {
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

/** Next scheduled meal anchor after `fromMs` (same calendar day; rolls to tomorrow if past last slot). */
export function nextMealDueIso(fromMs = Date.now()) {
  const d = new Date(fromMs)
  const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const slots = [7.5, 10, 12, 15.5, 17.75, 20].map((hr) => {
    const h = Math.floor(hr)
    const m = Math.round((hr - h) * 60)
    return dayStart + (h * 60 + m) * 60 * 1000
  })

  for (const t of slots) {
    if (t > fromMs + 5 * 60 * 1000) return new Date(t).toISOString()
  }
  const nextDay = dayStart + 24 * 60 * 60 * 1000 + 7.5 * 60 * 60 * 1000
  return new Date(nextDay).toISOString()
}

export function mealLabel(m) {
  return m.charAt(0).toUpperCase() + m.slice(1)
}

export function dietLabel(d) {
  if (d === 'tube_feeding') return 'Tube feeding'
  if (d === 'low_salt') return 'Low salt'
  return d.charAt(0).toUpperCase() + d.slice(1)
}

/**
 * @returns {'meal_due_now'|'poor_intake'|'swallowing_risk'|'completed_meals'|'weight_loss_concern'}
 */
export function nutritionBoardBucket(row, nowMs = Date.now()) {
  const due = new Date(row.nextMealDueAt).getTime()
  const inDueWindow = nowMs >= due - DUE_BEFORE_MS && nowMs <= due + DUE_AFTER_MS

  const completedForSlot =
    row.recordedForSlot === row.trackedMealType &&
    row.foodIntakePercent >= 73 &&
    !row.escalatedPoorIntake

  if (/weight\s*loss\s*concern|declining\s*sharply/i.test(row.weightTrend)) {
    return 'weight_loss_concern'
  }
  if (/mild\s*decline/i.test(row.weightTrend) && row.foodIntakePercent < 56) {
    return 'weight_loss_concern'
  }

  const poor =
    row.foodIntakePercent < 52 ||
    (row.refusedToday || 0) >= 2 ||
    row.appetiteLevel === 'Poor'

  if (poor) return 'poor_intake'

  const swallowWatch =
    row.swallowingRiskTier === 'High' ||
    row.dietType === 'tube_feeding' ||
    (row.swallowingRiskTier === 'Moderate' && /full\s*assist/i.test(row.feedingAssistanceNeeded || ''))

  if (swallowWatch) return 'swallowing_risk'

  if (completedForSlot) return 'completed_meals'

  if (inDueWindow || nowMs <= due + DUE_AFTER_MS) return 'meal_due_now'

  if (row.foodIntakePercent >= 72 && !row.escalatedPoorIntake) return 'completed_meals'

  return 'meal_due_now'
}

export function listNutritionLoopRows(patients, nowMs = Date.now()) {
  const merged = mergeNutritionLoopRows(patients, nowMs)
  const trackedMealType = currentMealTypeFromClock(nowMs)
  return merged.map((row) => {
    const trackedMealTypeResolved = trackedMealType
    const bucket = nutritionBoardBucket({ ...row, trackedMealType: trackedMealTypeResolved }, nowMs)
    return {
      ...row,
      trackedMealType: trackedMealTypeResolved,
      bucket,
    }
  })
}

function poorAppetiteFromNotes(notes, patientId) {
  return notes.some((n) => {
    if (n.patientId !== patientId) return false
    const a = String(n.appetite || '')
    const m = a.match(/(\d+)\s*%/)
    if (m && Number(m[1]) < 45) return true
    return /\b(minimal|poor|skipped|25%|30%|35%|40%)\b/i.test(a)
  })
}

/**
 * @param {Record<string, { intakePercent?: number; bucket?: string }>} hydrationByPatientId
 */
export function buildNutritionLoopAiAlerts(rows, nursingNotes = [], hydrationByPatientId = {}) {
  const alerts = []
  const seen = new Set()
  function add(id, severity, category, title, detail) {
    if (seen.has(id)) return
    seen.add(id)
    alerts.push({ id, severity, category, title, detail })
  }

  for (const row of rows) {
    const tag = `${row.patientName} · Rm ${row.room}`

    if (row.appetiteLevel === 'Poor' || poorAppetiteFromNotes(nursingNotes, row.patientId)) {
      add(`app-${row.patientId}`, 'medium', 'Poor appetite', `Monitor preferences & supplements (sim)`, tag)
    }

    if ((row.refusedToday || 0) >= 2) {
      add(`ref-${row.patientId}`, 'high', 'Repeated meal refusal', `${row.refusedToday} meal-related refusals today`, tag)
    } else if ((row.refusedToday || 0) === 1) {
      add(`ref1-${row.patientId}`, 'medium', 'Repeated meal refusal', `1 refusal logged — watch next tray`, tag)
    }

    if (
      row.swallowingRiskTier === 'High' ||
      row.dietType === 'tube_feeding' ||
      /aspiration|npo|puree/i.test(row.swallowingRisk || '')
    ) {
      add(`sw-${row.patientId}`, 'high', 'Swallowing risk', `Therapy/diet alignment check (demo)`, tag)
    }

    if (/weight\s*loss\s*concern|mild\s*decline/i.test(row.weightTrend)) {
      add(`wt-${row.patientId}`, row.weightTrend.includes('concern') ? 'critical' : 'medium', 'Weight loss risk', `${row.weightTrend} — trend per simulation`, tag)
    }

    const hyd = hydrationByPatientId[row.patientId]
    if (hyd && hyd.bucket === 'low_intake' && row.foodIntakePercent < 58) {
      add(`dehyd-${row.patientId}`, 'high', 'Dehydration + poor intake', `Low fluids plus low meal intake`, tag)
    }

    if (
      row.escalatedPoorIntake ||
      (row.dietType === 'tube_feeding' && row.foodIntakePercent < 42) ||
      (/concern/i.test(row.weightTrend) && row.foodIntakePercent < 50)
    ) {
      add(`doc-${row.patientId}`, 'high', 'Doctor / dietitian review needed', `Escalated nutrition risk (sim)`, tag)
    }
  }

  return alerts
}

export function nutritionScoreTotalsDisplay() {
  const raw = readNutritionLoopRaw()
  ensureNutritionBaseline()
  const b = raw.baseline || {
    goodIntake: 0,
    moderateIntake: 0,
    poorIntake: 0,
    refused: 0,
    highRisk: 0,
  }
  const s = raw.scores || {}
  return {
    goodIntake: b.goodIntake + (s.goodIntake ?? 0),
    moderateIntake: b.moderateIntake + (s.moderateIntake ?? 0),
    poorIntake: b.poorIntake + (s.poorIntake ?? 0),
    refused: b.refused + (s.refused ?? 0),
    highRisk: b.highRisk + (s.highRisk ?? 0),
  }
}

export function nutritionLoopAiSummary(rows, nursingNotes = []) {
  const poorIntakeIds = rows.filter(
    (r) => r.bucket === 'poor_intake' || r.foodIntakePercent < 52 || r.appetiteLevel === 'Poor',
  )
  const swallowCases = rows.filter(
    (r) =>
      r.bucket === 'swallowing_risk' ||
      r.swallowingRiskTier === 'High' ||
      r.dietType === 'tube_feeding',
  )
  const weightWarn = rows.filter((r) => /concern|decline/i.test(r.weightTrend))

  const checklist = [
    'Offer calorie-dense snacks between meals; document % eaten every tray.',
    'Verify diet texture matches speech recommendation; chin tuck as ordered.',
    'Weigh per facility policy; notify provider for unintended loss ≥ 5 lb/month (sim threshold).',
    'Pair fluids with meals for residents with low intake + low hydration loop scores.',
  ].join(' ')

  const namesPoor = poorIntakeIds.slice(0, 4).map((r) => r.patientName)
  const weighNames = weightWarn.slice(0, 3).map((r) => r.patientName)

  let familySuggestion =
    namesPoor.length > 0
      ? `Families for ${namesPoor.join(', ')}: explain appetite changes are common; describe fortified foods, preferred temperatures, and swallow precautions without diagnosing (simulation wording).`
      : 'Nutrition snapshot stable for proactive texts — send routine meal highlights.'

  if (weighNames.length) {
    familySuggestion += ` Mention supervised weights / dietitian follow-up for: ${weighNames.join(', ')}.`
  }

  return {
    poorIntakeCount: poorIntakeIds.length,
    swallowRiskCount: swallowCases.length,
    weightLossWarningCount: weightWarn.length,
    nurseActionChecklist: checklist,
    familyUpdateSuggestion: familySuggestion,
  }
}
