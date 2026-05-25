"use client"

import { useCallback, useEffect, useState } from "react"
import { fetchDashboardSnapshot } from "@/lib/api/central-backend.client"
import type {
  CentralBackendConnection,
  DashboardMetricsSnapshot,
  LiveBackendData,
} from "@/lib/api/types"

type DashboardDataState = {
  connection: CentralBackendConnection | null
  metrics: DashboardMetricsSnapshot | null
  live: LiveBackendData | null
  loading: boolean
}

const INITIAL: DashboardDataState = {
  connection: null,
  metrics:    null,
  live:       null,
  loading:    true,
}

const REFRESH_INTERVAL_MS = 30_000

export function useCentralBackendHealth(autoRefresh = true) {
  const [state, setState] = useState<DashboardDataState>(INITIAL)

  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true }))
    const { connection, metrics, live } = await fetchDashboardSnapshot()
    setState({ connection, metrics, live, loading: false })
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!autoRefresh) return
    const id = window.setInterval(() => void refresh(), REFRESH_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [autoRefresh, refresh])

  return {
    ...state,
    refresh,
    lastRefresh: state.connection?.fetchedAt ?? null,
  }
}
