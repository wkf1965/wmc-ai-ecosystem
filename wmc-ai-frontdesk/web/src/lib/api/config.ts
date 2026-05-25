/** Central Backend base URL — override via NEXT_PUBLIC_CENTRAL_API_URL in .env.local */
export const CENTRAL_API_URL =
  process.env.NEXT_PUBLIC_CENTRAL_API_URL ?? "http://localhost:5000"

/** Versioned API prefix */
export const CENTRAL_API_V1 = `${CENTRAL_API_URL.replace(/\/$/, "")}/api/v1`

/** Legacy health path (kept for backwards compat) */
export const CENTRAL_HEALTH_PATH = "/api/v1/health"

export function getCentralHealthUrl(): string {
  return `${CENTRAL_API_URL.replace(/\/$/, "")}${CENTRAL_HEALTH_PATH}`
}

/** Build a full v1 URL for a given path segment, e.g. "/patients" */
export function v1Url(path: string): string {
  return `${CENTRAL_API_V1}${path.startsWith("/") ? path : `/${path}`}`
}

/**
 * Mock supervisor token — used in dev (AUTH_MODE=mock) to call
 * protected endpoints like /events/dashboard-state from the browser.
 */
export const DEV_SUPERVISOR_TOKEN = "mock-token-supervisor"
