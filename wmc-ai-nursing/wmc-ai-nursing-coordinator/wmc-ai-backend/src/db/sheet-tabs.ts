/** Worksheet / table names — mirror `docs/schema/postgresql.sql` and seed tabs. */
export const SHEET_TABS = [
  'users',
  'patients',
  'crm_leads',
  'nursing_daily_reports',
  'vital_signs',
  'medications',
  'nursing_alerts',
  'doctor_review_queue',
  'rehab_sessions',
  'ai_results',
] as const

export type SheetTab = (typeof SHEET_TABS)[number]

/** In-memory / JSON file shape (one array per worksheet). */
export type StoreShape = Record<SheetTab, unknown[]>
