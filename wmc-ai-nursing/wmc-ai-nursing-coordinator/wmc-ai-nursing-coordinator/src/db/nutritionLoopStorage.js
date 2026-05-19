import { MED_LOOP_ROOM_MAP } from '../data/medicationLoopSeed.js'

export const NUTRITION_LOOP_STORAGE_KEY = 'wmc_nutrition_loop_v1'

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

/** @typedef {'breakfast'|'lunch'|'dinner'|'snack'} MealType */
/** @typedef {'normal'|'soft'|'diabetic'|'low_salt'|'tube_feeding'} DietType */

function loadRaw() {
  try {
    const raw = localStorage.getItem(NUTRITION_LOOP_STORAGE_KEY)
    if (!raw) {
      return {
        instances: {},
        scores: { goodIntake: 0, moderateIntake: 0, poorIntake: 0, refused: 0, highRisk: 0 },
        baseline: null,
      }
    }
    const p = JSON.parse(raw)
    return {
      instances: p.instances && typeof p.instances === 'object' ? p.instances : {},
      scores: {
        goodIntake: p.scores?.goodIntake ?? 0,
        moderateIntake: p.scores?.moderateIntake ?? 0,
        poorIntake: p.scores?.poorIntake ?? 0,
        refused: p.scores?.refused ?? 0,
        highRisk: p.scores?.highRisk ?? 0,
      },
      baseline: p.baseline || null,
    }
  } catch {
    return {
      instances: {},
      scores: { goodIntake: 0, moderateIntake: 0, poorIntake: 0, refused: 0, highRisk: 0 },
      baseline: null,
    }
  }
}

function saveRaw(data) {
  localStorage.setItem(NUTRITION_LOOP_STORAGE_KEY, JSON.stringify(data))
}

export function emitNutritionLoopUpdate() {
  window.dispatchEvent(new CustomEvent('wmc-nutrition-loop-updated'))
}

export function ensureNutritionBaseline() {
  const raw = loadRaw()
  if (raw.baseline) return raw.baseline
  raw.baseline = { goodIntake: 42, moderateIntake: 24, poorIntake: 11, refused: 7, highRisk: 5 }
  saveRaw(raw)
  return raw.baseline
}

export function readNutritionLoopRaw() {
  return loadRaw()
}

export function bumpNutritionScore(field, delta = 1) {
  const raw = loadRaw()
  raw.scores[field] = (raw.scores[field] ?? 0) + delta
  saveRaw(raw)
  emitNutritionLoopUpdate()
}

function roomForPatient(id, idx) {
  return MED_LOOP_ROOM_MAP[id] || `TBD-${String(idx).padStart(3, '0')}`
}

const DIETS = /** @type {const} */ (['normal', 'soft', 'diabetic', 'low_salt', 'tube_feeding'])

function dietFromPatient(feedingStatus, h) {
  const fs = String(feedingStatus || '').toLowerCase()
  if (/tube|peg|enteral|feeding tube/.test(fs)) return 'tube_feeding'
  if (/diabet/.test(fs)) return 'diabetic'
  if (/salt|sodium|cardiac|heart/i.test(fs)) return 'low_salt'
  if (/soft|puree|dysphag|mechanical/.test(fs)) return 'soft'
  return DIETS[h % DIETS.length]
}

function swallowingTier(feedingStatus, h) {
  const fs = String(feedingStatus || '').toLowerCase()
  if (/aspiration|npo|pureed|honey|thick/i.test(fs)) return 'High'
  if (/dysphag|precaution|soft|speech/i.test(fs)) return 'Moderate'
  return h % 10 >= 7 ? 'Moderate' : h % 10 >= 4 ? 'Moderate' : 'Low'
}

function appetiteFromHash(h) {
  return /** @type {const} */ (['Poor', 'Fair', 'Good'])[h % 3]
}

function weightTrendFromHash(h) {
  if (h % 17 === 0) return 'Weight loss concern'
  if (h % 11 === 0) return 'Mild decline'
  return 'Stable'
}

function feedingAssistFromHash(h) {
  return ['Independent', 'Setup only', 'Partial assist', 'Full assist'][h % 4]
}

