import { promises as fs } from "fs"
import path from "path"

export type FamilyUpdateQueueItem = {
  room: string
  patientName: string
  riskLevel: string
  familyMessage: string
  status: "DRAFT"
  createdAt: string
}

export type StoredFamilyUpdateItem = FamilyUpdateQueueItem & {
  id: string
  nurseName?: string
  source?: string
}

type FamilyUpdateStore = {
  items: StoredFamilyUpdateItem[]
}

const STORE_FILE = path.join(process.cwd(), ".family-update-queue.json")

const emptyStore: FamilyUpdateStore = { items: [] }

function makeId() {
  return `fuq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

async function readStore(): Promise<FamilyUpdateStore> {
  try {
    const raw = await fs.readFile(STORE_FILE, "utf8")
    const parsed = JSON.parse(raw) as Partial<FamilyUpdateStore>
    return { items: Array.isArray(parsed.items) ? parsed.items : [] }
  } catch {
    return { ...emptyStore }
  }
}

async function writeStore(store: FamilyUpdateStore) {
  await fs.writeFile(STORE_FILE, JSON.stringify(store, null, 2), "utf8")
}

export async function listFamilyUpdateQueue(status?: string) {
  const store = await readStore()
  const normalized = String(status ?? "").trim().toUpperCase()
  if (!normalized) return store.items
  return store.items.filter((item) => item.status.toUpperCase() === normalized)
}

export async function addFamilyUpdateQueueItem(
  input: Omit<FamilyUpdateQueueItem, "status" | "createdAt"> & {
    status?: "DRAFT"
    createdAt?: string
    nurseName?: string
    source?: string
  },
): Promise<StoredFamilyUpdateItem> {
  const store = await readStore()
  const record: StoredFamilyUpdateItem = {
    id: makeId(),
    room: String(input.room ?? "").trim(),
    patientName: String(input.patientName ?? "").trim(),
    riskLevel: String(input.riskLevel ?? "").trim(),
    familyMessage: String(input.familyMessage ?? "").trim(),
    status: "DRAFT",
    createdAt: input.createdAt ?? new Date().toISOString(),
    nurseName: input.nurseName ?? "",
    source: input.source ?? "ai-brain",
  }
  store.items.unshift(record)
  store.items = store.items.slice(0, 2000)
  await writeStore(store)
  return record
}
