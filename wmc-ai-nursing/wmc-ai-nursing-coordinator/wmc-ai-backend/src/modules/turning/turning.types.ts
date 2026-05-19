/** Persisted side-turning row (in-memory). */
export interface SideTurningRecord {
  id: string
  patientId: string
  patientName: string
  nurseName: string
  turningTime: string
  turningPosition: string
  skinCondition: string
  photoRequired: boolean
  photoUploaded: boolean
  notes: string
  /** Derived when saved — `turningTime` + 2 hours (`HH:mm`). */
  nextTurningTime: string
  createdAt: string
  recordedByUserId?: string
}
