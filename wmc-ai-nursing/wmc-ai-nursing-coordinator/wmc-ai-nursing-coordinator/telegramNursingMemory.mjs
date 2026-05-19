import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import { classifyDashboardCategories, dashboardRiskLevel } from './src/lib/telegramClinicalDashboard.js'
import { mapOverallScoreToWorkflowRiskLabel } from './src/lib/telegramWorkflowReply.js'

const STORE_PATH = path.join(process.cwd(), 'telegram-nursing-memory.json')

const VALID_STATUS = /** @type {const} */ (['new', 'acknowledged', 'completed'])

/** @typedef {'new'|'acknowledged'|'completed'} TelegramNursingStatus */

/**
 * Build a dashboard row from webhook processor output.
 * @param {object} processed — return value of processTelegramInboundUpdate
 * @param {object} opts
 * @param {string} opts.webhookEntryId
 * @param {string} opts.receivedAt — ISO
 * @param {string} [opts.mode]
 * @param {boolean} [opts.telegramSent]
 */
export function buildTelegramNursingMemoryRecord(processed, opts) {
  const { extracted, nursingRecord, replyText } = processed
  const { parsed, analysis, recommendedAction } = processed.integration
  const dashCat = classifyDashboardCategories(parsed, processed.integration)
  const dashRisk = dashboardRiskLevel(processed.integration)

  return {
    id: randomUUID(),
    timestamp: opts.receivedAt,
    chatId: extracted.chatId ?? null,
    nurseName: extracted.nurseDisplayName ?? nursingRecord.nurseName ?? null,
    room: nursingRecord.room ?? parsed.patientRoom ?? null,
    patientName: nursingRecord.patient ?? null,
    patientId: nursingRecord.patientId ?? null,
    symptoms: nursingRecord.symptoms ?? '',
    originalMessage: extracted.text ?? '',
    categories: dashCat.display,
    dashboardCategories: dashCat.labels,
    primaryLoop: parsed.suggestedLoopCategory,
    riskLevel: dashRisk.level,
    riskScore:
      analysis.overallScore != null && Number.isFinite(Number(analysis.overallScore))
        ? analysis.overallScore
        : null,
    workflowRiskLabel:
      analysis.overallScore != null && Number.isFinite(Number(analysis.overallScore))
        ? mapOverallScoreToWorkflowRiskLabel(analysis.overallScore)
        : 'N/A',
    suggestedAction: nursingRecord.recommendedAction ?? recommendedAction ?? '',
    replyText: replyText ?? null,
    status: /** @type {TelegramNursingStatus} */ ('new'),
    escalatedToDoctor: false,
    familyUpdateDraft: null,
    webhookEntryId: opts.webhookEntryId,
    mode: opts.mode ?? null,
    telegramSent: Boolean(opts.telegramSent),
    updatedAt: null,
  }
}

export async function appendTelegramNursingMemoryRecord(record) {
  let data = { version: 1, entries: [], last: null }
  try {
    const raw = await fs.readFile(STORE_PATH, 'utf8')
    data = JSON.parse(raw)
  } catch {
    // first run
  }
  if (!Array.isArray(data.entries)) data.entries = []
  data.entries.unshift(record)
  if (data.entries.length > 2000) data.entries = data.entries.slice(0, 2000)
  data.last = record
  await fs.writeFile(STORE_PATH, JSON.stringify(data, null, 2), 'utf8')
}

export async function readTelegramNursingMemoryState() {
  try {
    const raw = await fs.readFile(STORE_PATH, 'utf8')
    const data = JSON.parse(raw)
    if (!Array.isArray(data.entries)) data.entries = []
    return data
  } catch {
    return { version: 1, entries: [], last: null }
  }
}

/**
 * @param {string} id — memory row id
 * @param {Partial<{ status: string, escalatedToDoctor: boolean, familyUpdateDraft: string | null, telegramSent: boolean, replyText: string | null }>} patch
 */
export async function updateTelegramNursingMemoryRecord(id, patch) {
  const data = await readTelegramNursingMemoryState()
  const idx = data.entries.findIndex((e) => e.id === id)
  if (idx === -1) {
    const err = new Error('Telegram nursing memory record not found')
    err.code = 'NOT_FOUND'
    throw err
  }
  const row = { ...data.entries[idx] }
  if (patch.status !== undefined) {
    if (!VALID_STATUS.includes(patch.status)) {
      const err = new Error(`Invalid status — use ${VALID_STATUS.join(', ')}`)
      err.code = 'INVALID'
      throw err
    }
    row.status = patch.status
  }
  if (patch.escalatedToDoctor !== undefined) row.escalatedToDoctor = Boolean(patch.escalatedToDoctor)
  if (patch.familyUpdateDraft !== undefined) row.familyUpdateDraft = patch.familyUpdateDraft
  if (patch.telegramSent !== undefined) row.telegramSent = Boolean(patch.telegramSent)
  if (patch.replyText !== undefined) row.replyText = patch.replyText
  row.updatedAt = new Date().toISOString()
  data.entries[idx] = row
  await fs.writeFile(STORE_PATH, JSON.stringify(data, null, 2), 'utf8')
  return row
}
