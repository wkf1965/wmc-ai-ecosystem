import { useCallback, useEffect, useRef, useState } from 'react'

const DASHBOARD_URL = '/api/integrations/telegram/dashboard'
const DEFAULT_POLL_MS = 12_000

export function useTelegramDashboardSnapshot(pollMs = DEFAULT_POLL_MS) {
  const [snapshot, setSnapshot] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const timerRef = useRef(null)

  const fetchSnap = useCallback(async () => {
    const url = `${DASHBOARD_URL}?_=${Date.now()}`
    try {
      const r = await fetch(url, { cache: 'no-store' })
      const text = await r.text()
      let j = null
      try {
        j = text ? JSON.parse(text) : null
      } catch (parseErr) {
        console.error('[useTelegramDashboardSnapshot] Dashboard API returned non-JSON.', {
          status: r.status,
          parseError: parseErr,
          bodyPreview: text.slice(0, 800),
        })
        setError(
          `Dashboard API returned invalid JSON (HTTP ${r.status}). Check Vite dev server and /api/integrations/telegram/dashboard.`,
        )
        setSnapshot(null)
        return
      }

      if (!r.ok || j?.ok === false) {
        const msg = j?.error || `HTTP ${r.status}`
        console.error('[useTelegramDashboardSnapshot] Dashboard snapshot error:', { status: r.status, message: msg, body: j })
        setError(msg)
        setSnapshot(null)
        return
      }

      setSnapshot(j)
      setError(null)
    } catch (e) {
      console.error('[useTelegramDashboardSnapshot] Fetch failed:', e)
      setError(String(e?.message || e))
      setSnapshot(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSnap()
    if (pollMs > 0) {
      timerRef.current = window.setInterval(fetchSnap, pollMs)
      return () => window.clearInterval(timerRef.current)
    }
    return undefined
  }, [fetchSnap, pollMs])

  return {
    snapshot,
    error,
    loading,
    refetch: fetchSnap,
    generatedAt: snapshot?.generatedAt ?? null,
  }
}