export function mergeNutritionLoopRows(patients, nowMs = Date.now()) {
  ensureNutritionBaseline()
  const raw = loadRaw()
  const today = todayLocalStr(new Date(nowMs))

  if (!patients?.length) {
    const id = 'demo'
    const over = raw.instances[id] || {}
    return [
      {
        patientId: id,
        patientName: 'Demo Resident',
        room: '100A',
        mealType: /** @type {MealType} */ (over.mealType || 'lunch'),
        foodIntakePercent: typeof over.foodIntakePercent === 'number' ? over.foodIntakePercent : 52,
        fluidIntakeMl: typeof over.fluidIntakeMl === 'number' ? over.fluidIntakeMl : 180,
        swallowingRisk:
          over.swallowingRisk ?? 'Moderate — Speech evaluated; chin tuck with thin liquids avoided.',
        swallowingRiskTier: /** @type {'Low'|'Moderate'|'High'} */ (over.swallowingRiskTier || 'Moderate'),
        feedingAssistanceNeeded: over.feedingAssistanceNeeded ?? 'Partial assist',
        appetiteLevel: /** @type {'Poor'|'Fair'|'Good'} */ (over.appetiteLevel || 'Fair'),
        weightTrend: over.weightTrend ?? 'Stable',
        nurseAssigned: over.nurseAssigned ?? 'Demo Nurse',
        dietType: /** @type {DietType} */ (over.dietType || 'soft'),
        nextMealDueAt:
          over.nextMealDueAt ?? new Date(nowMs + 40 * 60000).toISOString(),
        lastMealRecordedAt: over.lastMealRecordedAt ?? new Date(nowMs - 70 * 60000).toISOString(),
        mealTrackingDay: over.mealTrackingDay ?? today,
        refusedToday: over.refusedToday ?? 0,
        refusedDay: over.refusedDay ?? today,
        notes: Array.isArray(over.notes) ? over.notes : [],
        escalatedPoorIntake: Boolean(over.escalatedPoorIntake),
        recordedForSlot: over.recordedForSlot ?? null,
        lastScoreSlotDay: over.lastScoreSlotDay ?? null,
      },
    ]
  }

  return patients.map((patient, idx) => {
    const id = patient.id
    const h = hashStr(`${id}|nut`)
    const over = raw.instances[id] || {}
    const nurse =
      over.nurseAssigned?.trim() ||
      patient.assignedNurse?.trim() ||
      ['R.N. Patel', 'LPN Santos', 'R.N. Kim', 'R.N. Nguyen'][idx % 4]

    const dietType = /** @type {DietType} */ (
      over.dietType || dietFromPatient(patient.feedingStatus, h)
    )
    const swallowTier =
      over.swallowingRiskTier || swallowingTier(patient.feedingStatus, h)
    const swallowingRisk =
      over.swallowingRisk ||
      `${swallowTier} — ${patient.feedingStatus?.slice(0, 72) || 'General diet; monitor intake.'}`

    let mealTrackingDay = over.mealTrackingDay || today
    let refusedToday = over.refusedToday ?? 0
    let refusedDay = over.refusedDay ?? today
    if (refusedDay !== today) {
      refusedToday = 0
      refusedDay = today
    }
    if (mealTrackingDay !== today) {
      mealTrackingDay = today
    }

    let foodIntakePercent =
      typeof over.foodIntakePercent === 'number'
        ? over.foodIntakePercent
        : Math.min(95, 38 + (h % 48))

    let fluidIntakeMl =
      typeof over.fluidIntakeMl === 'number'
        ? over.fluidIntakeMl
        : Math.round(120 + (h % 220))

    const appetiteLevel =
      /** @type {'Poor'|'Fair'|'Good'} */ (
        over.appetiteLevel || appetiteFromHash(h)
      )
    let weightTrend = over.weightTrend || weightTrendFromHash(h)

    return {
      patientId: id,
      patientName: patient.fullName || 'Unknown',
      room: over.room || roomForPatient(id, idx + 1),
      mealType: /** @type {MealType} */ (over.mealType || 'lunch'),
      foodIntakePercent,
      fluidIntakeMl,
      swallowingRisk,
      swallowingRiskTier: /** @type {'Low'|'Moderate'|'High'} */ (over.swallowingRiskTier || swallowTier),
      feedingAssistanceNeeded: over.feedingAssistanceNeeded || feedingAssistFromHash(h),
      appetiteLevel,
      weightTrend,
      nurseAssigned: nurse,
      dietType,
      nextMealDueAt:
        over.nextMealDueAt ||
        new Date(nowMs + ((h % 40) - 5) * 60000).toISOString(),
      lastMealRecordedAt:
        over.lastMealRecordedAt ||
        new Date(nowMs - ((h % 90) + 30) * 60000).toISOString(),
      mealTrackingDay,
      refusedToday,
      refusedDay,
      notes: Array.isArray(over.notes) ? over.notes : [],
      escalatedPoorIntake: Boolean(over.escalatedPoorIntake),
      recordedForSlot: over.recordedForSlot ?? null,
      lastScoreSlotDay: over.lastScoreSlotDay ?? null,
    }
  })
}

export function upsertNutritionPatient(patientId, patch) {
  const raw = loadRaw()
  const prev = raw.instances[patientId] || {}
  raw.instances[patientId] = { ...prev, ...patch }
  saveRaw(raw)
  emitNutritionLoopUpdate()
}

export function appendNutritionNote(patientId, text) {
  const trimmed = String(text || '').trim()
  if (!trimmed) return
  const raw = loadRaw()
  const prev = raw.instances[patientId] || {}
  const notes = Array.isArray(prev.notes) ? [...prev.notes] : []
  notes.push({ at: new Date().toISOString(), text: trimmed })
  raw.instances[patientId] = { ...prev, notes: notes.slice(-14) }
  saveRaw(raw)
  emitNutritionLoopUpdate()
}
