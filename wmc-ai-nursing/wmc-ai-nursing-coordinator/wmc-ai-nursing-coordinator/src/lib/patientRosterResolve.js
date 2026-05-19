/**
 * Resolve Telegram messages to real roster patients only (room and/or name match).
 * No synthetic patients — used by webhook (Sheet-backed) and UI (localStorage roster).
 */

import { normalizeRoomToken } from './telegramNurseParser.js'

export function pickFirst(row, aliases) {
  if (!row || typeof row !== 'object') return ''
  const flattenKey = (s) =>
    String(s || '')
      .trim()
      .toLowerCase()
      .replace(/[\s_\-]/g, '')
  /** Prefer earlier aliases when multiple columns match (e.g. room_number before room). */
  for (const alias of aliases) {
    const want = flattenKey(alias)
    for (const [k, v] of Object.entries(row)) {
      if (flattenKey(k) === want && v != null && String(v).trim()) {
        return String(v).trim()
      }
    }
  }
  return ''
}

/** Trim patient name only (no logging)—same sources as {@link rosterPatientDisplayName}. */
export function patientNameTrimmedFromRosterRow(row) {
  if (!row || typeof row !== 'object') return ''
  return String(
    row.patient_name ||
      row.patientName ||
      row['patient_name'] ||
      row['patientName'] ||
      row['Patient Name'] ||
      row['patient name'] ||
      '',
  ).trim()
}

/** Normalize a roster row from Google Sheet / local DB into { id, fullName, room, ...rest } */
export function normalizePatientRecord(row) {
  if (!row || typeof row !== 'object') return null
  let id = pickFirst(row, ['id', 'patientId', 'patient_id', 'Patient ID', 'PatientID'])
  /** Patientsroom roster columns (Sheet tab Patientsroom): patient_name, room_number only. */
  const fullName = patientNameTrimmedFromRosterRow(row)
  const room = pickFirst(row, ['room_number'])
  const roomTok = room ? normalizeRoomToken(room) : ''
  if (!id && roomTok) {
    id = `room:${roomTok}`
  }
  /** Keep row if we have any stable identity — Sheets often use room_number + patient_name only. */
  if (!id && !fullName && !room) return null
  return {
    ...row,
    id: id || row.id || '',
    fullName: fullName || row.fullName || '',
    room: room || row.room || '',
  }
}

/** Primary room from Patientsroom **room_number** only. */
export function patientRoomTrimFromRow(p) {
  if (!p || typeof p !== 'object') return ''
  const r = pickFirst(p, ['room_number'])
  if (r == null || r === '') return ''
  return String(r).trim()
}

/**
 * Compare roster room to Telegram-parsed room: trim, case-insensitive for letters,
 * numeric equivalence (e.g. 2 vs 02 vs 2.0 from sheets).
 */
export function rosterRoomsMatch(sheetRoom, lookupRoom) {
  const a = String(sheetRoom ?? '').trim()
  const b = String(lookupRoom ?? '').trim()
  if (!a || !b) return false
  if (a.toLowerCase() === b.toLowerCase()) return true
  const na = Number(a)
  const nb = Number(b)
  if (Number.isFinite(na) && Number.isFinite(nb) && na === nb) return true
  return false
}

/** Patientsroom production match: exact trim string equality on room_number (Spreadsheet column). */
export function patientsroomRowMatchesStrictRoom(row, roomNumber) {
  if (!row || typeof row !== 'object') return false
  const raw =
    Object.prototype.hasOwnProperty.call(row, 'room_number') && row.room_number != null
      ? row.room_number
      : pickFirst(row, ['room_number'])
  const a = String(raw ?? '').trim()
  const b = String(roomNumber ?? '').trim()
  return a !== '' && b !== '' && a === b
}

/** Distinct trimmed room_number values from roster rows (for logging). */
export function patientsroomRoomNumbersList(patients) {
  const list = Array.isArray(patients) ? patients : []
  const seen = new Set()
  const out = []
  for (const row of list) {
    const s = patientRoomTrimFromRow(row)
    if (!s || seen.has(s)) continue
    seen.add(s)
    out.push(s)
  }
  return out.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
}

/** Stable room token from Patientsroom **room_number** only (normalized token for non-Telegram flows). */
export function patientRoomNormFromRow(p) {
  const r = pickFirst(p, ['room_number'])
  return r ? normalizeRoomToken(r) : ''
}

