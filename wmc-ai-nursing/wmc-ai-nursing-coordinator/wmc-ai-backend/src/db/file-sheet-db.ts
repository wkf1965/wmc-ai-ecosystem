import fs from 'node:fs/promises'
import path from 'node:path'
import { SHEET_TABS, type SheetTab, type StoreShape } from './sheet-tabs.js'
import type { SheetDb } from './sheet-db.interface.js'

function emptyStore(): StoreShape {
  const o = {} as StoreShape
  for (const t of SHEET_TABS) o[t] = []
  return o
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true })
}

export function createFileSheetDb(opts: { dataDir: string }): SheetDb {
  function storePath(): string {
    return path.resolve(process.cwd(), opts.dataDir, 'wmc-ai-store.json')
  }

  async function readStore(): Promise<StoreShape> {
    const p = storePath()
    try {
      const raw = await fs.readFile(p, 'utf8')
      const parsed = JSON.parse(raw) as Partial<StoreShape>
      const base = emptyStore()
      for (const tab of SHEET_TABS) {
        base[tab] = Array.isArray(parsed[tab]) ? (parsed[tab] as unknown[]) : []
      }
      return base
    } catch {
      return emptyStore()
    }
  }

  async function writeStore(store: StoreShape) {
    await ensureDir(path.dirname(storePath()))
    await fs.writeFile(storePath(), JSON.stringify(store, null, 2), 'utf8')
  }

  return {
    async list<T>(tab: SheetTab): Promise<T[]> {
      const s = await readStore()
      return (s[tab] ?? []) as T[]
    },

    async append<T extends object>(tab: SheetTab, row: T): Promise<T> {
      const s = await readStore()
      s[tab].push(row as Record<string, unknown>)
      await writeStore(s)
      return row
    },

    async update<T extends object>(tab: SheetTab, id: string, patch: Partial<T>): Promise<T | null> {
      const s = await readStore()
      const rows = s[tab] as object[]
      const i = rows.findIndex((r) => (r as { id?: string }).id === id)
      if (i < 0) return null
      rows[i] = { ...(rows[i] as object), ...(patch as object) }
      await writeStore(s)
      return rows[i] as T
    },

    async findById<T extends { id: string }>(tab: SheetTab, id: string): Promise<T | null> {
      const rows = await this.list<T>(tab)
      return rows.find((r) => r.id === id) ?? null
    },
  }
}
