/**
 * Seed local file-backed store + print demo JWT credentials.
 * Run: npm run seed
 */
import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { v4 as uuid } from 'uuid'
import fs from 'node:fs/promises'
import path from 'node:path'
import { config } from '../src/config/env.js'
import type { User } from '../src/types/domain.js'

const roles = ['admin', 'doctor', 'nurse', 'receptionist', 'therapist'] as const

async function main() {
  const dir = path.resolve(process.cwd(), config.dataDir)
  await fs.mkdir(dir, { recursive: true })
  const ts = new Date().toISOString()
  const passwordHash = await bcrypt.hash('password123', 10)

  const users: User[] = roles.map((role, i) => ({
    id: uuid(),
    email: `${role}@wmc.local`,
    passwordHash,
    fullName: `Demo ${role.charAt(0).toUpperCase() + role.slice(1)}`,
    role,
    createdAt: ts,
    updatedAt: ts,
  }))

  const patientId = uuid()
  const patientId2 = uuid()

  const store = {
    users,
    patients: [
      {
        id: patientId,
        mrn: 'WMC-10001',
        fullName: 'Chan Tai Man',
        dateOfBirth: '1958-03-12',
        gender: 'M',
        phone: '+85290000001',
        medicalSummary: 'Hypertension; post-stroke rehab.',
        createdAt: ts,
        updatedAt: ts,
      },
      {
        id: patientId2,
        mrn: 'WMC-10002',
        fullName: 'Wong Siu Ming',
        dateOfBirth: '1972-11-02',
        gender: 'F',
        phone: '+85290000002',
        medicalSummary: 'Type 2 diabetes; physiotherapy for knee OA.',
        createdAt: ts,
        updatedAt: ts,
      },
    ],
    crm_leads: [
      {
        id: uuid(),
        source: 'whatsapp',
        status: 'new',
        pipelineStage: 'inquiry',
        contactName: 'Peter Lee',
        phone: '+85291234567',
        notes: 'Asked about physiotherapy package.',
        followUpAt: new Date(Date.now() + 86400000).toISOString(),
        createdAt: ts,
        updatedAt: ts,
      },
    ],
    nursing_daily_reports: [],
    vital_signs: [],
    medications: [],
    nursing_alerts: [],
    doctor_review_queue: [],
    rehab_sessions: [],
    ai_results: [],
  }

  const storePath = path.join(dir, 'wmc-ai-store.json')
  await fs.writeFile(storePath, JSON.stringify(store, null, 2), 'utf8')

  console.log('Seeded:', storePath)
  console.log('\nDemo logins (password: password123):')
  for (const u of users) {
    console.log(`  ${u.email}  (${u.role})`)
  }
  console.log('\nSample patient IDs for API calls:')
  console.log(' ', patientId)
  console.log(' ', patientId2)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
