/**
 * POST then GET structured /nursing/records (works without Bearer when server NODE_ENV=development).
 *
 * Uses sample payload compatible with MRNs like P001.
 *
 *   npm run test:nursing-records
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const BASE = process.env.API_BASE ?? 'http://localhost:4000/api/v1'

function loadFixture(): Record<string, unknown> {
  const p = path.join(process.cwd(), 'data/samples/nursing-clinical-record.json')
  return JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>
}

async function main() {
  const body = loadFixture()

  console.log(`API ${BASE}\n`)

  const postRes = await fetch(`${BASE}/nursing/records`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const postJson = await postRes.json().catch(() => ({}))
  console.log('POST /nursing/records →', postRes.status)
  console.log(JSON.stringify(postJson, null, 2))
  if (!postRes.ok) process.exit(1)

  const getRes = await fetch(`${BASE}/nursing/records`, { headers: { Accept: 'application/json' } })
  const getJson = await getRes.json().catch(() => ({}))
  console.log('\nGET /nursing/records →', getRes.status)
  console.log(JSON.stringify(getJson, null, 2))

  const ids = Array.isArray((getJson as { records?: unknown[] }).records)
    ? (getJson as { records: Array<{ id?: string }> }).records.map((r) => r.id)
    : []
  const createdId = (postJson as { id?: string }).id
  const found = ids.includes(createdId)
  console.log(found ? '\nOK — POST row appears in GET list.' : '\nFAIL — POST id missing from GET list.')
  process.exit(found ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
