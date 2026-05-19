/**
 * Room extraction tests — run: npm run test:parser
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  extractRoomFromMessage,
  normalizeTelegramTextForRoomParse,
  parseTelegramNurseMessage,
} from './telegramNurseParser.js'
import {
  patientNameTrimmedFromRosterRow,
  patientsroomRowMatchesStrictRoom,
  rosterPatientDisplayName,
  rosterRoomsMatch,
} from './patientRosterResolve.js'

test('extractRoomFromMessage: formats & regression', () => {
  assert.equal(extractRoomFromMessage('Room 5 weak mobility'), '5')
  assert.equal(extractRoomFromMessage('rm3 fall risk'), '3')
  assert.equal(extractRoomFromMessage('Room:8 poor appetite'), '8')
  assert.equal(extractRoomFromMessage('Ward 12 aggressive behaviour'), '12')
  assert.equal(extractRoomFromMessage('Room 2 patient poor appetite and weak mobility'), '2')
  assert.equal(extractRoomFromMessage('room 2 patient poor appetite'), '2')
  assert.equal(extractRoomFromMessage('Rm 2 patient poor appetite'), '2')
  assert.equal(extractRoomFromMessage('rm2 patient poor appetite'), '2')
  assert.equal(extractRoomFromMessage('Room #2 patient poor appetite'), '2')
  assert.equal(extractRoomFromMessage('Bed 2 patient poor appetite'), '2')
})

test('extractRoomFromMessage: room anywhere in sentence', () => {
  assert.equal(
    extractRoomFromMessage('Patient Ali room 5 fell down and poor appetite'),
    '5',
  )
  assert.equal(extractRoomFromMessage('Room 5 patient Ali weak'), '5')
  assert.equal(extractRoomFromMessage('Patient Ali room 5'), '5')
  assert.equal(extractRoomFromMessage('Ali room 5 fell'), '5')
  assert.equal(extractRoomFromMessage('Ali rm5 fell'), '5')
  assert.equal(extractRoomFromMessage('vitals rm 5 ok'), '5')
  assert.equal(extractRoomFromMessage('update room: 5 poor intake'), '5')
  assert.equal(extractRoomFromMessage('Bed #5 confused'), '5')
  assert.equal(extractRoomFromMessage('bed 5 refused tray'), '5')
  assert.equal(extractRoomFromMessage('WARD 12 fever'), '12')
})

test('normalizeTelegramTextForRoomParse: fullwidth digits', () => {
  assert.equal(extractRoomFromMessage('Room \uFF12 patient poor appetite'), '2')
})

test('parseTelegramNurseMessage: Room 2 yields patientRoom for roster resolution', () => {
  const p = parseTelegramNurseMessage('Room 2 patient poor appetite and weak mobility')
  assert.equal(p.patientRoom, '2')
  assert.ok(p.patientNameGuess == null || !/^poor\b/i.test(String(p.patientNameGuess)))
})

test('extractRoomFromMessage: patient Ali room 2 and glued Room2', () => {
  assert.equal(extractRoomFromMessage('Patient Ali room 2 fell down'), '2')
  assert.equal(extractRoomFromMessage('Room2 patient Ali fell down'), '2')
})

test('normalizeTelegramTextForRoomParse trims BOM and NBSP', () => {
  const t = normalizeTelegramTextForRoomParse('\uFEFFRoom\u00A02 patient')
  assert.match(t, /^Room 2/)
})

test('rosterRoomsMatch: trim, case, numeric forms', () => {
  assert.ok(rosterRoomsMatch('2', '2'))
  assert.ok(rosterRoomsMatch('02', '2'))
  assert.ok(rosterRoomsMatch('302A', '302a'))
  assert.ok(!rosterRoomsMatch('3', '2'))
})

test('patientsroomRowMatchesStrictRoom: trim string equality on room_number', () => {
  const row = { room_number: '2', patient_name: 'ali' }
  assert.ok(patientsroomRowMatchesStrictRoom(row, '2'))
  assert.ok(patientsroomRowMatchesStrictRoom(row, 2))
  assert.ok(!patientsroomRowMatchesStrictRoom(row, '02'))
  assert.ok(!patientsroomRowMatchesStrictRoom(row, '3'))
})

test('patientNameTrimmedFromRosterRow: explicit Sheet/API keys only', () => {
  assert.equal(patientNameTrimmedFromRosterRow({ room_number: '2', patient_name: 'ali' }), 'ali')
  assert.equal(
    patientNameTrimmedFromRosterRow({ room_number: '2', 'Patient Name': ' ali ' }),
    'ali',
  )
  assert.equal(patientNameTrimmedFromRosterRow({ room_number: '2', patientName: 'Sam' }), 'Sam')
  assert.equal(patientNameTrimmedFromRosterRow({ room_number: '1' }), '')
})

test('rosterPatientDisplayName: Unknown when all name fields empty', () => {
  assert.equal(rosterPatientDisplayName({ patient_name: 'ali' }), 'ali')
  assert.equal(rosterPatientDisplayName({ room_number: '1' }), 'Unknown')
})
