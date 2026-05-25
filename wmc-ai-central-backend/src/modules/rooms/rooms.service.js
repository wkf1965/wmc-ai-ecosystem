const { randomUUID } = require('crypto')
const { MOCK_ROOMS, MOCK_ASSIGNMENTS } = require('../../shared/mocks/rooms-mock-data')

// In-memory stores (Prisma-ready — swap getAll/create with prisma.room.findMany() etc.)
const roomStore       = MOCK_ROOMS.map((r) => ({ ...r }))
const assignmentStore = MOCK_ASSIGNMENTS.map((a) => ({ ...a }))

// ── Rooms ─────────────────────────────────────────────────────────────────────

function getRooms(filters = {}) {
  let rooms = [...roomStore]
  if (filters.ward)   rooms = rooms.filter((r) => r.ward.toLowerCase().includes(String(filters.ward).toLowerCase()))
  if (filters.status) rooms = rooms.filter((r) => r.status === filters.status)

  const totalBeds    = rooms.reduce((s, r) => s + r.totalBeds, 0)
  const occupiedBeds = rooms.reduce((s, r) => s + r.occupiedBeds, 0)
  const availableBeds = totalBeds - occupiedBeds

  return {
    totalRooms:    rooms.length,
    totalBeds,
    occupiedBeds,
    availableBeds,
    occupancyRate: totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0,
    rooms,
    source: 'mock',
    mock:   true,
  }
}

function assignPatientToRoom(input) {
  const { patientId, patientName, roomNumber, bedNumber } = input

  if (!patientId)  throw Object.assign(new Error('patientId is required'),  { status: 400 })
  if (!roomNumber) throw Object.assign(new Error('roomNumber is required'), { status: 400 })

  // Find the room
  const room = roomStore.find((r) => r.roomNumber === roomNumber)
  if (!room) throw Object.assign(new Error(`Room ${roomNumber} not found`), { status: 404 })
  if (room.status === 'full') throw Object.assign(new Error(`Room ${roomNumber} is full`), { status: 409 })

  // Discharge previous active assignment for this patient
  assignmentStore.forEach((a) => { if (a.patientId === patientId && a.status === 'active') a.status = 'discharged' })

  const assignment = {
    id:          randomUUID(),
    patientId,
    patientName: patientName ?? null,
    roomId:      room.id,
    roomNumber:  room.roomNumber,
    ward:        room.ward,
    bedNumber:   bedNumber ?? (room.occupiedBeds + 1),
    assignedAt:  new Date().toISOString(),
    status:      'active',
    mock:        true,
  }

  assignmentStore.unshift(assignment)

  // Update room occupancy
  room.occupiedBeds = Math.min(room.occupiedBeds + 1, room.totalBeds)
  room.status = room.occupiedBeds >= room.totalBeds ? 'full' : 'available'

  return { assignment, room, source: 'mock', mock: true }
}

function getAssignments(filters = {}) {
  let results = assignmentStore.filter((a) => a.status === 'active')
  if (filters.patientId) results = results.filter((a) => a.patientId === filters.patientId)
  if (filters.roomNumber) results = results.filter((a) => a.roomNumber === filters.roomNumber)
  return {
    count:       results.length,
    assignments: results,
    source: 'mock',
    mock:   true,
  }
}

module.exports = { getRooms, assignPatientToRoom, getAssignments }
