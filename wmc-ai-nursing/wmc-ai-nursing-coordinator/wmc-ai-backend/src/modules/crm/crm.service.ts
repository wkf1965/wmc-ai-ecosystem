import { z } from 'zod'
import { v4 as uuid } from 'uuid'
import { sheetDb } from '../../db/index.js'
import type { CrmLead, LeadSource, LeadStatus, PipelineStage } from '../../types/domain.js'

function normalizeLeadSource(input: unknown): LeadSource {
  if (typeof input !== 'string' || !input.trim()) return 'other'
  const key = input.trim().toLowerCase().replace(/\s+/g, '_')
  const aliases: Record<string, LeadSource> = {
    whatsapp: 'whatsapp',
    whats_app: 'whatsapp',
    google_form: 'google_form',
    googleform: 'google_form',
    walk_in: 'walk_in',
    walkin: 'walk_in',
    referral: 'referral',
    other: 'other',
  }
  return aliases[key] ?? 'other'
}

function normalizeLeadStatus(input: unknown): { status: LeadStatus; extraNote?: string } {
  if (input === undefined || input === null || input === '') {
    return { status: 'new' }
  }
  const raw = String(input).trim()
  const key = raw.toLowerCase()
  const direct: Record<string, LeadStatus> = {
    new: 'new',
    contacted: 'contacted',
    qualified: 'qualified',
    converted: 'converted',
    lost: 'lost',
    'hot lead': 'qualified',
    'hot_lead': 'qualified',
    hot: 'qualified',
    warm: 'contacted',
    cold: 'lost',
  }
  if (direct[key]) return { status: direct[key] }
  return { status: 'new', extraNote: `Status: ${raw}` }
}

const leadCreateShape = z.object({
  source: z.enum(['whatsapp', 'google_form', 'walk_in', 'referral', 'other']),
  contactName: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  notes: z.string().optional(),
  status: z.enum(['new', 'contacted', 'qualified', 'converted', 'lost']).optional(),
  pipelineStage: z
    .enum(['inquiry', 'consultation_booked', 'deposit', 'closed_won', 'closed_lost'])
    .optional(),
  followUpAt: z.string().optional(),
})

/** Accepts aliases: name→contactName, interest→notes line; normalizes source/status strings */
const leadCreate = z.preprocess(
  (raw: unknown) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw
    const o = raw as Record<string, unknown>
    const contactName =
      typeof o.contactName === 'string' && o.contactName.trim()
        ? o.contactName.trim()
        : typeof o.name === 'string'
          ? o.name.trim()
          : ''
    const interest =
      typeof o.interest === 'string' && o.interest.trim() ? o.interest.trim() : ''
    const existingNotes = typeof o.notes === 'string' && o.notes.trim() ? o.notes.trim() : ''
    const noteParts: string[] = []
    if (interest) noteParts.push(`Interest: ${interest}`)
    if (existingNotes) noteParts.push(existingNotes)

    const src =
      typeof o.source === 'string' && o.source.trim() ? normalizeLeadSource(o.source) : undefined
    const { status: normalizedStatus, extraNote } = normalizeLeadStatus(o.status)
    if (extraNote) noteParts.push(extraNote)

    const emailRaw = o.email
    const email =
      typeof emailRaw === 'string' && emailRaw.trim() ? emailRaw.trim() : undefined

    return {
      ...(src !== undefined ? { source: src } : {}),
      contactName: contactName || undefined,
      phone: o.phone,
      email: email ?? undefined,
      notes: noteParts.length ? noteParts.join('\n') : undefined,
      status: normalizedStatus,
      pipelineStage: o.pipelineStage,
      followUpAt: o.followUpAt,
    }
  },
  leadCreateShape,
)

const leadUpdate = leadCreateShape.partial()

function now(): string {
  return new Date().toISOString()
}

export const crmService = {
  async list(): Promise<CrmLead[]> {
    return sheetDb.list<CrmLead>('crm_leads')
  },

  async get(id: string): Promise<CrmLead | null> {
    return sheetDb.findById<CrmLead>('crm_leads', id)
  },

  async create(body: unknown): Promise<CrmLead> {
    const data = leadCreate.parse(body)
    const ts = now()
    const row: CrmLead = {
      id: uuid(),
      source: data.source as LeadSource,
      status: (data.status ?? 'new') as LeadStatus,
      pipelineStage: (data.pipelineStage ?? 'inquiry') as PipelineStage,
      contactName: data.contactName,
      phone: data.phone,
      email: data.email,
      notes: data.notes,
      followUpAt: data.followUpAt,
      createdAt: ts,
      updatedAt: ts,
    }
    return sheetDb.append('crm_leads', row)
  },

  async update(id: string, body: unknown): Promise<CrmLead | null> {
    const patch = leadUpdate.parse(body)
    return sheetDb.update<CrmLead>('crm_leads', id, { ...patch, updatedAt: now() } as Partial<CrmLead>)
  },
}
