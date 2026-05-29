/**
 * Workflow Engine — Stage 5
 *
 * Drives multi-step question-answer collection for every nursing command.
 * Serialized per chatId:userId with message deduplication.
 */

import {
  getState,
  getSessionKey,
  hasActiveSession,
  patchSession,
  setAwaitingConfirmation,
  clearState,
  withSessionLock,
  beginProcessing,
  finishProcessing,
  setAwaitingReply,
} from './stateManager.js'
import { shouldProcessMessage, markMessageProcessed, withWorkflowLock } from './workflowConcurrency.js'
import { prepareSessionForResume, getPendingStepInfo, registerWorkflowMap } from './workflowResume.js'
import { saveRecord }       from './recordStore.js'
import { saveToSheet }      from './googleSheetService.js'
import { sendToBackend,
         checkBackendConfig } from './backendApiService.js'
import { log }              from '../utils/logger.js'
import { safeSendMessage, escapeHtml } from '../utils/safeMessage.js'
import { setPendingTurningPhoto } from './turningPhotoPendingStore.js'
import {
  htmlWorkflowIntro,
  htmlWorkflowQuestion,
} from '../utils/workflowFormat.js'

import { ADMIT_WORKFLOW }    from '../workflows/admitWorkflow.js'
import { VITALS_WORKFLOW }   from '../workflows/vitalsWorkflow.js'
import { FALL_WORKFLOW }     from '../workflows/fallWorkflow.js'
import { TURNING_WORKFLOW }  from '../workflows/turningWorkflow.js'
import { REHAB_WORKFLOW }    from '../workflows/rehabWorkflow.js'
import { MED_WORKFLOW }      from '../workflows/medWorkflow.js'
import { ALERT_WORKFLOW }    from '../workflows/alertWorkflow.js'

/** @type {Record<string, object>} */
const WORKFLOW_MAP = {
  admit:   ADMIT_WORKFLOW,
  vitals:  VITALS_WORKFLOW,
  fall:    FALL_WORKFLOW,
  turning: TURNING_WORKFLOW,
  rehab:   REHAB_WORKFLOW,
  med:     MED_WORKFLOW,
  alert:   ALERT_WORKFLOW,
}

const HTML = { parse_mode: 'HTML' }
const NURSING_WEB_BASE_URL = (process.env.WMC_NURSING_WEB_URL ?? 'http://localhost:3000').replace(/\/$/, '')

async function safeJsonFetch(url, init = {}) {
  const response = await fetch(url, init)
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error ? String(payload.error) : `HTTP ${response.status}`)
  }
  return payload
}

registerWorkflowMap(WORKFLOW_MAP)

function canAcceptAnswer(state) {
  if (!state) return false
  if (state.processing) return false
  return true
}

