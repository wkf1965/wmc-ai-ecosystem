const { randomUUID } = require('crypto')
const { getClient, isDatabaseConnected } = require('../lib/prisma')
const { MOCK_PATIENTS } = require('../shared/mocks/domain-mock-data')

/** In-memory store — active only when DATABASE_ENABLED=false */
const store = MOCK_PATIENTS.map((p) => ({ ...p }))

function applyFilters(items, filters) {
  let results = items.filter((p) => !p.deletedAt)

  if (filters.status) {
    results = results.filter((p) => p.status === String(filters.status).toLowerCase())
  }

  if (filters.search) {
    const q = String(filters.search).toLowerCase()
    results = results.filter(
      (p) =>
        p.fullName.toLowerCase().includes(q) ||
        (p.mrn && p.mrn.toLowerCase().includes(q)) ||
        (p.phone && p.phone.includes(q))
    )
  }

  const limit = filters.limit && filters.limit > 0 ? Math.min(Number(filters.limit), 200) : 100
  return results.slice(0, limit)
}

const patientRepository = {
  async getAll(filters = {}) {
    if (isDatabaseConnected()) {
      const prisma = getClient()
      const where = { deletedAt: null }

      if (filters.status) where.status = String(filters.status).toLowerCase()
      if (filters.search) {
        where.OR = [
          { fullName: { contains: String(filters.search), mode: 'insensitive' } },
          { mrn:      { contains: String(filters.search), mode: 'insensitive' } },
        ]
      }

      const limit = filters.limit && filters.limit > 0 ? Math.min(Number(filters.limit), 200) : 100
      const data = await prisma.patient.findMany({ where, take: limit, orderBy: { updatedAt: 'desc' } })
      return { data, source: 'database' }
    }

    return { data: applyFilters(store, filters), source: 'mock' }
  },

  async getById(id) {
    if (isDatabaseConnected()) {
      const prisma = getClient()
      const data = await prisma.patient.findUnique({ where: { id } })
      return { data, source: 'database' }
    }

    const data = store.find((p) => p.id === id && !p.deletedAt) ?? null
    return { data, source: 'mock' }
  },

  async create(input) {
    if (isDatabaseConnected()) {
      const prisma = getClient()
      const data = await prisma.patient.create({ data: input })
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
      const data = await prisma.patient.update({ where: { id }, data: input })
      return { data, source: 'database' }
    }

    const idx = store.findIndex((p) => p.id === id)
    if (idx === -1) return { data: null, source: 'mock' }

    store[idx] = { ...store[idx], ...input, updatedAt: new Date().toISOString() }
    return { data: store[idx], source: 'mock' }
  },

  async delete(id) {
    if (isDatabaseConnected()) {
      const prisma = getClient()
      // Soft delete
      const data = await prisma.patient.update({ where: { id }, data: { deletedAt: new Date() } })
      return { data, source: 'database' }
    }

    const idx = store.findIndex((p) => p.id === id)
    if (idx === -1) return { data: null, source: 'mock' }

    store[idx] = { ...store[idx], deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    return { data: store[idx], source: 'mock' }
  },
}

module.exports = patientRepository
