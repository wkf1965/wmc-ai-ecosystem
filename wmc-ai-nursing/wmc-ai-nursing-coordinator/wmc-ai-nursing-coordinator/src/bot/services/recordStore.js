/**
 * Record Store — Stage 2
 *
 * Saves confirmed nursing records to a local JSON file.
 * No database or Google Sheets connected yet (Stage 3+).
 *
 * File: telegram-bot-records.json (project root)
 *
 * PostgreSQL-ready shape:
 *   id        UUID
 *   timestamp ISO string
 *   workflow  TEXT (e.g. 'vitals')
 *   data      JSONB
 *   savedBy   TEXT (chat id)
 */

import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const STORE_PATH = path.join(process.cwd(), 'telegram-bot-records.json')
const MAX_RECORDS = 1000

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

async function persist() {
  if (!cache) return
  try {
    await fs.writeFile(STORE_PATH, JSON.stringify(cache, null, 2), 'utf8')
  } catch (err) {
    console.error('[record-store] save failed:', err?.message)
  }
}

/**
 * Save a confirmed record.
 * @param {string} workflowName
 * @param {object} data
 * @param {string|number} [chatId]
 * @returns {Promise<{ id: string, timestamp: string, workflow: string, data: object }>}
 */
export async function saveRecord(workflowName, data, chatId = '') {
  const store = await load()
  const record = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    workflow: workflowName,
    data: { ...data },
    savedBy: String(chatId),
  }
  store.records.unshift(record)
  if (store.records.length > MAX_RECORDS) {
    store.records = store.records.slice(0, MAX_RECORDS)
  }
  await persist()
  return record
}

/**
 * Read all records, optionally filtered by workflow.
 * @param {{ workflow?: string, limit?: number }} opts
 * @returns {Promise<object[]>}
 */
export async function readRecords({ workflow, limit = 50 } = {}) {
  const store = await load()
  let records = store.records ?? []
  if (workflow) records = records.filter((r) => r.workflow === workflow)
  return records.slice(0, limit)
}
