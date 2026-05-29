import { google } from 'googleapis'
import { log } from '../utils/logger.js'
import { computeWorkedHours, todayString } from '../../lib/attendanceCalculation.js'

const ATTENDANCE_TAB = 'Attendance_Records'
const DUTY_ROSTER_TAB = 'Duty_Roster'
const ALERT_CHAT_ID = String(process.env.TELEGRAM_CHAT_ID || '').trim()
const ABSENT_CHECK_INTERVAL_MS = 60 * 1000

const SHIFT_WINDOWS = [
  { shift: 'Morning', start: '06:00', end: '14:00' },
  { shift: 'Evening', start: '14:00', end: '22:00' },
  { shift: 'Night', start: '22:00', end: '06:00' },
]

function createAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? process.env.GOOGLE_CLIENT_EMAIL ?? ''
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n')
  if (!email || !privateKey) throw new Error('Google credentials not configured')
  return new google.auth.JWT({
    email,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}

function sid() {
  const id = process.env.GOOGLE_SHEET_ID ?? ''
  if (!id) throw new Error('GOOGLE_SHEET_ID not configured')
  return id
}

function normalizeName(value) {
  return String(value || '').trim().toLowerCase()
}

function toMinutes(hhmm) {
  const match = String(hhmm || '').trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return -1
  return Number(match[1]) * 60 + Number(match[2])
}

function lateMinutes(punchIn, expectedStart) {
  const p = toMinutes(punchIn)
  const e = toMinutes(expectedStart)
  if (p < 0 || e < 0) return 0
  return Math.max(0, p - e)
}

function statusFromPunchIn(punchIn, expectedStart) {
  const late = lateMinutes(punchIn, expectedStart)
  return late > 15 ? 'Late' : 'Present'
}

function inferShift(hhmm) {
  const mins = toMinutes(hhmm)
  if (mins >= 6 * 60 && mins < 14 * 60) return SHIFT_WINDOWS[0]
  if (mins >= 14 * 60 && mins < 22 * 60) return SHIFT_WINDOWS[1]
  return SHIFT_WINDOWS[2]
}

async function ensureTabReady(tabName, headers) {
  const sheets = google.sheets({ version: 'v4', auth: createAuth() })
  const spreadsheetId = sid()
  const meta = await sheets.spreadsheets.get({ spreadsheetId })
  const exists = (meta.data.sheets || []).some((sheet) => String(sheet?.properties?.title || '') === tabName)
  if (exists) return
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ addSheet: { properties: { title: tabName } } }],
    },
  })
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tabName}!A1:${String.fromCharCode(64 + headers.length)}1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [headers] },
  })
  log.info(`[duty-roster-sync] created missing tab: ${tabName}`)
}

async function readRows(tabName, range) {
  const sheets = google.sheets({ version: 'v4', auth: createAuth() })
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sid(),
    range: `${tabName}!${range}`,
  })
  return res.data.values ?? []
}

async function appendRow(tabName, values, range = 'A1') {
  const sheets = google.sheets({ version: 'v4', auth: createAuth() })
  await sheets.spreadsheets.values.append({
    spreadsheetId: sid(),
    range: `${tabName}!${range}`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [values] },
  })
}

