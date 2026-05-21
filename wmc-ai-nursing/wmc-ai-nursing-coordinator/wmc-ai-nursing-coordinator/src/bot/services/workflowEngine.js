/**
 * Workflow Engine — Stage 5
 *
 * Drives multi-step question-answer collection for every nursing command.
 *
 * On confirmation (YES):
 *   1. Save to local JSON store  (always — offline backup)
 *   2. Save to Google Sheet      (Stage 3)
 *   3. Sync to Backend API       (Stage 5, optional — never blocks nurse)
 */

import {
  getState,
  nextStep,
  setAwaitingConfirmation,
  clearState,
} from './stateManager.js'
import { saveRecord }       from './recordStore.js'
import { saveToSheet }      from './googleSheetService.js'
import { sendToBackend,
         checkBackendConfig } from './backendApiService.js'
import { log }              from '../utils/logger.js'

// All workflow definitions — imported here to resolve by name
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

const DIVIDER = '━━━━━━━━━━━━━━━━━━━━━━━━━'

// ── Start a workflow ─────────────────────────────────────────────────────────

/**
 * Call this when a command is triggered. Sets state and sends the first question.
 * @param {import('node-telegram-bot-api').default} bot
 * @param {import('node-telegram-bot-api').Message} msg
 * @param {object} workflow
 * @param {Function} setState
 */
export function startWorkflow(bot, msg, workflow, setState) {
  const chatId = msg.chat.id
  const total = workflow.steps.length
  const nurseInfo = {
    chatId:    String(chatId),
    username:  msg.from?.username  ?? '',
    firstName: msg.from?.first_name ?? 'Nurse',
  }
  setState(chatId, workflow.name, 0, {}, nurseInfo)

  bot.sendMessage(
    chatId,
    [
      `${workflow.icon} *${workflow.title}*`,
      DIVIDER,
      `${total} questions — answer one at a time.`,
      'Send /cancel at any time to stop.',
      '',
      `*(1/${total})* ${workflow.steps[0].question}`,
    ].join('\n'),
    { parse_mode: 'Markdown' },
  )

  log.cmd(workflow.name, chatId, msg.from?.username)
}

// ── Process one answer ───────────────────────────────────────────────────────

/**
 * Process the nurse's text reply when inside an active workflow.
 * @param {import('node-telegram-bot-api').default} bot
 * @param {import('node-telegram-bot-api').Message} msg
 */
export async function processAnswer(bot, msg) {
  const chatId = msg.chat.id
  const state = getState(chatId)
  if (!state) return

  const text = String(msg.text ?? '').trim()
  const workflow = WORKFLOW_MAP[state.workflow]

  if (!workflow) {
    clearState(chatId)
    bot.sendMessage(chatId, '⚠️ Unknown workflow. Send /start to begin.')
    return
  }

  // ── Awaiting confirmation (yes / no) ──────────────────────────────────────
  if (state.awaitingConfirmation) {
    await _handleConfirmation(bot, chatId, text, workflow, state)
    return
  }

  // ── Save answer and advance ───────────────────────────────────────────────
  const steps = workflow.steps
  const currentIdx = state.step
  const currentStep = steps[currentIdx]

  if (!currentStep) return

  // Merge answer into data
  const newData = { ...state.data, [currentStep.key]: text }
  const nextIdx = currentIdx + 1

  if (nextIdx < steps.length) {
    // More questions — advance step and ask next
    nextStep(chatId, { [currentStep.key]: text })
    const next = steps[nextIdx]
    const total = steps.length

    bot.sendMessage(
      chatId,
      `*(${nextIdx + 1}/${total})* ${next.question}`,
      { parse_mode: 'Markdown' },
    )
    log.step(state.workflow, nextIdx, chatId)
  } else {
    // Last answer received — show confirmation summary
    nextStep(chatId, { [currentStep.key]: text })
    setAwaitingConfirmation(chatId)

    const summary = workflow.buildSummary(newData)
    bot.sendMessage(chatId, summary, { parse_mode: 'Markdown' })
    log.info(`[${workflow.name}] all steps complete — awaiting confirmation chat:${chatId}`)
  }
}

// ── Confirmation handler ─────────────────────────────────────────────────────

