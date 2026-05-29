/**
 * Turning Command Router
 *
 * Session state machine for /turn_right /turn_left /turn_supine /turn_back:
 *
 *   STEP 1  Nurse sends /turn_right [Room N]
 *           → If room in command: skip to STEP 2 immediately
 *           → If no room: set session state=awaiting_room, ask "Please enter room number"
 *
 *   STEP 2  (awaiting_room) Nurse types room number e.g. 201
 *           → Resolve patient, set turningPhotoPending, ask for photo
 *
 *   STEP 3  Nurse sends photo
 *           → Handled by bot.on("photo") in index.js
 *           → AI scoring + save to Google Sheet + web API + reply
 *
 * /turning (no directional) → full multi-step workflow (unchanged)
 */

import { TURNING_WORKFLOW } from '../workflows/turningWorkflow.js'
import { startWorkflow }    from '../services/workflowEngine.js'
import { setState }         from '../services/stateManager.js'
import { log }              from '../utils/logger.js'
import { setPendingTurningPhoto } from '../services/turningPhotoPendingStore.js'
import { setTurningSession, clearTurningSession } from '../services/turningSessionManager.js'
import { getPatientByRoom, normaliseRoom } from '../services/patientRoomService.js'
import { getCachedPatientName } from '../state/sideTurningState.js'
import { safeSendMessage }  from '../utils/safeMessage.js'

const HTML = { parse_mode: 'HTML' }
const D = '─────────────────────────'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Get display name for the nurse from a Telegram message. */
function getNurseName(msg) {
  if (msg.from?.username) return `@${msg.from.username}`
  return msg.from?.first_name ?? 'Nurse'
}

/**
 * Parse command, room number and optional patient name from message text.
 *
 * Accepts:
 *   /turn_right                 → command only
 *   /turn_right Room 1          → command + room
 *   /turn_left 5 Ali            → command + room + patient
 */
function parseSideTurningShortcut(text) {
  const raw = String(text || '').trim()
  const match = raw.match(/^\/(turning|turn_right|turn_left|turn_supine|turn_back)\b\s*(.*)$/i)
  if (!match) return null

  const command = `/${String(match[1] || '').toLowerCase()}`
  const rest = String(match[2] || '').trim()

  const roomMatch = rest.match(/^(?:room\s*)?(\d+)\b\s*(.*)$/i)
  const room = roomMatch ? String(roomMatch[1]) : ''
  const patientInline = roomMatch ? String(roomMatch[2] || '').trim() : ''

  let position = ''
  if (command === '/turn_right')                              position = 'right side'
  else if (command === '/turn_left')                          position = 'left side'
  else if (command === '/turn_supine' || command === '/turn_back') position = 'supine'

  return { command, room, position, patientInline }
}

/**
 * Resolve patient name for a room.
 * Priority: inline text → Google Sheet → cached in-memory → web API turning-records → generic fallback.
 */
async function resolvePatient(room, suppliedInline) {
  if (suppliedInline) return suppliedInline

  // 1. Try Patientsroom Google Sheet tab
  try {
    const fromSheet = await getPatientByRoom(room)
    if (fromSheet) {
      console.log(`[turn-cmd] patient resolved from Google Sheet: "${fromSheet}" for room ${room}`)
      return fromSheet
    }
  } catch (err) {
    log.warn('[turn-cmd] patient sheet lookup failed:', err?.message ?? String(err))
  }

  // 2. Try in-memory cache (from previous turning records this session)
  const cached = getCachedPatientName(room)
  if (cached) {
    console.log(`[turn-cmd] patient resolved from in-memory cache: "${cached}" for room ${room}`)
    return cached
  }

  // 3. Try web API turning-records for the most recent patient in that room
  try {
    const NURSING_WEB = (process.env.WMC_NURSING_WEB_URL ?? 'http://localhost:3000').replace(/\/$/, '')
    console.log(`[turn-cmd] querying web API turning-records for room ${room}...`)
    const res = await fetch(`${NURSING_WEB}/api/turning-records`, {
      signal: AbortSignal.timeout(5000),
    })
    if (res.ok) {
      const body = await res.json().catch(() => null)
      const rows = Array.isArray(body?.data) ? body.data : []
      const normalised = String(room).replace(/\D/g, '')
      const matching = rows
        .filter((r) => String(r.room || '').replace(/\D/g, '') === normalised && r.patientName)
        .sort((a, b) => new Date(b.turningTime ?? 0) - new Date(a.turningTime ?? 0))
      if (matching.length > 0 && matching[0].patientName) {
        const name = String(matching[0].patientName).trim()
        console.log(`[turn-cmd] patient resolved from web API: "${name}" for room ${room}`)
        return name
      }
    }
  } catch (err) {
    log.warn('[turn-cmd] web API patient lookup failed:', err?.message ?? String(err))
    console.warn(`[turn-cmd] web API patient lookup failed: ${err?.message ?? err}`)
  }

  console.warn(`[turn-cmd] patient NOT found for room ${room} — using generic fallback`)
  return `Room ${room} Patient`
}

