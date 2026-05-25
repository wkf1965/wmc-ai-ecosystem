export interface ParsedVitals {
  bloodPressure?: string | null
  pulse?: number | null
  temperature?: number | null
  oxygen?: number | null
  painScore?: number | null
}

export interface ParsedNursingFields {
  room?: string | null
  patientName?: string | null
  appetite?: string | null
  mobility?: string | null
  turningPosition?: string | null
  vitals: ParsedVitals
  symptoms: string[]
  notes?: string | null
}

export type ParseAlertType = 'fever' | 'fall_risk' | 'breathing_difficulty' | 'poor_appetite'

export interface NursingParseAlert {
  type: ParseAlertType
  severity: 'low' | 'medium' | 'high' | 'critical'
  message: string
}

export interface NursingParseResult {
  rawText: string
  parser: 'deepseek' | 'openai' | 'rules'
  parsed: ParsedNursingFields
  alerts: NursingParseAlert[]
  confirmationMessage: string
}

export interface NursingParsePersistedRow extends NursingParseResult {
  id: string
  source: string
  nurseName?: string | null
  chatId?: string | null
  patientId?: string | null
  storage: 'postgres' | 'file'
  clinicalRecordId?: string | null
  createdAt: string
}
