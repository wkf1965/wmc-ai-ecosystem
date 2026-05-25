import { v4 as uuid } from 'uuid'
import { resolvePatientIdFromBody } from '../../../utils/patientResolve.js'
import { nursingClinicalRecordsMemoryStore } from '../nursing.records.store.js'
import type { NursingClinicalRecord } from '../nursing.records.types.js'
import { nursingService } from '../nursing.service.js'
import { buildConfirmationMessage, detectNursingParseAlerts } from './nursing.parse.alerts.js'
import { parseNursingTextWithLlm } from './nursing.parse.llm.js'
import { saveParsedNursingMessage } from './nursing.parse.repository.js'
import type { NursingParsePersistedRow, NursingParseResult } from './nursing.parse.types.js'
import type { NursingParseInput } from './nursing.parse.validation.js'

function alertSeverityToDomain(severity: string): 'low' | 'medium' | 'high' | 'critical' {
  if (severity === 'critical') return 'critical'
  if (severity === 'high') return 'high'
  if (severity === 'medium') return 'medium'
  return 'low'
}

async function resolvePatientIdSafe(parsed: NursingParseResult['parsed']): Promise<string | null> {
  if (!parsed.patientName?.trim()) return null
  try {
    return await resolvePatientIdFromBody({ patientName: parsed.patientName.trim() })
  } catch {
    return null
  }
}

async function appendClinicalRecord(
  input: NursingParseInput,
  result: NursingParseResult,
  patientId: string | null,
): Promise<string | null> {
  const parsed = result.parsed
  const record: NursingClinicalRecord = {
    id: uuid(),
    patientId: patientId ?? 'unknown',
    patientName: parsed.patientName?.trim() || 'Unknown',
    nurseName: input.nurseName?.trim() || 'Nurse',
    bloodPressure: parsed.vitals.bloodPressure ?? '—',
    pulse: parsed.vitals.pulse ?? 0,
    temperature: parsed.vitals.temperature ?? 0,
    oxygen: parsed.vitals.oxygen ?? 0,
    painScore: parsed.vitals.painScore ?? 0,
    appetite: parsed.appetite ?? 'Not documented',
    mood: 'Not documented',
    mobility: parsed.mobility ?? 'Not documented',
    sideTurning: parsed.turningPosition ? `Turned ${parsed.turningPosition}` : 'Not documented',
    woundCondition: 'Not documented',
    notes: parsed.notes ?? result.rawText,
    createdAt: new Date().toISOString(),
  }
  nursingClinicalRecordsMemoryStore.append(record)
  return record.id
}

async function persistAlerts(patientId: string | null, result: NursingParseResult): Promise<void> {
  if (!patientId) return
  for (const alert of result.alerts) {
    await nursingService.createAlert({
      patientId,
      severity: alertSeverityToDomain(alert.severity),
      category: alert.type,
      description: alert.message,
    })
  }
}

export async function parseAndPersistNursingMessage(
  input: NursingParseInput,
): Promise<NursingParsePersistedRow> {
  const { parsed, parser } = await parseNursingTextWithLlm(input.text)
  const alerts = detectNursingParseAlerts(input.text, parsed)
  const confirmationMessage = buildConfirmationMessage(parsed, alerts)

  const result: NursingParseResult = {
    rawText: input.text,
    parser,
    parsed,
    alerts,
    confirmationMessage,
  }

  if (!input.persist) {
    return {
      id: uuid(),
      source: input.source ?? 'api',
      nurseName: input.nurseName ?? null,
      chatId: input.chatId != null ? String(input.chatId) : null,
      patientId: null,
      clinicalRecordId: null,
      storage: 'file',
      createdAt: new Date().toISOString(),
      ...result,
    }
  }

  const patientId = await resolvePatientIdSafe(parsed)
  const clinicalRecordId = await appendClinicalRecord(input, result, patientId)
  await persistAlerts(patientId, result)

  return saveParsedNursingMessage(input, result, { patientId, clinicalRecordId })
}
