import {
  HEALTH_CHECK_LOOP_TYPES,
  DEFAULT_FREQUENCY_BY_CHECK_ID,
  HEALTH_LOOP_FREQUENCY_MAP,
} from '../data/healthCheckLoopTypes.js'

export const HEALTH_CHECK_LOOPS_STORAGE_KEY = 'wmc_health_check_loops_v1'

const roomSeedMap = {
  p1: '302A',
  p2: '318C',
  p3: '214B',
  p4: '221D',
  p5: '305A',
}

function roomForPatient(id, fallbackIndex = 1) {
  if (!id) return `TBD-${fallbackIndex}`
  return roomSeedMap[id] || `TBD-${String(fallbackIndex).padStart(3, '0')}`
}

function hashStr(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function loadRaw() {
  try {
    const raw = localStorage.getItem(HEALTH_CHECK_LOOPS_STORAGE_KEY)
    if (!raw) return { instances: {} }
    const parsed = JSON.parse(raw)
    return {
      instances: parsed.instances && typeof parsed.instances === 'object' ? parsed.instances : {},
    }
  } catch {
    return { instances: {} }
  }
}

function saveRaw(data) {
  localStorage.setItem(HEALTH_CHECK_LOOPS_STORAGE_KEY, JSON.stringify(data))
}

function emitUpdate() {
  window.dispatchEvent(new CustomEvent('wmc-health-check-loops-updated'))
}

export function healthLoopInstanceKey(patientId, checkTypeId) {
  return `${patientId}::${checkTypeId}`
}

function demoValueForCheck(checkId, seed) {
  const presets = {
    bp: ['118/76', '148/92', '132/84', '112/70', '162/98'],
    pulse: ['72', '104', '68', '118', '76'],
    temp: ['36.7', '38.1', '37.0', '38.6', '36.5'],
    spo2: ['98%', '93%', '97%', '89%', '96%'],
    glucose: ['102', '58', '214', '126', '48'],
    weight: ['71.2 kg', '70.8 kg (−0.4)', '82.4 kg', '68.0 kg', '75.1 kg'],
    pain: ['2', '6', '1', '8', '0'],
    mental: ['AOx4, cooperative', 'AOx3, restless', 'AOx4', 'AOx2, agitated', 'AOx4, sleepy'],
    urine: ['42 mL/hr', '22 mL/hr', '55 mL/hr', '18 mL/hr', '38 mL/hr'],
    bowel: ['Soft BM ×1', 'None ×36h', 'Loose ×2', 'BM ×1 formed', 'None documented'],
    sleep: ['7 h', '4 h fragmented', '6.5 h', '3 h', '8 h'],
    appetite: ['75% meals', '40% lunch', '90% breakfast', '25%', '60%'],
  }
  const arr = presets[checkId] || ['—']
  return arr[seed % arr.length]
}

export function buildDefaultHealthLoopInstance(patient, checkType, patientIndex) {
  const freqId = DEFAULT_FREQUENCY_BY_CHECK_ID[checkType.id] || '4h'
  const minutes = HEALTH_LOOP_FREQUENCY_MAP[freqId]?.minutes ?? 240
  const h = hashStr(`${patient.id}|${checkType.id}`)
  const now = Date.now()
  const intervalMs = minutes * 60 * 1000
  const phase = ((h % 17) / 17 - 0.35) * intervalMs
  const nextDueAt = new Date(now + phase).toISOString()
  const lastRecordedAt = new Date(new Date(nextDueAt).getTime() - intervalMs * 0.85).toISOString()
  const nurse =
    patient.assignedNurse?.trim() ||
    ['R.N. Patel', 'LPN Santos', 'R.N. Kim', 'R.N. Nguyen'][patientIndex % 4]
  const lastValue = demoValueForCheck(checkType.id, h)

  return {
    patientId: patient.id,
    patientName: patient.fullName || 'Unknown',
    room: roomForPatient(patient.id, patientIndex + 1),
    checkTypeId: checkType.id,
    checkTypeLabel: checkType.label,
    normalRange: checkType.normalRange,
    frequencyId: freqId,
    frequencyMinutes: minutes,
    lastValue,
    lastRecordedAt,
    nextDueAt,
    nurseAssigned: nurse,
    doctorEscalated: false,
    notes: [],
    cycleCompletedAt: null,
  }
}

export function mergeHealthLoopInstances(patients) {
  const raw = loadRaw()
  const merged = []
  patients.forEach((patient, idx) => {
    HEALTH_CHECK_LOOP_TYPES.forEach((checkType) => {
      const key = healthLoopInstanceKey(patient.id, checkType.id)
      const defaults = buildDefaultHealthLoopInstance(patient, checkType, idx)
      const over = raw.instances[key] || {}
      const freqId = over.frequencyId || defaults.frequencyId
      const freqMinutes = HEALTH_LOOP_FREQUENCY_MAP[freqId]?.minutes ?? defaults.frequencyMinutes
      merged.push({
        ...defaults,
        ...over,
        patientId: patient.id,
        patientName: patient.fullName || defaults.patientName,
        room: over.room || defaults.room,
        checkTypeId: checkType.id,
        checkTypeLabel: checkType.label,
        normalRange: checkType.normalRange,
        frequencyId: freqId,
        frequencyMinutes: freqMinutes,
        nurseAssigned: over.nurseAssigned || defaults.nurseAssigned,
        notes: Array.isArray(over.notes) ? over.notes : [],
      })
    })
  })
  return merged
}

export function upsertHealthLoopInstance(key, patch) {
  const raw = loadRaw()
  const prev = raw.instances[key] || {}
  raw.instances[key] = { ...prev, ...patch }
  saveRaw(raw)
  emitUpdate()
}

export function appendHealthLoopNote(key, text) {
  const trimmed = String(text || '').trim()
  if (!trimmed) return
  const raw = loadRaw()
  const prev = raw.instances[key] || {}
  const notes = Array.isArray(prev.notes) ? [...prev.notes] : []
  notes.push({ at: new Date().toISOString(), text: trimmed })
  raw.instances[key] = { ...prev, notes: notes.slice(-14) }
  saveRaw(raw)
  emitUpdate()
}
