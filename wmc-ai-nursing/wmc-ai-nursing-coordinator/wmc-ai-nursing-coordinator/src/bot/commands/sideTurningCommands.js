/**
 * Side Turning Quick Commands
 *
 * /turn_left    [Room] NUMBER [PatientName]
 * /turn_right   [Room] NUMBER [PatientName]
 * /turn_supine  [Room] NUMBER [PatientName]
 * /turn_done    [Room] NUMBER [PatientName]
 * /turn_status  [[Room] NUMBER]
 *
 * Patient resolution order (no hardcoding):
 *   1. Name supplied inline by the nurse in the command text
 *   2. Live lookup from "Patientsroom" Google Sheet tab (cached 5 min)
 *   3. Last name recorded for this room (in-memory state, survives restarts)
 *   4. Fallback label "Room X Patient"
 *
 * All position commands are single-shot — no multi-step workflow.
 * The overdue checker fires every 15 min and reminds nurses for any
 * room that is DUE or OVERDUE.
 */

import { log }                   from '../utils/logger.js'
import { saveSideTurningRecord } from '../services/googleSheetService.js'
import { getLastTurningFromSheet } from '../services/sideTurningSheetService.js'
import { getPatientByRoom, normaliseRoom, getAllRoomAssignments } from '../services/patientRoomService.js'
import {
  recordTurn,
  getRoomState,
  getAllRooms,
  getCachedPatientName,
  computeStatus,
} from '../state/sideTurningState.js'

// ── Constants ─────────────────────────────────────────────────────────────────

const OVERDUE_CHECK_INTERVAL_MS = 5 * 60 * 1000   // 5 minutes
const D = '─────────────────────────'
const NURSING_WEB_BASE_URL = (process.env.WMC_NURSING_WEB_URL ?? 'http://localhost:3000').replace(/\/$/, '')

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Return the nurse's display name from a Telegram message. */
function nurseName(msg) {
  if (msg.from?.username) return `@${msg.from.username}`
  return msg.from?.first_name ?? 'Nurse'
}

/**
 * Parse room number and optional patient name from a command text.
 *
 * Accepts all of:
 *   /turn_left Room 2
 *   /turn_left room 2
 *   /turn_left room2
 *   /turn_left 2
 *   /turn_left Room 10 Ali
 *   /turn_left 5 Siti Binti Hamid
 *
 * Returns { room: string|null, patient: string }
 * room is the normalised numeric string (e.g. "2", "10").
 */
function parseRoomAndPatient(text) {
  const body = text.replace(/^\/\w+\s*/i, '').trim()
  // Match optional "room" prefix followed by digits
  const roomMatch = body.match(/^(?:room\s*)?(\d+)\s*/i)
  if (!roomMatch) return { room: null, patient: '' }
  const room    = normaliseRoom(roomMatch[1])
  const patient = body.slice(roomMatch[0].length).trim()
  return { room, patient }
}

/** Format an ISO timestamp as a 12-hour time string (MY locale). */
function fmtTime(isoString) {
  if (!isoString) return '—'
  try {
    return new Date(isoString).toLocaleTimeString('en-MY', {
      hour:   '2-digit',
      minute: '2-digit',
      hour12: true,
    })
  } catch {
    return isoString
  }
}

/** Emoji status indicator. */
function statusIcon(status) {
  if (status === 'OK')      return '✅'
  if (status === 'DUE')     return '⚠️'
  if (status === 'OVERDUE') return '🔴'
  return '❓'
}

function normalizeTurningPositionLabel(position) {
  const value = String(position || '').toUpperCase()
  if (value === 'LEFT') return 'left side'
  if (value === 'RIGHT') return 'right side'
  if (value === 'SUPINE') return 'supine'
  if (value === 'PRONE') return 'prone'
  return 'left side'
}

async function syncToNursingWebTurning(state) {
  try {
    const response = await fetch(`${NURSING_WEB_BASE_URL}/api/turning-records`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        patientName: state.patient_name,
        room: state.room_number,
        turningTime: state.timestamp,
        position: normalizeTurningPositionLabel(state.position),
        nurseName: state.nurse_name,
        recordedAt: state.timestamp,
        nextTurningDueAt: state.next_due,
        source: 'telegram',
        sourceStatus: 'live',
      }),
    })
    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      log.warn(`[turn-sync] web sync failed room ${state.room_number}: ${errorText.slice(0, 120)}`)
      return
    }
    log.info(`[turn-sync] web turning synced room ${state.room_number} ${state.position}`)
  } catch (error) {
    log.warn('[turn-sync] web turning sync error:', error?.message ?? String(error))
  }
}

// ── Patient resolver ──────────────────────────────────────────────────────────

