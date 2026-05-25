const { randomUUID } = require('crypto')
const { getClient, isDatabaseConnected } = require('../lib/prisma')
const { MOCK_NURSING_RECORDS } = require('../shared/mocks/domain-mock-data')

const store = MOCK_NURSING_RECORDS.map((r) => ({ ...r }))

function applyFilters(items, filters) {
  let results = [...items]

  if (filters.patientId) results = results.filter((r) => r.patientId === filters.patientId)
  if (filters.shiftDate) results = results.filter((r) => r.shiftDate === String(filters.shiftDate).trim())
  if (filters.shift) results = results.filter((r) => r.shift === String(filters.shift).toLowerCase())

  const limit = filters.limit && filters.limit > 0 ? Math.min(Number(filters.limit), 200) : 100
  return results.slice(0, limit)
}

const nursingRepository = {
  async getAll(filters = {}) {
    if (isDatabaseConnected()) {
      const prisma = getClient()
      const where = {}

      if (filters.patientId) where.patientId = filters.patientId
      if (filters.shiftDate) where.shiftDate = new Date(String(filters.shiftDate).trim())
      if (filters.shift) where.shift = String(filters.shift).toLowerCase()

      const limit = filters.limit && filters.limit > 0 ? Math.min(Number(filters.limit), 200) : 100
      const data = await prisma.nursingRecord.findMany({
        where,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          patient: { select: { id: true, fullName: true } },
          staff:   { select: { id: true, fullName: true } },
        },
      })
      return { data, source: 'database' }
    }

    return { data: applyFilters(store, filters), source: 'mock' }
  },

  async getById(id) {
    if (isDatabaseConnected()) {
      const prisma = getClient()
      const data = await prisma.nursingRecord.findUnique({
        where: { id },
        include: {
          patient: { select: { id: true, fullName: true } },
          staff:   { select: { id: true, fullName: true } },
        },
      })
      return { data, source: 'database' }
    }

    const data = store.find((r) => r.id === id) ?? null
    return { data, source: 'mock' }
  },

  async create(input) {
    if (isDatabaseConnected()) {
      const prisma = getClient()
      const data = await prisma.nursingRecord.create({ data: input })
      return { data, source: 'database' }
    }

    const now = new Date().toISOString()
    const record = { id: randomUUID(), ...input, status: input.status ?? 'active', createdAt: now, updatedAt: now, mock: true }
    store.unshift(record)
    return { data: record, source: 'mock' }
  },

  async update(id, input) {
    if (isDatabaseConnected()) {
      const prisma = getClient()
      const data = await prisma.nursingRecord.update({ where: { id }, data: input })
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
      const data = await prisma.nursingRecord.update({ where: { id }, data: { status: 'archived' } })
      return { data, source: 'database' }
    }

    const idx = store.findIndex((r) => r.id === id)
    if (idx === -1) return { data: null, source: 'mock' }

    store.splice(idx, 1)
    return { data: { id, deleted: true }, source: 'mock' }
  },
}

module.exports = nursingRepository
