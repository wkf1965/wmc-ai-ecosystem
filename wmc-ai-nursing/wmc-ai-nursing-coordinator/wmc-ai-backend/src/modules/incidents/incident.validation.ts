import { z } from 'zod'

export const incidentReportBodySchema = z.object({
  patientName: z.string().trim().min(1),
  incidentType: z.string().trim().min(1),
  incidentTime: z.string().trim().min(1),
  location: z.string().trim().min(1),
  reportedBy: z.string().trim().min(1),
  injuryDetected: z.boolean(),
  injuryDetails: z.string().optional().default(''),
  vitalStatus: z.string().trim().min(1),
  doctorInformed: z.boolean(),
  familyInformed: z.boolean(),
  notes: z.string().optional().default(''),
})

export type IncidentReportBody = z.infer<typeof incidentReportBodySchema>
