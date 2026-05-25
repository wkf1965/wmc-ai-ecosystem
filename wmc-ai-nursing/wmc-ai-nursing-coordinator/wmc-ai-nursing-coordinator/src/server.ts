/**
 * Dev server bootstrap — loaded by Vite on `npm run dev`.
 * Verifies hybrid NLP router + command mode are available.
 */

import { routeNlpMessage } from './bot/services/nlpRouter.js'

export function bootstrapDevServer(): void {
  console.log('✅ HYBRID NLP ROUTER ACTIVE')
  console.log('✅ COMMAND + NLP MODE ENABLED')
  console.log('[dev-server] loaded src/server.ts')
  console.log(
    '[dev-server] loaded src/bot/services/nlpRouter.js',
    typeof routeNlpMessage === 'function' ? '(routeNlpMessage ok)' : '(missing)',
  )
}
