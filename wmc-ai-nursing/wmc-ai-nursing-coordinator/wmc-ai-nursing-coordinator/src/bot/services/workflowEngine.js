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
  nextStep,
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

registerWorkflowMap(WORKFLOW_MAP)

function canAcceptAnswer(state) {
  if (!state) return false
  if (state.processing) return false
  return true
}

export async function startWorkflow(bot, msg, workflow, setStateFn) {
  const chatId = msg.chat.id
  const sessionKey = getSessionKey(msg)

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

  setStateFn(msg, workflow.name, 0, {}, nurseInfo)
  console.log('[workflow] started', sessionKey, workflow.name, 'step', 0, 'field', workflow.steps[0]?.key)

  const intro = [
    htmlWorkflowIntro(workflow, total),
    '',
    htmlWorkflowQuestion(1, total, workflow.steps[0].question),
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
      const nextIdx = currentIdx + 1

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

        nextStep(msg, { [currentStep.key]: text })
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

      nextStep(msg, { [currentStep.key]: text })
      setAwaitingConfirmation(msg)
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

  if (/^yes$/i.test(text)) {
    const nurseInfo = state.nurseInfo ?? {}
    const savedAt = new Date().toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })

    const record = await saveRecord(workflow.name, state.data, chatId)
    const shortId = record.id.slice(0, 8)

    const sheetResult = await saveToSheet(workflow.name, state.data, nurseInfo)

    const backendCfg = checkBackendConfig()
    let backendResult = null

    if (backendCfg.ok) {
      backendResult = await sendToBackend(workflow.name, state.data, nurseInfo, record.id)
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
      reply = [
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
      clearState(msg, 'confirmed')
    } else {
      log.error(`[${workflow.name}] saved but confirmation message failed — session kept for chat:${chatId}`)
      setAwaitingReply(msg, true)
    }

    log.info(
      `[confirm] ${workflow.name} | patient:${state.data?.patientName ?? '?'}`
      + ` | sheet:${sheetResult.success ? 'ok' : 'fail'}`
      + ` | backend:${backendResult === null ? 'skipped' : backendResult.success ? 'ok' : 'fail'}`
      + ` | id:${shortId}`,
    )
  } else if (/^no$/i.test(text)) {
    const sent = await safeSendMessage(
      bot,
      chatId,
      [
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
