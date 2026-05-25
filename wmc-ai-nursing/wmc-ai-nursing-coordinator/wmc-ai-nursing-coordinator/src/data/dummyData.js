/** Reference data for local dashboards — not real PHI. Patient roster lives in localStorage (see `src/db/`). */

export const facilityName = 'Willowbrook Medical Centre'

export const rehabPrograms = []

export const aiAlerts = []

export const censusTrend = [
  { month: 'Jan', occupancy: 92, admits: 8, discharges: 6 },
  { month: 'Feb', occupancy: 94, admits: 10, discharges: 7 },
  { month: 'Mar', occupancy: 91, admits: 7, discharges: 9 },
  { month: 'Apr', occupancy: 96, admits: 11, discharges: 5 },
  { month: 'May', occupancy: 95, admits: 6, discharges: 4 },
]

export const alertSeverityCounts = [
  { name: 'Critical', value: 2, fill: '#dc2626' },
  { name: 'High', value: 5, fill: '#ea580c' },
  { name: 'Medium', value: 12, fill: '#ca8a04' },
  { name: 'Low', value: 18, fill: '#16a34a' },
]

export const shiftCoverage = [
  { shift: 'Day', staffed: 18, required: 16 },
  { shift: 'Evening', staffed: 14, required: 14 },
  { shift: 'Night', staffed: 11, required: 12 },
]

export const qualityMetrics = [
  { name: 'Falls (30d)', value: 2, benchmark: 3 },
  { name: 'HAPI (30d)', value: 0, benchmark: 1 },
  { name: 'Med errors', value: 0, benchmark: 0 },
  { name: 'Readmissions', value: 1, benchmark: 2 },
]

export function generateFamilyUpdate(patient) {
  if (!patient) return ''
  const name = patient.fullName || 'Your loved one'
  const dx = (patient.diagnosis || '').trim()
  const mobility = patient.mobilityStatus || 'as documented in the care plan'
  const feeding = patient.feedingStatus || 'per dietary orders'
  const rehab = patient.rehabilitationStatus || 'as documented'
  const mental = patient.mentalStatus || 'stable per team assessment'
  const meds = (patient.currentMedications || '').trim()

  return `Dear family,

Here is a friendly update on ${name} as of ${new Date().toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.

${name} continues on the care plan${dx ? ` for ${dx.toLowerCase()}` : ''}. Mobility: ${mobility}. Feeding: ${feeding}. Rehabilitation status: ${rehab}. Mental status: ${mental}.

${meds ? `Medications and treatments remain as follows (review with nursing/pharmacy before changes): ${meds}` : 'Medications remain per the MAR and prescriber orders.'} If you have questions about goals of care or visit scheduling, please reach your unit social worker or nursing coordinator.

Warm regards,
${facilityName}
Care Team (AI draft — review before sending)`
}
