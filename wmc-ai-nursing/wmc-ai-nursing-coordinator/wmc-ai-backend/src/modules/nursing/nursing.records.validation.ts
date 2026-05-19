import { z } from 'zod'

/** Request body for `POST /nursing/records` */
export const nursingRecordCreateSchema = z.object({
  patientId: z.string().trim().min(1),
  patientName: z.string().trim().min(1),
  nurseName: z.string().trim().min(1),
  bloodPressure: z.string().trim().min(1),
  pulse: z.coerce.number().int().positive().max(300),
  temperature: z.coerce.number(),
  oxygen: z.coerce.number().min(0).max(100),
  painScore: z.coerce.number().int().min(0).max(10),
  appetite: z.string().trim().min(1),
  mood: z.string().trim().min(1),
  mobility: z.string().trim().min(1),
  sideTurning: z.string().trim().min(1),
  woundCondition: z.string().trim().min(1),
  notes: z.string().trim().optional().default(''),
  createdAt: z.string().trim().optional(),
})