async function _handleConfirmation(bot, chatId, text, workflow, state) {
  if (/^yes$/i.test(text)) {
    const nurseInfo = state.nurseInfo ?? {}
    const savedAt   = new Date().toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })

    // ── Step 1: Local backup (always succeeds) ─────────────────────────────
    const record = await saveRecord(workflow.name, state.data, chatId)
    const shortId = record.id.slice(0, 8)

    clearState(chatId)

    // ── Step 2: Google Sheet ───────────────────────────────────────────────
    const sheetResult = await saveToSheet(workflow.name, state.data, nurseInfo)

    // ── Step 3: Backend API (optional — run in background, never awaited for reply) ─
    const backendCfg  = checkBackendConfig()
    let   backendResult = null

    if (backendCfg.ok) {
      // Fire-and-wait with timeout already handled inside sendToBackend
      backendResult = await sendToBackend(workflow.name, state.data, nurseInfo, record.id)
    }

    // ── Build status lines ─────────────────────────────────────────────────
    const sheetLine   = sheetResult.success
      ? '📊 Google Sheet:  ✅ saved'
      : '📊 Google Sheet:  ❌ failed'

    const backendLine = !backendCfg.ok
      ? null   // backend not configured — don't mention it
      : backendResult?.success
        ? '🔗 Backend API:   ✅ synced'
        : '🔗 Backend API:   ❌ sync failed'

    // ── Build reply ────────────────────────────────────────────────────────
    const allOk = sheetResult.success && (backendResult === null || backendResult?.success)

    const statusBlock = [sheetLine, backendLine].filter(Boolean).join('\n')

    if (allOk) {
      bot.sendMessage(
        chatId,
        [
          `✅ *Record saved successfully.*`,
          '',
          statusBlock,
          '',
          `🕐 Saved at ${savedAt}`,
          `🔖 Record ID: ${shortId}`,
          '',
          'Send another command when ready.',
        ].join('\n'),
        { parse_mode: 'Markdown' },
      )
    } else if (sheetResult.success && backendResult && !backendResult.success) {
      // Sheet OK, backend failed
      bot.sendMessage(
        chatId,
        [
          `⚠️ *Record saved to Google Sheet.*`,
          `*Backend API sync failed.*`,
          '',
          statusBlock,
          '',
          '👨‍💼 Admin please check backend server.',
          `🔖 Record ID: ${shortId}`,
        ].join('\n'),
        { parse_mode: 'Markdown' },
      )
      log.error(`[${workflow.name}] backend sync failed — chat:${chatId} error:`, backendResult.error)
    } else {
      // Sheet failed (backend status secondary)
      bot.sendMessage(
        chatId,
        [
          `⚠️ *Record could not be saved to Google Sheet.*`,
          '',
          statusBlock || '📊 Google Sheet:  ❌ failed',
          '',
          'Please contact admin.',
          `🔖 Local backup ID: ${shortId}`,
        ].join('\n'),
        { parse_mode: 'Markdown' },
      )
      log.error(`[${workflow.name}] sheet save failed — chat:${chatId} error:`, sheetResult.error)
    }

    // Structured log line for every confirmation
    log.info(
      `[confirm] ${workflow.name} | patient:${state.data?.patientName ?? '?'}` +
      ` | sheet:${sheetResult.success ? 'ok' : 'fail'}` +
      ` | backend:${backendResult === null ? 'skipped' : backendResult.success ? 'ok' : 'fail'}` +
      ` | id:${shortId}`,
    )

  } else if (/^no$/i.test(text)) {
    clearState(chatId)
    bot.sendMessage(
      chatId,
      [
        `❌ *Record cancelled.*`,
        '',
        'Please restart the command whenever you are ready.',
        `Send /${workflow.name} to begin again.`,
      ].join('\n'),
      { parse_mode: 'Markdown' },
    )
    log.info(`[${workflow.name}] cancelled by nurse chat:${chatId}`)

  } else {
    // Not yes or no — re-prompt
    bot.sendMessage(
      chatId,
      `Please reply *yes* to save or *no* to cancel the ${workflow.title.toLowerCase()} record.`,
      { parse_mode: 'Markdown' },
    )
  }
}