export async function startWorkflow(bot, msg, workflow, setStateFn, options = {}) {
  const chatId = msg.chat.id
  const sessionKey = getSessionKey(msg)
  const prefilledData = options?.prefilledData && typeof options.prefilledData === 'object' ? options.prefilledData : {}
  const startStep = Number.isInteger(options?.startStep) ? Math.max(0, Number(options.startStep)) : 0

  if (hasActiveSession(msg)) {
    const existing = getState(msg)
    console.log('[workflow] duplicate prevented', sessionKey, 'active workflow', existing?.workflow, 'step', existing?.step)
    await safeSendMessage(
      bot,
      chatId,
      [
        `⚠️ You already have an active <b>${escapeHtml(existing?.workflow ?? 'workflow')}</b> in progress.`,
        '',
        'Continue answering, or send /cancel to stop before starting a new one.',
      ].join('\n'),
      HTML,
    )
    return
  }

  const total = workflow.steps.length
  const nurseInfo = {
    chatId: String(chatId),
    userId: String(msg.from?.id ?? chatId),
    username: msg.from?.username ?? '',
    firstName: msg.from?.first_name ?? 'Nurse',
  }

  const safeStartStep = Math.min(startStep, Math.max(0, workflow.steps.length - 1))
  const enrichedData =
    workflow.name === 'turning'
      ? {
          ...prefilledData,
          side_turning_session: {
            status: 'collecting',
            current_step: safeStartStep + 1,
            turning_position: String(prefilledData.turning_position ?? prefilledData.position ?? '').trim(),
          },
        }
      : prefilledData
  setStateFn(msg, workflow.name, safeStartStep, enrichedData, nurseInfo)
  console.log('[workflow] started', sessionKey, workflow.name, 'step', safeStartStep, 'field', workflow.steps[safeStartStep]?.key)

  const intro = typeof options?.introText === 'string' && options.introText.trim()
    ? options.introText
    : [
        htmlWorkflowIntro(workflow, total),
        '',
        htmlWorkflowQuestion(safeStartStep + 1, total, workflow.steps[safeStartStep].question),
      ].join('\n')

  const sent = await safeSendMessage(bot, chatId, intro, HTML)
  if (!sent.ok) {
    clearState(msg, 'failed to send first question')
    await safeSendMessage(
      bot,
      chatId,
      '⚠️ Could not start the workflow. Please try /' + workflow.name + ' again.',
      HTML,
    )
    return
  }

  setAwaitingReply(msg, true)
  log.cmd(workflow.name, chatId, msg.from?.username)
}

