import dotenv from 'dotenv'

dotenv.config()

const demoAuthOff = process.env.WMC_DEMO_AUTH === '0'

export const config = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  apiPrefix: process.env.API_PREFIX ?? '/api/v1',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  /** Set WMC_DEMO_AUTH=0 to disable. Fixed token for admin UI smoke tests (default `demo-token`). */
  demoAuthEnabled: !demoAuthOff,
  demoAuthToken: process.env.WMC_DEMO_AUTH_TOKEN ?? 'demo-token',
  sheetsMode: (process.env.SHEETS_MODE ?? 'file') as 'file' | 'google',
  dataDir: process.env.DATA_DIR ?? './data/store',
  /** Spreadsheet ID from the URL when SHEETS_MODE=google */
  googleSheetsSpreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID ?? '',
  /** Optional path to service account JSON (else use GOOGLE_APPLICATION_CREDENTIALS) */
  googleServiceAccountJsonPath: process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH ?? '',
  databaseUrl: process.env.DATABASE_URL ?? '',
  llmProvider: (process.env.LLM_PROVIDER ?? 'auto') as 'auto' | 'deepseek' | 'openai' | 'rules',
  deepseekApiKey: process.env.DEEPSEEK_API_KEY ?? '',
  openaiApiKey: process.env.OPENAI_API_KEY ?? '',
} as const
