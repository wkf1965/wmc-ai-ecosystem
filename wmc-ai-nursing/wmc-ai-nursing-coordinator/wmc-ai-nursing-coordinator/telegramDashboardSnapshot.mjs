/**
 * Live dashboard snapshot: Telegram nursing memory + optional Google Sheet tables.
 * Never synthesizes patients — roster-driven widgets use Sheet **Patientsroom** (`read_table`: patientsroom) when readable.
 */

import { readTelegramNursingMemoryState } from './telegramNursingMemory.mjs'
import { readGoogleSheetTable } from './sheetWebhookRead.mjs'
import {
  normalizePatientRecord,
  noteRowPatientId,
  pickFirst,
  rosterPatientDisplayName,
} from './src/lib/patientRosterResolve.js'

const TURN_INTERVAL_MS = 2 * 60 * 60 * 1000
const MISSED_GRACE_MS = 15 * 60 * 1000

function normRoomToken(x) {
  return String(x || '')
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase()
}

function sortByTimestampDesc(a, b) {
  return new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime()
}

function rowDashboardCategories(row) {
  if (Array.isArray(row.dashboardCategories) && row.dashboardCategories.length > 0) {
    return row.dashboardCategories.map((x) => String(x))
  }
  return String(row.categories || '')
    .split('+')
    .map((s) => s.trim())
    .filter(Boolean)
}

function rowMatchesCategory(row, needle) {
  return rowDashboardCategories(row).some((c) => c.includes(needle))
}

function turningReminder(row) {
  const t = `${row.originalMessage || ''} ${row.symptoms || ''}`.toLowerCase()
  return /\bturn\b|reposition|q2h|q\s*2\s*h|lateral|pressure\s+relief|every\s+2\s+hours/.test(t)
}

function otRelated(row) {
  const t = `${row.originalMessage || ''} ${row.categories || ''}`.toLowerCase()
  return /\bot\b|occupational\s+therapy|ot\s+session|ot\s+report/.test(t)
}

function nutritionCue(row) {
  return (
    row.primaryLoop === 'nutrition' ||
    rowMatchesCategory(row, 'Nutrition') ||
    /\bappetite\b|\bmeal\b/i.test(row.originalMessage || '')
  )
}

function mobilityCue(row) {
  return (
    row.primaryLoop === 'rehabilitation' ||
    rowMatchesCategory(row, 'Mobility') ||
    /\bmobil|\bgait\b|\bweak\b|\bpt\b/i.test(row.originalMessage || '')
  )
}

function fallRiskCue(row) {
  return row.primaryLoop === 'fall_risk' || rowMatchesCategory(row, 'Fall Risk')
}

function familyUpdateRow(row) {
  return (
    rowMatchesCategory(row, 'Family Update') ||
    /\bfamily\s+update\b|\bdaughter\b|\bson\b/i.test(row.originalMessage || '')
  )
}

function shiftHandoverRow(row) {
  return (
    rowMatchesCategory(row, 'Shift Handover') ||
    /\bhandover\b|shift\s+report|change\s+of\s+shift/i.test(row.originalMessage || '')
  )
}

function medicationCue(row) {
  return row.primaryLoop === 'medication' || rowMatchesCategory(row, 'Medication')
}

function severityRank(level) {
  const lv = String(level || '')
  if (lv === 'Emergency') return 4
  if (lv === 'High') return 3
  if (lv === 'Warning') return 2
  if (lv === 'Low') return 1
  return 0
}

function isElevatedRisk(row) {
  const lv = String(row.riskLevel || '')
  const s = Number(row.riskScore)
  if (['Warning', 'High', 'Emergency', 'Critical'].includes(lv)) return true
  if (Number.isFinite(s) && s >= 35) return true
  return false
}

