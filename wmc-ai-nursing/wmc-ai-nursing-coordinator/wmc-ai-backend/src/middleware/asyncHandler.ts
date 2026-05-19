import type { Request, Response } from 'express'
import { ZodError } from 'zod'

export function asyncHandler(
  fn: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response) => void {
  return (req, res) => {
    void fn(req, res).catch((err: unknown) => {
      if (err instanceof ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.flatten() })
        return
      }
      const msg = err instanceof Error ? err.message : 'Internal error'
      res.status(500).json({ error: 'Internal server error', message: msg })
    })
  }
}
