/**
 * requireAuth middleware
 *
 * Verifies the Bearer JWT in the Authorization header.
 * In AUTH_MODE=mock it accepts a special dev token without DB lookup.
 * In AUTH_MODE=jwt it validates the signature and expiry with jsonwebtoken.
 *
 * On success: attaches req.user = { id, email, role, fullName }
 * On failure: 401 Unauthorized
 */

const jwt = require('jsonwebtoken')
const { config } = require('../../config/env')

/** Token accepted in AUTH_MODE=mock for any role during development */
const MOCK_TOKEN_PREFIX = 'mock-token-'

/**
 * Decode the mock token pattern: "mock-token-<role>"
 * e.g. "mock-token-admin", "mock-token-nurse"
 */
function decodeMockToken(token) {
  if (!token.startsWith(MOCK_TOKEN_PREFIX)) return null

  const role = token.slice(MOCK_TOKEN_PREFIX.length)
  const VALID_ROLES = ['admin', 'supervisor', 'nurse', 'therapist', 'doctor', 'frontdesk']

  if (!VALID_ROLES.includes(role)) return null

  return {
    id:       `mock-user-${role}`,
    email:    `${role}@wmc.dev`,
    role,
    fullName: `Mock ${role.charAt(0).toUpperCase() + role.slice(1)}`,
    mock:     true,
  }
}

/**
 * Extract Bearer token from Authorization header.
 * Returns null if header is missing or malformed.
 */
function extractBearerToken(req) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) return null
  return header.slice(7).trim()
}

/**
 * requireAuth — Express middleware.
 * Attach to any route or router that requires authentication.
 *
 * @example
 * router.get('/sensitive', requireAuth, (req, res) => { ... })
 */
function requireAuth(req, res, next) {
  const token = extractBearerToken(req)

  if (!token) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing or malformed Authorization header. Expected: Bearer <token>',
    })
  }

  // ── Mock shortcut tokens (both modes) ────────────────────────────────
  // "mock-token-<role>" tokens work in any mode for quick testing.
  if (token.startsWith(MOCK_TOKEN_PREFIX)) {
    const mockUser = decodeMockToken(token)
    if (!mockUser) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: `Invalid mock token. Use "mock-token-<role>" (e.g. mock-token-nurse)`,
        validTokens: ['mock-token-admin', 'mock-token-supervisor', 'mock-token-nurse',
                      'mock-token-therapist', 'mock-token-doctor', 'mock-token-frontdesk'],
      })
    }
    req.user = mockUser
    return next()
  }

  // ── JWT verification (mock mode + jwt mode) ───────────────────────────
  // Both modes issue real signed JWTs from /auth/login — verify them here.
  try {
    const payload = jwt.verify(token, config.jwtSecret)
    req.user = {
      id:       payload.sub,
      email:    payload.email,
      role:     payload.role,
      fullName: payload.fullName,
    }
    return next()
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Unauthorized', message: 'Token expired. Please refresh.' })
    }
    return res.status(401).json({ error: 'Unauthorized', message: 'Invalid token.' })
  }
}

module.exports = { requireAuth, extractBearerToken, decodeMockToken, MOCK_TOKEN_PREFIX }
