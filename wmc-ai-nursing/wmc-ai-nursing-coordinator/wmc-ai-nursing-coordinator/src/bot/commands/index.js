/**
 * Command Router — hybrid architecture
 *
 *  /command  → COMMAND ROUTE (onText workflow handlers)
 *  free text → NLP ROUTER first, then WORKFLOW ROUTE if still active
 */

import {
  getState,
  blockIfActiveWorkflow,
  getSessionKey,
} from '../services/stateManager.js'
import { cancelAllSessionStates, CANCEL_FLOW_REPLY } from '../services/sessionReset.js'
import { routeNlpMessage } from '../services/nlpRouter.js'
import { processAnswer }        from '../services/workflowEngine.js'
import { prepareSessionForResume, buildStatusMessage } from '../services/workflowResume.js'
import { patchBotSendMessage, safeSendMessage } from '../utils/safeMessage.js'
import { log }                  from '../utils/logger.js'
import { getPendingTurningPhoto, clearPendingTurningPhoto } from "../services/turningPhotoPendingStore.js"
import { getTurningSession, clearTurningSession } from '../services/turningSessionManager.js'
import { saveSideTurningRecord } from '../services/googleSheetService.js'
import { recordTurn } from '../state/sideTurningState.js'
import { handleVitalsNlp } from '../services/vitalsNlp.js'

import { registerStartCommand }     from './startCommand.js'
import { registerHelpCommand }      from './helpCommand.js'
import { registerAdmitCommand }     from './admitCommand.js'
import { registerVitalsCommand }    from './vitalsCommand.js'
import { registerFallCommand }      from './fallCommand.js'
import { registerTurningCommand, handleTurningRoomInput } from './turningCommand.js'
import { registerRehabCommand }     from './rehabCommand.js'
import { registerMedCommand }       from './medCommand.js'
import { registerAlertCommand }     from './alertCommand.js'
import { registerHandoverCommand }  from './handoverCommand.js'
import { registerOtPayrollCommand }  from './otPayrollCommand.js'
import { registerOtCheckCommand }    from './otCheckCommand.js'
import { registerPunchInCommand }    from './punchInCommand.js'
import { registerPunchOutCommand }   from './punchOutCommand.js'
import { registerOtInCommand }       from './otInCommand.js'
import { registerOtOutCommand }      from './otOutCommand.js'
import { registerAttendanceCommand }   from './attendanceCommand.js'
import { registerOtReportCommand }     from './otReportCommand.js'
import { registerMonthlyOtCommand }      from './monthlyOtCommand.js'
import { registerApproveRejectOtCommands } from './approveRejectOtCommand.js'
import {
  registerSideTurningCommands,
  startOverdueChecker,
} from './sideTurningCommands.js'
import {
  registerInventoryCommands,
  handleInventoryStepIfActive,
} from './inventoryCommands.js'
import { registerAdminStockCommands } from './adminStockCommands.js'
import { startDutyRosterAutoAbsentChecker } from '../services/dutyRosterAttendanceService.js'

const SELF_HANDLED_WORKFLOWS = new Set(['ot_payroll', 'ot_check', 'ot_report', 'inventory', 'admin_stock'])

function installCommandGuard(bot) {
  const originalOnText = bot.onText.bind(bot)
  bot.onText = (regexp, callback) => {
    originalOnText(regexp, async (msg, match) => {
      if (/^\/(start|cancel|status)\b/i.test(String(msg.text ?? ''))) {
        return callback(msg, match)
      }
      if (await blockIfActiveWorkflow(msg, bot)) return
      const cmd = String(msg.text ?? '').split(/\s+/)[0]
      console.log('[COMMAND ROUTE]', cmd)
      log.info('[COMMAND ROUTE]', cmd)
      return callback(msg, match)
    })
  }
}

