/**
 * Logger — Stage 1
 * Simple structured console logger for the bot.
 * Stage 3+: replace with Winston or Pino.
 */

function ts() {
  return new Date().toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export const log = {
  info:  (...args) => console.log( `[${ts()}] [INFO ]`, ...args),
  warn:  (...args) => console.warn( `[${ts()}] [WARN ]`, ...args),
  error: (...args) => console.error(`[${ts()}] [ERROR]`, ...args),
  cmd:   (cmd, chatId, user) => console.log(`[${ts()}] [CMD  ] /${cmd} — chat:${chatId} user:${user ?? '?'}`),
  step:  (workflow, step, chatId) => console.log(`[${ts()}] [STEP ] ${workflow} step:${step} chat:${chatId}`),
}
