/**
 * Live Google Sheet connection test
 * Usage: node scripts/testGoogleSheet.mjs
 */

import 'dotenv/config'
import { google } from 'googleapis'

const SHEET_ID    = process.env.GOOGLE_SHEET_ID
const EMAIL       = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
const RAW_KEY     = process.env.GOOGLE_PRIVATE_KEY ?? ''
const PRIVATE_KEY = RAW_KEY.replace(/\\n/g, '\n')

console.log('\n[test] ─── Google Sheet Connection Test ──────────────────────────────')
console.log('[test]  SHEET_ID :', SHEET_ID   ? `✅ ${SHEET_ID}` : '❌ MISSING')
console.log('[test]  EMAIL    :', EMAIL       ? `✅ ${EMAIL}`    : '❌ MISSING')
console.log('[test]  KEY      :', PRIVATE_KEY ? `✅ ${PRIVATE_KEY.length} chars — starts: ${PRIVATE_KEY.slice(0,40)}` : '❌ MISSING')
console.log('[test]  has BEGIN:', PRIVATE_KEY.includes('BEGIN PRIVATE KEY') ? '✅' : '❌')
console.log('[test]  has END  :', PRIVATE_KEY.includes('END PRIVATE KEY')   ? '✅' : '❌')
console.log('[test]  newlines :', (PRIVATE_KEY.match(/\n/g) || []).length, 'real newlines found')
console.log()

if (!SHEET_ID || !EMAIL || !PRIVATE_KEY) {
  console.error('[test] ❌ Cannot proceed — missing credentials')
  process.exit(1)
}

// ── Build auth ────────────────────────────────────────────────────────────────
console.log('[test] Creating JWT auth...')
const auth = new google.auth.JWT({
  email:  EMAIL,
  key:    PRIVATE_KEY,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
})
const sheets = google.sheets({ version: 'v4', auth })

// ── Test 1: Read spreadsheet metadata ────────────────────────────────────────
console.log('[test] Calling spreadsheets.get to verify auth...')
try {
  const meta = await google.sheets({ version: 'v4', auth })
    .spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'spreadsheetId,properties.title,sheets.properties.title' })

  console.log('[test] ✅ Auth SUCCESS')
  console.log('[test]  Spreadsheet title:', meta.data.properties?.title)
  const tabNames = meta.data.sheets?.map(s => s.properties?.title) ?? []
  console.log('[test]  Existing tabs   :', tabNames.join(', ') || '(none)')

  const requiredTabs = ['Admissions', 'Vitals', 'Falls', 'Turning', 'Rehab', 'Medicine', 'Alerts']
  const missingTabs  = requiredTabs.filter(t => !tabNames.includes(t))
  if (missingTabs.length) {
    console.log('[test]  ⚠️  Missing tabs :', missingTabs.join(', '), '— create them in the spreadsheet')
  } else {
    console.log('[test]  ✅ All required tabs present')
  }
} catch (err) {
  console.error('[test] ❌ Auth / spreadsheet read FAILED')
  console.error('[test]  message :', err?.message)
  console.error('[test]  code    :', err?.code)
  console.error('[test]  status  :', err?.status)
  if (err?.response?.data) console.error('[test]  API body:', JSON.stringify(err.response.data, null, 2))
  process.exit(1)
}

// ── Test 2: Append a test row to Vitals tab ───────────────────────────────────
console.log('\n[test] Appending test row to Vitals tab...')
try {
  const res = await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'Vitals!A1',
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[
        new Date().toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' }),
        'TEST',
        'test-chat-id',
        '@test-nurse',
        'Test Patient',
        'Room 0',
        '120/80', '72', '36.5', '98', '5.5', 'connection test row'
      ]]
    }
  })
  console.log('[test] ✅ APPEND SUCCESS')
  console.log('[test]  Updated range :', res.data?.updates?.updatedRange)
  console.log('[test]  Updated rows  :', res.data?.updates?.updatedRows)
} catch (err) {
  console.error('[test] ❌ APPEND FAILED')
  console.error('[test]  message :', err?.message)
  console.error('[test]  code    :', err?.code)
  console.error('[test]  status  :', err?.status)
  if (err?.response?.data) console.error('[test]  API body:', JSON.stringify(err.response.data, null, 2))
  process.exit(1)
}

console.log('\n[test] ─── ALL TESTS PASSED — Google Sheet integration is working ✅ ──\n')