export async function processAnswer(bot, msg) {
  if (!shouldProcessMessage(msg)) return undefined

  return withWorkflowLock(msg, () => withSessionLock(msg, async () => {
    const chatId = msg.chat.id
    const sessionKey = getSessionKey(msg)
    const state = prepareSessionForResume(msg) ?? getState(msg)
    if (!state) return

    const pending = getPendingStepInfo(state)
    if (pending) {
      console.log(
        '[workflow] current step resumed',
        sessionKey,
        state.workflow,
        'step',
        pending.stepNumber,
        'field',
        pending.field,
      )
    }

    if (state.lastProcessedMessageId === msg.message_id) {
      console.log('[workflow] duplicate prevented', sessionKey, 'message already applied', msg.message_id)
      return
    }

    if (!canAcceptAnswer(state)) {
      console.log(
        '[workflow] duplicate prevented',
        sessionKey,
        'not awaiting reply at step',
        state.step + 1,
        'processing',
        state.processing,
      )
      return
    }

    if (!beginProcessing(msg)) {
      console.log('[workflow] duplicate prevented', sessionKey, 'processing flag set')
      return
    }

    const generationAtStart = state.sessionGeneration ?? 0

    try {
      const text = String(msg.text ?? '').trim()
      const workflow = WORKFLOW_MAP[state.workflow]
      const sessionBefore = getState(msg)
      if (state.workflow === 'turning') {
        console.log("SIDE TURNING STEP BEFORE:", Number(sessionBefore?.step ?? 0) + 1)
        console.log("USER ANSWER:", text)
        console.log("POSITION:", String(sessionBefore?.data?.turning_position ?? sessionBefore?.data?.position ?? ""))
      }

      if (!workflow) {
        clearState(msg, 'unknown workflow')
        await safeSendMessage(bot, chatId, '⚠️ Unknown workflow. Send /start to begin.', HTML)
        return
      }

      if (state.awaitingConfirmation) {
        await _handleConfirmation(bot, msg, text, workflow, state)
        markMessageProcessed(msg)
        finishProcessing(msg, { lastProcessedMessageId: msg.message_id })
        return
      }
      if (state.workflow === 'turning' && String(state?.data?.side_turning_session?.status || '').toLowerCase() === 'confirming') {
        await _handleConfirmation(bot, msg, text, workflow, state)
        markMessageProcessed(msg)
        finishProcessing(msg, { lastProcessedMessageId: msg.message_id })
        return
      }

      const steps = workflow.steps
      const currentIdx = state.step
      const currentStep = steps[currentIdx]

      if (!currentStep) {
        console.log('[workflow] current step', sessionKey, state.workflow, 'missing step index', currentIdx)
        return
      }

      console.log(
        '[workflow] message received',
        sessionKey,
        state.workflow,
        'step',
        currentIdx + 1,
        'field',
        currentStep.key,
        'value',
        text,
      )

      const fresh = getState(msg)
      if (!fresh || (fresh.sessionGeneration ?? 0) !== generationAtStart) {
        console.log('[workflow] duplicate prevented', sessionKey, 'stale generation')
        return
      }

      const newData = { ...fresh.data, [currentStep.key]: text }
      let nextIdx = currentIdx + 1
      while (
        nextIdx < steps.length
        && newData[steps[nextIdx].key] != null
        && String(newData[steps[nextIdx].key]).trim() !== ''
      ) {
        nextIdx += 1
      }

      if (nextIdx < steps.length) {
        const next = steps[nextIdx]
        const total = steps.length
        const sent = await safeSendMessage(
          bot,
          chatId,
          htmlWorkflowQuestion(nextIdx + 1, total, next.question),
          HTML,
        )

        if (!sent.ok) {
          log.error(`[${fresh.workflow}] failed to send next question — kept at step ${currentIdx + 1}`)
          await safeSendMessage(
            bot,
            chatId,
            '⚠️ Could not send the next question. Your workflow is still active — please send your last answer again.',
            HTML,
          )
          setAwaitingReply(msg, true)
          return
        }

        patchSession(msg, {
          step: nextIdx,
          data: newData,
          sessionGeneration: (fresh.sessionGeneration ?? 0) + 1,
          awaitingReply: false,
          processing: false,
          lastProcessedMessageId: fresh.lastProcessedMessageId ?? null,
        })
        const sessionAfter = getState(msg)
        if (state.workflow === 'turning') {
          console.log("SIDE TURNING STEP AFTER:", Number(sessionAfter?.step ?? 0) + 1)
        }
        setAwaitingReply(msg, true)
        finishProcessing(msg, { lastProcessedMessageId: msg.message_id })
        markMessageProcessed(msg)
        console.log('[workflow] answer accepted', sessionKey, currentStep.key, '=', text)
        console.log('[workflow] next question sent', sessionKey, fresh.workflow, 'step', nextIdx + 1)
        log.step(fresh.workflow, nextIdx, chatId)
        return
      }

      const summary = workflow.buildSummary(newData)
      const sent = await safeSendMessage(bot, chatId, summary, HTML)
      if (!sent.ok) {
        log.error(`[${fresh.workflow}] failed to send confirmation summary — kept at step ${currentIdx + 1}`)
        await safeSendMessage(
          bot,
          chatId,
          '⚠️ Could not show the confirmation summary. Please send your last answer again.',
          HTML,
        )
        setAwaitingReply(msg, true)
        return
      }

      const isTurning = state.workflow === 'turning'
      const confirmingData = isTurning
        ? {
            ...newData,
            side_turning_session: {
              status: 'confirming',
              current_step: 'confirm',
              turning_position: String(newData.turning_position ?? newData.position ?? '').trim(),
            },
          }
        : newData
      patchSession(msg, {
        data: confirmingData,
        sessionGeneration: (fresh.sessionGeneration ?? 0) + 1,
        awaitingReply: true,
        awaitingConfirmation: true,
        processing: false,
        lastProcessedMessageId: fresh.lastProcessedMessageId ?? null,
      })
      const sessionAfter = getState(msg)
      if (state.workflow === 'turning') {
        console.log("SIDE TURNING STEP AFTER:", Number(sessionAfter?.step ?? 0) + 1)
      }
      setAwaitingReply(msg, true)
      finishProcessing(msg, { lastProcessedMessageId: msg.message_id })
      markMessageProcessed(msg)
      console.log('[workflow] current step', sessionKey, fresh.workflow, 'awaiting confirmation')
      log.info(`[${workflow.name}] all steps complete — awaiting confirmation chat:${chatId}`)
    } finally {
      const latest = getState(msg)
      if (latest?.processing) {
        finishProcessing(msg)
        if (!latest.awaitingConfirmation) setAwaitingReply(msg, true)
      }
    }
  }))
}

