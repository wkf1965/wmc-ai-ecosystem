const { randomUUID } = require('crypto')
const { MOCK_MED_SCHEDULES, MOCK_MED_RECORDS } = require('../../shared/mocks/medicine-mock-data')

// In-memory stores (Prisma-ready)
const scheduleStore = MOCK_MED_SCHEDULES.map((s) => ({ ...s }))
const recordStore   = MOCK_MED_RECORDS.map((r) => ({ ...r }))

// ── Schedules ─────────────────────────────────────────────────────────────────

function getSchedules(filters = {}) {
  let results = scheduleStore.filter((s) => s.active)
  if (filters.patientId) results = results.filter((s) => s.patientId === filters.patientId)

  return {
    total:     results.length,
    count:     results.length,
    schedules: results,
    source: 'mock',
    mock:   true,
  }
}

// ── Administration records ────────────────────────────────────────────────────

function getRecords(filters = {}) {
  let results = [...recordStore]
  if (filters.patientId)    results = results.filter((r) => r.patientId === filters.patientId)
  if (filters.status)       results = results.filter((r) => r.status === filters.status)
  if (filters.medicineName) results = results.filter((r) =>
    r.medicineName.toLowerCase().includes(String(filters.medicineName).toLowerCase())
  )

  const limit = filters.limit ? Math.min(Number(filters.limit), 200) : 50
  results = results.slice(0, limit)

  return {
    total:   recordStore.length,
    count:   results.length,
    records: results,
    source: 'mock',
    mock:   true,
  }
}

/**
 * Record a medication administration (give a dose).
 */
function giveMedication(input) {
  const { patientId, patientName, medicineName, dosage, route, givenBy, scheduleId, notes } = input

  if (!patientId)    throw Object.assign(new Error('patientId is required'),    { status: 400 })
  if (!medicineName) throw Object.assign(new Error('medicineName is required'), { status: 400 })
  if (!givenBy)      throw Object.assign(new Error('givenBy is required'),      { status: 400 })

  const record = {
    id:           randomUUID(),
    scheduleId:   scheduleId ?? null,
    patientId,
    patientName:  patientName ?? null,
    medicineName: String(medicineName).trim(),
    dosage:       dosage ?? null,
    route:        route ?? 'oral',
    givenBy:      String(givenBy).trim(),
    givenAt:      new Date().toISOString(),
    notes:        notes ?? null,
    status:       'given',
    mock:         true,
  }

  recordStore.unshift(record)
  return { record, source: 'mock', mock: true }
}

/**
 * Pending medications — schedules not yet administered today.
 */
function getPendingMedications() {
  const today = new Date().toISOString().slice(0, 10)

  // For each active schedule, check if a record exists for today
  const pending = scheduleStore.filter((sched) => {
    if (!sched.active) return false
    const alreadyGiven = recordStore.some(
      (r) => r.scheduleId === sched.id && r.givenAt.startsWith(today) && r.status === 'given'
    )
    return !alreadyGiven
  })

  return {
    count:   pending.length,
    pending,
    source: 'mock',
    mock:   true,
  }
}

/**
 * Summary stats — for dashboard card.
 */
function getMedicineSummary() {
  const today = new Date().toISOString().slice(0, 10)
  const givenToday    = recordStore.filter((r) => r.givenAt.startsWith(today) && r.status === 'given').length
  const { count: pendingCount, pending } = getPendingMedications()
  const overdueCount  = pending.filter((s) => {
    const [h, m] = (s.scheduledTime?.split(',')[0] ?? '00:00').split(':').map(Number)
    const scheduled = new Date()
    scheduled.setHours(h, m, 0, 0)
    return new Date() > scheduled
  }).length

  return {
    totalSchedules: scheduleStore.filter((s) => s.active).length,
    givenToday,
    pendingToday:   pendingCount,
    overdueCount,
    source: 'mock',
    mock:   true,
  }
}

module.exports = { getSchedules, getRecords, giveMedication, getPendingMedications, getMedicineSummary }
