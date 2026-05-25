const { randomUUID } = require('crypto')
const { getClient, isDatabaseConnected } = require('../lib/prisma')
const { MOCK_REHAB_RECORDS } = require('../shared/mocks/domain-mock-data')

const store = MOCK_REHAB_RECORDS.map((r) => ({ ...r }))

function applyFilters(items, filters) {
  let results = [...items]

  if (filters.patientId) results = results.filter((r) => r.patientId === filters.patientId)
  if (filters.sessionDate) results = results.filter((r) => r.sessionDate === String(filters.sessionDate).trim())
  if (filters.gaitStatus) results = results.filter((r) => r.gaitStatus === String(filters.gaitStatus).toLowerCase())

  const limit = filters.limit && filters.limit > 0 ? Math.min(Number(filters.limit), 200) : 100
  return results.slice(0, limit)
}

const rehabRepository = {
  async getAll(filters = {}) {
    if (isDatabaseConnected()) {
      const prisma = getClient()
      const where = {}

      if (filters.patientId) where.patientId = filters.patientId
      if (filters.sessionDate) where.sessionDate = new Date(String(filters.sessionDate).trim())
      if (filters.gaitStatus) where.gaitStatus = String(filters.gaitStatus).toLowerCase()

      const limit = filters.limit && filters.limit > 0 ? Math.min(Number(filters.limit), 200) : 100
      const data = await prisma.rehabProgress.findMany({
        where,
        take: limit,
        orderBy: { sessionDate: 'desc' },
        include: { patient: { select: { id: true, fullName: true } } },
      })
      return { data, source: 'database' }
    }

    return { data: applyFilters(store, filters), source: 'mock' }
  },

  async getById(id) {
    if (isDatabaseConnected()) {
      const prisma = getClient()
      const data = await prisma.rehabProgress.findUnique({
        where: { id },
        include: { patient: { select: { id: true, fullName: true } } },
      })
      return { data, source: 'database' }
    }

    const data = store.find((r) => r.id === id) ?? null
    return { data, source: 'mock' }
  },

  async create(input) {
    if (isDatabaseConnected()) {
      const prisma = getClient()
      const data = await prisma.rehabProgress.create({ data: input })
      return { data, source: 'database' }
    }

    const now = new Date().toISOString()
    const record = { id: randomUUID(), ...input, createdAt: now, updatedAt: now, mock: true }
    store.unshift(record)
    return { data: record, source: 'mock' }
  },

  async update(id, input) {
    if (isDatabaseConnected()) {
      const prisma = getClient()
      const data = await prisma.rehabProgress.update({ where: { id }, data: input })
      return { data, source: 'database' }
    }

    const idx = store.findIndex((r) => r.id === id)
    if (idx === -1) return { data: null, source: 'mock' }

    store[idx] = { ...store[idx], ...input, updatedAt: new Date().toISOString() }
    return { data: store[idx], source: 'mock' }
  },

  async delete(id) {
    if (isDatabaseConnected()) {
      const prisma = getClient()
      await prisma.rehabProgress.delete({ where: { id } })
      return { data: { id, deleted: true }, source: 'database' }
    }

    const idx = store.findIndex((r) => r.id === id)
    if (idx === -1) return { data: null, source: 'mock' }

    store.splice(idx, 1)
    return { data: { id, deleted: true }, source: 'mock' }
  },
}

module.exports = rehabRepository
