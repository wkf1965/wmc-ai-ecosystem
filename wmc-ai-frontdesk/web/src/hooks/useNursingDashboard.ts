"use client"

import { useCallback, useEffect, useState } from "react"
import { fetchNursingDashboard } from "@/lib/api/nursing/nursing-backend.client"
import type { NursingDashboardSnapshot } from "@/lib/api/nursing/types"

const REFRESH_INTERVAL_MS = 30_000

export function useNursingDashboard(autoRefresh = true) {
  const [snapshot, setSnapshot] = useState<NursingDashboardSnapshot | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    const data = await fetchNursingDashboard()
    setSnapshot(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    if (!autoRefresh) return
    const id = window.setInterval(refresh, REFRESH_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [autoRefresh, refresh])

  return {
    snapshot,
    loading,
    refresh,
    lastUpdated: snapshot?.fetchedAt ?? null,
  }
}
