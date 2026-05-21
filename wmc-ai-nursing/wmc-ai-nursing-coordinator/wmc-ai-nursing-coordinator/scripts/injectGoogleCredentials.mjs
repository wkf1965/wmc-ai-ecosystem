/**
 * Inject Google Service Account credentials into .env
 * Usage: node scripts/injectGoogleCredentials.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dir  = dirname(fileURLToPath(import.meta.url))
const root   = resolve(__dir, '..')
const jsonPath = resolve(root, '..', 'omega-rhino-461101-f5-e361bce1d1e0.json')
const envPath  = resolve(root, '.env')

// ── 1. Read service account JSON ─────────────────────────────────────────────
console.log('\n[step 1] Reading service account JSON...')
console.log('         Path:', jsonPath)
const json = JSON.parse(readFileSync(jsonPath, 'utf8'))

const email  = json.client_email
const rawKey = json.private_key   // real newlines after JSON parse

if (!email)  { console.error('❌ client_email not found in JSON'); process.exit(1) }
if (!rawKey) { console.error('❌ private_key not found in JSON');  process.exit(1) }

// ── 2. Convert key to .env one-line format ────────────────────────────────────
// Replace real newline characters with the two-char literal \n for .env
const envKey = rawKey.replace(/\n/g, '\\n')

console.log('\n[step 2] Extracted credentials:')
console.log('         client_email  :', email)
console.log('         private_key   : length =', rawKey.length, 'chars (raw)')
console.log('         env-line key  : length =', envKey.length, 'chars (escaped)')
console.log('         starts with   :', envKey.slice(0, 45))
console.log('         ends with     :', envKey.slice(-45))
console.log('         has BEGIN     :', envKey.includes('BEGIN PRIVATE KEY') ? '✅ YES' : '❌ NO')
console.log('         has END       :', envKey.includes('END PRIVATE KEY')   ? '✅ YES' : '❌ NO')

// ── 3. Read current .env ──────────────────────────────────────────────────────
console.log('\n[step 3] Reading current .env...')
let env = readFileSync(envPath, 'utf8')
console.log('         current file size:', Buffer.byteLength(env, 'utf8'), 'bytes')

// ── 4. Replace (or append) credential lines ───────────────────────────────────
console.log('\n[step 4] Updating .env...')

const emailPattern = /^GOOGLE_SERVICE_ACCOUNT_EMAIL=.*$/m
const keyPattern   = /^GOOGLE_PRIVATE_KEY=.*$/m
const newEmailLine = `GOOGLE_SERVICE_ACCOUNT_EMAIL=${email}`
const newKeyLine   = `GOOGLE_PRIVATE_KEY="${envKey}"`

if (emailPattern.test(env)) {
  env = env.replace(emailPattern, newEmailLine)
  console.log('         ✅ Replaced GOOGLE_SERVICE_ACCOUNT_EMAIL')
} else {
  env += `\n${newEmailLine}`
  console.log('         ➕ Appended GOOGLE_SERVICE_ACCOUNT_EMAIL')
}

if (keyPattern.test(env)) {
  env = env.replace(keyPattern, newKeyLine)
  console.log('         ✅ Replaced GOOGLE_PRIVATE_KEY')
} else {
  env += `\n${newKeyLine}`
  console.log('         ➕ Appended GOOGLE_PRIVATE_KEY')
}

// ── 5. Write updated .env ─────────────────────────────────────────────────────
writeFileSync(envPath, env, 'utf8')
console.log('\n[step 5] .env saved.')
console.log('         new file size:', Buffer.byteLength(env, 'utf8'), 'bytes')

// ── 6. Verify written lines ───────────────────────────────────────────────────
console.log('\n[step 6] Verifying written values...')
const lines = readFileSync(envPath, 'utf8').split('\n')
const writtenEmail = lines.find(l => l.startsWith('GOOGLE_SERVICE_ACCOUNT_EMAIL='))
const writtenKey   = lines.find(l => l.startsWith('GOOGLE_PRIVATE_KEY='))
console.log('         EMAIL line :', writtenEmail)
console.log('         KEY line   : length =', writtenKey?.length ?? 0, 'chars')
console.log('         KEY preview:', writtenKey?.slice(0, 60) + '...')

console.log('\n✅ Done — credentials injected into .env\n')
