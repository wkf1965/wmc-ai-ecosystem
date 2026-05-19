import fs from 'node:fs/promises'
import path from 'node:path'

const STORE_PATH = path.join(process.cwd(), 'telegram-mock-store.json')

export async function appendTelegramWebhookEntry(entry) {
  let data = { version: 1, entries: [], last: null }
  try {
    const raw = await fs.readFile(STORE_PATH, 'utf8')
    data = JSON.parse(raw)
  } catch {
    // first run or invalid file
  }
  if (!Array.isArray(data.entries)) data.entries = []
  data.entries.unshift(entry)
  if (data.entries.length > 500) data.entries = data.entries.slice(0, 500)
  data.last = entry
  await fs.writeFile(STORE_PATH, JSON.stringify(data, null, 2), 'utf8')
}

export async function readTelegramMockStoreState() {
  try {
    const raw = await fs.readFile(STORE_PATH, 'utf8')
    const data = JSON.parse(raw)
    if (!Array.isArray(data.entries)) data.entries = []
    return data
  } catch {
    return { version: 1, entries: [], last: null }
  }
}
