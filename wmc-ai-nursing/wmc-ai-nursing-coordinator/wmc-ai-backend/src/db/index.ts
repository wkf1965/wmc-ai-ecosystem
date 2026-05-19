import { config } from '../config/env.js'
import { createFileSheetDb } from './file-sheet-db.js'
import { createGoogleSheetDb } from './google-sheet-db.js'
import type { SheetDb } from './sheet-db.interface.js'

export { SHEET_TABS, type SheetTab } from './sheet-tabs.js'
export type { SheetDb } from './sheet-db.interface.js'

function createSheetDb(): SheetDb {
  if (config.sheetsMode === 'google') {
    if (!config.googleSheetsSpreadsheetId.trim()) {
      throw new Error(
        'SHEETS_MODE=google requires GOOGLE_SHEETS_SPREADSHEET_ID (and GOOGLE_SERVICE_ACCOUNT_JSON_PATH or GOOGLE_APPLICATION_CREDENTIALS).',
      )
    }
    return createGoogleSheetDb({
      spreadsheetId: config.googleSheetsSpreadsheetId.trim(),
      keyFile: config.googleServiceAccountJsonPath.trim() || undefined,
    })
  }
  return createFileSheetDb({ dataDir: config.dataDir })
}

/** Selected by `SHEETS_MODE`: local JSON file tabs or Google Sheets worksheets. */
export const sheetDb = createSheetDb()
