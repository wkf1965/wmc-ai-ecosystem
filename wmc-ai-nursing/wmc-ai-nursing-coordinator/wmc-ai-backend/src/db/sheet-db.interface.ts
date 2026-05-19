import type { SheetTab } from './sheet-tabs.js'

/** Pluggable persistence — file JSON, Google Sheets (one JSON object per cell in column A), or Postgres later. */
export interface SheetDb {
  list<T>(tab: SheetTab): Promise<T[]>
  append<T extends object>(tab: SheetTab, row: T): Promise<T>
  update<T extends object>(tab: SheetTab, id: string, patch: Partial<T>): Promise<T | null>
  findById<T extends { id: string }>(tab: SheetTab, id: string): Promise<T | null>
}
