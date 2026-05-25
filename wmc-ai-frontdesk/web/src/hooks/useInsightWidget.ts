"use client"

import { useCallback, useEffect, useState } from "react"
import type { InsightFetchOutcome } from "@/lib/api/nursing/fetch"

export type InsightWidgetState<T> = {
  data: T | null
  loading: boolean
  usingMock: boolean
  error: string | null
  fetchedAt: string | null
}

const INITIAL = <T,>(): InsightWidgetState<T> => ({
  data: null,
  loading: true,
  usingMock: false,
  error: null,
  fetchedAt: null,
})

export function useInsightWidget<T>(
  fetcher: () => Promise<InsightFetchOutcome<T>>,
  autoRefresh = false,
  intervalMs = 60_000
) {
  const [state, setState] = useState<InsightWidgetState<T>>(INITIAL)

  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true }))
    try {
      const outcome = await fetcher()
      setState({
        data: outcome.data,
        loading: false,
        usingMock: outcome.usingMock,
        error: outcome.error,
        fetchedAt: outcome.fetchedAt,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load"
      setState({
        data: null,
        loading: false,
        usingMock: true,
        error: message,
        fetchedAt: new Date().toISOString(),
      })
    }
  }, [fetcher])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    if (!autoRefresh) return
    const id = window.setInterval(refresh, intervalMs)
    return () => window.clearInterval(id)
  }, [autoRefresh, intervalMs, refresh])

  return { ...state, refresh }
}
