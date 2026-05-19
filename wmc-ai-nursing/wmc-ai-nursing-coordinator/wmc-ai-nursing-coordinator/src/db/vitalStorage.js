/**
 * localStorage persistence for patient vital sign records.
 * Key: wmc_vital_records_v1 — stores an array of VitalRecord objects, newest first.
 */

const VITALS_KEY = 'wmc_vital_records_v1'
const MAX_RECORDS = 1000

/** @returns {object[]} */
export function readAllVitals() {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(VITALS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** Save (insert or replace by id) a vital record. */
export function saveVitalRecord(record) {
  const all = readAllVitals()
  const idx = all.findIndex((r) => r.id === record.id)
  if (idx >= 0) {
    all[idx] = record
  } else {
    all.unshift(record)
  }
  const trimmed = all.slice(0, MAX_RECORDS)
  try {
    localStorage.setItem(VITALS_KEY, JSON.stringify(trimmed))
  } catch {
    // quota exceeded — no-op
  }
  return record
}

/** Get all vital records for a patient, newest first. */
export function getPatientVitals(patientId, limit = 20) {
  return readAllVitals()
    .filter((r) => r.patientId === patientId)
    .slice(0, limit)
}

/**
 * Get recent vital records that have high or critical risk levels.
 * Used by Dashboard to show live red alerts.
 */
export function getRecentVitalAlerts(hoursBack = 24) {
  const cutoff = Date.now() - hoursBack * 60 * 60 * 1000
  return readAllVitals()
    .filter((r) => {
      const t = r.recordedAt ? new Date(r.recordedAt).getTime() : 0
      return t >= cutoff && (r.overallRiskLevel === 'critical' || r.overallRiskLevel === 'high')
    })
    .sort((a, b) => new Date(b.recordedAt) - new Date(a.recordedAt))
}

/** Generate a unique record id. */
export function generateVitalId() {
  return `vit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}
