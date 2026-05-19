import {
  MED_LOOP_ROOM_MAP,
  MED_LOOP_SEED_BY_PATIENT,
} from '../data/medicationLoopSeed.js'

export const MEDICATION_LOOP_STORAGE_KEY = 'wmc_medication_loop_v1'

function todayLocalStr(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function slugMed(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function hashStr(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function loadRaw() {
  try {
    const raw = localStorage.getItem(MEDICATION_LOOP_STORAGE_KEY)
    if (!raw) {
      return {
        dosesById: {},
        scores: { onTime: 0, late: 0, missed: 0, refused: 0, escalated: 0 },
        baseline: null,
      }
    }
    const p = JSON.parse(raw)
    return {
      dosesById: p.dosesById && typeof p.dosesById === 'object' ? p.dosesById : {},
      scores: {
        onTime: p.scores?.onTime ?? 0,
        late: p.scores?.late ?? 0,
        missed: p.scores?.missed ?? 0,
        refused: p.scores?.refused ?? 0,
        escalated: p.scores?.escalated ?? 0,
      },
      baseline: p.baseline || null,
    }
  } catch {
    return {
      dosesById: {},
      scores: { onTime: 0, late: 0, missed: 0, refused: 0, escalated: 0 },
      baseline: null,
    }
  }
}

function saveRaw(data) {
  localStorage.setItem(MEDICATION_LOOP_STORAGE_KEY, JSON.stringify(data))
}

export function emitMedicationLoopUpdate() {
  window.dispatchEvent(new CustomEvent('wmc-medication-loop-updated'))
}

export function ensureMedLoopBaseline() {
  const raw = loadRaw()
  if (raw.baseline) return raw.baseline
  raw.baseline = { onTime: 118, late: 22, missed: 9, refused: 4, escalated: 6 }
  saveRaw(raw)
  return raw.baseline
}

export function readMedicationLoopRaw() {
  return loadRaw()
}

export function bumpMedLoopScore(field, delta = 1) {
  const raw = loadRaw()
  raw.scores[field] = (raw.scores[field] ?? 0) + delta
  saveRaw(raw)
  emitMedicationLoopUpdate()
}

function roomForPatient(id, idx) {
  return MED_LOOP_ROOM_MAP[id] || `TBD-${String(idx).padStart(3, '0')}`
}

export function buildMedLoopDoseId(patientId, medicationName) {
  return `${patientId}::${slugMed(medicationName)}`
}

export function seedMedLoopRows(patients) {
  const rows = []
  const today = todayLocalStr()

  if (!patients?.length) {
    rows.push({
      id: 'demo::acetaminophen',
      patientId: 'demo',
      patientName: 'Demo Resident',
      room: '100A',
      medicationName: 'Acetaminophen',
      dosage: '500 mg',
      frequency: 'PO q6h',
      timeDue: '14:00',
      nurseAssigned: 'Demo Nurse',
      adminStatus: 'pending',
      lastGivenAt: null,
      lastGivenDay: null,
      notes: [],
      doctorEscalated: false,
      delayCount: 0,
      simAbnormalPostDose: false,
    })
    return rows
  }

  patients.forEach((patient, index) => {
    const seeds = MED_LOOP_SEED_BY_PATIENT[patient.id] || [
      {
        medicationName: 'Multivitamin',
        dosage: '1 tab',
        frequency: 'PO daily',
        timeDue: '09:00',
        nurseInCharge: patient.assignedNurse || 'R.N. team',
      },
    ]
    seeds.forEach((s, j) => {
      const id = buildMedLoopDoseId(patient.id, s.medicationName)
      const h = hashStr(`${id}|${today}`)
      const adminStatusRoll = h % 11
      let adminStatus = 'pending'
      let lastGivenAt = null
      let lastGivenDay = null
      if (adminStatusRoll === 0) {
        adminStatus = 'given'
        lastGivenDay = today
        lastGivenAt = new Date(Date.now() - (4 + (h % 20)) * 60 * 60000).toISOString()
      } else if (adminStatusRoll === 1) {
        adminStatus = 'missed'
      } else if (adminStatusRoll === 2) {
        adminStatus = 'refused'
      } else if (adminStatusRoll === 3) {
        adminStatus = 'delayed'
      }

      rows.push({
        id,
        patientId: patient.id,
        patientName: patient.fullName || 'Unknown',
        room: roomForPatient(patient.id, index + 1),
        medicationName: s.medicationName,
        dosage: s.dosage,
        frequency: s.frequency,
        timeDue: s.timeDue,
        nurseAssigned: s.nurseInCharge || patient.assignedNurse || 'R.N. team',
        adminStatus,
        lastGivenAt,
        lastGivenDay,
        notes: [],
        doctorEscalated: false,
        delayCount: adminStatus === 'delayed' ? 1 + (h % 3) : 0,
        simAbnormalPostDose: (h % 17) === 0,
      })
    })
  })

  return rows
}

export function mergeMedicationLoopDoses(patients) {
  ensureMedLoopBaseline()
  const raw = loadRaw()
  const patches = raw.dosesById || {}
  const today = todayLocalStr()
  const seeded = seedMedLoopRows(patients)

  return seeded.map((base) => {
    const p = patches[base.id] || {}
    let merged = {
      ...base,
      ...p,
      notes: Array.isArray(p.notes) ? p.notes : base.notes || [],
    }

    if (merged.adminStatus === 'given' && merged.lastGivenDay && merged.lastGivenDay !== today) {
      merged = {
        ...merged,
        adminStatus: 'pending',
        lastGivenAt: null,
        lastGivenDay: null,
      }
    }

    return merged
  })
}

export function upsertMedLoopDose(id, patch) {
  const raw = loadRaw()
  const prev = raw.dosesById[id] || {}
  raw.dosesById[id] = { ...prev, ...patch }
  saveRaw(raw)
  emitMedicationLoopUpdate()
}

export function appendMedLoopNote(id, text) {
  const trimmed = String(text || '').trim()
  if (!trimmed) return
  const raw = loadRaw()
  const prev = raw.dosesById[id] || {}
  const notes = Array.isArray(prev.notes) ? [...prev.notes] : []
  notes.push({ at: new Date().toISOString(), text: trimmed })
  raw.dosesById[id] = { ...prev, notes: notes.slice(-16) }
  saveRaw(raw)
  emitMedicationLoopUpdate()
}