/**
 * Resolve the patient name for a room using four sources in priority order.
 *
 * @param {string} room            normalised room number string
 * @param {string} suppliedInline  name typed by the nurse (may be empty)
 * @returns {Promise<string>}
 */
async function resolvePatient(room, suppliedInline) {
  // 1. Nurse supplied it in the command text
  if (suppliedInline) return suppliedInline

  // 2. Live Patientsroom sheet lookup (cached 5 min)
  try {
    const fromSheet = await getPatientByRoom(room)
    if (fromSheet) return fromSheet
  } catch (err) {
    log.warn('[turn-cmd] patient sheet lookup failed:', err.message)
  }

  // 3. Last name we stored for this room in state (survives restarts)
  const cached = getCachedPatientName(room)
  if (cached) return cached

  // 4. Generic fallback
  return `Room ${room} Patient`
}

// ── Reply builders ────────────────────────────────────────────────────────────

function buildTurnRecordedReply(state) {
  const posLabel = state.position === 'DONE' ? 'DONE ✔' : state.position
  return [
    `✅ *Side Turning Recorded*`,
    D,
    `🏥 Room: ${state.room_number}`,
    `👤 Patient: ${state.patient_name}`,
    `🔄 Position: ${posLabel}`,
    `👩‍⚕️ Nurse: ${state.nurse_name}`,
    `⏰ Recorded: ${fmtTime(state.timestamp)}`,
    `⏭ Next Turning Due: *${fmtTime(state.next_due)}* (+2 hours)`,
    D,
    `_Record saved to Google Sheet._`,
  ].join('\n')
}

function buildRoomStatusReply(state) {
  const icon     = statusIcon(state.status)
  const posLabel = state.position === 'DONE' ? 'DONE ✔' : state.position
  return [
    `🔄 *Turning Status — Room ${state.room_number}*`,
    D,
    `👤 Patient: ${state.patient_name}`,
    `🔄 Last Position: ${posLabel}`,
    `🕐 Last Time: ${fmtTime(state.timestamp)}`,
    `⏭ Next Due: ${fmtTime(state.next_due)}`,
    `${icon} Status: *${state.status}*`,
  ].join('\n')
}

function buildAllRoomsStatusReply(rooms, sheetAssignments) {
  // Merge in-memory records + sheet assignments
  const roomMap = new Map()

  // Sheet assignments as baseline (all active patients)
  for (const { room, patient } of sheetAssignments) {
    roomMap.set(room, { room_number: room, patient_name: patient, status: 'NO RECORD', position: '—', timestamp: null, next_due: null })
  }

  // Overlay with live state (has actual turn data)
  for (const s of rooms) {
    roomMap.set(s.room_number, s)
  }

  const entries = [...roomMap.values()].sort((a, b) => {
    const na = Number(a.room_number), nb = Number(b.room_number)
    if (!isNaN(na) && !isNaN(nb)) return na - nb
    return String(a.room_number).localeCompare(String(b.room_number))
  })

  if (entries.length === 0) {
    return (
      '📋 No room records found.\n\n' +
      'Ensure the *Patientsroom* sheet tab has room assignments, then send:\n' +
      '/turn_left Room 1'
    )
  }

  const lines = ['🔄 *Side Turning Status — All Rooms*', D]
  for (const s of entries) {
    const icon = statusIcon(s.status)
    if (s.status === 'NO RECORD') {
      lines.push(`${icon} Room ${s.room_number} | ${s.patient_name} | No turn recorded yet`)
    } else {
      lines.push(
        `${icon} Room ${s.room_number} | ${s.patient_name} | ${s.position} @ ${fmtTime(s.timestamp)} → Due ${fmtTime(s.next_due)}`
      )
    }
  }
  return lines.join('\n')
}

function buildOverdueReminderReply(state) {
  const icon = statusIcon(state.status)
  return [
    `${icon} *Turning Reminder*`,
    D,
    `🏥 Room: ${state.room_number}`,
    `👤 Patient: ${state.patient_name}`,
    `Last turned *${state.position}* at ${fmtTime(state.timestamp)}`,
    `⏭ Was due at: *${fmtTime(state.next_due)}* — now *${state.status}*`,
    ``,
    `Please turn the patient and record with one of:`,
    `/turn_left Room ${state.room_number}`,
    `/turn_right Room ${state.room_number}`,
    `/turn_supine Room ${state.room_number}`,
  ].join('\n')
}

// ── Core turn handler ─────────────────────────────────────────────────────────

/**
 * Shared handler for /turn_left, /turn_right, /turn_supine, /turn_done.
 */
