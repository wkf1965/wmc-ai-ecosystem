/**
 * Shared domain types — align with docs/schema/postgresql.sql for future migration.
 */

export type UserRole = 'admin' | 'doctor' | 'nurse' | 'receptionist' | 'therapist'

export interface User {
  id: string
  email: string
  passwordHash: string
  fullName: string
  role: UserRole
  createdAt: string
  updatedAt: string
}

export interface Patient {
  id: string
  mrn?: string
  fullName: string
  dateOfBirth?: string
  gender?: string
  phone?: string
  medicalSummary?: string
  createdAt: string
  updatedAt: string
}

export type LeadSource = 'whatsapp' | 'google_form' | 'walk_in' | 'referral' | 'other'
export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'converted' | 'lost'
export type PipelineStage = 'inquiry' | 'consultation_booked' | 'deposit' | 'closed_won' | 'closed_lost'

export interface CrmLead {
  id: string
  source: LeadSource
  status: LeadStatus
  pipelineStage: PipelineStage
  contactName: string
  phone?: string
  email?: string
  notes?: string
  followUpAt?: string
  createdAt: string
  updatedAt: string
}

export interface NursingDailyReport {
  id: string
  patientId: string
  nurseUserId: string
  shiftDate: string
  narrative: string
  createdAt: string
}

export interface VitalSignRecord {
  id: string
  patientId: string
  recordedByUserId: string
  recordedAt: string
  temperature?: number
  bloodPressureSys?: number
  bloodPressureDia?: number
  heartRate?: number
  spo2?: number
  notes?: string
}

export interface MedicationRecord {
  id: string
  patientId: string
  medicationName: string
  dose?: string
  route?: string
  scheduledAt?: string
  administeredAt?: string
  administeredByUserId?: string
  notes?: string
}

export interface NursingAlert {
  id: string
  patientId: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  category: string
  description: string
  photoUrlPlaceholder?: string
  createdAt: string
  acknowledgedByUserId?: string
}

export interface DoctorReviewItem {
  id: string
  patientId: string
  sourceAlertId?: string
  priority: 'routine' | 'urgent'
  summary: string
  status: 'pending' | 'reviewed' | 'escalated'
  createdAt: string
}

export interface RehabSession {
  id: string
  patientId: string
  therapistUserId: string
  sessionAt: string
  painScore?: number
  mobilityNotes?: string
  therapistNotes?: string
  aiProgressSummary?: string
  createdAt: string
}

export interface AiJobResult {
  requestId: string
  kind:
    | 'patient_summary'
    | 'clinical_notes_summary'
    | 'lead_classify'
    | 'follow_up_message'
    | 'nursing_alert_summary'
    | 'rehab_progress_report'
  outputText: string
  meta?: Record<string, unknown>
  createdAt: string
}
