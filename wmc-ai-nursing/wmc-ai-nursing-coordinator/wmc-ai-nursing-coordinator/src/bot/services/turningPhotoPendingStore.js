import fs from "node:fs/promises"
import path from "node:path"

const STORE_PATH = path.join(process.cwd(), "src", "bot", "data", "turningPhotoPending.json")

async function readStore() {
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8")
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

async function writeStore(data) {
  await fs.writeFile(STORE_PATH, JSON.stringify(data, null, 2), "utf8")
}

export async function setPendingTurningPhoto(chatId, payload) {
  const store = await readStore()
  store[String(chatId)] = {
    ...payload,
    pendingAt: new Date().toISOString(),
  }
  await writeStore(store)
}

export async function getPendingTurningPhoto(chatId) {
  const store = await readStore()
  return store[String(chatId)] ?? null
}

export async function clearPendingTurningPhoto(chatId) {
  const store = await readStore()
  delete store[String(chatId)]
  await writeStore(store)
}
