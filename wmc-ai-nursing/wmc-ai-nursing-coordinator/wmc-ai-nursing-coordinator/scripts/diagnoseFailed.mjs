/**
 * Targeted diagnostic for a failed Google Sheet save.
 * Replays record a10521dc against the Vitals tab and prints every detail.
 */
import 'dotenv/config'
import { google } from 'googleapis'

const SHEET_ID    = process.env.GOOGLE_SHEET_ID    ?? ''
const EMAIL       = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? ''
const RAW_KEY     = process.env.GOOGLE_PRIVATE_KEY ?? ''
const PRIVATE_KEY = RAW_KEY.replace(/\\n/g, '\n')
const TAB         = 'Vitals'

console.log('\n════════════════════════════════════════════════════════════════')
console.log('  WMC Google Sheet — Targeted Failure Diagnostic')
console.log('════════════════════════════════════════════════════════════════\n')

// ── Credentials ───────────────────────────────────────────────────────────────
console.log('▶ CREDENTIALS')
console.log('  spreadsheetId :', SHEET_ID   || '❌ MISSING')
console.log('  service email :', EMAIL      || '❌ MISSING')
console.log('  private key   :', PRIVATE_KEY
  ? `✅ ${PRIVATE_KEY.length} chars | starts: "${PRIVATE_KEY.slice(0,27)}" | ends: "${PRIVATE_KEY.slice(-26)}"`
  : '❌ MISSING')
console.log('  newlines      :', (PRIVATE_KEY.match(/\n/g)||[]).length, 'real \\n found')
console.log('  has BEGIN     :', PRIVATE_KEY.includes('BEGIN PRIVATE KEY') ? '✅' : '❌ MISSING')
console.log('  has END       :', PRIVATE_KEY.includes('END PRIVATE KEY')   ? '✅' : '❌ MISSING')
console.log()

if (!SHEET_ID || !EMAIL || !PRIVATE_KEY) {
  console.error('❌ Cannot proceed — missing credentials. Fix .env and retry.\n')
  process.exit(1)
}

// ── Auth ──────────────────────────────────────────────────────────────────────
console.log('▶ BUILDING JWT AUTH')
const auth = new google.auth.JWT({
  email:  EMAIL,
  key:    PRIVATE_KEY,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
})

let accessToken
try {
  console.log('  Requesting access token from Google...')
  const tokenRes = await auth.getAccessToken()
  accessToken = tokenRes?.token ?? tokenRes?.res?.data?.access_token
  if (accessToken) {
    console.log('  ✅ Access token obtained:', accessToken.slice(0,20) + '...')
  } else {
    console.log('  ⚠️  Token response:', JSON.stringify(tokenRes))
  }
} catch (tokenErr) {
  console.error('  ❌ FAILED to get access token')
  console.error('  message:', tokenErr?.message)
  console.error('  code   :', tokenErr?.code)
  if (tokenErr?.response?.data) console.error('  body   :', JSON.stringify(tokenErr.response.data, null, 2))
  process.exit(1)
}
console.log()

// ── Read spreadsheet metadata ─────────────────────────────────────────────────
console.log('▶ READING SPREADSHEET METADATA')
console.log('  spreadsheetId:', SHEET_ID)
const sheets = google.sheets({ version: 'v4', auth })
let existingTabs = []
try {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: SHEET_ID,
    fields: 'spreadsheetId,properties.title,sheets.properties.title',
  })
  console.log('  ✅ Spreadsheet title :', meta.data.properties?.title)
  existingTabs = (meta.data.sheets ?? []).map(s => s.properties?.title)
  console.log('  Existing tabs       :', existingTabs.join(', ') || '(none)')

  const required = ['Admissions','Vitals','Falls','Turning','Rehab','Medicine','Alerts']
  const missing  = required.filter(t => !existingTabs.includes(t))
  if (missing.length) {
    console.log('  ⚠️  Missing tabs     :', missing.join(', '), '← CREATE THESE in the spreadsheet')
  } else {
    console.log('  ✅ All required tabs present')
  }
} catch (metaErr) {
  console.error('  ❌ FAILED to read spreadsheet metadata')
  console.error('  message:', metaErr?.message)
  console.error('  code   :', metaErr?.code)
  console.error('  status :', metaErr?.status)
  if (metaErr?.response?.data) console.error('  body   :', JSON.stringify(metaErr.response.data, null, 2))
  process.exit(1)
}
console.log()

// ── Check target tab ──────────────────────────────────────────────────────────
console.log(`▶ TARGET TAB CHECK — "${TAB}"`)
const tabExists = existingTabs.includes(TAB)
console.log(`  Tab "${TAB}" exists:`, tabExists ? '✅ YES' : '❌ NO — must create it first')
if (!tabExists) {
  console.error(`\n❌ Tab "${TAB}" not found. Create it in the spreadsheet and retry.\n`)
  process.exit(1)
}
console.log()

// ── Replay the failed record ──────────────────────────────────────────────────
console.log('▶ REPLAYING FAILED RECORD  (id: a10521dc...)')
console.log('  workflow    : vitals')
console.log('  patient     : Ali')
console.log('  room        : 2')
console.log('  bp          : 130/89')
console.log(`  target tab  : ${TAB}!A1`)

const row = [
  new Date().toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' }),
  'VITALS',
  '-4853741756',
  'replay-test',
  'Ali', '2', '130/89', '-', '-', '-', '-', '-',
]
console.log('  row values  :', JSON.stringify(row))
console.log()

try {
  console.log('▶ CALLING sheets.spreadsheets.values.append ...')
  const res = await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${TAB}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] },
  })
  console.log('\n  ✅ APPEND SUCCESS')
  console.log('  updatedRange :', res.data?.updates?.updatedRange)
  console.log('  updatedRows  :', res.data?.updates?.updatedRows)
  console.log('  updatedCells :', res.data?.updates?.updatedCells)
} catch (apiErr) {
  console.error('\n  ❌ GOOGLE API ERROR ─────────────────────────────────────────')
  console.error('  message :', apiErr?.message)
  console.error('  code    :', apiErr?.code)
  console.error('  status  :', apiErr?.status)
  console.error('  errors  :', JSON.stringify(apiErr?.errors ?? [], null, 2))
  if (apiErr?.response?.data) {
    console.error('  API body:', JSON.stringify(apiErr.response.data, null, 2))
  }
  console.error('  ─────────────────────────────────────────────────────────────\n')
  process.exit(1)
}

console.log('\n════════════════════════════════════════════════════════════════')
console.log('  ✅ ALL CHECKS PASSED — Google Sheet is working correctly')
console.log('════════════════════════════════════════════════════════════════\n')
