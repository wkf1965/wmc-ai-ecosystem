/**
 * Form Engine — drives multi-step data collection for Telegram nursing commands.
 *
 * Lifecycle:
 *   startForm(chatId, commandName, argText)
 *     → tries inline parse first
 *     → if complete inline → { done: true, data }
 *     → else → starts session, returns first { nextPrompt }
 *
 *   processStep(chatId, inputText)
 *     → feeds answer to current step
 *     → validates, normalizes, transforms
 *     → when all steps done → sets session to awaiting_confirmation
 *     → returns { awaitingConfirmation: true, confirmationPrompt }
 *
 *   processConfirmation(chatId, inputText)
 *     → YES → { confirmed: true, data }
 *     → NO  → { confirmed: false }
 *     → else → { confirmed: null, prompt: 'Reply YES or NO.' }
 *
 * Skip tokens: "skip", "n/a", "-", "none", "nil" (optional fields only)
 * Cancel token: /cancel (handled upstream in dispatcher)
 */

import { getCommandDef, parseInlineArgs, isSkipToken } from './commandRegistry.js'
import {
  startSession,
  getActiveSession,
  updateSession,
  setSessionAwaitingConfirmation,
  clearSession,
} from './sessionStore.js'

// ── Inline parse ─────────────────────────────────────────────────────────────

/**
 * Try to extract all fields from a single-line arg string.
 * Returns collected data and list of still-missing required field keys.
 */
export function tryInlineParse(commandDef, argText) {
  const data = {}
  const kv = parseInlineArgs(argText)

  for (const field of commandDef.fields) {
    const keys = [field.key, ...(field.aliases ?? [])]
    let found = null
    for (const k of keys) {
      if (kv[k.toLowerCase()] !== undefined) {
        found = kv[k.toLowerCase()]
        break
      }
    }
    if (found !== null && found !== undefined) {
      let val = String(found).trim()
      if (field.normalize) val = field.normalize(val) ?? val
      if (field.transform) val = field.transform(val) ?? val
      data[field.key] = val
    }
  }

  const missingRequired = commandDef.fields
    .filter((f) => f.required && !data[f.key])
    .map((f) => f.key)

  return { data, missingRequired }
}

// ── Next unanswered field ────────────────────────────────────────────────────

/**
 * Find the first field that has NOT yet been answered.
 * undefined / null  → not yet seen
 * ''                → explicitly skipped (treated as answered)
 * any other value   → answered
 */
function findNextFieldIndex(fields, collected) {
  for (let i = 0; i < fields.length; i++) {
    const v = collected[fields[i].key]
    if (v === undefined || v === null) return i
  }
  return -1
}

// ── Step progress text ───────────────────────────────────────────────────────

export function stepProgressText(session, commandDef) {
  const total = commandDef.fields.length
  const current = Math.min((session.current_step ?? 0) + 1, total)
  return `(${current}/${total})`
}

// ── Start form ───────────────────────────────────────────────────────────────

/**
 * Begin a new form session.
 * If argText provides all required fields → returns { done: true, data }.
 * Otherwise starts a session and returns the first prompt.
 *
 * @param {string|number} chatId
 * @param {string} commandName
 * @param {string} argText
 * @returns {Promise<{ done: boolean, data?: object, nextPrompt?: string }>}
 */
export async function startForm(chatId, commandName, argText) {
  const def = getCommandDef(commandName)
  if (!def) return { done: false, nextPrompt: `Unknown command: ${commandName}` }

  const { data: inline, missingRequired } = tryInlineParse(def, argText)

  if (missingRequired.length === 0) {
    // All required fields resolved inline — no session needed
    return { done: true, data: inline }
  }

  const session = await startSession(chatId, commandName, inline)
  const nextIdx = findNextFieldIndex(def.fields, session.collected_data)
  const field = def.fields[nextIdx]
  const progress = stepProgressText(session, def)

  return {
    done: false,
    nextPrompt: `${progress} ${field.prompt}`,
  }
}

// ── Process one step ─────────────────────────────────────────────────────────

