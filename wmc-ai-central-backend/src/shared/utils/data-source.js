const { isDatabaseConnected } = require('../../config/prisma')

/**
 * Run a Prisma query when connected; otherwise return mock data from fallback().
 * @template T
 * @param {() => Promise<T>} queryFn
 * @param {() => T} fallbackFn
 * @returns {Promise<{ data: T, source: 'database' | 'mock' }>}
 */
async function withDatabaseOrMock(queryFn, fallbackFn) {
  if (isDatabaseConnected()) {
    try {
      const data = await queryFn()
      return { data, source: 'database' }
    } catch (err) {
      console.warn('[data-source] Prisma query failed, using mock fallback:', err.message)
    }
  }

  return { data: fallbackFn(), source: 'mock' }
}

module.exports = { withDatabaseOrMock }
