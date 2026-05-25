/**
 * Mock medication data — replaced by Prisma queries when DATABASE_ENABLED=true.
 */

const PATIENT_AH_CHONG = '11111111-1111-4111-8111-111111111111'
const PATIENT_MARY_LIM = '22222222-2222-4222-8222-222222222222'
const PATIENT_JOHN_TAN = '33333333-3333-4333-8333-333333333333'

/** Medication schedules — recurring prescriptions */
const MOCK_MED_SCHEDULES = [
  {
    id:            'sched-001',
    patientId:     PATIENT_AH_CHONG,
    patientName:   'Ah Chong',
    medicineName:  'Amlodipine',
    dosage:        '5mg',
    route:         'oral',
    frequency:     'once daily',
    scheduledTime: '08:00',
    prescribedBy:  'Dr Lee',
    startDate:     '2026-05-18',
    active:        true,
    mock:          true,
  },
  {
    id:            'sched-002',
    patientId:     PATIENT_AH_CHONG,
    patientName:   'Ah Chong',
    medicineName:  'Metformin',
    dosage:        '500mg',
    route:         'oral',
    frequency:     'twice daily',
    scheduledTime: '08:00,20:00',
    prescribedBy:  'Dr Lee',
    startDate:     '2026-05-18',
    active:        true,
    mock:          true,
  },
  {
    id:            'sched-003',
    patientId:     PATIENT_MARY_LIM,
    patientName:   'Mary Lim',
    medicineName:  'Aspirin',
    dosage:        '100mg',
    route:         'oral',
    frequency:     'once daily',
    scheduledTime: '08:00',
    prescribedBy:  'Dr Lee',
    startDate:     '2026-05-10',
    active:        true,
    mock:          true,
  },
  {
    id:            'sched-004',
    patientId:     PATIENT_JOHN_TAN,
    patientName:   'John Tan',
    medicineName:  'Omeprazole',
    dosage:        '20mg',
    route:         'oral',
    frequency:     'once daily',
    scheduledTime: '07:00',
    prescribedBy:  'Dr Ahmad',
    startDate:     '2026-05-15',
    active:        true,
    mock:          true,
  },
]

/** Administration records — when a dose was actually given */
const MOCK_MED_RECORDS = [
  {
    id:           'med-001',
    scheduleId:   'sched-001',
    patientId:    PATIENT_AH_CHONG,
    patientName:  'Ah Chong',
    medicineName: 'Amlodipine',
    dosage:       '5mg',
    route:        'oral',
    givenBy:      'Nurse Amy',
    givenAt:      '2026-05-20T08:05:00.000Z',
    notes:        null,
    status:       'given',
    mock:         true,
  },
  {
    id:           'med-002',
    scheduleId:   'sched-003',
    patientId:    PATIENT_MARY_LIM,
    patientName:  'Mary Lim',
    medicineName: 'Aspirin',
    dosage:       '100mg',
    route:        'oral',
    givenBy:      'Nurse Amy',
    givenAt:      '2026-05-20T08:10:00.000Z',
    notes:        null,
    status:       'given',
    mock:         true,
  },
]

module.exports = { MOCK_MED_SCHEDULES, MOCK_MED_RECORDS }
