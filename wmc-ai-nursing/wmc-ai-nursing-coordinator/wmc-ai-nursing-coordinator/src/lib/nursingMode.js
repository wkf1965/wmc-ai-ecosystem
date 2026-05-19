/**
 * Strict production nursing behaviour (Sheet-backed roster only; no demo Telegram paths).
 * Server (Node/Vite middleware): set `NURSING_MODE=production` in `.env`.
 * Browser: use `VITE_NURSING_MODE=production` (optional duplicate).
 */

export function isProductionNursingMode() {
  try {
    if (typeof process !== 'undefined' && process.env) {
      const v = String(process.env.NURSING_MODE ?? process.env.VITE_NURSING_MODE ?? '')
        .toLowerCase()
        .trim()
      if (v === 'production') return true
    }
  } catch {
    /* ignore */
  }
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    const env = import.meta.env
    const v = String(env.VITE_NURSING_MODE ?? env.NURSING_MODE ?? '')
      .toLowerCase()
      .trim()
    return v === 'production'
  }
  return false
}
