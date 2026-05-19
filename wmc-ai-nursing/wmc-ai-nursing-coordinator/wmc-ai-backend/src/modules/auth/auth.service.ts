import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { config } from '../../config/env.js'
import { sheetDb } from '../../db/index.js'
import { signToken } from '../../middleware/auth.js'
import type { User } from '../../types/domain.js'

/** Official demo admin for `POST /api/v1/auth/login` (must exist in store after `npm run seed`). */
export const DEMO_ADMIN_EMAIL = 'admin@wmc.local'
export const DEMO_ADMIN_PASSWORD = 'password123'

const loginSchema = z.object({
  email: z.preprocess(
    (v) => (typeof v === 'string' ? v.trim().toLowerCase() : v),
    z.string().email(),
  ),
  password: z.string(),
})

export const authService = {
  async login(body: unknown) {
    const { email: emailNorm, password } = loginSchema.parse(body)

    const users = await sheetDb.list<User>('users')

    if (emailNorm === DEMO_ADMIN_EMAIL) {
      if (password !== DEMO_ADMIN_PASSWORD) {
        const err = new Error('Invalid credentials')
        ;(err as Error & { status?: number }).status = 401
        throw err
      }
      const user = users.find(
        (u) => u.email.toLowerCase() === DEMO_ADMIN_EMAIL && u.role === 'admin',
      )
      if (!user) {
        const err = new Error(
          `Demo admin (${DEMO_ADMIN_EMAIL}) not found — run: npm run seed`,
        )
        ;(err as Error & { status?: number }).status = 401
        throw err
      }
      if (!(await bcrypt.compare(DEMO_ADMIN_PASSWORD, user.passwordHash))) {
        const err = new Error('Invalid credentials')
        ;(err as Error & { status?: number }).status = 401
        throw err
      }
      return buildAuthResponse(user)
    }

    if (password.length < 6) {
      const err = new Error('Invalid credentials')
      ;(err as Error & { status?: number }).status = 401
      throw err
    }

    const user = users.find((u) => u.email.toLowerCase() === emailNorm)
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      const err = new Error('Invalid credentials')
      ;(err as Error & { status?: number }).status = 401
      throw err
    }
    return buildAuthResponse(user)
  },

  async me(userId: string) {
    const user = await sheetDb.findById<User>('users', userId)
    if (!user) return null
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      name: user.email.toLowerCase() === DEMO_ADMIN_EMAIL ? 'Admin' : user.fullName,
      role: user.role,
      createdAt: user.createdAt,
    }
  },
}

function buildAuthResponse(user: User) {
  const useDemoToken =
    config.demoAuthEnabled &&
    Boolean(config.demoAuthToken) &&
    user.email.toLowerCase() === DEMO_ADMIN_EMAIL
  const token = useDemoToken
    ? config.demoAuthToken
    : signToken({
        sub: user.id,
        email: user.email,
        role: user.role,
      })
  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      name: user.email.toLowerCase() === DEMO_ADMIN_EMAIL ? 'Admin' : user.fullName,
      role: user.role,
    },
  }
}
