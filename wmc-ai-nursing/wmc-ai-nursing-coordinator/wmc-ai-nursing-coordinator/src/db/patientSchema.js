/** Canonical patient record for local mock database (localStorage). */

export const PATIENT_STORAGE_KEY = 'wmc_patients_v1'

export const FALL_RISK_OPTIONS = ['Low', 'Moderate', 'High']
export const PRESSURE_RISK_OPTIONS = ['Low', 'Moderate', 'High']
export const GENDER_OPTIONS = ['Female', 'Male', 'Non-binary', 'Other', 'Prefer not to say']
export const REHABILITATION_STATUS_OPTIONS = [
  'Not in rehabilitation',
  'Active rehabilitation',
  'Long-term care',
  'Short-stay / transitional',
  'Hospice / comfort care',
]

/**
 * @typedef {Object} PatientRecord
 * @property {string} id
 * @property {string} fullName
 * @property {number} age
 * @property {string} gender
 * @property {string} diagnosis
 * @property {string} admissionDate
 * @property {string} mobilityStatus
 * @property {string} feedingStatus
 * @property {string} toiletAssistance
 * @property {string} fallRisk
 * @property {string} pressureSoreRisk
 * @property {string} mentalStatus
 * @property {string} currentMedications
 * @property {string} familyContact
 * @property {string} assignedNurse
 * @property {string} rehabilitationStatus
 * @property {string} createdAt
 * @property {string} updatedAt
 */

export function emptyPatientForm() {
  return {
    fullName: '',
    age: '',
    gender: 'Female',
    diagnosis: '',
    admissionDate: '',
    mobilityStatus: '',
    feedingStatus: '',
    toiletAssistance: '',
    fallRisk: 'Moderate',
    pressureSoreRisk: 'Moderate',
    mentalStatus: '',
    currentMedications: '',
    familyContact: '',
    assignedNurse: '',
    rehabilitationStatus: 'Long-term care',
  }
}

export function patientToForm(p) {
  if (!p) return emptyPatientForm()
  return {
    fullName: p.fullName ?? '',
    age: p.age != null ? String(p.age) : '',
    gender: p.gender ?? 'Female',
    diagnosis: p.diagnosis ?? '',
    admissionDate: p.admissionDate ?? '',
    mobilityStatus: p.mobilityStatus ?? '',
    feedingStatus: p.feedingStatus ?? '',
    toiletAssistance: p.toiletAssistance ?? '',
    fallRisk: p.fallRisk ?? 'Moderate',
    pressureSoreRisk: p.pressureSoreRisk ?? 'Moderate',
    mentalStatus: p.mentalStatus ?? '',
    currentMedications: p.currentMedications ?? '',
    familyContact: p.familyContact ?? '',
    assignedNurse: p.assignedNurse ?? '',
    rehabilitationStatus: p.rehabilitationStatus ?? 'Long-term care',
  }
}

export function formToPatientPayload(form) {
  const age = parseInt(String(form.age), 10)
  return {
    fullName: String(form.fullName || '').trim(),
    age: Number.isFinite(age) ? Math.min(130, Math.max(0, age)) : 0,
    gender: form.gender || '',
    diagnosis: String(form.diagnosis || '').trim(),
    admissionDate: form.admissionDate || '',
    mobilityStatus: String(form.mobilityStatus || '').trim(),
    feedingStatus: String(form.feedingStatus || '').trim(),
    toiletAssistance: String(form.toiletAssistance || '').trim(),
    fallRisk: form.fallRisk || 'Moderate',
    pressureSoreRisk: form.pressureSoreRisk || 'Moderate',
    mentalStatus: String(form.mentalStatus || '').trim(),
    currentMedications: String(form.currentMedications || '').trim(),
    familyContact: String(form.familyContact || '').trim(),
    assignedNurse: String(form.assignedNurse || '').trim(),
    rehabilitationStatus: form.rehabilitationStatus || 'Long-term care',
  }
}

function riskPoints(level) {
  const v = String(level || '').toLowerCase()
  if (v.includes('high')) return 35
  if (v.includes('moderate')) return 20
  return 8
}

/** Composite 0–100 score for dashboard analytics (mock heuristic). */
export function deriveRiskScore(p) {
  if (!p) return 0
  const base = 22
  const aiScore = Number(p.latestAiRiskScore)
  const baseRisk = base + riskPoints(p.fallRisk) + riskPoints(p.pressureSoreRisk)
  return Math.min(100, Math.round(Math.max(baseRisk, Number.isFinite(aiScore) ? aiScore : 0)))
}

export function initialsFromFullName(fullName) {
  const parts = String(fullName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
