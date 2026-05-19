import { Router } from 'express'
import { asyncHandler } from '../../middleware/asyncHandler.js'
import { authService } from './auth.service.js'

export const authRouter = Router()

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    try {
      const out = await authService.login(req.body)
      res.json(out)
    } catch (e) {
      const status = (e as Error & { status?: number }).status ?? 500
      res.status(status).json({ error: 'Login failed', message: (e as Error).message })
    }
  }),
)

authRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const me = await authService.me(req.auth!.sub)
    if (!me) {
      res.status(404).json({ error: 'User not found' })
      return
    }
    res.json(me)
  }),
)
