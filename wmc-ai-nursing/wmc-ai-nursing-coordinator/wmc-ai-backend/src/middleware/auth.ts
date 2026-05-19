import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { config } from '../config/env.js'
import { sheetDb } from '../db/index.js'
import type { User, UserRole } from '../types/domain.js'

export interface AuthPayload {
  sub: string
  email: string
  role: UserRole
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload
    }
  }
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  } as jwt.SignOptions)
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    const h = req.headers.authorization
    const token = h?.startsWith('Bearer ') ? h.slice(7) : null
    if (!token) {
      res.status(401).json({ error: 'Unauthorized', message: 'Missing Bearer token' })
      return
    }
    if (config.demoAuthEnabled && config.demoAuthToken && token === config.demoAuthToken) {
      const users = await sheetDb.list<User>('users')
      const admin = users.find((u) => u.email.toLowerCase() === 'admin@wmc.local')
      if (admin) {
        req.auth = { sub: admin.id, email: admin.email, role: admin.role as UserRole }
        next()
        return
      }
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Demo token not accepted — run npm run seed (admin@wmc.local must exist)',
      })
      return
    }
    try {
      const decoded = jwt.verify(token, config.jwtSecret) as AuthPayload
      req.auth = decoded
      next()
    } catch {
      res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired token' })
    }
  } catch (e) {
    next(e)
  }
}

export function requireRoles(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    if (!roles.includes(req.auth.role)) {
      res.status(403).json({ error: 'Forbidden', message: 'Insufficient role' })
      return
    }
    next()
  }
}
