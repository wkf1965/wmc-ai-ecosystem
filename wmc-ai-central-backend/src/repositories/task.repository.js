const { randomUUID } = require('crypto')
const { getClient, isDatabaseConnected } = require('../lib/prisma')
const { MOCK_TASKS } = require('../shared/mocks/domain-mock-data')

const store = MOCK_TASKS.map((t) => ({ ...t }))

function applyFilters(items, filters) {
  let results = [...items]

  if (filters.status) results = results.filter((t) => t.status === String(filters.status).toLowerCase())
  if (filters.patientId) results = results.filter((t) => t.patientId === filters.patientId)
  if (filters.domain) results = results.filter((t) => t.domain === String(filters.domain).toLowerCase())
  if (filters.completed !== undefined) {
    const done = String(filters.completed) === 'true'
    results = results.filter((t) => Boolean(t.completed) === done)
  }

  const limit = filters.limit && filters.limit > 0 ? Math.min(Number(filters.limit), 200) : 100
  return results.slice(0, limit)
}

const taskRepository = {
  async getAll(filters = {}) {
    if (isDatabaseConnected()) {
      const prisma = getClient()
      const where = {}

      if (filters.status) where.status = String(filters.status).toLowerCase()
      if (filters.patientId) where.patientId = filters.patientId
      if (filters.domain) where.domain = String(filters.domain).toLowerCase()
      if (filters.completed !== undefined) where.completed = String(filters.completed) === 'true'

      const limit = filters.limit && filters.limit > 0 ? Math.min(Number(filters.limit), 200) : 100
      const data = await prisma.task.findMany({
        where,
        take: limit,
        orderBy: [{ priority: 'desc' }, { dueAt: 'asc' }],
        include: {
          patient:         { select: { id: true, fullName: true } },
          assignedToStaff: { select: { id: true, fullName: true } },
        },
      })
      return { data, source: 'database' }
    }

    return { data: applyFilters(store, filters), source: 'mock' }
  },

  async getById(id) {
    if (isDatabaseConnected()) {
      const prisma = getClient()
      const data = await prisma.task.findUnique({
        where: { id },
        include: {
          patient:         { select: { id: true, fullName: true } },
          assignedToStaff: { select: { id: true, fullName: true } },
        },
      })
      return { data, source: 'database' }
    }

    const data = store.find((t) => t.id === id) ?? null
    return { data, source: 'mock' }
  },

  async create(input) {
    if (isDatabaseConnected()) {
      const prisma = getClient()
      const data = await prisma.task.create({ data: input })
      return { data, source: 'database' }
    }

    const now = new Date().toISOString()
    const record = {
      id: randomUUID(),
      ...input,
      status: input.status ?? 'pending',
      completed: input.completed ?? false,
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
      const data = await prisma.task.update({ where: { id }, data: input })
      return { data, source: 'database' }
    }

    const idx = store.findIndex((t) => t.id === id)
    if (idx === -1) return { data: null, source: 'mock' }

    const updated = {
      ...store[idx],
      ...input,
      updatedAt: new Date().toISOString(),
    }
    // Keep completed flag in sync with status
    if (input.status === 'done') updated.completed = true
    if (input.status && input.status !== 'done') updated.completed = false

    store[idx] = updated
    return { data: store[idx], source: 'mock' }
  },

  async delete(id) {
    if (isDatabaseConnected()) {
      const prisma = getClient()
      const data = await prisma.task.update({ where: { id }, data: { status: 'cancelled' } })
      return { data, source: 'database' }
    }

    const idx = store.findIndex((t) => t.id === id)
    if (idx === -1) return { data: null, source: 'mock' }

    store[idx] = { ...store[idx], status: 'cancelled', updatedAt: new Date().toISOString() }
    return { data: store[idx], source: 'mock' }
  },
}

module.exports = taskRepository
