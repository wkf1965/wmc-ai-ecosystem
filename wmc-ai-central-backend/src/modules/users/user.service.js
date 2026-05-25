/**
 * User service
 *
 * Manages user identity records (auth accounts).
 * Currently returns mock data; wire to Prisma when AUTH_MODE=jwt is activated.
 */

const { MOCK_USERS } = require('../../shared/mocks/user-mock-data')

async function listUsers(filters = {}) {
  let results = MOCK_USERS.map(sanitize)

  if (filters.role) {
    results = results.filter((u) => u.role === String(filters.role).toLowerCase())
  }

  if (filters.isActive !== undefined) {
    const active = String(filters.isActive) === 'true'
    results = results.filter((u) => u.isActive === active)
  }

  return {
    total: results.length,
    count: results.length,
    users: results,
    source: 'mock',
    mock: true,
  }
}

async function getUserById(id) {
  const user = MOCK_USERS.find((u) => u.id === id)
  return {
    user: user ? sanitize(user) : null,
    source: 'mock',
    mock: true,
  }
}

async function getUserByEmail(email) {
  return MOCK_USERS.find((u) => u.email === String(email).toLowerCase()) ?? null
}

/** Strip passwordHash before returning to client */
function sanitize(user) {
  const { passwordHash, ...safe } = user
  return safe
}

module.exports = { listUsers, getUserById, getUserByEmail, sanitize }
