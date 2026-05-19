/**
 * Local persistence for side-turning / posture care schedules and confirmations.
 */

const SCHEDULES_KEY = 'wmc_side_turning_schedules_v1'
const EVENTS_KEY = 'wmc_side_turning_events_v1'
const MAX_EVENTS = 2000

function migrateTurnEvents(rows) {
  let changed = false
  const next = rows.map((e) => {
    if (e && e.confirmedAt && e.photoDataUrl == null && !e.legacyPhotoExempt) {
      changed = true
      return { ...e, legacyPhotoExempt: true }
    }
    return e
  })
  return { rows: next, changed }
}

/** Events recorded before photo enforcement still advance the schedule. */
export function completionAnchorsSchedule(ev) {
  if (!ev || !ev.confirmedAt) return false
  if (ev.legacyPhotoExempt) return true
  return typeof ev.photoDataUrl === 'string' && ev.photoDataUrl.length > 200
}

export function eventHasPhotoProof(ev) {
  return typeof ev?.photoDataUrl === 'string' && ev.photoDataUrl.length > 200
}

/** @returns {object[]} */
export function readSchedules() {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(SCHEDULES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeSchedules(rows) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(SCHEDULES_KEY, JSON.stringify(rows))
  } catch {
    // no-op
  }
}

function writeEvents(rows) {
  if (typeof window === 'undefined') return false
  try {
    localStorage.setItem(EVENTS_KEY, JSON.stringify(rows.slice(0, MAX_EVENTS)))
    return true
  } catch {
    return false
  }
}

/** @returns {object[]} */
export function readTurnEvents() {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(EVENTS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    const base = Array.isArray(parsed) ? parsed : []
    const { rows, changed } = migrateTurnEvents(base)
    if (changed) writeEvents(rows)
    return rows
  } catch {
    return []
  }
}

export function generateScheduleId() {
  return `sts_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

export function generateTurnEventId() {
  return `ste_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

export function saveSchedule(schedule) {
  const all = readSchedules()
  const idx = all.findIndex((s) => s.id === schedule.id)
  if (idx >= 0) all[idx] = { ...schedule, updatedAt: new Date().toISOString() }
  else all.unshift({ ...schedule, createdAt: schedule.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() })
  writeSchedules(all)
  return schedule
}

export function removeSchedule(scheduleId) {
  const next = readSchedules().filter((s) => s.id !== scheduleId)
  writeSchedules(next)
}

/** Append a turning record (photo proof required for new entries — see page validation). @returns {boolean} success */
export function appendTurnEvent(event) {
  const all = readTurnEvents()
  all.unshift(event)
  return writeEvents(all)
}

const BOARD_GRACE_MS = 15 * 60 * 1000

/**
 * Board workflow: optional photo when photoRequired false (legacy exempt).
 * turnScore: on_time | late (vs nextDueAtMs + grace). photoSubmitted derived from image presence.
 */
export function appendBoardTurnEvent(payload) {
  const {
    scheduleId,
    patientId,
    patientNameSnapshot,
    position,
    nurse,
    note,
    photoDataUrl,
    photoRequired,
    nextDueAtMs,
  } = payload

  const confirmedAt = new Date().toISOString()
  const confirmedMs = new Date(confirmedAt).getTime()
  const needsPhoto = Boolean(photoRequired)
  const hasPhoto = typeof photoDataUrl === 'string' && photoDataUrl.length > 200

  if (needsPhoto && !hasPhoto) {
    return { ok: false, error: 'Photo is required for this patient on the schedule board.' }
  }

  let turnScore = 'on_time'
  if (typeof nextDueAtMs === 'number' && Number.isFinite(nextDueAtMs)) {
    turnScore = confirmedMs > nextDueAtMs + BOARD_GRACE_MS ? 'late' : 'on_time'
  }

  const event = {
    id: generateTurnEventId(),
    scheduleId,
    patientId,
    position,
    nurse,
    confirmedAt,
    note: note || '',
    patientNameSnapshot,
    photoDataUrl: hasPhoto ? photoDataUrl : undefined,
    photoMime: hasPhoto ? 'image/jpeg' : undefined,
    legacyPhotoExempt: !needsPhoto,
    turnScore,
    photoSubmitted: hasPhoto,
    source: 'schedule-board',
  }

  const ok = appendTurnEvent(event)
  return ok ? { ok: true, event } : { ok: false, error: 'Could not save (storage full?).' }
}

export function getEventsForPatient(patientId, limit = 50) {
  return readTurnEvents()
    .filter((e) => e.patientId === patientId)
    .sort((a, b) => new Date(b.confirmedAt) - new Date(a.confirmedAt))
    .slice(0, limit)
}

/** Latest completion that advances the 2-hour schedule (photo proof or legacy exempt). */
export function getLastAnchoringEventForPatient(patientId) {
  const list = readTurnEvents()
    .filter((e) => e.patientId === patientId && completionAnchorsSchedule(e))
    .sort((a, b) => new Date(b.confirmedAt) - new Date(a.confirmedAt))
  return list[0] || null
}

export function getLastEventForPatient(patientId) {
  return getLastAnchoringEventForPatient(patientId)
}