/** Patientsroom display name from matched roster row (logs + Unknown fallback). */
export function rosterPatientDisplayName(row) {
  const patientName = String(
    row.patient_name ||
      row.patientName ||
      row['patient_name'] ||
      row['patientName'] ||
      row['Patient Name'] ||
      row['patient name'] ||
      '',
  ).trim()

  console.log("Matched roster row =", row)
  console.log("Resolved patient name =", patientName)

  const finalPatientName = patientName.length > 0 ? patientName : 'Unknown'

  return finalPatientName
}

export function noteRowPatientId(row) {
  return pickFirst(row, ['patientId', 'patient_id', 'Patient ID', 'PatientID']) || ''
}

function normName(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function namesMatch(fullNorm, guessNorm) {
  if (!fullNorm || !guessNorm) return false
  if (fullNorm === guessNorm) return true
  if (fullNorm.includes(guessNorm) || guessNorm.includes(fullNorm)) return true
  const gw = guessNorm.split(' ')
  const fw = fullNorm.split(' ')
  return gw.every((g) => g.length > 0 && fw.some((f) => f === g || f.startsWith(g)))
}

/** Telegram lookup room string from parsed message (trimmed). */
function telegramLookupRoomTrim(parsed) {
  return parsed?.patientRoom != null ? String(parsed.patientRoom).trim() : ''
}

function normalizePatientList(patients) {
  return (Array.isArray(patients) ? patients : [])
    .map((p) => (p?.id != null && String(p.id).trim() ? p : normalizePatientRecord(p)))
    .filter(Boolean)
}

/**
 * Production / Sheet-only: match **Patientsroom** row by
 * `String(row.room_number).trim() === String(lookupRoom).trim()` (strict).
 * Display name from patient_name (see rosterPatientDisplayName).
 *
 * @returns {{ patient: object|null, error: null|'room_not_found'|'room_required'|'ambiguous'|'not_found' }}
 */
export function resolvePatientForTelegramMessageProduction(patients, parsed) {
  const list = normalizePatientList(patients)
  const lookupRoom = telegramLookupRoomTrim(parsed)

  if (!lookupRoom) {
    return { patient: null, error: 'room_required' }
  }

  const byRoom = list.filter((p) => patientsroomRowMatchesStrictRoom(p, lookupRoom))

  if (byRoom.length === 1) return { patient: byRoom[0], error: null }
  if (byRoom.length === 0) return { patient: null, error: 'room_not_found' }
  return { patient: null, error: 'ambiguous' }
}

/**
 * @param {object[]} patients — normalized roster (see normalizePatientRecord)
 * @param {object} parsed — parseTelegramNurseMessage result
 * @param {{ production?: boolean }} [options] — production uses Sheet room rows only (no name-based guessing alone)
 * @returns {{ patient: object|null, error: null|'ambiguous'|'not_found'|'room_not_found'|'room_required' }}
 */
export function resolvePatientForTelegramMessage(patients, parsed, options = {}) {
  if (options.production === true) {
    return resolvePatientForTelegramMessageProduction(patients, parsed)
  }

  const list = normalizePatientList(patients)

  const lookupRoom = telegramLookupRoomTrim(parsed)
  const nameGuess = normName(parsed?.patientNameGuess || '')

  if (!lookupRoom && !nameGuess) {
    return { patient: null, error: 'not_found' }
  }

  if (lookupRoom) {
    const byRoom = list.filter((p) => {
      const rowRoom = patientRoomTrimFromRow(p)
      return rowRoom !== '' && rosterRoomsMatch(rowRoom, lookupRoom)
    })
    if (byRoom.length === 1) return { patient: byRoom[0], error: null }
    if (byRoom.length > 1) {
      if (nameGuess) {
        const narrowed = byRoom.filter((p) => namesMatch(normName(p.fullName || p.name), nameGuess))
        if (narrowed.length === 1) return { patient: narrowed[0], error: null }
      }
      return { patient: null, error: 'ambiguous' }
    }
  }

  if (nameGuess) {
    const byName = list.filter((p) => namesMatch(normName(p.fullName || p.name), nameGuess))
    if (byName.length === 1) return { patient: byName[0], error: null }
    if (byName.length > 1) return { patient: null, error: 'ambiguous' }
  }

  return { patient: null, error: 'not_found' }
}