async function _handleConfirmation(bot, msg, text, workflow, state) {
  const chatId = msg.chat.id
  const confirmStatus = String(state?.data?.side_turning_session?.status || (state.awaitingConfirmation ? 'confirming' : 'collecting'))
  console.log("Confirm status:", confirmStatus)
  console.log("Confirm reply:", text)

  if (/^(yes|y)$/i.test(text)) {
    const normalizedStateData = (() => {
      const source = { ...(state.data || {}) }
      const turningPosition = String(source.turning_position ?? source.position ?? '').trim()
      if (turningPosition) {
        source.turning_position = turningPosition
        source.position = turningPosition
      }
      return source
    })()
    const sessionForDebug = { ...state, data: normalizedStateData }
    console.log("Current turning session:", sessionForDebug)
    const nurseInfo = state.nurseInfo ?? {}
    const savedAt = new Date().toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })

    const record = await saveRecord(workflow.name, normalizedStateData, chatId)
    const shortId = record.id.slice(0, 8)

    const sheetResult = await saveToSheet(workflow.name, normalizedStateData, nurseInfo)

    const backendCfg = checkBackendConfig()
    let backendResult = null

    if (backendCfg.ok) {
      backendResult = await sendToBackend(workflow.name, normalizedStateData, nurseInfo, record.id)
    }

    const sheetLine = sheetResult.success
      ? '📊 Google Sheet:  ✅ saved'
      : '📊 Google Sheet:  ❌ failed'

    const backendLine = !backendCfg.ok
      ? null
      : backendResult?.success
        ? '🔗 Backend API:   ✅ synced'
        : '🔗 Backend API:   ❌ sync failed'

    const allOk = sheetResult.success && (backendResult === null || backendResult?.success)
    const statusBlock = [sheetLine, backendLine].filter(Boolean).join('\n')

    let reply
    if (allOk) {
      reply =
        workflow.name === 'turning'
          ? [
              '✅ <b>Side turning record saved</b>',
              '',
              statusBlock,
              '',
              `🕐 Saved at ${escapeHtml(savedAt)}`,
              `🔖 Record ID: ${escapeHtml(shortId)}`,
              '',
              'Send another command when ready.',
            ].join('\n')
          : [
              '✅ <b>Record saved successfully.</b>',
              '',
              statusBlock,
              '',
              `🕐 Saved at ${escapeHtml(savedAt)}`,
              `🔖 Record ID: ${escapeHtml(shortId)}`,
              '',
              'Send another command when ready.',
            ].join('\n')
    } else if (sheetResult.success && backendResult && !backendResult.success) {
      reply = [
        '⚠️ <b>Record saved to Google Sheet.</b>',
        '<b>Backend API sync failed.</b>',
        '',
        statusBlock,
        '',
        '👨‍💼 Admin please check backend server.',
        `🔖 Record ID: ${escapeHtml(shortId)}`,
      ].join('\n')
      log.error(`[${workflow.name}] backend sync failed — chat:${chatId} error:`, backendResult.error)
    } else {
      reply = [
        '⚠️ <b>Record could not be saved to Google Sheet.</b>',
        '',
        statusBlock || '📊 Google Sheet:  ❌ failed',
        '',
        'Please contact admin.',
        `🔖 Local backup ID: ${escapeHtml(shortId)}`,
      ].join('\n')
      log.error(`[${workflow.name}] sheet save failed — chat:${chatId} error:`, sheetResult.error)
    }

    const sent = await safeSendMessage(bot, chatId, reply, HTML)
    if (sent.ok) {
      console.log("Saving side turning record...")
      if (workflow.name === 'turning') {
        const turningTimeRaw = String(state.data?.time ?? '').trim()
        const turningTime = /^now$/i.test(turningTimeRaw) || !turningTimeRaw ? new Date().toISOString() : turningTimeRaw
        const positionRaw = String(normalizedStateData?.turning_position ?? normalizedStateData?.position ?? '').toLowerCase()
        const normalizedPosition =
          positionRaw.includes('right') ? 'right side' :
          positionRaw.includes('supine') ? 'supine' :
          positionRaw.includes('prone') ? 'prone' :
          'left side'
        console.log("Saved turning position:", normalizedPosition)
        const nextDue = (() => {
          const parsed = new Date(turningTime)
          if (Number.isNaN(parsed.getTime())) return new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
          parsed.setHours(parsed.getHours() + 2)
          return parsed.toISOString()
        })()
        const turningPayload = {
          patientName: String(normalizedStateData?.patientName ?? '').trim(),
          room: String(normalizedStateData?.room ?? '').trim(),
          turningTime,
          position: normalizedPosition,
          turning_position: normalizedPosition,
          skinCondition: String(normalizedStateData?.skinCondition ?? '').trim(),
          remark: String(normalizedStateData?.remark ?? '').trim(),
          nurseName: String(nurseInfo?.firstName || nurseInfo?.username || 'Nurse'),
          recordedAt: new Date().toISOString(),
          nextTurningDueAt: nextDue,
          source: 'telegram',
          sourceStatus: 'live',
        }
        safeJsonFetch(`${NURSING_WEB_BASE_URL}/api/turning-records`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(turningPayload),
        })
          .then(async () => {
            await setPendingTurningPhoto(chatId, {
              ...turningPayload,
              recordId: `${Date.now()}`,
              workflow: 'turning',
            })
            await safeSendMessage(
              bot,
              chatId,
              '📷 Upload turning photo now.\n✅ Use LIVE CAMERA capture (preferred)\n⚠️ Gallery images will be flagged and may get penalty.',
              HTML,
            )
          })
          .catch((error) => {
            log.warn('[turning-sync] backend sync error:', error?.message ?? String(error))
          })
      }
      clearState(msg, 'confirmed')
      console.log("Side turning session cleared")
      return
    } else {
      log.error(`[${workflow.name}] saved but confirmation message failed — session kept for chat:${chatId}`)
      setAwaitingReply(msg, true)
      return
    }

    log.info(
      `[confirm] ${workflow.name} | patient:${state.data?.patientName ?? '?'}`
      + ` | sheet:${sheetResult.success ? 'ok' : 'fail'}`
      + ` | backend:${backendResult === null ? 'skipped' : backendResult.success ? 'ok' : 'fail'}`
      + ` | id:${shortId}`,
    )
  } else if (/^(no|cancel)$/i.test(text)) {
    const sent = await safeSendMessage(
      bot,
      chatId,
      workflow.name === 'turning'
        ? [
            '❌ <b>Side turning record cancelled</b>',
            '',
            'Please restart the command whenever you are ready.',
            `Send /${escapeHtml(workflow.name)} to begin again.`,
          ].join('\n')
        : [
            '❌ <b>Record cancelled.</b>',
            '',
            'Please restart the command whenever you are ready.',
            `Send /${escapeHtml(workflow.name)} to begin again.`,
          ].join('\n'),
      HTML,
    )
    if (sent.ok) clearState(msg, 'cancelled by nurse')
    else setAwaitingReply(msg, true)
    log.info(`[${workflow.name}] cancelled by nurse chat:${chatId}`)
    console.log("Side turning session cleared")
    return
  } else {
    await safeSendMessage(
      bot,
      chatId,
      `Please reply <b>yes</b> to save or <b>no</b> to cancel the ${escapeHtml(workflow.title.toLowerCase())} record.`,
      HTML,
    )
    setAwaitingReply(msg, true)
  }
}
