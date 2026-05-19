/**
 * Dashboard mobile nurse submit → Telegram nursing memory + optional Sheet sync + Telegram group reply.
 * Patient display name comes only from verified Google Sheet roster when available.
 */

import { randomUUID } from 'node:crypto'

import { fetchPatientsFromGoogleSheet } from './sheetWebhookRead.mjs'
import {
  appendTelegramNursingMemoryRecord,
  updateTelegramNursingMemoryRecord,
} from './telegramNursingMemory.mjs'
import { saveTelegramNursingNoteToGoogleSheet } from './telegramGoogleSheetSync.mjs'
import { sendTelegramChatMessage } from './telegramWebhookProcessor.mjs'
import { normalizePatientRecord } from './src/lib/patientRosterResolve.js'
import {
  classifyDashboardCategories,
  dashboardRiskLevel,
  formatRecommendedActionForTelegram,
} from './src/lib/telegramClinicalDashboard.js'
import { parseTelegramNurseMessage, loopCategoryLabel } from './src/lib/telegramNurseParser.js'
import { mapOverallScoreToWorkflowRiskLabel } from './src/lib/telegramWorkflowReply.js'

function envStr(k) {
  return String(process.env[k] || process.env[`VITE_${k}`] || '').trim()
}

function parseTelegramChatId(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return null
  if (/^-?\d+$/.test(s)) return Number(s)
  return s
}

/**
 * @param {object} body
 * @param {string} body.patientId
 * @param {string} [body.room]
 * @param {string} [body.nurseName]
 * @param {string} body.narrative
 * @param {number} [body.overallScore]
 * @param {string} [body.suggestedAction]
 * @param {string} [body.primaryLoop] — aiRiskDetection category id e.g. fall_risk
 */
export async function processMobileNurseSubmit(body) {
  const patientId = String(body?.patientId || '').trim()
  const narrative = String(body?.narrative || '').trim()
  if (!patientId) {
    const err = new Error('patientId is required')
    err.code = 'VALIDATION'
    throw err
  }
  if (!narrative) {
    const err = new Error('narrative is required')
    err.code = 'VALIDATION'
    throw err
  }

  const rosterResult = await fetchPatientsFromGoogleSheet()
  const rosterList = rosterResult.ok
    ? rosterResult.rows.map(normalizePatientRecord).filter(Boolean)
    : []
  const rosterPatient =
    rosterResult.ok && rosterList.length > 0
      ? rosterList.find((p) => String(p.id || '').trim() === patientId)
      : null

  const rosterVerified = Boolean(rosterResult.ok && rosterPatient)

  const roomFromRoster = rosterPatient ? String(rosterPatient.room || '').trim() : ''
  const roomFromBody = String(body.room || '').trim()
  const roomDisplay = (roomFromRoster || roomFromBody || '—').trim() || '—'

  const syntheticLine = roomDisplay !== '—' ? `Room ${roomDisplay} ${narrative}` : narrative
  let parsed = parseTelegramNurseMessage(syntheticLine)
  const loop = String(body.primaryLoop || '').trim()
  if (loop) {
    parsed = {
      ...parsed,
      suggestedLoopCategory: loop,
      loopCategoryLabel: loopCategoryLabel(loop),
    }
  }

  const overallScore = Number(body.overallScore)
  const scoreOk = Number.isFinite(overallScore)

  const suggestedAction = String(body.suggestedAction || '').trim()

  const riskIntegration = {
    parsed,
    patientResolution: null,
    analysis: {
      overallScore: scoreOk ? overallScore : null,
      categories: [],
      anyEscalation: false,
    },
    recommendedAction: suggestedAction,
  }

  const dashCat = classifyDashboardCategories(parsed, riskIntegration)
  const dashRisk = dashboardRiskLevel(riskIntegration)
  const actionLine = formatRecommendedActionForTelegram(riskIntegration, dashRisk)

  const patientTelegramName = rosterVerified ? String(rosterPatient.fullName || '').trim() : ''

  const replyText = [
    'Received mobile nurse input.',
    `Room: ${roomDisplay}`,
    patientTelegramName ? `Patient: ${patientTelegramName}` : 'Patient: —',
    `Category: ${dashCat.display}`,
    `Risk: ${dashRisk.level}`,
    `Action: ${actionLine}`,
    'Saved to Nursing Dashboard.',
  ].join('\n')

  const receivedAt = new Date().toISOString()
  const token = envStr('TELEGRAM_BOT_TOKEN')
  const chatIdRaw = envStr('TELEGRAM_CHAT_ID')
  const chatId = parseTelegramChatId(chatIdRaw)

  const memoryRecord = {
    id: randomUUID(),
    timestamp: receivedAt,
    chatId: chatId != null ? chatId : null,
    nurseName: String(body.nurseName || '').trim() || null,
    room: roomDisplay !== '—' ? roomDisplay : null,
    patientName: patientTelegramName || null,
    patientId: rosterVerified ? String(rosterPatient.id) : patientId,
    symptoms: '',
    originalMessage: `[Mobile nurse input] ${narrative}`,
    categories: dashCat.display,
    dashboardCategories: dashCat.labels,
    primaryLoop: parsed.suggestedLoopCategory,
    riskLevel: dashRisk.level,
    riskScore: scoreOk ? overallScore : null,
    workflowRiskLabel: scoreOk ? mapOverallScoreToWorkflowRiskLabel(overallScore) : 'N/A',
    suggestedAction,
    replyText,
    status: 'new',
    escalatedToDoctor: false,
    familyUpdateDraft: null,
    webhookEntryId: null,
    mode: 'mobile-nurse-input',
    telegramSent: false,
    updatedAt: null,
  }

  await appendTelegramNursingMemoryRecord(memoryRecord)

  saveTelegramNursingNoteToGoogleSheet(memoryRecord).catch((err) => {
    console.error('[mobile-submit] Google Sheet async sync error:', err?.message || err)
  })

  let telegramSent = false
  let telegramError = null

  if (!token) {
    telegramError = 'TELEGRAM_BOT_TOKEN not configured'
    console.warn('[mobile-submit]', telegramError)
  } else if (chatId == null || chatId === '') {
    telegramError = 'Missing TELEGRAM_CHAT_ID'
    console.error('Missing TELEGRAM_CHAT_ID')
  } else {
    try {
      await sendTelegramChatMessage(token, chatId, replyText)
      telegramSent = true
      memoryRecord.telegramSent = true
      await updateTelegramNursingMemoryRecord(memoryRecord.id, { telegramSent: true, replyText })
    } catch (e) {
      telegramError = String(e?.message || e)
      console.error('[mobile-submit] Telegram sendMessage failed:', telegramError)
    }
  }

  return {
    ok: true,
    memoryId: memoryRecord.id,
    telegramSent,
    telegramError,
    replyText,
    rosterVerified,
    rosterLoaded: rosterResult.ok,
    rosterError: rosterResult.ok ? undefined : rosterResult.error,
  }
}
