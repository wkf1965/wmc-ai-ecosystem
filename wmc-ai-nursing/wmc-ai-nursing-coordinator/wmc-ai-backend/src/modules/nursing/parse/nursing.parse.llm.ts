import { config } from '../../../config/env.js'
import type { ParsedNursingFields } from './nursing.parse.types.js'
import { parseNursingTextWithRules } from './nursing.parse.rules.js'

const SYSTEM_PROMPT = `You extract structured nursing observations from free-text nurse messages.
Return ONLY valid JSON with this shape:
{
  "room": string|null,
  "patientName": string|null,
  "appetite": string|null,
  "mobility": string|null,
  "turningPosition": string|null,
  "vitals": {
    "bloodPressure": string|null,
    "pulse": number|null,
    "temperature": number|null,
    "oxygen": number|null,
    "painScore": number|null
  },
  "symptoms": string[],
  "notes": string|null
}
Use null for unknown fields. Symptoms should be short clinical labels.`

function normalizeParsed(raw: unknown): ParsedNursingFields {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const vitalsObj = obj.vitals && typeof obj.vitals === 'object' ? (obj.vitals as Record<string, unknown>) : {}
  return {
    room: typeof obj.room === 'string' ? obj.room : null,
    patientName: typeof obj.patientName === 'string' ? obj.patientName : null,
    appetite: typeof obj.appetite === 'string' ? obj.appetite : null,
    mobility: typeof obj.mobility === 'string' ? obj.mobility : null,
    turningPosition: typeof obj.turningPosition === 'string' ? obj.turningPosition : null,
    vitals: {
      bloodPressure: typeof vitalsObj.bloodPressure === 'string' ? vitalsObj.bloodPressure : null,
      pulse: typeof vitalsObj.pulse === 'number' ? vitalsObj.pulse : null,
      temperature: typeof vitalsObj.temperature === 'number' ? vitalsObj.temperature : null,
      oxygen: typeof vitalsObj.oxygen === 'number' ? vitalsObj.oxygen : null,
      painScore: typeof vitalsObj.painScore === 'number' ? vitalsObj.painScore : null,
    },
    symptoms: Array.isArray(obj.symptoms)
      ? obj.symptoms.filter((s): s is string => typeof s === 'string')
      : [],
    notes: typeof obj.notes === 'string' ? obj.notes : null,
  }
}

async function callChatCompletions(
  provider: 'deepseek' | 'openai',
  text: string,
): Promise<ParsedNursingFields | null> {
  const apiKey = provider === 'deepseek' ? config.deepseekApiKey : config.openaiApiKey
  if (!apiKey) return null

  const baseURL = provider === 'deepseek' ? 'https://api.deepseek.com/v1' : 'https://api.openai.com/v1'
  const model = provider === 'deepseek' ? 'deepseek-chat' : 'gpt-4o-mini'

  const res = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text },
      ],
    }),
  })

  if (!res.ok) return null
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = data.choices?.[0]?.message?.content
  if (!content) return null
  try {
    return normalizeParsed(JSON.parse(content))
  } catch {
    return null
  }
}

export async function parseNursingTextWithLlm(
  text: string,
): Promise<{ parsed: ParsedNursingFields; parser: 'deepseek' | 'openai' | 'rules' }> {
  const provider = config.llmProvider

  if (provider === 'deepseek' && config.deepseekApiKey) {
    const parsed = await callChatCompletions('deepseek', text)
    if (parsed) return { parsed, parser: 'deepseek' }
  }

  if (provider === 'openai' && config.openaiApiKey) {
    const parsed = await callChatCompletions('openai', text)
    if (parsed) return { parsed, parser: 'openai' }
  }

  if (provider === 'auto') {
    if (config.deepseekApiKey) {
      const parsed = await callChatCompletions('deepseek', text)
      if (parsed) return { parsed, parser: 'deepseek' }
    }
    if (config.openaiApiKey) {
      const parsed = await callChatCompletions('openai', text)
      if (parsed) return { parsed, parser: 'openai' }
    }
  }

  return { parsed: parseNursingTextWithRules(text), parser: 'rules' }
}