async function updateRow(tabName, rowNumber, values, endColumn) {
  const sheets = google.sheets({ version: 'v4', auth: createAuth() })
  await sheets.spreadsheets.values.update({
    spreadsheetId: sid(),
    range: `${tabName}!A${rowNumber}:${endColumn}${rowNumber}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [values] },
  })
}

async function upsertAttendanceRecordRow(input) {
  await ensureTabReady(ATTENDANCE_TAB, [
    'Record ID', 'Date', 'Staff Name', 'Punch In', 'Punch Out',
    'Working Hours', 'OT Hours', 'Status', 'Created At',
  ])
  const rows = await readRows(ATTENDANCE_TAB, 'A:I')
  const matchIdx = rows.findIndex((row, index) => index > 0 && String(row[1] || '') === input.date && normalizeName(row[2]) === normalizeName(input.staffName))
  const values = [
    input.recordId,
    input.date,
    input.staffName,
    input.punchIn || '',
    input.punchOut || '',
    Number(input.workingHours || 0),
    Number(input.otHours || 0),
    input.status,
    input.createdAt,
  ]
  if (matchIdx > 0) {
    await updateRow(ATTENDANCE_TAB, matchIdx + 1, values, 'I')
  } else {
    await appendRow(ATTENDANCE_TAB, values)
  }
}

async function upsertDutyRosterRow(input) {
  await ensureTabReady(DUTY_ROSTER_TAB, [
    'Date', 'Shift', 'Staff Name', 'Expected Start', 'Expected End',
    'Punch In', 'Punch Out', 'Status', 'Late Minutes', 'Remarks',
  ])
  const rows = await readRows(DUTY_ROSTER_TAB, 'A:J')
  const matchIdx = rows.findIndex(
    (row, index) =>
      index > 0 &&
      String(row[0] || '') === input.date &&
      String(row[1] || '') === input.shift &&
      normalizeName(row[2]) === normalizeName(input.staffName),
  )
  const values = [
    input.date,
    input.shift,
    input.staffName,
    input.expectedStart,
    input.expectedEnd,
    input.punchIn || '',
    input.punchOut || '',
    input.status,
    Number(input.lateMins || 0),
    input.remarks || '',
  ]
  if (matchIdx > 0) {
    await updateRow(DUTY_ROSTER_TAB, matchIdx + 1, values, 'J')
  } else {
    await appendRow(DUTY_ROSTER_TAB, values)
  }
}

export async function syncDutyRosterFromPunchIn(input) {
  const punchIn = String(input.punchIn || '').trim()
  const shift = inferShift(punchIn)
  const status = statusFromPunchIn(punchIn, shift.start)
  const lateMins = lateMinutes(punchIn, shift.start)
  const recordId = `att-${input.date}-${normalizeName(input.staffName).replace(/[^a-z0-9]/g, '')}`
  const createdAt = new Date().toISOString()

  await upsertAttendanceRecordRow({
    recordId,
    date: input.date,
    staffName: input.staffName,
    punchIn,
    punchOut: '',
    workingHours: 0,
    otHours: 0,
    status: 'Present',
    createdAt,
  })

  await upsertDutyRosterRow({
    date: input.date,
    shift: shift.shift,
    staffName: input.staffName,
    expectedStart: shift.start,
    expectedEnd: shift.end,
    punchIn,
    punchOut: '',
    status,
    lateMins,
    remarks: 'Auto updated from /punchin',
  })
}

export async function syncDutyRosterFromPunchOut(input) {
  const recordId = `att-${input.date}-${normalizeName(input.staffName).replace(/[^a-z0-9]/g, '')}`
  const workingHours = computeWorkedHours(input.punchIn, input.punchOut)
  await upsertAttendanceRecordRow({
    recordId,
    date: input.date,
    staffName: input.staffName,
    punchIn: input.punchIn,
    punchOut: input.punchOut,
    workingHours,
    otHours: Number(input.otHours || 0),
    status: 'Present',
    createdAt: new Date().toISOString(),
  })

  const shift = inferShift(input.punchIn)
  const lateMins = lateMinutes(input.punchIn, shift.start)
  await upsertDutyRosterRow({
    date: input.date,
    shift: shift.shift,
    staffName: input.staffName,
    expectedStart: shift.start,
    expectedEnd: shift.end,
    punchIn: input.punchIn,
    punchOut: input.punchOut,
    status: lateMins > 15 ? 'Late' : 'Present',
    lateMins,
    remarks: 'Auto updated from /punchout',
  })
}

export async function runAutoAbsentCheck(bot) {
  if (!ALERT_CHAT_ID) return
  await ensureTabReady(DUTY_ROSTER_TAB, [
    'Date', 'Shift', 'Staff Name', 'Expected Start', 'Expected End',
    'Punch In', 'Punch Out', 'Status', 'Late Minutes', 'Remarks',
  ])
  const rows = await readRows(DUTY_ROSTER_TAB, 'A2:J5000')
  const today = todayString()
  const nowMinutes = (() => {
    const now = new Date()
    return now.getHours() * 60 + now.getMinutes()
  })()

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]
    const date = String(row[0] || '')
    if (date !== today) continue
    const expectedStart = String(row[3] || '')
    const punchIn = String(row[5] || '')
    const currentStatus = String(row[7] || '')
    const remarks = String(row[9] || '')
    if (punchIn) continue
    const startMins = toMinutes(expectedStart)
    if (startMins < 0) continue

    let nextStatus = currentStatus
    if (nowMinutes >= startMins + 30) nextStatus = 'Absent'
    else if (nowMinutes >= startMins + 15) nextStatus = 'Not Yet Punch In'
    if (!nextStatus || nextStatus === currentStatus) continue

    const newRemarks = nextStatus === 'Absent' && !remarks.includes('[ABSENT_ALERT_SENT]')
      ? `${remarks} [ABSENT_ALERT_SENT]`.trim()
      : remarks
    const values = [
      row[0] || '', row[1] || '', row[2] || '', row[3] || '', row[4] || '',
      row[5] || '', row[6] || '', nextStatus, Number(row[8] || 0), newRemarks,
    ]
    await updateRow(DUTY_ROSTER_TAB, i + 2, values, 'J')

    if (nextStatus === 'Absent' && !remarks.includes('[ABSENT_ALERT_SENT]')) {
      await bot.sendMessage(
        ALERT_CHAT_ID,
        [
          '🚨 Duty Roster Alert',
          `Date: ${row[0] || ''}`,
          `Shift: ${row[1] || ''}`,
          `Staff: ${row[2] || ''}`,
          `Status: Absent`,
          `Expected start: ${row[3] || ''}`,
        ].join('\n'),
      )
    }
  }
}

export function startDutyRosterAutoAbsentChecker(bot) {
  setInterval(() => {
    void runAutoAbsentCheck(bot).catch((error) => {
      log.warn('[duty-roster-check] auto absent checker failed:', error?.message ?? String(error))
    })
  }, ABSENT_CHECK_INTERVAL_MS)
}

export async function getDutyRosterRowsForDate(date = todayString()) {
  await ensureTabReady(DUTY_ROSTER_TAB, [
    'Date', 'Shift', 'Staff Name', 'Expected Start', 'Expected End',
    'Punch In', 'Punch Out', 'Status', 'Late Minutes', 'Remarks',
  ])
  const rows = await readRows(DUTY_ROSTER_TAB, 'A2:J5000')
  return rows
    .filter((row) => String(row[0] || '') === date)
    .map((row) => ({
      date: String(row[0] || ''),
      shift: String(row[1] || ''),
      staffName: String(row[2] || ''),
      expectedStart: String(row[3] || ''),
      expectedEnd: String(row[4] || ''),
      punchIn: String(row[5] || ''),
      punchOut: String(row[6] || ''),
      status: String(row[7] || 'Not Yet Punch In'),
      lateMinutes: Number(row[8] || 0),
      remarks: String(row[9] || ''),
    }))
}
