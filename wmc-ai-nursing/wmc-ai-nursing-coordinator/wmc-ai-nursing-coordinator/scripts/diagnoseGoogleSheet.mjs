/**
 * Google Sheet Diagnostic Script
 * Usage: node scripts/diagnoseGoogleSheet.mjs
 */

import 'dotenv/config'
import { google } from 'googleapis'

const D = '═'.repeat(62)

// ── Step 1–4: Load and print credentials ─────────────────────────────────────
console.log(`\n${D}`)
console.log('  WMC — Google Sheet Diagnostic')
console.log(`${D}\n`)

const SHEET_ID    = process.env.GOOGLE_SHEET_ID                ?? ''
const EMAIL       = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL  ?? ''
const RAW_KEY     = process.env.GOOGLE_PRIVATE_KEY            ?? ''
const PRIVATE_KEY = RAW_KEY.replace(/\\n/g, '\n')

console.log('STEP 1-4  Load credentials from .env')
console.log(`  GOOGLE_SHEET_ID              : ${SHEET_ID   ? `✅ ${SHEET_ID}` : '❌ MISSING'}`)
console.log(`  GOOGLE_SERVICE_ACCOUNT_EMAIL : ${EMAIL      ? `✅ ${EMAIL}`    : '❌ MISSING'}`)
console.log(`  GOOGLE_PRIVATE_KEY           : ${PRIVATE_KEY
  ? `✅ ${PRIVATE_KEY.length} chars | ${(PRIVATE_KEY.match(/\n/g)||[]).length} newlines`
  : '❌ MISSING'}`)
if (PRIVATE_KEY) {
  console.log(`    starts : "${PRIVATE_KEY.slice(0, 27)}"`)
  console.log(`    ends   : "${PRIVATE_KEY.slice(-26).replace(/\n/g,'\\n')}"`)
  console.log(`    BEGIN  : ${PRIVATE_KEY.includes('BEGIN PRIVATE KEY') ? '✅' : '❌ NOT FOUND'}`)
  console.log(`    END    : ${PRIVATE_KEY.includes('END PRIVATE KEY')   ? '✅' : '❌ NOT FOUND'}`)
}
console.log()

if (!SHEET_ID || !EMAIL || !PRIVATE_KEY) {
  console.error('❌ Cannot continue — fix missing credentials in .env\n')
  process.exit(1)
}

// ── Step 5: Connect to Google Sheets API ─────────────────────────────────────
console.log('STEP 5  Connect to Google Sheets API')
const auth = new google.auth.JWT({
  email:  EMAIL,
  key:    PRIVATE_KEY,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
})
const sheets = google.sheets({ version: 'v4', auth })

// ── Step 6: Verify auth via access token ──────────────────────────────────────
console.log('STEP 6  Verify authentication')
try {
  const tokenRes    = await auth.getAccessToken()
  const accessToken = tokenRes?.token ?? tokenRes?.res?.data?.access_token
  if (!accessToken) throw new Error('Empty token returned')
  console.log(`  ✅ Auth success — token: ${accessToken.slice(0, 25)}...`)
} catch (err) {
  console.error(`  ❌ Auth failed: ${err?.message}`)
  if (err?.response?.data) console.error('  API body:', JSON.stringify(err.response.data, null, 2))
  process.exit(1)
}
console.log()

// ── Step 7: Print spreadsheet title + tabs ────────────────────────────────────
console.log('STEP 7  Read spreadsheet metadata')
let existingTabs = []
try {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: SHEET_ID,
    fields: 'spreadsheetId,properties.title,sheets.properties.title',
  })
  console.log(`  ✅ Spreadsheet title : "${meta.data.properties?.title}"`)
  existingTabs = (meta.data.sheets ?? []).map(s => s.properties?.title)
  console.log(`  Existing tabs       : ${existingTabs.join(', ') || '(none)'}`)

  const required = ['Admissions','Vitals','Falls','Turning','Rehab','Medicine','Alerts']
  const missing  = required.filter(t => !existingTabs.includes(t))
  if (missing.length) {
    console.log(`  ⚠️  Missing tabs: ${missing.join(', ')} ← create these in the spreadsheet`)
  } else {
    console.log('  ✅ All 7 required tabs present')
  }
} catch (err) {
  console.error(`  ❌ Failed to read spreadsheet`)
  console.error(`  message : ${err?.message}`)
  console.error(`  code    : ${err?.code}`)
  console.error(`  status  : ${err?.status}`)
  if (err?.response?.data) console.error('  API body:', JSON.stringify(err.response.data, null, 2))
  console.error()
  if (err?.code === 404) {
    console.error('  ► FIX: Open the spreadsheet and share it with:')
    console.error(`         ${EMAIL}`)
    console.error('         (Editor permission)')
  }
  process.exit(1)
}
console.log()

// ── Step 8: Append one test row to Vitals ────────────────────────────────────
const TAB = 'Vitals'
console.log(`STEP 8  Append test row → "${TAB}" tab`)
if (!existingTabs.includes(TAB)) {
  console.error(`  ❌ Tab "${TAB}" not found — create it in the spreadsheet first\n`)
  process.exit(1)
}

const testRow = [
  new Date().toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' }),
  'DIAGNOSE',
  'test-chat',
  '@diagnose-script',
  'Test Patient', 'Room 0',
  '120/80', '72', '36.5', '98', '5.5',
  'diagnostic test row — safe to delete',
]

console.log(`  Appending row to ${TAB}!A1 ...`)
try {
  const res = await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range:         `${TAB}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [testRow] },
  })
  console.log(`  ✅ Append success`)
  console.log(`  updatedRange : ${res.data?.updates?.updatedRange}`)
  console.log(`  updatedRows  : ${res.data?.updates?.updatedRows}`)
  console.log(`  updatedCells : ${res.data?.updates?.updatedCells}`)
} catch (err) {
  console.error(`  ❌ Append failed`)
  console.error(`  message : ${err?.message}`)
  console.error(`  code    : ${err?.code}`)
  console.error(`  status  : ${err?.status}`)
  if (err?.response?.data) console.error('  API body:', JSON.stringify(err.response.data, null, 2))
  process.exit(1)
}

// ── Done ──────────────────────────────────────────────────────────────────────
console.log()
console.log(`${D}`)
console.log('  ✅ ALL STEPS PASSED — Google Sheet integration is working')
console.log(`${D}\n`)