async function handleTurnCommand(bot, msg, position) {
  const chatId = msg.chat.id
  const text   = msg.text ?? ''
  const { room, patient: suppliedPatient } = parseRoomAndPatient(text)

  if (!room) {
    const cmd = position.toLowerCase()
    return bot.sendMessage(
      chatId,
      `❌ Please include a room number.\n\nExamples:\n` +
      `/turn_${cmd} Room 1\n/turn_${cmd} Room 10\n/turn_${cmd} 5`,
    )
  }

  // Resolve patient from Patientsroom sheet (or fallback chain)
  const patientName = await resolvePatient(room, suppliedPatient)
  const nurse       = nurseName(msg)
  const state       = recordTurn(room, position, patientName, nurse, chatId)

  // Non-blocking sheet save
  saveSideTurningRecord({
    timestamp:        state.timestamp,
    room_number:      state.room_number,
    patient_name:     state.patient_name,
    turning_position: state.position,
    nurse_name:       state.nurse_name,
    next_turning_due: state.next_due,
    status:           state.status,
    source:           'telegram',
  }).catch((err) => log.error('[turn-cmd] sheet save error:', err.message))
  syncToNursingWebTurning(state).catch(() => {})

  await bot.sendMessage(chatId, buildTurnRecordedReply(state), { parse_mode: 'Markdown' })
  log.info(`[turn-cmd] ${position} — room ${room} (${patientName}) by ${nurse}`)
}

// ── /turn_status handler ──────────────────────────────────────────────────────

async function handleTurnStatus(bot, msg) {
  const chatId       = msg.chat.id
  const text         = msg.text ?? ''
  const { room }     = parseRoomAndPatient(text)

  if (!room) {
    // Show all rooms: merge sheet assignments + in-memory state
    const [rooms, sheetAssignments] = await Promise.all([
      Promise.resolve(getAllRooms()),
      getAllRoomAssignments().catch(() => []),
    ])
    return bot.sendMessage(
      chatId,
      buildAllRoomsStatusReply(rooms, sheetAssignments),
      { parse_mode: 'Markdown' },
    )
  }

  // Single room lookup — try in-memory state first
  let state = getRoomState(room)

  if (!state) {
    // Try to resolve patient for context even without a turn record
    const [patient, sheetRecord] = await Promise.all([
      resolvePatient(room, ''),
      getLastTurningFromSheet(room).catch(() => null),
    ])

    if (sheetRecord) {
      // Re-hydrate from last sheet record with live-computed status
      const fakeState = {
        ...sheetRecord,
        room_number:  String(sheetRecord.room_number || room),
        patient_name: patient || sheetRecord.patient_name || `Room ${room} Patient`,
        next_due:     sheetRecord.next_turning_due ?? null,
        status:       sheetRecord.next_turning_due
          ? computeStatus({ next_due: sheetRecord.next_turning_due })
          : 'UNKNOWN',
      }
      return bot.sendMessage(chatId, buildRoomStatusReply(fakeState), { parse_mode: 'Markdown' })
    }

    // No record at all — still show who's in the room
    const noRecord = patient && patient !== `Room ${room} Patient`
      ? `ℹ️ *Room ${room}*\nPatient: ${patient}\n\nNo turning record yet.\n\nRecord a turn:\n/turn_left Room ${room}`
      : `ℹ️ No record found for Room ${room}.\n\nRecord a turn:\n/turn_left Room ${room}`
    return bot.sendMessage(chatId, noRecord, { parse_mode: 'Markdown' })
  }

  // State exists — refresh patient name from sheet (room may have new patient)
  try {
    const freshPatient = await getPatientByRoom(room)
    if (freshPatient && freshPatient !== state.patient_name) {
      state = { ...state, patient_name: freshPatient }
    }
  } catch { /* non-fatal */ }

  await bot.sendMessage(chatId, buildRoomStatusReply(state), { parse_mode: 'Markdown' })
}

// ── Registration ──────────────────────────────────────────────────────────────

/**
 * Trigger the web backend to scan overdue turning records and send Telegram
 * group alerts. Shared by the manual /send_overdue_alerts command and the
 * background checker. Returns the backend summary object (or null on error).
 *
 * @param {{ source: string }} [opts]
 * @returns {Promise<object|null>}
 */