/** Capitalise first letter of each word. */
function titleCase(str) {
  return String(str || '').replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Build the "please send photo" message string.
 */
function buildPhotoRequestMsg(patientName, room, position) {
  return [
    `📷 <b>Please send turning photo for AI scoring.</b>`,
    D,
    `👤 Patient: ${patientName}`,
    `🏥 Room: ${room}`,
    `🔄 Position: ${titleCase(position)}`,
    D,
    `✅ Use LIVE CAMERA capture (preferred)`,
    `⚠️ Gallery images will be flagged and may get penalty.`,
  ].join('\n')
}

/**
 * Set up the pending photo context (step 2 → step 3).
 * Called either from the command handler (room in command) or handleTurningRoomInput.
 */
async function setupPendingPhoto(chatId, { patientName, room, position, nurseName }) {
  const now = new Date()
  const turningTime = now.toISOString()
  const nextTurningDueAt = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString()
  const recordId = `${Date.now()}`

  await setPendingTurningPhoto(chatId, {
    patientName,
    room,
    position,
    turning_position: position,
    nurseName,
    turningTime,
    nextTurningDueAt,
    recordId,
    skinCondition: '-',
    remark: '-',
    source: 'telegram',
    sourceStatus: 'live',
    workflow: 'turning',
  })

  log.info(`[turning] pending photo set — room:${room} patient:${patientName} nurse:${nurseName} recordId:${recordId}`)
  return { patientName, room, position, nurseName, turningTime, nextTurningDueAt, recordId }
}

// ── Exported: called from index.js when nurse types room number ───────────────

/**
 * Handle a text reply that provides the room number when the session is
 * in state=awaiting_room.  Called by index.js BEFORE the NLP router.
 *
 * @param {import('node-telegram-bot-api').default} bot
 * @param {object} msg  Telegram message
 * @param {object} session  Active turning session from getTurningSession()
 */
export async function handleTurningRoomInput(bot, msg, session) {
  const chatId = msg.chat.id
  const text   = String(msg.text || '').trim()

  console.log(`[turning-session] handleTurningRoomInput — chatId:${chatId} input:"${text}" session:`, JSON.stringify(session))

  // Accept "201", "Room 201", "room201", just a digit string
  const roomMatch = text.match(/^(?:room\s*)?(\d+)\b\s*(.*)$/i)
  if (!roomMatch) {
    // Not a room number — keep session alive, prompt again
    await safeSendMessage(
      bot, chatId,
      `❌ Invalid room number.\n\n🏥 Please enter a room number, e.g. <b>201</b>\n\nSend /cancel to abort.`,
      HTML,
    )
    return
  }

  const room          = normaliseRoom(roomMatch[1])
  const patientInline = String(roomMatch[2] || '').trim()

  log.info(`[turning] room input "${room}" received for ${session.position} session`)
  console.log(`[turning-session] room resolved: "${room}" for position: "${session.position}"`)

  // Resolve patient from sheet / cache
  const patientName = await resolvePatient(room, patientInline)
  console.log(`[turning-session] patient resolved: "${patientName}" for room ${room}`)

  // Transition: clear awaiting_room session → set pending photo
  clearTurningSession(chatId)
  await setupPendingPhoto(chatId, {
    patientName,
    room,
    position:   session.position,
    nurseName:  session.nurseName,
  })

  console.log(`[turning-session] state → awaiting_photo (pending set) — room:${room}`)

  await safeSendMessage(bot, chatId, buildPhotoRequestMsg(patientName, room, session.position), HTML)
}

// ── Registration ──────────────────────────────────────────────────────────────

export function registerTurningCommand(bot) {
  bot.onText(/^\/(turning|turn_right|turn_left|turn_supine|turn_back)\b/i, async (msg) => {
    const chatId = msg.chat.id
    const parsed = parseSideTurningShortcut(msg.text)

    // ── /turning → full multi-step workflow (unchanged) ────────────────────────
    if (!parsed || parsed.command === '/turning') {
      clearTurningSession(chatId)  // clear any stale turning session
      void startWorkflow(bot, msg, TURNING_WORKFLOW, setState)
      return
    }

    const { command, room, position, patientInline } = parsed

    console.log(`[turning-session] command="${command}" room="${room || 'none'}" position="${position}"`)
    log.info(`[turning] ${command} | room="${room || 'none'}" | position="${position}"`)

    // Clear any previous turning session (nurse restarted the workflow)
    clearTurningSession(chatId)

    // ── Directional WITH room → resolve patient → ask for photo directly ───────
    if (room) {
      const normalizedRoom = normaliseRoom(room)
      log.info(`[turning] resolving patient for room ${normalizedRoom}...`)
      const patientName = await resolvePatient(normalizedRoom, patientInline)

      await setupPendingPhoto(chatId, {
        patientName,
        room: normalizedRoom,
        position,
        nurseName: getNurseName(msg),
      })

      console.log(`[turning-session] state → awaiting_photo (room in command) — room:${normalizedRoom}`)
      await safeSendMessage(bot, chatId, buildPhotoRequestMsg(patientName, normalizedRoom, position), HTML)
      return
    }

    // ── Directional WITHOUT room → set awaiting_room session ──────────────────
    const posLabel = titleCase(position)
    const sessionData = {
      chatId:    String(chatId),
      userId:    String(msg.from?.id ?? chatId),
      command,
      position,
      nurseName: getNurseName(msg),
      state:     'awaiting_room',
    }

    setTurningSession(chatId, sessionData)
    console.log(`[turning-session] state → awaiting_room — waiting for room number`)

    await safeSendMessage(
      bot,
      chatId,
      [
        `🔄 <b>Side Turning Record</b>`,
        `Position: ${posLabel}`,
        D,
        `🏥 <b>Please enter room number.</b>`,
        ``,
        `Example: <code>201</code>`,
        ``,
        `Send /cancel to abort.`,
      ].join('\n'),
      HTML,
    )
  })
}
