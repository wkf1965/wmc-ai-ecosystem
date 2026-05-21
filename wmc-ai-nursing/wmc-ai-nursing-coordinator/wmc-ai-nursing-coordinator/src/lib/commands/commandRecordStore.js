/**
 * Command Record Store — persists executed command records to a JSON file.
 *
 * This acts as the local "database" for all structured nursing commands.
 * PostgreSQL-ready: each record maps to a row in the command-specific table (cmd_admissions,
 * cmd_vitals, etc.) or a generic `command_records` table with a JSONB payload column.
 *
 * DB schema (generic, future):
 *   CREATE TABLE command_records (
 *     id UUID PRIMARY KEY,
 *     timestamp TIMESTAMPTZ,
 *     command_name TEXT,
 *     chat_id TEXT,
 *     nurse_name TEXT,
 *     room TEXT,
 *     patient_name TEXT,
 *     payload JSONB,
 *     source TEXT DEFAULT 'telegram_command'
 *   );
 */

import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const STORE_PATH = path.join(process.cwd(), 'telegram-command-records.json')
const MAX_RECORDS = 2000

let cache = null

async function load() {
  if (cache) return cache
  try {
    const raw = await fs.readFile(STORE_PATH, 'utf8')
    cache = JSON.parse(raw)
    if (!Array.isArray(cache.records)) cache = { records: [] }
  } catch {
    cache = { records: [] }
  }
  return cache
}

async function save() {
  if (!cache) return
  try {
    await fs.writeFile(STORE_PATH, JSON.stringify(cache, null, 2), 'utf8')
  } catch (err) {
    console.error('[cmd-record-store] save failed:', err?.message)
  }
}

/**
 * Append a new command record and persist.
 * @param {string} commandName
 * @param {object} data  collected_data from form
 * @param {object} meta  { chatId, nurseName, dbRow }
 * @returns {Promise<object>} the saved record
 */
export async function appendCommandRecord(commandName, data, meta) {
  const store = await load()
  const record = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    command_name: commandName,
    chat_id: String(meta.chatId ?? ''),
    nurse_name: String(data.nurseInitials ?? meta.nurseName ?? ''),
    room: String(data.room ?? ''),
    patient_name: String(data.patientName ?? ''),
    payload: { ...data },
    db_row: meta.dbRow ?? null,
    source: 'telegram_command',
  }
  store.records.unshift(record)
  if (store.records.length > MAX_RECORDS) {
    store.records = store.records.slice(0, MAX_RECORDS)
  }
  await save()
  return record
}

/**
 * Read all records, optionally filtered by command name.
 * @param {{ commandName?: string, limit?: number }} opts
 * @returns {Promise<object[]>}
 */
export async function readCommandRecords({ commandName, limit = 100 } = {}) {
  const store = await load()
  let records = store.records ?? []
  if (commandName) records = records.filter((r) => r.command_name === commandName)
  return records.slice(0, limit)
}
