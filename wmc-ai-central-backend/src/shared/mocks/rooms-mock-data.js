/**
 * Mock room and bed data — replaced by Prisma queries when DATABASE_ENABLED=true.
 * Ward structure: A (general), B (nursing care), C (rehab), D (isolation)
 */

const MOCK_ROOMS = [
  { id: 'room-A101', roomNumber: 'A-101', ward: 'General', totalBeds: 2, occupiedBeds: 1, status: 'available', floor: 1 },
  { id: 'room-A102', roomNumber: 'A-102', ward: 'General', totalBeds: 2, occupiedBeds: 2, status: 'full',      floor: 1 },
  { id: 'room-B201', roomNumber: 'B-201', ward: 'Nursing Care', totalBeds: 1, occupiedBeds: 1, status: 'full',      floor: 2 },
  { id: 'room-B202', roomNumber: 'B-202', ward: 'Nursing Care', totalBeds: 1, occupiedBeds: 0, status: 'available', floor: 2 },
  { id: 'room-B203', roomNumber: 'B-203', ward: 'Nursing Care', totalBeds: 2, occupiedBeds: 1, status: 'available', floor: 2 },
  { id: 'room-C301', roomNumber: 'C-301', ward: 'Rehabilitation', totalBeds: 2, occupiedBeds: 0, status: 'available', floor: 3 },
  { id: 'room-C302', roomNumber: 'C-302', ward: 'Rehabilitation', totalBeds: 2, occupiedBeds: 2, status: 'full',      floor: 3 },
  { id: 'room-D401', roomNumber: 'D-401', ward: 'Isolation',  totalBeds: 1, occupiedBeds: 0, status: 'available', floor: 4 },
]

const MOCK_ASSIGNMENTS = [
  {
    id:           'assign-001',
    patientId:    '11111111-1111-4111-8111-111111111111',
    patientName:  'Ah Chong',
    roomId:       'room-A102',
    roomNumber:   'A-102',
    ward:         'General',
    bedNumber:    1,
    assignedAt:   '2026-05-18T08:00:00.000Z',
    status:       'active',
    mock:         true,
  },
  {
    id:           'assign-002',
    patientId:    '22222222-2222-4222-8222-222222222222',
    patientName:  'Mary Lim',
    roomId:       'room-B201',
    roomNumber:   'B-201',
    ward:         'Nursing Care',
    bedNumber:    1,
    assignedAt:   '2026-05-10T08:00:00.000Z',
    status:       'active',
    mock:         true,
  },
  {
    id:           'assign-003',
    patientId:    '33333333-3333-4333-8333-333333333333',
    patientName:  'John Tan',
    roomId:       'room-A102',
    roomNumber:   'A-102',
    ward:         'General',
    bedNumber:    2,
    assignedAt:   '2026-05-15T10:00:00.000Z',
    status:       'active',
    mock:         true,
  },
]

module.exports = { MOCK_ROOMS, MOCK_ASSIGNMENTS }
