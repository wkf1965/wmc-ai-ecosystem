/**
 * Unified Telegram session reset — bot workflow + command form sessions.
 */

import { clearState, getState } from './stateManager.js'
import { clearSession } from '../../lib/commands/sessionStore.js'

export const CANCEL_FLOW_REPLY = 'Current flow cancelled. You can send nursing note now.'

/**
 * Clear all active session state for this chat/nurse.
 * @param {import('node-telegram-bot-api').Message} msg
 * @returns {Promise<boolean>} true when something was cleared
 */
export async function cancelAllSessionStates(msg) {
  const hadBotWorkflow = Boolean(getState(msg))
  clearState(msg, 'cancelled')
  await clearSession(msg.chat.id, 'cancelled')
  return hadBotWorkflow
}
