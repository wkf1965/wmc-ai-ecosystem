/**
 * Smoke test: POST then GET /api/v1/patients (no Bearer needed if backend runs with NODE_ENV=development dev-bypass).
 *
 * Run while the API is up:
 *   npx tsx scripts/test-patient-post-get.ts
 */
const BASE = process.env.API_BASE ?? 'http://localhost:4000/api/v1'

const body = {
  name: 'Test Patient',
  age: 75,
  phone: '0124520077',
  condition: 'Stroke rehabilitation',
  status: 'active',
}

async function main() {
  console.log(`API base: ${BASE}\n`)

  const postRes = await fetch(`${BASE}/patients`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const postText = await postRes.text()
  let postJson: unknown
  try {
    postJson = postText ? JSON.parse(postText) : null
  } catch {
    postJson = { _raw: postText }
  }
  console.log('1. POST /patients →', postRes.status)
  console.log(JSON.stringify(postJson, null, 2))

  if (!postRes.ok) {
    console.error('\nPOST failed.')
    process.exit(1)
  }

  const getRes = await fetch(`${BASE}/patients`, { headers: { Accept: 'application/json' } })
  const getJson = (await getRes.json()) as { patients?: Array<{ fullName?: string; id?: string }> }
  console.log('\n2. GET /patients →', getRes.status)
  const rows = Array.isArray(getJson.patients) ? getJson.patients : []
  console.log(`   Returned ${rows.length} patient(s).`)

  const found = rows.some((p) => p.fullName === 'Test Patient')
  console.log(
    found
      ? '\n3. OK — "Test Patient" appears in the list.'
      : '\n3. FAIL — "Test Patient" not found (POST may have succeeded but list differs).',
  )

  process.exit(found ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
