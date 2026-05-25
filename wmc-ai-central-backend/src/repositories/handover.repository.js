const { randomUUID } = require('crypto')
const { getClient, isDatabaseConnected } = require('../lib/prisma')
const { MOCK_HANDOVER_LOGS } = require('../shared/mocks/domain-mock-data')

const store = MOCK_HANDOVER_LOGS.map((h) => ({ ...h }))

function applyFilters(items, filters) {
  let results = [...items]

  if (filters.shift) results = results.filter((h) => h.shift === String(filters.shift).toLowerCase())
  if (filters.shiftDate) results = results.filter((h) => h.shiftDate === String(filters.shiftDate).trim())
  if (filters.patientId) results = results.filter((h) => h.patientId === filters.patientId)

  const limit = filters.limit && filters.limit > 0 ? Math.min(Number(filters.limit), 200) : 100
  return results.slice(0, limit)
}

const handoverRepository = {
  async getAll(filters = {}) {
    if (isDatabaseConnected()) {
      const prisma = getClient()
      const where = {}

      if (filters.shift) where.shift = String(filters.shift).toLowerCase()
      if (filters.shiftDate) where.shiftDate = new Date(String(filters.shiftDate).trim())
      if (filters.patientId) where.patientId = filters.patientId

      const limit = filters.limit && filters.limit > 0 ? Math.min(Number(filters.limit), 200) : 100
      const data = await prisma.handoverLog.findMany({
        where,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { patient: { select: { id: true, fullName: true } } },
      })
      return { data, source: 'database' }
    }

    return { data: applyFilters(store, filters), source: 'mock' }
  },

  async getById(id) {
    if (isDatabaseConnected()) {
      const prisma = getClient()
      const data = await prisma.handoverLog.findUnique({ where: { id } })
      return { data, source: 'database' }
    }

    const data = store.find((h) => h.id === id) ?? null
    return { data, source: 'mock' }
  },

  async create(input) {
    if (isDatabaseConnected()) {
      const prisma = getClient()
      const data = await prisma.handoverLog.create({ data: input })
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
      const data = await prisma.handoverLog.update({ where: { id }, data: input })
      return { data, source: 'database' }
    }

    const idx = store.findIndex((h) => h.id === id)
    if (idx === -1) return { data: null, source: 'mock' }

    store[idx] = { ...store[idx], ...input, updatedAt: new Date().toISOString() }
    return { data: store[idx], source: 'mock' }
  },

  async delete(id) {
    if (isDatabaseConnected()) {
      const prisma = getClient()
      await prisma.handoverLog.delete({ where: { id } })
      return { data: { id, deleted: true }, source: 'database' }
    }

    const idx = store.findIndex((h) => h.id === id)
    if (idx === -1) return { data: null, source: 'mock' }

    store.splice(idx, 1)
    return { data: { id, deleted: true }, source: 'mock' }
  },
}

module.exports = handoverRepository
