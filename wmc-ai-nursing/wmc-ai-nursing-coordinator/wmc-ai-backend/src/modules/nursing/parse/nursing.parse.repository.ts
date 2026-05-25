import fs from 'node:fs/promises'
import path from 'node:path'
import { v4 as uuid } from 'uuid'
import { config } from '../../../config/env.js'
import { ensureNursingParsedTable, getPostgresPool, isPostgresEnabled } from '../../../db/postgres.js'
import type { NursingParsePersistedRow, NursingParseResult } from './nursing.parse.types.js'
import type { NursingParseInput } from './nursing.parse.validation.js'

const FILE_NAME = 'nursing-parsed-messages.json'

async function readFileRows(): Promise<NursingParsePersistedRow[]> {
  const filePath = path.resolve(process.cwd(), config.dataDir, FILE_NAME)
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as NursingParsePersistedRow[]) : []
  } catch {
    return []
  }
}

async function writeFileRows(rows: NursingParsePersistedRow[]): Promise<void> {
  const dir = path.resolve(process.cwd(), config.dataDir)
  await fs.mkdir(dir, { recursive: true })
  const filePath = path.join(dir, FILE_NAME)
  await fs.writeFile(filePath, JSON.stringify(rows, null, 2), 'utf8')
}

export async function saveParsedNursingMessage(
  input: NursingParseInput,
  result: NursingParseResult,
  extras: {
    patientId?: string | null
    clinicalRecordId?: string | null
  } = {},
): Promise<NursingParsePersistedRow> {
  const row: NursingParsePersistedRow = {
    id: uuid(),
    source: input.source ?? 'api',
    nurseName: input.nurseName ?? null,
    chatId: input.chatId != null ? String(input.chatId) : null,
    patientId: extras.patientId ?? null,
    clinicalRecordId: extras.clinicalRecordId ?? null,
    storage: isPostgresEnabled() ? 'postgres' : 'file',
    createdAt: new Date().toISOString(),
    ...result,
  }

  if (isPostgresEnabled()) {
    await ensureNursingParsedTable()
    const pool = getPostgresPool()
    await pool.query(
      `INSERT INTO nursing_parsed_messages (
        id, source, raw_text, room, patient_name, patient_id, nurse_name, chat_id,
        appetite, mobility, turning_position, blood_pressure, pulse, temperature, oxygen, pain_score,
        symptoms, vitals, parsed_json, alerts, created_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21
      )`,
      [
        row.id,
        row.source,
        row.rawText,
        row.parsed.room,
        row.parsed.patientName,
        row.patientId,
        row.nurseName,
        row.chatId,
        row.parsed.appetite,
        row.parsed.mobility,
        row.parsed.turningPosition,
        row.parsed.vitals.bloodPressure,
        row.parsed.vitals.pulse,
        row.parsed.vitals.temperature,
        row.parsed.vitals.oxygen,
        row.parsed.vitals.painScore,
        JSON.stringify(row.parsed.symptoms),
        JSON.stringify(row.parsed.vitals),
        JSON.stringify(row.parsed),
        JSON.stringify(row.alerts),
        row.createdAt,
      ],
    )
    return row
  }

  const rows = await readFileRows()
  rows.unshift(row)
  await writeFileRows(rows.slice(0, 5000))
  return row
}
