import pg from 'pg'
import { config } from '../config/env.js'

const { Pool } = pg

let pool: pg.Pool | null = null

export function isPostgresEnabled(): boolean {
  return Boolean(config.databaseUrl.trim())
}

export function getPostgresPool(): pg.Pool {
  if (!isPostgresEnabled()) {
    throw new Error('DATABASE_URL is not configured')
  }
  if (!pool) {
    pool = new Pool({ connectionString: config.databaseUrl })
  }
  return pool
}

export async function ensureNursingParsedTable(): Promise<void> {
  if (!isPostgresEnabled()) return
  const client = await getPostgresPool().connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS nursing_parsed_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        source TEXT NOT NULL DEFAULT 'api',
        raw_text TEXT NOT NULL,
        room TEXT,
        patient_name TEXT,
        patient_id UUID,
        nurse_name TEXT,
        chat_id TEXT,
        appetite TEXT,
        mobility TEXT,
        turning_position TEXT,
        blood_pressure TEXT,
        pulse INT,
        temperature REAL,
        oxygen INT,
        pain_score INT,
        symptoms JSONB NOT NULL DEFAULT '[]'::jsonb,
        vitals JSONB NOT NULL DEFAULT '{}'::jsonb,
        parsed_json JSONB NOT NULL,
        alerts JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)
  } finally {
    client.release()
  }
}
