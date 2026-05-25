import { z } from 'zod'

export const nursingParseInputSchema = z.object({
  text: z.string().min(1).max(4000),
  nurseName: z.string().max(200).optional(),
  chatId: z.union([z.string(), z.number()]).optional(),
  source: z.enum(['api', 'telegram', 'mobile']).optional().default('api'),
  persist: z.boolean().optional().default(true),
})

export type NursingParseInput = z.infer<typeof nursingParseInputSchema>
