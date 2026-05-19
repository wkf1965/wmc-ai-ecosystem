import type { Request } from 'express'

/** Express 5 may type params as string | string[] */
export function routeParam(req: Request, key: string): string {
  const v = req.params[key]
  if (Array.isArray(v)) return v[0] ?? ''
  return v ?? ''
}
