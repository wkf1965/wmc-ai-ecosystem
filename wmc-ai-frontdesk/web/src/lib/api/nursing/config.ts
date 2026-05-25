export const NURSING_API_URL =
  process.env.NEXT_PUBLIC_NURSING_API_URL ?? "http://localhost:4000"

export const NURSING_API_PREFIX =
  process.env.NEXT_PUBLIC_NURSING_API_PREFIX ?? "/api/v1"

/** Optional — nursing backend accepts dev bypass without token; set for production */
export const NURSING_API_TOKEN =
  process.env.NEXT_PUBLIC_NURSING_API_TOKEN ?? "demo-token"

export function nursingApiUrl(path: string): string {
  const base = NURSING_API_URL.replace(/\/$/, "")
  const prefix = NURSING_API_PREFIX.startsWith("/")
    ? NURSING_API_PREFIX
    : `/${NURSING_API_PREFIX}`
  const segment = path.startsWith("/") ? path : `/${path}`
  return `${base}${prefix}${segment}`
}
