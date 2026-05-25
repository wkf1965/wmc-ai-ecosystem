const { randomUUID } = require('crypto')
const { getClient, isDatabaseConnected } = require('../lib/prisma')
const { MOCK_CRM_LEADS } = require('../shared/mocks/domain-mock-data')

const store = MOCK_CRM_LEADS.map((l) => ({ ...l }))

function applyFilters(items, filters) {
  let results = [...items]

  if (filters.leadStatus) results = results.filter((l) => l.leadStatus === filters.leadStatus)
  if (filters.inquiryType) results = results.filter((l) => l.inquiryType === String(filters.inquiryType).toLowerCase())
  if (filters.priority) results = results.filter((l) => l.priority === String(filters.priority).toLowerCase())

  const limit = filters.limit && filters.limit > 0 ? Math.min(Number(filters.limit), 200) : 100
  return results.slice(0, limit)
}

const crmRepository = {
  async getAll(filters = {}) {
    if (isDatabaseConnected()) {
      const prisma = getClient()
      const where = {}

      if (filters.leadStatus) where.leadStatus = filters.leadStatus
      if (filters.inquiryType) where.inquiryType = String(filters.inquiryType).toLowerCase()
      if (filters.priority) where.priority = String(filters.priority).toLowerCase()

      const limit = filters.limit && filters.limit > 0 ? Math.min(Number(filters.limit), 200) : 100
      const data = await prisma.crmLead.findMany({
        where,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { assignedTo: { select: { id: true, fullName: true } } },
      })
      return { data, source: 'database' }
    }

    return { data: applyFilters(store, filters), source: 'mock' }
  },

  async getById(id) {
    if (isDatabaseConnected()) {
      const prisma = getClient()
      const data = await prisma.crmLead.findUnique({ where: { id } })
      return { data, source: 'database' }
    }

    const data = store.find((l) => l.id === id) ?? null
    return { data, source: 'mock' }
  },

  async create(input) {
    if (isDatabaseConnected()) {
      const prisma = getClient()
      const data = await prisma.crmLead.create({ data: input })
      return { data, source: 'database' }
    }

    const now = new Date().toISOString()
    const record = {
      id: randomUUID(),
      ...input,
      leadStatus: input.leadStatus ?? 'New',
      status: input.status ?? 'Active',
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
      const data = await prisma.crmLead.update({ where: { id }, data: input })
      return { data, source: 'database' }
    }

    const idx = store.findIndex((l) => l.id === id)
    if (idx === -1) return { data: null, source: 'mock' }

    store[idx] = { ...store[idx], ...input, updatedAt: new Date().toISOString() }
    return { data: store[idx], source: 'mock' }
  },

  async delete(id) {
    if (isDatabaseConnected()) {
      const prisma = getClient()
      const data = await prisma.crmLead.update({ where: { id }, data: { status: 'Archived' } })
      return { data, source: 'database' }
    }

    const idx = store.findIndex((l) => l.id === id)
    if (idx === -1) return { data: null, source: 'mock' }

    store[idx] = { ...store[idx], status: 'Archived', updatedAt: new Date().toISOString() }
    return { data: store[idx], source: 'mock' }
  },
}

module.exports = crmRepository
