/** Dummy data for demonstration — not real PHI. Patient roster lives in localStorage (see `src/db/`). */

export const facilityName = 'Willowbrook Medical Centre'

export const rehabPrograms = [
  {
    patientId: 'p2',
    patientName: 'Sim Resident B (demo)',
    primaryGoal: 'Independent ambulation on flat surfaces',
    targetDate: '2026-05-28',
    sessionsPerWeek: 5,
    barthelIndex: { current: 78, admission: 62 },
    fimMotor: { current: 68, admission: 54 },
    milestones: [
      { label: 'WB status per ortho', done: true, date: '2026-04-10' },
      { label: 'Stairs with rail', done: true, date: '2026-05-08' },
      { label: 'Community distance trial', done: false, date: null },
    ],
    weeklyMinutes: [
      { week: 'W1', pt: 120, ot: 60 },
      { week: 'W2', pt: 150, ot: 60 },
      { week: 'W3', pt: 150, ot: 90 },
      { week: 'W4', pt: 180, ot: 90 },
    ],
  },
  {
    patientId: 'p4',
    patientName: 'Sim Resident D (demo)',
    primaryGoal: 'Endurance for ADLs without supplemental O₂ at rest',
    targetDate: '2026-06-05',
    sessionsPerWeek: 4,
    barthelIndex: { current: 85, admission: 70 },
    fimMotor: { current: 72, admission: 60 },
    milestones: [
      { label: 'IS protocol compliance', done: true, date: '2026-04-22' },
      { label: 'Ambulate 200 ft with breaks', done: true, date: '2026-05-05' },
      { label: 'Stair tolerance 1 flight', done: false, date: null },
    ],
    weeklyMinutes: [
      { week: 'W1', pt: 90, ot: 45 },
      { week: 'W2', pt: 120, ot: 45 },
      { week: 'W3', pt: 120, ot: 60 },
    ],
  },
]

export const aiAlerts = [
  {
    id: 'a1',
    patientId: 'p1',
    patientName: 'Sim Resident A (demo)',
    severity: 'high',
    category: 'Cardiovascular',
    title: 'Weight trend + edema pattern',
    description:
      '7-day weight up 2.1 kg with evening pedal edema notes on 4/7 shifts. Correlates with weekend fluid preference.',
    confidence: 0.87,
    suggestedActions: [
      'Notify prescriber for possible diuretic adjustment',
      'Strict I&O ×72h',
      'Daily weights same scale/time',
    ],
    status: 'open',
    createdAt: '2026-05-12T06:12:00',
  },
  {
    id: 'a2',
    patientId: 'p3',
    patientName: 'Sim Resident C (demo)',
    severity: 'critical',
    category: 'Aspiration risk',
    title: 'Coughing episodes clustered around lunch',
    description:
      'Speech notes + nursing narratives show increased wet voice quality and cough within 20 min of meals on 3 consecutive days.',
    confidence: 0.91,
    suggestedActions: [
      'Hold tray; page SLP and MD',
      'Review swallow strategy at bedside',
      'Consider NPO until assessed',
    ],
    status: 'acknowledged',
    createdAt: '2026-05-11T14:40:00',
  },
  {
    id: 'a3',
    patientId: 'p2',
    patientName: 'Sim Resident B (demo)',
    severity: 'medium',
    category: 'Pain / mobility',
    title: 'Post-PT pain spike pattern',
    description:
      'PRN analgesic use highest on days with stair training. Morning baseline pain scores remain low.',
    confidence: 0.76,
    suggestedActions: [
      'Pre-medicate 30 min before stair sessions',
      'Ice pack protocol after PT',
    ],
    status: 'open',
    createdAt: '2026-05-10T09:05:00',
  },
  {
    id: 'a4',
    patientId: 'p4',
    patientName: 'Sim Resident D (demo)',
    severity: 'medium',
    category: 'Respiratory',
    title: 'Rescue inhaler use trending up',
    description:
      'SABA use 4× in 48h vs baseline 1×/week. No fever documented.',
    confidence: 0.72,
    suggestedActions: [
      'Vitals q4h ×24h',
      'Notify MD if SpO₂ <92% on current O₂',
    ],
    status: 'resolved',
    createdAt: '2026-05-09T11:22:00',
  },
]

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
Care Team (demo AI draft — review before sending)`
}