export function sanitizeMedicationObservation(text) {
  let s = String(text || '').replace(/\s+/g, ' ').trim()
  s = s.replace(/\b\d+(?:\.\d+)?\s*(?:mg|mcg|ml|g)\b/gi, '[amount withheld]')
  return s.slice(0, 420)
}

async function safeReadTable(name) {
  const r = await readGoogleSheetTable(name)
  const rows = Array.isArray(r.rows) ? r.rows : []
  return {
    ok: r.ok,
    error: r.ok ? undefined : r.error,
    rows: r.ok ? rows : [],
    rowCount: r.ok ? rows.length : 0,
  }
}

async function buildTelegramDashboardSnapshotBody() {
  const generatedAt = new Date().toISOString()
  const memoryState = await readTelegramNursingMemoryState()
  const records = Array.isArray(memoryState.entries) ? [...memoryState.entries] : []
  records.sort(sortByTimestampDesc)

  const [patientsR, notesR, turningR, rehabR, medNotesR, shiftR, roomStatusR, roomModuleNotesR] =
    await Promise.all([
      safeReadTable('patientsroom'),
      safeReadTable('nursing_notes'),
      safeReadTable('turning_schedule'),
      safeReadTable('rehab_sessions'),
      safeReadTable('medication_notes'),
      safeReadTable('shift_handover'),
      safeReadTable('room_status'),
      safeReadTable('room_module_nursing_notes'),
    ])

  const roster = patientsR.ok ? patientsR.rows.map(normalizePatientRecord).filter(Boolean) : []

  const rosterIds = new Set(roster.map((p) => String(p.id || '').trim()).filter(Boolean))

  const latestTelegramByPatientId = new Map()
  const latestTelegramByRoom = new Map()
  for (const r of records) {
    const pid = String(r.patientId || '').trim()
    if (pid && !latestTelegramByPatientId.has(pid)) latestTelegramByPatientId.set(pid, r)
    const rk = normRoomToken(r.room)
    if (rk && !latestTelegramByRoom.has(rk)) latestTelegramByRoom.set(rk, r)
  }

  function telegramForPatient(p) {
    const pid = String(p.id || '').trim()
    const byId = pid ? latestTelegramByPatientId.get(pid) : null
    if (byId) return byId
    const rk = normRoomToken(p.room)
    return rk ? latestTelegramByRoom.get(rk) : null
  }

  const alertBucket = new Map()
  for (const r of records) {
    if (!isElevatedRisk(r)) continue
    const pid = String(r.patientId || '').trim()
    const key =
      pid ||
      `${normRoomToken(r.room)}|${String(r.patientName || '').trim()}` ||
      String(r.id || '')
    const prev = alertBucket.get(key)
    const rank = severityRank(r.riskLevel)
    const prevRank = prev ? severityRank(prev.riskLevel) : -1
    const score = Number(r.riskScore)
    const prevScore = prev ? Number(prev.riskScore) : -1
    const better =
      !prev ||
      rank > prevRank ||
      (rank === prevRank && Number.isFinite(score) && score > prevScore) ||
      (rank === prevRank &&
        score === prevScore &&
        new Date(r.timestamp || 0) > new Date(prev.timestamp || 0))
    if (better) alertBucket.set(key, r)
  }

  const highRiskAlerts = [...alertBucket.values()]
    .sort((a, b) => {
      const dr = severityRank(b.riskLevel) - severityRank(a.riskLevel)
      if (dr !== 0) return dr
      const ds = (Number(b.riskScore) || 0) - (Number(a.riskScore) || 0)
      if (ds !== 0) return ds
      return new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime()
    })
    .map((r) => ({
      id: r.id,
      room: r.room ?? null,
      patientName: r.patientName ?? null,
      patientId: r.patientId ?? null,
      riskLevel: r.riskLevel ?? 'N/A',
      riskScore: r.riskScore ?? null,
      categories: r.categories ?? '',
      latestNote: String(r.originalMessage || '').slice(0, 320),
      timestamp: r.timestamp ?? null,
      suggestedAction: String(r.suggestedAction || '').slice(0, 220),
    }))

  const emergencies = highRiskAlerts.filter((a) => a.riskLevel === 'Emergency')

  const roomStatusByRoom = new Map()
  if (roomStatusR.ok) {
    for (const row of roomStatusR.rows) {
      const rk = normRoomToken(pickFirst(row, ['room_number', 'Room', 'room']))
      if (!rk) continue
      roomStatusByRoom.set(rk, row)
    }
  }

  const roomStatusBoard = roster.map((p) => {
    const tg = telegramForPatient(p)
    const rk = normRoomToken(pickFirst(p, ['room', 'room_number', 'Room']) || p.room)
    const sheetFall = pickFirst(p, ['fall_risk', 'fallRisk', 'Fall risk', 'Fall Risk'])
    const sheetMobility = pickFirst(p, ['mobility_status', 'mobility', 'Mobility', 'mobilityStatus'])
    const sheetAppetite = pickFirst(p, ['appetite_status', 'appetite', 'Appetite', 'intake'])

    let mobility = sheetMobility || '—'
    if (tg && mobilityCue(tg)) {
      mobility =
        mobility !== '—'
          ? `${mobility} · Telegram cue`
          : `Telegram: ${String(tg.symptoms || tg.originalMessage || '').slice(0, 100)}`
    }

    let appetite = sheetAppetite || '—'
    if (tg && nutritionCue(tg)) {
      appetite = appetite !== '—' ? `${appetite} · Telegram` : 'Telegram nutrition cue'
    }

    let turning = '—'
    if (tg && turningReminder(tg)) turning = 'Telegram turning cue'
    if (turningR.ok && rk) {
      const hit = turningR.rows.find((row) => normRoomToken(pickFirst(row, ['Room', 'room'])) === rk)
      if (hit) turning = turning !== '—' ? `${turning}; Sheet row` : 'Sheet turning_schedule'
    }

    let rehab = '—'
    if (tg && (otRelated(tg) || rowMatchesCategory(tg, 'Mobility'))) {
      rehab = 'Telegram PT/OT or mobility'
    }

    let fallRisk = sheetFall || '—'
    if (tg && fallRiskCue(tg)) {
      fallRisk = fallRisk !== '—' ? `${fallRisk} · Telegram` : 'Telegram fall-risk cue'
    }

    return {
      patientId: p.id,
      room: p.room || '—',
      patientName: rosterPatientDisplayName(p),
      mobility: String(mobility).slice(0, 180),
      appetite: String(appetite).slice(0, 180),
      turning,
      rehab: String(rehab).slice(0, 180),
      fallRisk: String(fallRisk).slice(0, 180),
      lastTelegramAt: tg?.timestamp ?? null,
    }
  })

  const roomModuleBoard = roster.map((p) => {
    const tg = telegramForPatient(p)
    const rk = normRoomToken(pickFirst(p, ['room', 'room_number', 'Room']) || p.room)
    const rs = rk ? roomStatusByRoom.get(rk) : null
    const sheetMob = pickFirst(p, ['mobility_status', 'mobility', 'Mobility', 'mobilityStatus'])
    const sheetApp = pickFirst(p, ['appetite_status', 'appetite', 'Appetite', 'intake'])
    const sheetFallR = pickFirst(p, ['fall_risk', 'fallRisk', 'Fall risk', 'Fall Risk'])
    const turnReq = pickFirst(p, ['turning_required', 'turningRequired', 'Turning'])
    const rehabReq = pickFirst(p, ['rehab_required', 'rehabRequired', 'Rehab'])
    const otReq = pickFirst(p, ['ot_required', 'otRequired', 'OT'])

    let mobilityStatus = sheetMob || '—'
    if (tg && mobilityCue(tg)) {
      mobilityStatus =
        mobilityStatus !== '—'
          ? `${mobilityStatus} · Telegram`
          : `Telegram: ${String(tg.symptoms || tg.originalMessage || '').slice(0, 120)}`
    }

    let appetiteStatus = sheetApp || '—'
    if (tg && nutritionCue(tg)) {
      appetiteStatus = appetiteStatus !== '—' ? `${appetiteStatus} · Telegram` : 'Telegram nutrition cue'
    }

    let turningStatus = turnReq || '—'
    if (turningStatus === '—' && tg && turningReminder(tg)) turningStatus = 'Telegram turning cue'
    if (turningR.ok && rk) {
      const hit = turningR.rows.find((row) => normRoomToken(pickFirst(row, ['Room', 'room'])) === rk)
      if (hit) turningStatus = turningStatus !== '—' ? `${turningStatus}; Sheet` : 'Sheet turning_schedule'
    }

    let rehabStatus = rehabReq || '—'
    if (rehabStatus === '—' && tg && (otRelated(tg) || rowMatchesCategory(tg, 'Mobility'))) {
      rehabStatus = 'Telegram PT/OT cue'
    }

    let fallRiskM = sheetFallR || '—'
    if (tg && fallRiskCue(tg)) {
      fallRiskM = fallRiskM !== '—' ? `${fallRiskM} · Telegram` : 'Telegram fall-risk cue'
    }

    const latestFromSheet = rs ? pickFirst(rs, ['latest_note', 'Latest note', 'latestNote']) : ''
    const latestNursingNote =
      String(latestFromSheet || '').trim() ||
      (tg ? String(tg.originalMessage || '').slice(0, 320) : '') ||
      '—'

    const riskFromSheet = rs ? pickFirst(rs, ['risk_level', 'Risk level', 'riskLevel']) : ''
    const riskLevel =
      String(riskFromSheet || '').trim() ||
      (tg ? String(tg.riskLevel || '') : '') ||
      '—'

    const displayRoom = pickFirst(p, ['room', 'room_number']) || p.room || '—'
    const displayName = rosterPatientDisplayName(p)

    return {
      patientId: p.id,
      room: displayRoom,
      patientName: displayName,
      latestNursingNote,
      riskLevel,
      mobilityStatus: String(mobilityStatus).slice(0, 200),
      appetiteStatus: String(appetiteStatus).slice(0, 200),
      fallRisk: String(fallRiskM).slice(0, 200),
      rehabStatus: String(rehabStatus).slice(0, 200),
      otRequired: otReq || '—',
      turningStatus: String(turningStatus).slice(0, 200),
      currentStatusFromSheet: rs ? pickFirst(rs, ['current_status', 'Current status']) : '',
      lastUpdatedFromSheet: rs ? pickFirst(rs, ['last_updated', 'Last updated']) : '',
      isSampleRow: Boolean(p.isSample),
      diagnosis: pickFirst(p, ['diagnosis', 'Diagnosis']) || '—',
    }
  })

  const turningSchedule = []
  for (const p of roster) {
    const pid = String(p.id || '').trim()
    const rk = normRoomToken(pickFirst(p, ['room', 'room_number', 'Room']) || p.room)
    const turningMsgs = records
      .filter((r) => {
        if (!turningReminder(r)) return false
        if (pid && String(r.patientId || '') === pid) return true
        if (rk && normRoomToken(r.room) === rk) return true
        return false
      })
      .sort(sortByTimestampDesc)
    const last = turningMsgs[0]
    if (!last) continue
    const lastTs = new Date(last.timestamp || 0).getTime()
    if (!Number.isFinite(lastTs) || lastTs <= 0) continue
    const nextDueAt = new Date(lastTs + TURN_INTERVAL_MS).toISOString()
    const missed = Date.now() > lastTs + TURN_INTERVAL_MS + MISSED_GRACE_MS
    turningSchedule.push({
      patientId: p.id,
      room: p.room || null,
      patientName: rosterPatientDisplayName(p),
      lastTurnDocumentedAt: last.timestamp,
      nextDueAt,
      missed,
      source: 'telegram',
      lastSnippet: String(last.originalMessage || '').slice(0, 120),
    })
  }

  const telegramLiveFeed = records.slice(0, 60).map((r) => ({
    id: r.id,
    timestamp: r.timestamp,
    nurseName: r.nurseName ?? null,
    nurseInput: String(r.originalMessage || '').slice(0, 500),
    classification: r.categories ?? '',
    riskLevel: r.riskLevel ?? '',
    riskScore: r.riskScore ?? null,
    room: r.room ?? null,
    patientName: r.patientName ?? null,
    status: r.status ?? null,
  }))

  const rehabTelegram = records
    .filter((r) => otRelated(r) || rowMatchesCategory(r, 'Mobility') || r.primaryLoop === 'rehabilitation')
    .slice(0, 35)
    .map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      room: r.room,
      patientName: r.patientName,
      summary: String(r.originalMessage || '').slice(0, 240),
      categories: r.categories ?? '',
      source: 'telegram',
    }))

  const rehabSheetRows =
    rehabR.ok && Array.isArray(rehabR.rows)
      ? rehabR.rows
          .filter((row) => rosterIds.has(String(noteRowPatientId(row) || '').trim()))
          .slice(0, 40)
      : []

  const pendingTasks = records.filter((r) => r.status !== 'completed').length
  const handoverTelegram = records.filter(shiftHandoverRow).sort(sortByTimestampDesc).slice(0, 25)
  const highPriNames = [...new Set(highRiskAlerts.map((a) => a.patientName).filter(Boolean))].slice(0, 14)

  const shiftHandoverSummary = {
    headline: `Pending Telegram workflow items: ${pendingTasks}. Handover-tagged messages in memory: ${handoverTelegram.length}.`,
    highPriorityPatients: highPriNames,
    pendingTaskCount: pendingTasks,
    recentHandoverMessages: handoverTelegram.slice(0, 10).map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      summary: String(r.originalMessage || '').slice(0, 200),
      room: r.room,
      patientName: r.patientName,
    })),
    sheetShiftHandoverRows: shiftR.ok ? shiftR.rowCount : 0,
  }

  const familyUpdateQueue = records
    .filter((r) => familyUpdateRow(r) && r.status !== 'completed')
    .sort(sortByTimestampDesc)
    .slice(0, 45)
    .map((r) => ({
      id: r.id,
      room: r.room,
      patientName: r.patientName,
      timestamp: r.timestamp,
      snippet: String(r.originalMessage || '').slice(0, 220),
      draft: r.familyUpdateDraft ? String(r.familyUpdateDraft).slice(0, 240) : null,
    }))

  const medicationObservations = [
    ...records.filter(medicationCue).slice(0, 40).map((r) => ({
      id: r.id,
      source: 'telegram',
      timestamp: r.timestamp,
      room: r.room,
      patientName: r.patientName,
      text: sanitizeMedicationObservation(r.originalMessage),
    })),
    ...(medNotesR.ok
      ? medNotesR.rows
          .filter((row) => rosterIds.has(String(noteRowPatientId(row) || '').trim()))
          .slice(0, 40)
          .map((row) => ({
            id: `sheet-${pickFirst(row, ['Time', 'time'])}-${pickFirst(row, ['Room', 'room'])}`,
            source: 'sheet',
            timestamp: pickFirst(row, ['Time', 'time']) || null,
            room: pickFirst(row, ['Room', 'room']) || null,
            patientName: pickFirst(row, ['Patient Name', 'patientName']) || null,
            text: sanitizeMedicationObservation(
              pickFirst(row, [
                'Original Message',
                'originalMessage',
                'Suggested Action',
                'suggestedAction',
                'Note',
                'note',
              ]) || '',
            ),
          }))
      : []),
  ].slice(0, 55)

  /** Latest Sheet nursing note per roster patient (text fields only, for board enrichment). */
  const latestSheetNoteByPatient = new Map()
  if (notesR.ok && Array.isArray(notesR.rows) && notesR.rows.length > 0) {
    const sortedNotes = [...notesR.rows].sort(
      (a, b) =>
        String(pickFirst(b, ['date', 'Date', 'createdAt']) || '').localeCompare(
          String(pickFirst(a, ['date', 'Date', 'createdAt']) || ''),
        ) || 0,
    )
    for (const row of sortedNotes) {
      const pid = String(noteRowPatientId(row) || '').trim()
      if (!pid || latestSheetNoteByPatient.has(pid)) continue
      latestSheetNoteByPatient.set(pid, row)
    }
  }

  return {
    ok: true,
    generatedAt,
    sources: {
      telegramMemoryCount: records.length,
      googleSheet: {
        patientsroom: { ok: patientsR.ok, error: patientsR.error, rowCount: patientsR.rowCount },
        nursing_notes: { ok: notesR.ok, error: notesR.error, rowCount: notesR.rowCount },
        turning_schedule: { ok: turningR.ok, error: turningR.error, rowCount: turningR.rowCount },
        rehab_sessions: { ok: rehabR.ok, error: rehabR.error, rowCount: rehabR.rowCount },
        medication_notes: { ok: medNotesR.ok, error: medNotesR.error, rowCount: medNotesR.rowCount },
        shift_handover: { ok: shiftR.ok, error: shiftR.error, rowCount: shiftR.rowCount },
        room_status: { ok: roomStatusR.ok, error: roomStatusR.error, rowCount: roomStatusR.rowCount },
        room_module_nursing_notes: {
          ok: roomModuleNotesR.ok,
          error: roomModuleNotesR.error,
          rowCount: roomModuleNotesR.rowCount,
        },
      },
    },
    emergencies,
    highRiskAlerts,
    roomStatusBoard,
    roomModuleBoard,
    rosterIncludesSamplePlaceholder: false,
    rosterAvailable: patientsR.ok && roster.length > 0,
    rosterCount: roster.length,
    turningSchedule,
    telegramLiveFeed,
    rehabTracking: {
      telegram: rehabTelegram,
      sheetSessions: rehabSheetRows,
    },
    shiftHandoverSummary,
    familyUpdateQueue,
    medicationObservations,
    meta: {
      latestSheetNotesIndexed: latestSheetNoteByPatient.size,
      rosterIncludesSamplePlaceholder: false,
    },
  }
}

export async function buildTelegramDashboardSnapshot() {
  try {
    return await buildTelegramDashboardSnapshotBody()
  } catch (e) {
    console.error('[telegram-dashboard] snapshot failed:', e)
    const now = new Date().toISOString()
    return {
      ok: true,
      generatedAt: now,
      snapshotError: String(e?.message || e),
      sources: {
        telegramMemoryCount: 0,
        googleSheet: {},
      },
      emergencies: [],
      highRiskAlerts: [],
      roomStatusBoard: [],
      roomModuleBoard: [],
      rosterIncludesSamplePlaceholder: false,
      rosterAvailable: false,
      rosterCount: 0,
      turningSchedule: [],
      telegramLiveFeed: [],
      rehabTracking: { telegram: [], sheetSessions: [] },
      shiftHandoverSummary: {
        headline: 'Dashboard snapshot failed — showing empty boards.',
        highPriorityPatients: [],
        pendingTaskCount: 0,
        recentHandoverMessages: [],
        sheetShiftHandoverRows: 0,
      },
      familyUpdateQueue: [],
      medicationObservations: [],
      meta: {
        latestSheetNotesIndexed: 0,
        rosterIncludesSamplePlaceholder: false,
      },
    }
  }
}
