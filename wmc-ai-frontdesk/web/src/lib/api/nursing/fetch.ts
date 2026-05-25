import { NURSING_API_TOKEN, nursingApiUrl } from "./config"

export const NURSING_FETCH_TIMEOUT_MS = 10_000

export type FetchResult<T> = { ok: true; data: T } | { ok: false; error: string }

export async function nursingFetch<T>(path: string): Promise<FetchResult<T>> {
  const headers: HeadersInit = { Accept: "application/json" }
  if (NURSING_API_TOKEN) {
    headers.Authorization = `Bearer ${NURSING_API_TOKEN}`
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), NURSING_FETCH_TIMEOUT_MS)

  try {
    const res = await fetch(nursingApiUrl(path), {
      method: "GET",
      headers,
      cache: "no-store",
      signal: controller.signal,
    })

    if (!res.ok) {
      return { ok: false, error: `${path}: HTTP ${res.status}` }
    }

    const data = (await res.json()) as T
    return { ok: true, data }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Request failed"
    return { ok: false, error: `${path}: ${message}` }
  } finally {
    clearTimeout(timer)
  }
}

export type InsightFetchOutcome<T> = {
  data: T
  usingMock: boolean
  error: string | null
  fetchedAt: string
}

export async function fetchInsight<T>(
  path: string,
  mock: () => T,
  mapResponse?: (data: T) => T
): Promise<InsightFetchOutcome<T>> {
  const fetchedAt = new Date().toISOString()
  const result = await nursingFetch<T>(path)

  if (result.ok) {
    return {
      data: mapResponse ? mapResponse(result.data) : result.data,
      usingMock: false,
      error: null,
      fetchedAt,
    }
  }

  return {
    data: mock(),
    usingMock: true,
    error: result.error,
    fetchedAt,
  }
}
