/**
 * WMC Central Backend — natural language nursing parse client.
 * POST /api/v1/nursing/parse
 */

const TIMEOUT_MS = 12_000

function backendBaseUrl() {
  const raw = process.env.WMC_BACKEND_API_URL || process.env.VITE_API_BASE_URL || 'http://localhost:4000'
  const trimmed = String(raw).replace(/\/$/, '')
  return trimmed.endsWith('/api/v1') ? trimmed.slice(0, -'/api/v1'.length) : trimmed
}

/**
 * @param {string} text
 * @param {{ nurseName?: string, chatId?: string|number, source?: string }} [meta]
 */
export async function parseNursingMessageViaBackend(text, meta = {}) {
  const base = backendBaseUrl()
  const url = `${base}/api/v1/nursing/parse`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        text: String(text),
        nurseName: meta.nurseName ?? undefined,
        chatId: meta.chatId ?? undefined,
        source: meta.source ?? 'telegram',
        persist: true,
      }),
      signal: controller.signal,
    })

    const payload = await res.json().catch(() => null)
    if (!res.ok) {
      return {
        ok: false,
        error: payload?.message || payload?.error || `HTTP ${res.status}`,
      }
    }

    console.log('[nursing-parse] backend response:', payload)
    return { ok: true, data: payload }
  } catch (err) {
    return {
      ok: false,
      error: err?.name === 'AbortError' ? 'Parse request timed out' : (err?.message ?? String(err)),
    }
  } finally {
    clearTimeout(timer)
  }
}

export function buildTelegramReplyFromParseResult(data) {
  if (data?.confirmationMessage) return data.confirmationMessage
  const p = data?.parsed ?? {}
  return [
    '✅ Nursing note recorded',
    '',
    `Room: ${p.room ?? '—'}`,
    `Patient: ${p.patientName ?? '—'}`,
    `Appetite: ${p.appetite ?? '—'}`,
    `Mobility: ${p.mobility ?? '—'}`,
    `Turning: ${p.turningPosition ?? '—'}`,
  ].join('\n')
}
