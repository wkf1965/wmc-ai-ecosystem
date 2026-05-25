/**
 * Mock user accounts — used when AUTH_MODE=mock or DATABASE_ENABLED=false.
 * passwordHash is bcrypt hash of "password123" — never use in production.
 */

const MOCK_USERS = [
  {
    id:           'u1000000-0000-4000-8000-000000000001',
    fullName:     'Dr Admin',
    email:        'admin@wmc.dev',
    role:         'admin',
    passwordHash: '$2a$10$abcdefghijklmnopqrstuuVK5GjCDmy.example.hash.placeholder',
    isActive:     true,
    createdAt:    '2026-01-01T00:00:00.000Z',
    updatedAt:    '2026-01-01T00:00:00.000Z',
    mock:         true,
  },
  {
    id:           'u1000000-0000-4000-8000-000000000002',
    fullName:     'Supervisor Siti',
    email:        'supervisor@wmc.dev',
    role:         'supervisor',
    passwordHash: '$2a$10$abcdefghijklmnopqrstuuVK5GjCDmy.example.hash.placeholder',
    isActive:     true,
    createdAt:    '2026-01-01T00:00:00.000Z',
    updatedAt:    '2026-01-01T00:00:00.000Z',
    mock:         true,
  },
  {
    id:           'u1000000-0000-4000-8000-000000000003',
    fullName:     'Nurse Amy',
    email:        'nurse@wmc.dev',
    role:         'nurse',
    passwordHash: '$2a$10$abcdefghijklmnopqrstuuVK5GjCDmy.example.hash.placeholder',
    isActive:     true,
    createdAt:    '2026-01-15T00:00:00.000Z',
    updatedAt:    '2026-01-15T00:00:00.000Z',
    mock:         true,
  },
  {
    id:           'u1000000-0000-4000-8000-000000000004',
    fullName:     'Therapist Tan',
    email:        'therapist@wmc.dev',
    role:         'therapist',
    passwordHash: '$2a$10$abcdefghijklmnopqrstuuVK5GjCDmy.example.hash.placeholder',
    isActive:     true,
    createdAt:    '2026-02-01T00:00:00.000Z',
    updatedAt:    '2026-02-01T00:00:00.000Z',
    mock:         true,
  },
  {
    id:           'u1000000-0000-4000-8000-000000000005',
    fullName:     'Dr Lee',
    email:        'doctor@wmc.dev',
    role:         'doctor',
    passwordHash: '$2a$10$abcdefghijklmnopqrstuuVK5GjCDmy.example.hash.placeholder',
    isActive:     true,
    createdAt:    '2026-02-01T00:00:00.000Z',
    updatedAt:    '2026-02-01T00:00:00.000Z',
    mock:         true,
  },
  {
    id:           'u1000000-0000-4000-8000-000000000006',
    fullName:     'Frontdesk Farah',
    email:        'frontdesk@wmc.dev',
    role:         'frontdesk',
    passwordHash: '$2a$10$abcdefghijklmnopqrstuuVK5GjCDmy.example.hash.placeholder',
    isActive:     true,
    createdAt:    '2026-03-01T00:00:00.000Z',
    updatedAt:    '2026-03-01T00:00:00.000Z',
    mock:         true,
  },
]

module.exports = { MOCK_USERS }
