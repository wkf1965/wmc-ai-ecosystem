import { VITALS_FORMAT_HINT } from '../services/vitalsNlp.js'
import { safeSendMessage } from '../utils/safeMessage.js'

/**
 * /vitals — show the natural-language format hint.
 *
 * Vital signs are captured via free-text NLP (see vitalsNlp.js), e.g.
 *   "Room 201 BP 130/80 Pulse 76 SpO2 98"
 * so /vitals simply reminds the nurse of the format instead of starting a
 * multi-step form.
 */
export function registerVitalsCommand(bot) {
  bot.onText(/^\/vitals\b/i, (msg) => {
    void safeSendMessage(bot, msg.chat.id, VITALS_FORMAT_HINT)
  })
}