async function triggerOverdueAlerts({ source = 'auto' } = {}) {
  log.info(`[overdue-checker] overdue check started (source: ${source})`)
  console.log(`[overdue-checker] overdue check started (source: ${source})`)
  try {
    const response = await fetch(`${NURSING_WEB_BASE_URL}/api/turning-records/alerts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok || !payload?.ok) {
      const reason = payload?.error ? String(payload.error) : `HTTP ${response.status}`
      log.error(`[overdue-checker] failed alert reason: ${reason}`)
      console.error(`[overdue-checker] failed alert reason: ${reason}`)
      return null
    }
    const data = payload.data || {}
    log.info(
      `[overdue-checker] overdue:${Number(data.overdue || 0)} sent:${Number(data.sent || 0)} ` +
        `normal:${Number(data.normalSent || 0)} critical:${Number(data.criticalSent || 0)} ` +
        `supervisor:${Number(data.supervisorSent || 0)} skipped:${Number(data.skippedDuplicate || 0)} ` +
        `failed:${Number(data.failed || 0)}`,
    )
    console.log(
      `[overdue-checker] overdue:${Number(data.overdue || 0)} sent:${Number(data.sent || 0)} ` +
        `critical:${Number(data.criticalSent || 0)} supervisor:${Number(data.supervisorSent || 0)} ` +
        `skipped:${Number(data.skippedDuplicate || 0)} failed:${Number(data.failed || 0)}`,
    )
    return data
  } catch (err) {
    log.error('[overdue-checker] failed alert reason (fetch):', err?.message ?? String(err))
    console.error('[overdue-checker] failed alert reason (fetch):', err?.message ?? String(err))
    return null
  }
}

export function registerSideTurningCommands(bot) {
  // /turn_left /turn_right /turn_supine /turn_back are routed by turningCommand.js
  // into the shared /turning multi-step workflow to avoid command conflicts.
  bot.onText(/^\/turn_done\b/i,   (msg) => handleTurnCommand(bot, msg, 'DONE'))
  bot.onText(/^\/turn_status\b/i, (msg) => handleTurnStatus(bot, msg))

  // Manual trigger: scan overdue turning records and send group alerts now.
  bot.onText(/^\/send_overdue_alerts\b/i, async (msg) => {
    const chatId = msg.chat.id
    await bot.sendMessage(chatId, '🔍 Checking overdue turning records...')
    const data = await triggerOverdueAlerts({ source: 'manual command' })
    if (!data) {
      await bot.sendMessage(chatId, '❌ Could not run overdue alert check. Is the dashboard backend running?')
      return
    }
    await bot.sendMessage(
      chatId,
      [
        '✅ Overdue alert check complete',
        D,
        `Overdue records: ${Number(data.overdue || 0)}`,
        `Alerts sent: ${Number(data.sent || 0)}`,
        `Skipped (already alerted): ${Number(data.skippedDuplicate || 0)}`,
        `Failed: ${Number(data.failed || 0)}`,
      ].join('\n'),
    )
  })

  log.info('[bot] side turning commands registered (/turn_done /turn_status /send_overdue_alerts) — directional commands routed to /turning workflow')
}

// ── Overdue checker ───────────────────────────────────────────────────────────

let _overdueInterval = null

/**
 * Start the background overdue turn checker (fires every 5 min).
 * Triggers the web backend to scan turning records with status="overdue"
 * (alertSent != true) and send a Telegram group alert for each.
 *
 * @param {import('node-telegram-bot-api').default} bot
 */
export function startOverdueChecker(bot) {
  if (_overdueInterval) return   // already started

  // ── ENV check (#9) — clear terminal error if Telegram config is missing ──
  const token  = String(process.env.TELEGRAM_BOT_TOKEN ?? '').trim()
  const chatId = String(process.env.TELEGRAM_CHAT_ID ?? '').trim()
  if (!token) {
    log.error('[Scheduler] ERROR: TELEGRAM_BOT_TOKEN is missing — overdue alerts cannot be sent. Set it in .env')
    console.error('[Scheduler] ERROR: TELEGRAM_BOT_TOKEN is missing — overdue alerts cannot be sent. Set it in .env')
  }
  if (!chatId) {
    log.error('[Scheduler] ERROR: TELEGRAM_CHAT_ID is missing — overdue alerts cannot be sent. Set it in .env')
    console.error('[Scheduler] ERROR: TELEGRAM_CHAT_ID is missing — overdue alerts cannot be sent. Set it in .env')
  }

  // ── Auto-start (#10) — runs on `npm run telegram`, no manual trigger ──────
  console.log('[Scheduler] Started')
  log.info('[Scheduler] Started — automatic overdue turning checker, interval 5 min')

  const runCheck = () => {
    void triggerOverdueAlerts({ source: '5-min background checker' })
  }

  // Run once shortly after startup, then every 5 minutes.
  setTimeout(runCheck, 30 * 1000)
  _overdueInterval = setInterval(runCheck, OVERDUE_CHECK_INTERVAL_MS)
}

export function stopOverdueChecker() {
  if (_overdueInterval) {
    clearInterval(_overdueInterval)
    _overdueInterval = null
  }
}
