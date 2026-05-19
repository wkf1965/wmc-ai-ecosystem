import type { Request, Response, NextFunction, ErrorRequestHandler } from 'express'

interface HttpError extends Error {
  status?: number
}

/** Last-resort handler for errors passed to `next(err)`. */
export const errorHandler: ErrorRequestHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) => {
  if (res.headersSent) {
    return
  }
  const message = err instanceof Error ? err.message : 'Internal error'
  const httpErr = err as HttpError
  const status = typeof httpErr.status === 'number' ? httpErr.status : 500
  if (status >= 500) {
    console.error('[wmc-ai-backend]', err)
  }
  res.status(status).json({
    error: status === 500 ? 'Internal server error' : 'Request failed',
    message,
  })
}
