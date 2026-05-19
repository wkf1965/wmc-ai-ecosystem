import { z } from 'zod'
import { v4 as uuid } from 'uuid'
import { sheetDb } from '../../db/index.js'
import { resolvePatientIdFromBody } from '../../utils/patientResolve.js'
import type { AiJobResult, Patient } from '../../types/domain.js'

function now(): string {
  return new Date().toISOString()
}

/** Placeholder “AI” outputs — replace with OpenAI / Vertex calls using env keys */
export const aiService = {
  async patientSummary(patientId: string): Promise<AiJobResult> {
    const text = `[Draft] Clinical summary for patient ${patientId}: consolidate demographics, active problems, recent vitals, and rehab goals. Replace this stub with LLM call.`
    return persist('patient_summary', text, { patientId })
  },

  /** Summarize free-text clinical notes for a patient (by id or name); persists `clinical_notes_summary`. */
  async clinicalNotesSummary(body: unknown): Promise<AiJobResult> {
    const raw = aiBodySchemas.summary.parse(body)
    const patientId = await resolvePatientIdFromBody(raw)
    const p = await sheetDb.findById<Patient>('patients', patientId)
    const label = raw.patientName?.trim() || p?.fullName || patientId
    const notes = raw.notes.trim()
    const text = `[Draft] Clinical summary for ${label}: ${notes.slice(0, 500)}${notes.length > 500 ? '…' : ''}\n\n(Replace with LLM: key problems, trajectory, risks, follow-ups.)`
    return persist('clinical_notes_summary', text, { patientId, label, notesLen: notes.length })
  },

  async classifyLead(leadNotes: string): Promise<AiJobResult> {
    const text = `[Draft] Lead classification from notes: "${leadNotes.slice(0, 200)}…" — suggest status + pipeline stage. Replace with LLM.`
    return persist('lead_classify', text, { snippetLen: leadNotes.length })
  },

  async followUpMessage(context: string): Promise<AiJobResult> {
    const text = `[Draft] Follow-up message draft based on: ${context.slice(0, 120)}…`
    return persist('follow_up_message', text, {})
  },

  async nursingAlertSummary(alertDescription: string): Promise<AiJobResult> {
    const text = `[Draft] Nursing alert digest: ${alertDescription.slice(0, 200)}`
    return persist('nursing_alert_summary', text, {})
  },

  async rehabProgressReport(sessionIds: string[]): Promise<AiJobResult> {
    const text = `[Draft] Rehab progress across sessions: ${sessionIds.join(', ')} — trends in pain & mobility.`
    return persist('rehab_progress_report', text, { sessionIds })
  },
}

async function persist(kind: AiJobResult['kind'], outputText: string, meta: Record<string, unknown>): Promise<AiJobResult> {
  const row: AiJobResult = {
    requestId: uuid(),
    kind,
    outputText,
    meta,
    createdAt: now(),
  }
  await sheetDb.append('ai_results', row)
  return row
}

export const aiBodySchemas = {
  patientSummary: z.object({ patientId: z.string().uuid() }),
  summary: z
    .object({
      patientId: z.string().uuid().optional(),
      patientName: z.string().optional(),
      notes: z.string().min(1),
    })
    .refine((d) => Boolean(d.patientId?.trim()) || Boolean(d.patientName?.trim()), {
      message: 'Provide patientId or patientName',
      path: ['patientName'],
    }),
  classifyLead: z.object({ notes: z.string().min(1) }),
  followUp: z.object({ context: z.string().min(1) }),
  nursingAlert: z.object({ description: z.string().min(1) }),
  rehabReport: z.object({ sessionIds: z.array(z.string().uuid()).min(1) }),
}
