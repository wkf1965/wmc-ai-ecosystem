import { z } from 'zod'
import { v4 as uuid } from 'uuid'
import { sheetDb } from '../../db/index.js'
import { resolvePatientIdFromBody } from '../../utils/patientResolve.js'
import type { RehabSession } from '../../types/domain.js'

function now(): string {
  return new Date().toISOString()
}

const sessionCreateShape = z.object({
  patientId: z.string().uuid(),
  sessionAt: z.string(),
  painScore: z.number().min(0).max(10).optional(),
  mobilityNotes: z.string().optional(),
  therapistNotes: z.string().optional(),
})

const sessionCreate = sessionCreateShape

/** Friendly progress payload: patientName, mobility, therapistNote; defaults sessionAt to now */
const rehabProgressInput = z
  .object({
    patientId: z.string().uuid().optional(),
    patientName: z.string().optional(),
    painScore: z.number().min(0).max(10).optional(),
    mobility: z.string().optional(),
    mobilityNotes: z.string().optional(),
    therapistNote: z.string().optional(),
    therapistNotes: z.string().optional(),
    sessionAt: z.string().optional(),
  })
  .refine((d) => Boolean(d.patientId?.trim()) || Boolean(d.patientName?.trim()), {
    message: 'Provide patientId or patientName',
    path: ['patientName'],
  })

const summaryPatch = z.object({
  aiProgressSummary: z.string().min(1),
})

export const rehabService = {
  async list(): Promise<RehabSession[]> {
    return sheetDb.list('rehab_sessions')
  },

  async get(id: string): Promise<RehabSession | null> {
    return sheetDb.findById<RehabSession>('rehab_sessions', id)
  },

  async create(therapistUserId: string, body: unknown): Promise<RehabSession> {
    const data = sessionCreate.parse(body)
    const row: RehabSession = {
      id: uuid(),
      patientId: data.patientId,
      therapistUserId,
      sessionAt: data.sessionAt,
      painScore: data.painScore,
      mobilityNotes: data.mobilityNotes,
      therapistNotes: data.therapistNotes,
      createdAt: now(),
    }
    return sheetDb.append('rehab_sessions', row)
  },

  async createProgress(therapistUserId: string, body: unknown): Promise<RehabSession> {
    const raw = rehabProgressInput.parse(body)
    const patientId = await resolvePatientIdFromBody(raw)
    const mobilityNotes = (raw.mobilityNotes ?? raw.mobility)?.trim() || undefined
    const therapistNotes = (raw.therapistNotes ?? raw.therapistNote)?.trim() || undefined
    const sessionAt = raw.sessionAt?.trim() || now()
    const data = sessionCreateShape.parse({
      patientId,
      sessionAt,
      painScore: raw.painScore,
      mobilityNotes,
      therapistNotes,
    })
    const row: RehabSession = {
      id: uuid(),
      patientId: data.patientId,
      therapistUserId,
      sessionAt: data.sessionAt,
      painScore: data.painScore,
      mobilityNotes: data.mobilityNotes,
      therapistNotes: data.therapistNotes,
      createdAt: now(),
    }
    return sheetDb.append('rehab_sessions', row)
  },

  async attachAiSummary(sessionId: string, body: unknown): Promise<RehabSession | null> {
    const { aiProgressSummary } = summaryPatch.parse(body)
    return sheetDb.update<RehabSession>('rehab_sessions', sessionId, { aiProgressSummary })
  },
}
