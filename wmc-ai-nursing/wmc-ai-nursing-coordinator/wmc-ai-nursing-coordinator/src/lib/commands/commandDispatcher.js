/**
 * Command Dispatcher — the central entry point for all WMC AI Nursing Coordinator commands.
 *
 * Call this FIRST in telegramWebhookProcessor before any other pipeline.
 *
 * Decision tree:
 *   1. /cancel             → cancel active session, reply
 *   2. /help or /start     → reply with menu
 *   3. Session awaiting_confirmation + YES/NO input → confirm or cancel
 *   4. Active session (active) + non-command text   → feed to processStep
 *   5. New /command detected                        → startForm (inline or step-by-step)
 *   6. None of the above                            → { handled: false } (fall through)
 */

import {
  detectCommand,
  getCommandDef,
  buildCommandHelpReply,
  buildStartMessage,
} from './commandRegistry.js'
import { startForm, processStep, processConfirmation } from './formEngine.js'
import { getActiveSession, updateSession, setSessionAwaitingConfirmation, clearSession } from './sessionStore.js'
import { handleAdmitCommand } from './handlers/admitHandler.js'
import { handleVitalsCommand } from './handlers/vitalsHandler.js'
import { handleFallCommand } from './handlers/fallHandler.js'
import { handleTurningCommand } from './handlers/turningHandler.js'
import { handleRehabCommand } from './handlers/rehabHandler.js'
import { handleMedCommand } from './handlers/medHandler.js'
import { handleAlertCommand } from './handlers/alertHandler.js'

/** Map command names to execute handlers (called after form confirmation). */
const HANDLERS = {
  '/admit':   handleAdmitCommand,
  '/vitals':  handleVitalsCommand,
  '/fall':    handleFallCommand,
  '/turning': handleTurningCommand,
  '/rehab':   handleRehabCommand,
  '/med':     handleMedCommand,
  '/alert':   handleAlertCommand,
}

/**
 * Call the domain handler and return its reply string.
 */
async function executeCommand(commandName, data, ctx) {
  const handler = HANDLERS[commandName]
  if (!handler) {
    console.warn('[cmd-dispatcher] No handler for:', commandName)
    return `Command ${commandName} is not yet implemented.`
  }
  try {
    const { reply } = await handler(data, ctx)
    return reply
  } catch (err) {
    console.error(`[cmd-dispatcher] ${commandName} handler error:`, err?.stack || err)
    return `⚠️ Error saving record for ${commandName}. Please try again or contact your supervisor.`
  }
}

/**
 * Main dispatcher. Returns { handled: true, reply } or { handled: false }.
 *
 * @param {string}       text
 * @param {string|number} chatId
 * @param {object}       ctx   — { nurseName, username }
 * @returns {Promise<{ handled: boolean, reply?: string }>}
 */
export async function dispatchCommandOrFormStep(text, chatId, ctx = {}) {
  const t = String(text ?? '').trim()

  // ── 1. /cancel ──────────────────────────────────────────────────────────
  if (/^\/cancel\b/i.test(t)) {
    const session = await getActiveSession(chatId)
    if (session) {
      const def = getCommandDef(session.command_name)
      await clearSession(chatId, 'cancelled')
      return {
        handled: true,
        reply: [
          `❌ *${def?.description ?? session.command_name} form cancelled.*`,
          '',
          'No data was saved.',
          'Send any command to start again, or /help to see all commands.',
        ].join('\n'),
      }
    }
    return { handled: true, reply: 'No active form to cancel.' }
  }

  // ── 2. /help or /start ────────────────────────────────────────────────────
  if (/^\/help\b/i.test(t)) {
    return { handled: true, reply: buildCommandHelpReply() }
  }
  if (/^\/start\b/i.test(t)) {
    return { handled: true, reply: buildStartMessage(ctx.nurseName) }
  }

  // ── 3. Awaiting confirmation (YES / NO) ──────────────────────────────────
  const activeSession = await getActiveSession(chatId)

  if (activeSession?.status === 'awaiting_confirmation') {
    const result = await processConfirmation(chatId, t)

    if (result.confirmed === true) {
      // Confirmed — execute and save
      console.log(`[cmd-dispatcher] confirmed ${result.commandName}`)
      const reply = await executeCommand(result.commandName, result.data, ctx)
      return { handled: true, reply }
    }

    if (result.confirmed === false) {
      // Cancelled by nurse
      const def = getCommandDef(result.commandName)
      return {
        handled: true,
        reply: [
          `❌ *${def?.description ?? result.commandName} record discarded.*`,
          '',
          `Send /${result.commandName?.replace('/', '')} again to start over.`,
        ].join('\n'),
      }
    }

    // confirmed === null → invalid answer, re-send confirmation prompt
    return { handled: true, reply: result.prompt }
  }

  // ── 4. Active form step (text while in a form) ───────────────────────────
  if (activeSession?.status === 'active' && !t.startsWith('/')) {
    const result = await processStep(chatId, t)

    if (result.awaitingConfirmation) {
      return { handled: true, reply: result.confirmationPrompt }
    }
    if (result.nextPrompt) {
      return { handled: true, reply: result.nextPrompt }
    }
    if (result.done) {
      // Inline-complete edge case
      const reply = await executeCommand(activeSession.command_name, result.data, ctx)
      return { handled: true, reply }
    }
    return { handled: true, reply: 'Please enter a value.' }
  }

  // ── 5. New command detected ───────────────────────────────────────────────
  const detected = detectCommand(t)
  if (!detected) {
    // Not a command text and no active session → fall through to nursing notes
    return { handled: false }
  }

  const { commandName, argText } = detected

  // Cancel any previous session if nurse starts a different command mid-way
  if (activeSession && activeSession.command_name !== commandName) {
    await clearSession(chatId, 'cancelled')
    console.log(
      `[cmd-dispatcher] previous ${activeSession.command_name} session cancelled — starting ${commandName}`,
    )
  }

  const def = getCommandDef(commandName)
  const formResult = await startForm(chatId, commandName, argText)

  if (formResult.done) {
    // All fields resolved inline — go to confirmation before saving
    const confirmPrompt = def.buildConfirmationSummary(formResult.data)
    // Start a session just for awaiting confirmation
    const { startSession } = await import('./sessionStore.js')
    await startSession(chatId, commandName, formResult.data)
    await setSessionAwaitingConfirmation(chatId, formResult.data)
    return { handled: true, reply: confirmPrompt }
  }

  // Multi-step form started — return intro + first prompt
  return {
    handled: true,
    reply: [
      `${def?.icon ?? '📋'} *${def?.description ?? commandName}*`,
      'Answer each question. Send /cancel at any time to stop.',
      '',
      formResult.nextPrompt,
    ].join('\n'),
  }
}

/**
 * Quick check: is there an active session for this chat?
 * @param {string|number} chatId
 * @returns {Promise<boolean>}
 */
export async function hasActiveFormSession(chatId) {
  const s = await getActiveSession(chatId)
  return s !== null
}