export function registerAllCommands(bot) {
  if (bot.__wmcCommandsRegistered) {
    log.warn('[bot] registerAllCommands skipped (already registered on this bot instance)')
    return
  }
  bot.__wmcCommandsRegistered = true

  patchBotSendMessage(bot)
  installCommandGuard(bot)

  registerStartCommand(bot)
  registerHelpCommand(bot)

  registerAdmitCommand(bot)
  registerVitalsCommand(bot)
  registerFallCommand(bot)
  registerTurningCommand(bot)
  registerRehabCommand(bot)
  registerMedCommand(bot)
  registerAlertCommand(bot)
  registerHandoverCommand(bot)

  registerOtPayrollCommand(bot)
  registerOtCheckCommand(bot)

  registerPunchInCommand(bot)
  registerPunchOutCommand(bot)
  registerOtInCommand(bot)
  registerOtOutCommand(bot)
  registerAttendanceCommand(bot)
  registerOtReportCommand(bot)
  registerMonthlyOtCommand(bot)
  registerApproveRejectOtCommands(bot)

  registerSideTurningCommands(bot)
  startOverdueChecker(bot)
  startDutyRosterAutoAbsentChecker(bot)

  registerInventoryCommands(bot)
  registerAdminStockCommands(bot)

  bot.on("photo", async (msg) => {
    try {
      const chatId = msg.chat.id
      const pending = await getPendingTurningPhoto(chatId)
      if (!pending) return

      const NURSING_WEB = (process.env.WMC_NURSING_WEB_URL ?? "http://localhost:3000").replace(/\/$/, "")

      // ── Step 1: Resolve photo file path from Telegram ─────────────────────────
      const photos = Array.isArray(msg.photo) ? msg.photo : []
      const largest = photos[photos.length - 1]
      if (!largest?.file_id) {
        await safeSendMessage(bot, chatId, "⚠️ Photo upload failed. Please send a clear turning photo again.")
        return
      }

      const file = await bot.getFile(largest.file_id)
      const photoFilePath = file?.file_path
      if (!photoFilePath) {
        await safeSendMessage(bot, chatId, "⚠️ Could not resolve Telegram photo path. Please retry upload.")
        return
      }

      // ── Step 2: Extract pending context ───────────────────────────────────────
      const patientName    = String(pending.patientName    || "").trim()
      const room           = String(pending.room           || "").trim()
      // Support both pending.turning_position and pending.position
      const turningPosition = String(pending.turning_position || pending.position || "").trim().toLowerCase()
      const nurseName      = String(pending.nurseName || msg.from?.first_name || msg.from?.username || "Nurse")
      const turningTime    = String(pending.turningTime || new Date().toISOString())
      const nextTurningDueAt = pending.nextTurningDueAt
        ? String(pending.nextTurningDueAt)
        : new Date(new Date(turningTime).getTime() + 2 * 60 * 60 * 1000).toISOString()
      const recordId       = String(pending.recordId || `${Date.now()}`)
      const skinCondition  = String(pending.skinCondition || "-")
      const remark         = String(pending.remark || "-")

      log.info(`[turning-photo] photo received — room:${room} patient:${patientName} position:${turningPosition} nurse:${nurseName}`)

      // ── Step 3: Acknowledge receipt immediately ───────────────────────────────
      await safeSendMessage(
        bot,
        chatId,
        `📷 Photo received. AI scoring in progress...\n\nPatient: ${patientName}\nRoom: ${room}\nPosition: ${turningPosition.replace(/\b\w/g, (c) => c.toUpperCase())}`,
      )

      // ── Step 4: POST to AI scoring endpoint (35-second timeout) ─────────────
      log.info(`[turning-photo] ── photo received ── room:${room} patient:${patientName} nurse:${nurseName}`)
      log.info(`[turning-photo] telegram file downloaded — fileId:${largest.file_id} filePath:${photoFilePath}`)
      log.info(`[turning-photo] OpenAI request started — calling /api/turning-photo-assessments recordId:${recordId}`)
      console.log(`[turning-photo] STEP4 calling AI scoring — room:${room} filePath:${photoFilePath}`)

      const scoringController = new AbortController()
      const scoringTimeout = setTimeout(() => {
        scoringController.abort()
        log.error('[turning-photo] AI scoring timed out after 35 seconds')
        console.error('[turning-photo] AI SCORING TIMED OUT after 35 seconds')
      }, 35_000)

      let scoringResponse, scoringPayload
      try {
        scoringResponse = await fetch(`${NURSING_WEB}/api/turning-photo-assessments`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            recordId,
            patientName,
            room,
            nurseName,
            turningPosition,
            turningTime,
            photoFileId: largest.file_id,
            photoFilePath,
            source: "telegram",
            uploadSourceHint: "unknown",
          }),
          signal: scoringController.signal,
        })
        clearTimeout(scoringTimeout)
        scoringPayload = await scoringResponse.json().catch(() => null)
        log.info(`[turning-photo] OpenAI response received — http:${scoringResponse.status} scoringStatus:${scoringPayload?.data?.scoringStatus}`)
        console.log(`[turning-photo] STEP4 response — ok:${scoringResponse.ok} scoringStatus:${scoringPayload?.data?.scoringStatus} error:${scoringPayload?.error ?? 'none'}`)
      } catch (fetchErr) {
        clearTimeout(scoringTimeout)
        const reason = fetchErr?.name === 'AbortError'
          ? 'AI scoring timed out after 35 seconds'
          : (fetchErr?.message ?? String(fetchErr))
        log.error(`[turning-photo] AI scoring fetch failed: ${reason}`)
        console.error(`[turning-photo] STEP4 fetch error: ${reason}`)

        // Save to Google Sheet and update state even on timeout
        try {
          await saveSideTurningRecord({ timestamp: turningTime, room_number: room, patient_name: patientName, turning_position: turningPosition, nurse_name: nurseName, next_turning_due: nextTurningDueAt, status: 'OK', source: 'telegram' })
        } catch { /* ignore */ }
        try { recordTurn(room, (() => { const p = turningPosition.toLowerCase(); if (p.includes('right')) return 'RIGHT'; if (p.includes('left')) return 'LEFT'; if (p.includes('supine') || p.includes('back')) return 'SUPINE'; return 'LEFT' })(), patientName, nurseName, chatId) } catch { /* ignore */ }
        await clearPendingTurningPhoto(chatId)
        await safeSendMessage(bot, chatId, [
          `✅ Turning record saved.`,
          `👤 Patient: ${patientName}`,
          `🏥 Room: ${room}`,
          `🔄 Position: ${turningPosition.replace(/\b\w/g, (c) => c.toUpperCase())}`,
          ``,
          `⚠️ AI scoring failed: ${reason}`,
          `Use dashboard to retry.`,
        ].join('\n'))
        return
      }

      // ── Step 5: Save turning record to Google Sheet (regardless of AI result) ─
      const statePosition = (() => {
        const p = turningPosition.toLowerCase()
        if (p.includes('right'))  return 'RIGHT'
        if (p.includes('left'))   return 'LEFT'
        if (p.includes('supine') || p.includes('back')) return 'SUPINE'
        if (p.includes('prone'))  return 'PRONE'
        return 'LEFT'
      })()

      try {
        await saveSideTurningRecord({
          timestamp:        turningTime,
          room_number:      room,
          patient_name:     patientName,
          turning_position: turningPosition,
          nurse_name:       nurseName,
          next_turning_due: nextTurningDueAt,
          status:           'OK',
          source:           'telegram',
        })
        log.info(`[turning-photo] scoring saved (Google Sheet) — room:${room}`)
        console.log(`[turning-photo] STEP5 scoring saved to Google Sheet — room:${room} patient:${patientName}`)
      } catch (sheetErr) {
        log.warn("[turning-photo] Google Sheet save failed:", sheetErr?.message ?? String(sheetErr))
        console.warn(`[turning-photo] STEP5 Google Sheet save FAILED: ${sheetErr?.message ?? sheetErr}`)
      }

      // ── Step 6: Save turning record to web API ────────────────────────────────
      try {
        const webResponse = await fetch(`${NURSING_WEB}/api/turning-records`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            recordId,
            patientName,
            room,
            turningTime,
            position: turningPosition,
            nurseName,
            skinCondition,
            remark,
            recordedAt: turningTime,
            nextTurningDueAt,
            source: "telegram",
            sourceStatus: "live",
          }),
        })
        const webPayload = await webResponse.json().catch(() => null)
        if (webResponse.ok && webPayload?.ok) {
          log.info(`[turning-photo] dashboard updated — turning-records saved OK room:${room}`)
          console.log(`[turning-photo] STEP6 dashboard updated — room:${room} recordId:${recordId}`)
        } else {
          log.warn("[turning-photo] web API turning-records save failed:", webPayload?.error ?? `HTTP ${webResponse.status}`)
          console.warn(`[turning-photo] STEP6 dashboard save FAILED: ${webPayload?.error ?? `HTTP ${webResponse.status}`}`)
        }
      } catch (webErr) {
        log.warn("[turning-photo] web API save error:", webErr?.message ?? String(webErr))
        console.warn(`[turning-photo] STEP6 web API error: ${webErr?.message ?? webErr}`)
      }

      // ── Step 7: Update in-memory turning state (for overdue checker) ─────────
      try {
        recordTurn(room, statePosition, patientName, nurseName, chatId)
        log.info(`[turning-photo] in-memory state updated — room:${room} position:${statePosition}`)
      } catch (stateErr) {
        log.warn("[turning-photo] in-memory state update failed:", stateErr?.message ?? String(stateErr))
      }

      // ── Step 8: Clear pending and reply with score ─────────────────────────────
      await clearPendingTurningPhoto(chatId)

      if (!scoringResponse.ok || !scoringPayload?.ok) {
        // Turning record saved, but AI scoring failed
        const errMsg = scoringPayload?.error ? `: ${scoringPayload.error}` : ""
        log.warn(`[turning-photo] AI scoring failed — replying with error: ${errMsg}`)
        console.warn(`[turning-photo] STEP8 AI scoring failed: ${errMsg}`)
        await safeSendMessage(
          bot,
          chatId,
          [
            "✅ Turning record saved.",
            `👤 Patient: ${patientName}`,
            `🏥 Room: ${room}`,
            `🔄 Position: ${turningPosition.replace(/\b\w/g, (c) => c.toUpperCase())}`,
            `⏭ Next due: ${new Date(nextTurningDueAt).toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit", hour12: true })}`,
            ``,
            `⚠️ AI scoring failed${errMsg}. Use dashboard to retry.`,
          ].join("\n"),
        )
        return
      }

      const scored = scoringPayload.data
      const scoringStatus = String(scored?.scoringStatus || "FAILED")
      const overallScore  = Number(scored?.overallScore || 0)
      const allowance     = Number(scored?.allowanceEarned || 0)
      const scoreReason   = String(scored?.scoreReason || "")
      const verifyResult  = String(scored?.verificationResult || "warning")

      const nextDueStr = new Date(nextTurningDueAt).toLocaleTimeString("en-MY", {
        hour: "2-digit", minute: "2-digit", hour12: true,
      })

      const lines = [
        scoringStatus === "SUCCESS" ? "✅ Turning photo saved and AI scored." : "✅ Turning record saved.",
        `─────────────────────────`,
        `👤 Patient: ${patientName}`,
        `🏥 Room: ${room}`,
        `🔄 Position: ${turningPosition.replace(/\b\w/g, (c) => c.toUpperCase())}`,
        `👩‍⚕️ Nurse: ${nurseName}`,
        `⏭ Next due: ${nextDueStr} (+2 hrs)`,
      ]

      if (scoringStatus === "SUCCESS") {
        lines.push(
          `─────────────────────────`,
          `🤖 AI Score: ${overallScore}/100`,
          `💰 Allowance earned: RM ${allowance.toFixed(2)}`,
          scoreReason ? `📝 Remarks: ${scoreReason}` : "",
          `🔍 Verification: ${verifyResult}`,
          `⏳ Supervisor review: pending`,
        )
      } else {
        lines.push(
          ``,
          `⚠️ AI scoring failed. Use dashboard to retry.`,
        )
      }

      if (scoringStatus === "SUCCESS") {
        log.info(`[turning-photo] JSON parsed — overallScore:${overallScore} allowance:${allowance} remarks:"${scoreReason}"`)
        console.log(`[turning-photo] STEP8 JSON parsed — score:${overallScore}/100 allowance:RM${allowance} remarks:${scoreReason}`)
      }
      await safeSendMessage(bot, chatId, lines.filter((l) => l !== "").join("\n"))
      log.info(`[turning-photo] ── complete ── room:${room} scoringStatus:${scoringStatus} score:${overallScore} allowance:RM${allowance}`)
      console.log(`[turning-photo] STEP8 reply sent — scoringStatus:${scoringStatus} score:${overallScore} allowance:RM${allowance}`)
    } catch (error) {
      log.error("[turning-photo] processing failed:", error?.message || error)
      console.error(`[turning-photo] UNHANDLED ERROR: ${error?.message ?? error}`)
    }
  })

  bot.onText(/^\/status\b/i, async (msg) => {
    const chatId = msg.chat.id
    const state = prepareSessionForResume(msg) ?? getState(msg)
    if (!state) {
      await safeSendMessage(bot, chatId, 'No active workflow. Send /help for commands.', { parse_mode: 'HTML' })
      return
    }
    await safeSendMessage(bot, chatId, buildStatusMessage(state), { parse_mode: 'HTML' })
  })

  bot.onText(/^\/cancel\b/i, async (msg) => {
    const chatId = msg.chat.id
    const state = getState(msg)
    log.info('[COMMAND ROUTE] /cancel')
    console.log('[COMMAND ROUTE] /cancel')
    await cancelAllSessionStates(msg)
    // Also clear turning session and pending photo
    clearTurningSession(chatId)
    await clearPendingTurningPhoto(chatId).catch(() => {})
    console.log(`[turning-session] CLEARED via /cancel — chatId:${chatId}`)
    await bot.sendMessage(chatId, CANCEL_FLOW_REPLY)
    if (state) {
      log.info(`[cancel] workflow "${state.workflow ?? state.flow}" cancelled by ${getSessionKey(msg)}`)
    }
  })

  // ── Hybrid free-text router ───────────────────────────────────────────────
  //   Priority rules (command mode wins over NLP):
  //     1. "/..."           → command (handled by onText, returns early here)
  //     2. active session   → continue command flow, NLP disabled
  //     3. no session       → NLP parser (vitals / med / inventory / note / handover)
  //   The command session is only cleared when the workflow completes or /cancel.
  bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/')) return

    const chatId  = msg.chat.id
    const nurseNameStr = msg.from?.first_name ?? msg.from?.username ?? 'Nurse'

    // ── Determine whether a command session is currently active ───────────────
    const turnSession = getTurningSession(chatId)
    const turnActive = Boolean(turnSession && turnSession.state === 'awaiting_room')
    const state = getState(msg)
    const activeSession = turnActive || Boolean(state)

    console.log(`[ROUTER] activeSession = ${activeSession}`)
    log.info(`[ROUTER] activeSession = ${activeSession}`)

    // ════════════════════════════════════════════════════════════════════════
    // COMMAND MODE — an active session has priority; NLP is disabled.
    // ════════════════════════════════════════════════════════════════════════
    if (activeSession) {
      console.log('[ROUTER] mode = COMMAND')
      log.info('[ROUTER] mode = COMMAND')

      // Turning session: capture room-number reply
      if (turnActive) {
        console.log(`[turning-session] text intercepted — chatId:${chatId} state:${turnSession.state} input:"${msg.text}"`)
        await handleTurningRoomInput(bot, msg, turnSession)
        return
      }

      // Inventory step-by-step flow
      if (await handleInventoryStepIfActive(bot, msg)) {
        console.log('[WORKFLOW ROUTE] inventory step')
        log.info('[WORKFLOW ROUTE] inventory step')
        return
      }

      // Other self-handled modules (ot_payroll, ot_check, ot_report, admin_stock)
      if (state && SELF_HANDLED_WORKFLOWS.has(state.workflow)) return

      // Nursing command forms (/admit, /fall, …)
      if (state) {
        console.log('[WORKFLOW ROUTE]', state.workflow ?? state.flow, 'step', state.step)
        log.info('[WORKFLOW ROUTE]', state.workflow ?? state.flow, 'step', state.step)
        prepareSessionForResume(msg)
        await processAnswer(bot, msg)
        return
      }

      // Safety: active session but nothing consumed the message — wait for input.
      return
    }

    // ════════════════════════════════════════════════════════════════════════
    // NLP MODE — no active session.
    // ════════════════════════════════════════════════════════════════════════
    console.log('[ROUTER] mode = NLP')
    log.info('[ROUTER] mode = NLP')

    // Vital signs (labelled, no patient name) — handled first.
    if (await handleVitalsNlp(bot, msg, nurseNameStr)) {
      console.log('[NLP ROUTE] vitals')
      log.info('[NLP ROUTE] vitals')
      return
    }

    // General NLP: medication, inventory, nursing note, handover, side turning…
    const nlpResult = await routeNlpMessage({
      text: msg.text,
      msg,
      bot,
      chatId,
      nurseName: nurseNameStr,
      clearWorkflowOnNursing: false,
    })
    if (nlpResult.handled) {
      console.log('[NLP ROUTE]', nlpResult.route ?? 'nursing')
      log.info('[NLP ROUTE]', nlpResult.route ?? 'nursing')
      return
    }

    // Unrecognised free text
    await bot.sendMessage(
      chatId,
      '💬 Type a nursing note naturally, e.g.\n' +
      '`Room 2 Ali poor appetite`\n\n' +
      'Or start a command: /vitals /admit /pampers /help',
      { parse_mode: 'Markdown' },
    )
  })

  console.log('[bot] hybrid router active — NLP + commands + workflows')
  log.info('[bot] hybrid router active — NLP + commands + workflows')
}
