/**
 * Real Telegram runtime — polling bot with hybrid NLP router.
 *
 * Run: npm run telegram
 */
import 'dotenv/config'
import { routeNlpMessage } from '../bot/services/nlpRouter.js'
import { startTelegramBot } from '../bot/index.js'

console.log('✅ REAL TELEGRAM NLP ROUTER ACTIVE')
console.log('[telegram] entry: src/telegram/bot.js')
console.log(
  '[telegram] loaded src/bot/services/nlpRouter.js',
  typeof routeNlpMessage === 'function' ? '(routeNlpMessage ok)' : '(missing)',
)
console.log('[telegram] routing: /commands → [COMMAND ROUTE] | free text → [NLP ROUTER] → [WORKFLOW ROUTE]')

startTelegramBot().catch((err) => {
  console.error('[telegram] startup failed:', err?.message ?? err)
  process.exit(1)
})
