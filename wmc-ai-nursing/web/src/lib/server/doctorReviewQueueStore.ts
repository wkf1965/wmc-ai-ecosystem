import { promises as fs } from "fs"
import path from "path"
import type { DoctorReviewQueueItem } from "../../ai/doctorReviewBrain"

export type StoredDoctorReviewItem = DoctorReviewQueueItem & {
  id: string
  nurseName?: string
  source?: string
}

type DoctorReviewStore = {
  items: StoredDoctorReviewItem[]
}

const STORE_FILE = path.join(process.cwd(), ".doctor-review-queue.json")

const emptyStore: DoctorReviewStore = { items: [] }

function makeId() {
  return `drq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

async function readStore(): Promise<DoctorReviewStore> {
  try {
    const raw = await fs.readFile(STORE_FILE, "utf8")
    const parsed = JSON.parse(raw) as Partial<DoctorReviewStore>
    return { items: Array.isArray(parsed.items) ? parsed.items : [] }
  } catch {
    return { ...emptyStore }
  }
}

async function writeStore(store: DoctorReviewStore) {
  await fs.writeFile(STORE_FILE, JSON.stringify(store, null, 2), "utf8")
}

export async function listDoctorReviewQueue(status?: string) {
  const store = await readStore()
  const normalized = String(status ?? "").trim().toUpperCase()
  if (!normalized) return store.items
  return store.items.filter((item) => item.status.toUpperCase() === normalized)
}

export async function addDoctorReviewQueueItem(
  input: DoctorReviewQueueItem & { nurseName?: string; source?: string },
): Promise<StoredDoctorReviewItem> {
  const store = await readStore()
  const record: StoredDoctorReviewItem = {
    id: makeId(),
    ...input,
    nurseName: input.nurseName ?? "",
    source: input.source ?? "ai-brain",
  }
  store.items.unshift(record)
  store.items = store.items.slice(0, 2000)
  await writeStore(store)
  return record
}
