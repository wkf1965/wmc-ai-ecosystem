/**
 * Auth service
 *
 * AUTH_MODE=mock  — accepts any email/password from MOCK_USERS list,
 *                   returns signed JWTs without DB lookup.
 * AUTH_MODE=jwt   — full bcrypt password check + Prisma user lookup (future).
 *
 * Token strategy:
 *   accessToken  — short-lived (15m), sent with every API request
 *   refreshToken — long-lived (7d), used only to obtain new access tokens
 */

const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const { config } = require('../../config/env')
const { getUserByEmail, sanitize } = require('../users/user.service')
const { MOCK_USERS } = require('../../shared/mocks/user-mock-data')
const { logAuditEvent, AUDIT_ACTIONS } = require('../../shared/utils/audit-logger')
const { emitEvent } = require('../../core/events/event-bus')
const { EVENT_TYPES } = require('../../core/events/event-types')

/** In-memory refresh token store — replace with DB table in production */
const refreshTokenStore = new Map()

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

function signAccessToken(user) {
  return jwt.sign(
    {
      sub:      user.id,
      email:    user.email,
      role:     user.role,
      fullName: user.fullName,
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  )
}

function signRefreshToken(user) {
  const token = jwt.sign(
    { sub: user.id },
    config.jwtRefreshSecret,
    { expiresIn: config.jwtRefreshExpiresIn }
  )
  // Store for validation on /auth/refresh
  refreshTokenStore.set(token, { userId: user.id, createdAt: Date.now() })
  return token
}

function buildTokenResponse(user) {
  return {
    accessToken:  signAccessToken(user),
    refreshToken: signRefreshToken(user),
    tokenType:    'Bearer',
    expiresIn:    config.jwtExpiresIn,
    user:         sanitize(user),
  }
}

// ---------------------------------------------------------------------------
// Auth operations
// ---------------------------------------------------------------------------

/**
 * POST /auth/login
 * Mock mode: accepts email matching MOCK_USERS regardless of password.
 * JWT mode: verifies bcrypt hash against DB record.
 */
async function login(email, password, req = null) {
  if (!email || !password) {
    return { success: false, error: 'Email and password are required' }
  }

  // ── Mock mode ─────────────────────────────────────────────────────────
  if (config.authMode === 'mock') {
    const user = MOCK_USERS.find((u) => u.email === String(email).toLowerCase() && u.isActive)
    if (!user) {
      return { success: false, error: 'Invalid credentials' }
    }
    const tokens = buildTokenResponse(user)
    emitEvent(EVENT_TYPES.USER_LOGGED_IN, {
      userId:    user.id,
      userRole:  user.role,
      fullName:  user.fullName,
      email:     user.email,
      ipAddress: req?.ip ?? 'unknown',
    })
    return { success: true, mock: true, ...tokens }
  }

  // ── JWT mode ──────────────────────────────────────────────────────────
  const user = await getUserByEmail(email)
  if (!user || !user.isActive) {
    return { success: false, error: 'Invalid credentials' }
  }

  const passwordValid = await bcrypt.compare(password, user.passwordHash)
  if (!passwordValid) {
    return { success: false, error: 'Invalid credentials' }
  }

  emitEvent(EVENT_TYPES.USER_LOGGED_IN, {
    userId:    user.id,
    userRole:  user.role,
    fullName:  user.fullName,
    email:     user.email,
    ipAddress: req?.ip ?? 'unknown',
  })

  return { success: true, mock: false, ...buildTokenResponse(user) }
}

/**
 * POST /auth/refresh
 * Validates refresh token, issues new access token.
 */
async function refresh(refreshToken) {
  if (!refreshToken) {
    return { success: false, error: 'Refresh token is required' }
  }

  // Verify the token hasn't been tampered with
  let payload
  try {
    payload = jwt.verify(refreshToken, config.jwtRefreshSecret)
  } catch {
    return { success: false, error: 'Invalid or expired refresh token' }
  }

  // Check it's in our store (not revoked)
  if (!refreshTokenStore.has(refreshToken)) {
    return { success: false, error: 'Refresh token not recognised — please log in again' }
  }

  // Find the user
  const user = config.authMode === 'mock'
    ? MOCK_USERS.find((u) => u.id === payload.sub)
    : await getUserByEmail(payload.sub)  // replace with getById in production

  if (!user || !user.isActive) {
    refreshTokenStore.delete(refreshToken)
    return { success: false, error: 'User not found or deactivated' }
  }

  // Rotate: revoke old refresh token, issue new pair
  refreshTokenStore.delete(refreshToken)
  const tokens = buildTokenResponse(user)

  return {
    success: true,
    mock: config.authMode === 'mock',
    ...tokens,
    rotated: true,
  }
}

/**
 * POST /auth/logout
 * Revokes the provided refresh token from the in-memory store.
 */
function logout(refreshToken, req = null) {
  if (refreshToken) refreshTokenStore.delete(refreshToken)

  emitEvent(EVENT_TYPES.USER_LOGGED_OUT, {
    userId:    req?.user?.id,
    userRole:  req?.user?.role ?? 'unknown',
    fullName:  req?.user?.fullName,
    ipAddress: req?.ip ?? 'unknown',
  })

  return { success: true, message: 'Logged out successfully' }
}

module.exports = { login, refresh, logout }
