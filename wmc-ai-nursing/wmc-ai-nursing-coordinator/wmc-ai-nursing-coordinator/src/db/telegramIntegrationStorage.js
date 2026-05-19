/**
 * Simulation log for Telegram nurse intake (browser localStorage).
 */

export const TELEGRAM_INTEGRATION_LOG_KEY = 'wmc_telegram_nurse_integration_v1'

const SAMPLE_INBOUND = [
  'Room 12: Patient refused lunch, confused, weak mobility',
  'Room 3 patient fell in bathroom',
  'Room 8 refused medication',
  'Room 5 poor appetite and dark urine',
  'Room 2 wound redness increased',
]

function loadLog() {
  try {
    const raw = localStorage.getItem(TELEGRAM_INTEGRATION_LOG_KEY)
    if (!raw) return []
    const p = JSON.parse(raw)
    return Array.isArray(p) ? p : []
  } catch {
    return []
  }
}

function saveLog(entries) {
  localStorage.setItem(TELEGRAM_INTEGRATION_LOG_KEY, JSON.stringify(entries.slice(0, 80)))
}

export function emitTelegramIntegrationUpdated() {
  window.dispatchEvent(new CustomEvent('wmc-telegram-nurse-integration-updated'))
}

export function appendTelegramInboundRecord(record) {
  const log = loadLog()
  log.unshift({
    at: new Date().toISOString(),
    ...record,
  })
  saveLog(log)
  emitTelegramIntegrationUpdated()
}

export function getTelegramInboundLog() {
  return loadLog()
}

export function getTelegramExampleMessages() {
  return [...SAMPLE_INBOUND]
}
