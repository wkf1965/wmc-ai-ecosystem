/** Full structured nursing shift / assessment row — stored in memory (swap for DB later). */
export interface NursingClinicalRecord {
  id: string
  /** Friendly or system id e.g. MRN/code until DB uses UUID everywhere */
  patientId: string
  patientName: string
  nurseName: string
  bloodPressure: string
  pulse: number
  temperature: number
  oxygen: number
  painScore: number
  appetite: string
  mood: string
  mobility: string
  sideTurning: string
  woundCondition: string
  notes: string
  /** ISO 8601 */
  createdAt: string
  /** Nurse user id from JWT when authenticated (omit in pure dev bypass) */
  recordedByUserId?: string
}
