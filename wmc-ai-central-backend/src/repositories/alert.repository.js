const { randomUUID } = require('crypto')
const { getClient, isDatabaseConnected } = require('../lib/prisma')
const { MOCK_ALERTS } = require('../shared/mocks/domain-mock-data')

const store = MOCK_ALERTS.map((a) => ({ ...a }))

function applyFilters(items, filters) {
  let results = [...items]

  if (filters.status) results = results.filter((a) => a.status === String(filters.status).toLowerCase())
  if (filters.patientId) results = results.filter((a) => a.patientId === filters.patientId)
  if (filters.severity) results = results.filter((a) => a.severity === String(filters.severity).toLowerCase())
  if (filters.alertType) results = results.filter((a) => a.alertType === String(filters.alertType).toLowerCase())
  if (filters.resolved !== undefined) {
    const res = String(filters.resolved) === 'true'
    results = results.filter((a) => Boolean(a.resolved) === res)
  }

  const limit = filters.limit && filters.limit > 0 ? Math.min(Number(filters.limit), 200) : 100
  return results.slice(0, limit)
}

const alertRepository = {
  async getAll(filters = {}) {
    if (isDatabaseConnected()) {
      const prisma = getClient()
      const where = {}

      if (filters.status) where.status = String(filters.status).toLowerCase()
      if (filters.patientId) where.patientId = filters.patientId
      if (filters.severity) where.severity = String(filters.severity).toLowerCase()
      if (filters.alertType) where.alertType = String(filters.alertType).toLowerCase()
      if (filters.resolved !== undefined) where.resolved = String(filters.resolved) === 'true'

      const limit = filters.limit && filters.limit > 0 ? Math.min(Number(filters.limit), 200) : 100
      const data = await prisma.alert.findMany({
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
      const data = await prisma.alert.findUnique({
        where: { id },
        include: { patient: { select: { id: true, fullName: true } } },
      })
      return { data, source: 'database' }
    }

    const data = store.find((a) => a.id === id) ?? null
    return { data, source: 'mock' }
  },

  async create(input) {
    if (isDatabaseConnected()) {
      const prisma = getClient()
      const data = await prisma.alert.create({ data: input })
      return { data, source: 'database' }
    }

    const now = new Date().toISOString()
    const record = {
      id: randomUUID(),
      ...input,
      status: input.status ?? 'open',
      resolved: input.resolved ?? false,
      createdAt: now,
      updatedAt: now,
      mock: true,
    }
    store.unshift(record)
    return { data: record, source: 'mock' }
  },

  async update(id, input) {
    if (isDatabaseConnected()) {
      const prisma = getClient()
      const data = await prisma.alert.update({ where: { id }, data: input })
      return { data, source: 'database' }
    }

    const idx = store.findIndex((a) => a.id === id)
    if (idx === -1) return { data: null, source: 'mock' }

    const updated = { ...store[idx], ...input, updatedAt: new Date().toISOString() }
    if (input.status === 'resolved') {
      updated.resolved = true
      updated.resolvedAt = updated.resolvedAt ?? new Date().toISOString()
    }

    store[idx] = updated
    return { data: store[idx], source: 'mock' }
  },

  async delete(id) {
    if (isDatabaseConnected()) {
      const prisma = getClient()
      const data = await prisma.alert.update({ where: { id }, data: { status: 'resolved', resolved: true } })
      return { data, source: 'database' }
    }

    const idx = store.findIndex((a) => a.id === id)
    if (idx === -1) return { data: null, source: 'mock' }

    store.splice(idx, 1)
    return { data: { id, deleted: true }, source: 'mock' }
  },
}

module.exports = alertRepository