/**
 * Feed the user's latest text as an answer to the current form step.
 *
 * @param {string|number} chatId
 * @param {string} inputText
 * @returns {Promise<{
 *   done?: boolean,
 *   cancelled?: boolean,
 *   awaitingConfirmation?: boolean,
 *   confirmationPrompt?: string,
 *   nextPrompt?: string,
 *   validationError?: boolean,
 * }>}
 */
export async function processStep(chatId, inputText) {
  const session = await getActiveSession(chatId)
  if (!session || session.status !== 'active') return { done: false, nextPrompt: null }

  const def = getCommandDef(session.command_name)
  if (!def) {
    await clearSession(chatId, 'cancelled')
    return { cancelled: true }
  }

  const currentIdx = session.current_step ?? 0
  if (currentIdx >= def.fields.length) {
    // Edge case: already past last field
    await clearSession(chatId)
    return { done: true, data: session.collected_data }
  }

  const field = def.fields[currentIdx]
  const raw = String(inputText ?? '').trim()

  // Handle skip for optional fields — mark with '' so findNextFieldIndex skips past it
  if (!field.required && isSkipToken(raw)) {
    const newData = { ...session.collected_data, [field.key]: '' }
    return await _advanceOrComplete(chatId, def, session, currentIdx + 1, newData)
  }

  // Validate
  if (field.validate) {
    const err = field.validate(raw)
    if (err) {
      const progress = stepProgressText(session, def)
      return {
        validationError: true,
        nextPrompt: `❌ ${err}\n\n${progress} ${field.prompt}`,
      }
    }
  }

  // Normalize + transform
  let finalVal = raw
  if (field.normalize) finalVal = field.normalize(finalVal) ?? finalVal
  if (field.transform) finalVal = field.transform(finalVal) ?? finalVal

  const newData = { ...session.collected_data, [field.key]: finalVal }
  return await _advanceOrComplete(chatId, def, session, currentIdx + 1, newData)
}

async function _advanceOrComplete(chatId, def, session, _nextIdx, newData) {
  const nextFieldIdx = findNextFieldIndex(def.fields, newData)

  if (nextFieldIdx === -1) {
    // Every field has been answered or explicitly skipped → go to confirmation
    await setSessionAwaitingConfirmation(chatId, newData)
    const confirmationPrompt = def.buildConfirmationSummary(newData)
    return { awaitingConfirmation: true, confirmationPrompt, data: newData }
  }

  await updateSession(chatId, {
    current_step: nextFieldIdx,
    collected_data: newData,
  })

  const nextField = def.fields[nextFieldIdx]
  const updatedSession = await getActiveSession(chatId)
  const progress = updatedSession ? stepProgressText(updatedSession, def) : ''

  return { nextPrompt: `${progress} ${nextField.prompt}` }
}

// ── Process confirmation ─────────────────────────────────────────────────────

/**
 * Handle YES / NO reply when session is awaiting confirmation.
 *
 * @param {string|number} chatId
 * @param {string} inputText
 * @returns {Promise<{
 *   confirmed: boolean|null,
 *   data?: object,
 *   commandName?: string,
 *   prompt?: string,
 * }>}
 */
export async function processConfirmation(chatId, inputText) {
  const session = await getActiveSession(chatId)
  if (!session || session.status !== 'awaiting_confirmation') {
    return { confirmed: null, prompt: null }
  }

  const answer = String(inputText ?? '').trim().toLowerCase()

  if (/^y(es)?$/i.test(answer)) {
    const data = { ...session.collected_data }
    const commandName = session.command_name
    await clearSession(chatId, 'completed')
    return { confirmed: true, data, commandName }
  }

  if (/^n(o)?$/i.test(answer)) {
    const commandName = session.command_name
    await clearSession(chatId, 'cancelled')
    return { confirmed: false, commandName }
  }

  // Unrecognised response — re-prompt
  const def = getCommandDef(session.command_name)
  const summary = def ? def.buildConfirmationSummary(session.collected_data) : ''
  return {
    confirmed: null,
    prompt: `Please reply *YES* to save or *NO* to cancel.\n\n${summary}`,
  }
}
