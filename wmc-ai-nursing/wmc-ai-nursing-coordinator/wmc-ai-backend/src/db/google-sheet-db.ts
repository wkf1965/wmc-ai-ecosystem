import { google } from 'googleapis'
import type { SheetDb } from './sheet-db.interface.js'
import type { SheetTab } from './sheet-tabs.js'

/**
 * Each worksheet uses column A: one JSON object per row (same logical model as the JSON file store).
 * Share the spreadsheet with the service account email (Editor).
 */
export function createGoogleSheetDb(opts: {
  spreadsheetId: string
  /** If omitted, uses Application Default Credentials / GOOGLE_APPLICATION_CREDENTIALS */
  keyFile?: string
}): SheetDb {
  const auth = new google.auth.GoogleAuth({
    ...(opts.keyFile ? { keyFile: opts.keyFile } : {}),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  const sheets = google.sheets({ version: 'v4', auth })
  const spreadsheetId = opts.spreadsheetId

  function escapeSheet(title: string): string {
    return `'${String(title).replace(/'/g, "''")}'`
  }

  async function ensureWorksheet(title: string): Promise<void> {
    const meta = await sheets.spreadsheets.get({ spreadsheetId })
    const exists = meta.data.sheets?.some((s) => s.properties?.title === title)
    if (exists) return
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title } } }],
      },
    })
  }

  function parseRows(values: string[][] | null | undefined): unknown[] {
    if (!values?.length) return []
    const out: unknown[] = []
    for (const row of values) {
      const cell = row?.[0]
      if (typeof cell !== 'string' || !cell.trim()) continue
      try {
        out.push(JSON.parse(cell))
      } catch {
        /* ignore malformed lines */
      }
    }
    return out
  }

  return {
    async list<T>(tab: SheetTab): Promise<T[]> {
      await ensureWorksheet(tab)
      const range = `${escapeSheet(tab)}!A:A`
      const res = await sheets.spreadsheets.values.get({ spreadsheetId, range })
      return parseRows(res.data.values as string[][] | undefined) as T[]
    },

    async append<T extends object>(tab: SheetTab, row: T): Promise<T> {
      await ensureWorksheet(tab)
      const range = `${escapeSheet(tab)}!A:A`
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [[JSON.stringify(row)]] },
      })
      return row
    },

    async update<T extends object>(tab: SheetTab, id: string, patch: Partial<T>): Promise<T | null> {
      await ensureWorksheet(tab)
      const range = `${escapeSheet(tab)}!A:A`
      const res = await sheets.spreadsheets.values.get({ spreadsheetId, range })
      const rows = res.data.values ?? []
      let rowNum = -1
      for (let i = 0; i < rows.length; i++) {
        const cell = rows[i]?.[0]
        if (typeof cell !== 'string') continue
        try {
          const obj = JSON.parse(cell) as { id?: string }
          if (obj.id === id) {
            rowNum = i + 1
            break
          }
        } catch {
          /* skip */
        }
      }
      if (rowNum < 0) return null
      const cell = rows[rowNum - 1]?.[0]
      const current = JSON.parse(cell as string) as T
      const next = { ...(current as object), ...(patch as object) } as T
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${escapeSheet(tab)}!A${rowNum}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[JSON.stringify(next)]] },
      })
      return next
    },

    async findById<T extends { id: string }>(tab: SheetTab, id: string): Promise<T | null> {
      const rows = await this.list<T>(tab)
      return rows.find((r) => r.id === id) ?? null
    },
  }
}
