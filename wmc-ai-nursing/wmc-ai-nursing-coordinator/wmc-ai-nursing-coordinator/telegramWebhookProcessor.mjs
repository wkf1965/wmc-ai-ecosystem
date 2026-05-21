import { scoreToLevel } from './src/lib/aiRiskDetection.js'
import {
  classifyDashboardCategories,
  dashboardRiskLevel,
} from './src/lib/telegramClinicalDashboard.js'
import { fetchNursingNotesFromGoogleSheet, fetchPatientsFromGoogleSheet } from './sheetWebhookRead.mjs'
import {
  resolvePatientForTelegramMessage,
  patientsroomRoomNumbersList,
} from './src/lib/patientRosterResolve.js'
import { isProductionNursingMode } from './src/lib/nursingMode.js'
import { parseTelegramNurseMessage } from './src/lib/telegramNurseParser.js'
import {
  buildTelegramProcessingErrorIntegration,
  processTelegramNurseMessageForIntegration,
  resolveAcknowledgedPatientName,
} from './src/lib/telegramNurseIntegration.js'
import {
  buildTelegramWorkflowReply,
  mapOverallScoreToWorkflowRiskLabel,
} from './src/lib/telegramWorkflowReply.js'
import {
  isTelegramHandoverCommand,
  handleHandoverCommand,
} from './src/lib/telegramHandoverHandler.js'
import {
  isTelegramTimelineCommand,
  handleTimelineCommand,
} from './src/lib/telegramTimelineHandler.js'
import { dispatchCommandOrFormStep } from './src/lib/commands/commandDispatcher.js'

function telegramSenderDisplay(from) {
  if (!from || typeof from !== 'object') return null
  const parts = [from.first_name, from.last_name].filter(Boolean).join(' ').trim()
  if (parts) return parts
  if (from.username) return `@${String(from.username)}`
  return null
}

async function loadTelegramSheetRoster(parsed) {
  const lookupDisplay =
    parsed?.patientRoom != null && String(parsed.patientRoom).trim() !== ''
      ? String(parsed.patientRoom).trim()
      : '(none)'

  let patientsResult = await fetchPatientsFromGoogleSheet()
  if (!patientsResult.ok) {
    console.log('Available rooms:', [])
    console.log('Looking up room:', lookupDisplay)
    console.log('Roster result:', 'not found')
    return {
      patients: [],
      nursingNotes: [],
      resolution: { patient: null, error: 'roster_unavailable' },
      rosterLoadError: patientsResult.error,
    }
  }

  let patients = patientsResult.rows
  /** Tab Patientsroom — columns room_number + patient_name only (GET read_table, no nursing_notes for roster). */
  let resolution = resolvePatientForTelegramMessage(patients, parsed, { production: true })

  if (resolution.error === 'room_not_found') {
    console.log('[Patientsroom] GET read_table retry before not-found reply')
    const retry = await fetchPatientsFromGoogleSheet()
    if (retry.ok) {
      patientsResult = retry
      patients = retry.rows
      resolution = resolvePatientForTelegramMessage(patients, parsed, { production: true })
    }
  }

  const roomsLogged = patientsroomRoomNumbersList(patients)
  console.log('Available rooms:', roomsLogged)
  console.log('Looking up room:', lookupDisplay)

  if (isProductionNursingMode() && patients.length > 0) {
    console.log('Production nursing roster loaded successfully.')
  }

  console.log('Roster result:', resolution.patient ? 'found' : 'not found')

  if (!resolution.patient) {
    return {
      patients,
      nursingNotes: [],
      resolution,
      rosterLoadError: null,
    }
  }

  const notesResult = await fetchNursingNotesFromGoogleSheet()
  /** Historical nursing rows for risk context only — loaded after roster match; never used for room lookup. */
  const nursingNotes = notesResult.ok ? notesResult.rows : []

  return { patients, nursingNotes, resolution, rosterLoadError: null }
}

function summarizeAiCategory(analysis, id) {
  const c = analysis?.categories?.find((x) => x.id === id)
  if (!c) {
    return {
      score: 0,
      level: 'minimal',
      levelLabel: 'Minimal',
      signals: [],
      recommendedAction: '',
      escalation: false,
    }
  }
  const sl = scoreToLevel(c.score)
  return {
    score: c.score,
    level: c.level,
    levelLabel: sl.label,
    signals: c.signals || [],
    recommendedAction: c.recommendedAction || '',
    escalation: Boolean(c.escalation),
  }
}

function heuristicBrainFromParsed(parsed, analysis) {
  const baseScore = Math.min(
    88,
    parsed.riskKeywords.length * 14 + (parsed.suggestedLoopCategory === 'doctor_review' ? 42 : 24),
  )
  const loop = parsed.suggestedLoopCategory
  const mk = (loopKeys) => {
    const hit = loopKeys.includes(loop)
    const sc = hit ? Math.max(52, baseScore) : Math.round(baseScore * 0.32)
    const sl = scoreToLevel(sc)
    return {
      score: sc,
      level: sl.level,
      levelLabel: sl.label,
      signals: [],
      recommendedAction: '',
      escalation: sc >= 60,
    }
  }

  const doctorReviewTrigger =
    parsed.suggestedLoopCategory === 'doctor_review' ||
    baseScore >= 55 ||
    Boolean(analysis?.anyEscalation)

  return {
    fallRisk: mk(['fall_risk']),
    hydrationRisk: mk(['hydration']),
    nutritionRisk: mk(['nutrition']),
    mentalHealthRisk: mk(['mental_health']),
    doctorReviewTrigger,
  }
}

export function buildBrainSignals(analysis, parsed, opts = {}) {
  const production = Boolean(opts.production)

  if (analysis?.telegramPatientUnresolved) {
    const z = () => ({
      score: 0,
      level: 'minimal',
      levelLabel: 'Minimal',
      signals: [],
      recommendedAction: '',
      escalation: false,
    })
    return {
      fallRisk: z(),
      hydrationRisk: z(),
      nutritionRisk: z(),
      mentalHealthRisk: z(),
      doctorReviewTrigger: false,
    }
  }

  const hasCats = Array.isArray(analysis?.categories) && analysis.categories.length > 0
  if (!hasCats) {
    if (production) {
      const z = () => ({
        score: 0,
        level: 'minimal',
        levelLabel: 'Minimal',
        signals: [],
        recommendedAction: '',
        escalation: false,
      })
      return {
        fallRisk: z(),
        hydrationRisk: z(),
        nutritionRisk: z(),
        mentalHealthRisk: z(),
        doctorReviewTrigger: false,
      }
    }
    return heuristicBrainFromParsed(parsed, analysis)
  }

  const fallRisk = summarizeAiCategory(analysis, 'fall_risk')
  const hydrationRisk = summarizeAiCategory(analysis, 'dehydration')
  const nutritionRisk = summarizeAiCategory(analysis, 'poor_appetite')
  const mentalHealthRisk = summarizeAiCategory(analysis, 'emotional_distress')

  const doctorReviewTrigger =
    Boolean(analysis.anyEscalation) ||
    parsed.suggestedLoopCategory === 'doctor_review' ||
    analysis.overallScore >= 55

  return {
    fallRisk,
    hydrationRisk,
    nutritionRisk,
    mentalHealthRisk,
    doctorReviewTrigger,
  }
}

/** @deprecated Prefer buildTelegramWorkflowReply(integration) — kept for tooling compatibility */
export function buildTelegramReply(_brainSignals, analysis, parsed) {
  const supervisor = _brainSignals.doctorReviewTrigger
  const tail = supervisor ? 'Supervisor review recommended.' : 'Continue routine monitoring.'
  const riskWord = mapOverallScoreToWorkflowRiskLabel(analysis?.overallScore ?? 0)
  const cat = parsed?.loopCategoryLabel || 'General'
  const room = parsed?.patientRoom ? `Room ${parsed.patientRoom}` : 'Room —'
  return `Received ${room}. Category: ${cat}. Risk: ${riskWord}. Action: Review fused signals. ${tail}`
}

export async function sendTelegramChatMessage(token, chatId, text) {
  const safeToken = encodeURIComponent(token)
  const url = `https://api.telegram.org/bot${safeToken}/sendMessage`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.ok === false) {
    throw new Error(data.description || `Telegram sendMessage failed (${res.status})`)
  }
  return data
}

/**
 * @param {string} token
 * @param {string} webhookUrl full HTTPS URL Telegram should POST updates to
 */
export async function telegramSetWebhook(token, webhookUrl, opts = {}) {
  const safeToken = encodeURIComponent(token)
  const apiUrl = `https://api.telegram.org/bot${safeToken}/setWebhook`
  const payload = { url: webhookUrl }
  if (opts.drop_pending_updates === true) payload.drop_pending_updates = true
  if (Array.isArray(opts.allowed_updates) && opts.allowed_updates.length > 0) {
    payload.allowed_updates = opts.allowed_updates
  }
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.ok === false) {
    throw new Error(data.description || `setWebhook failed (${res.status})`)
  }
  return data
}

export async function telegramGetWebhookInfo(token) {
  const safeToken = encodeURIComponent(token)
  const res = await fetch(`https://api.telegram.org/bot${safeToken}/getWebhookInfo`)
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.ok === false) {
    throw new Error(data.description || `getWebhookInfo failed (${res.status})`)
  }
  return data.result
}

function normalizeTelegramUpdate(json) {
  if (json?.message || json?.edited_message || json?.channel_post) return json
  if (json?.text !== undefined && json?.text !== null) {
    return {
      update_id: json.update_id ?? Date.now(),
      message: {
        message_id: json.message_id ?? 0,
        date: json.date != null ? Number(json.date) : Math.floor(Date.now() / 1000),
        chat: {
          id: json.chat_id ?? json.chat?.id ?? 0,
          type: json.chat?.type ?? 'private',
        },
        from: {
          id: json.from_id ?? 0,
          username: json.username ?? json.from?.username ?? 'dev_test',
        },
        text: String(json.text),
      },
    }
  }
  return json
}

/**
 * Chat id for replies — from message-like updates or callback_query.message.chat.
 */
export function extractTelegramWebhookChatId(bodyJson) {
  const u = normalizeTelegramUpdate(bodyJson)
  const msg = u.message || u.edited_message || u.channel_post
  const fromMsg = msg?.chat?.id
  if (fromMsg != null && fromMsg !== '') return fromMsg

  const cq = u.callback_query
  if (cq?.message?.chat?.id != null && cq.message.chat.id !== '') return cq.message.chat.id

  const memberChat = u.my_chat_member?.chat || u.chat_member?.chat
  if (memberChat?.id != null) return memberChat.id

  return null
}

/**
 * Terminal helper: print detected chat id vs .env so operators can set TELEGRAM_CHAT_ID.
 */
export function logTelegramChatIdFromWebhook(bodyJson, label = '[telegram]') {
  const detected = extractTelegramWebhookChatId(bodyJson)
  const envId = String(process.env.TELEGRAM_CHAT_ID || process.env.VITE_TELEGRAM_CHAT_ID || '').trim()
  console.log(`${label} TELEGRAM_CHAT_ID (detected from webhook):`, detected ?? '(none)')
  console.log(`${label} TELEGRAM_CHAT_ID (.env):`, envId || '(not set)')
  if (detected != null && envId && String(detected) !== envId) {
    console.warn(
      `${label} Incoming chat id differs from TELEGRAM_CHAT_ID in .env — replies still use the incoming update's chat.`,
    )
  }
  return detected
}

export async function processTelegramInboundUpdate(bodyJson) {
  const rawUpdate = normalizeTelegramUpdate(bodyJson)
  const msg = rawUpdate.message || rawUpdate.edited_message || rawUpdate.channel_post
  const text = msg?.text ?? msg?.caption ?? ''
  const chatId = extractTelegramWebhookChatId(bodyJson)
  const username = msg?.from?.username ?? null
  const nurseDisplayName = telegramSenderDisplay(msg?.from)
  const messageDate = msg?.date
  const timestamp =
    typeof messageDate === 'number'
      ? new Date(messageDate * 1000).toISOString()
      : new Date().toISOString()

  const extracted = {
    text: String(text),
    chatId,
    username,
    nurseDisplayName,
    timestamp,
    updateId: rawUpdate.update_id ?? null,
  }

  console.log('[telegram] webhook update:', {
    update_id: rawUpdate.update_id ?? null,
    chat_id: chatId ?? null,
    text_preview: String(text).slice(0, 120),
  })

  // ── Structured command workflow dispatcher ────────────────────────────────
  // Handles /admit /vitals /fall /turning /rehab /med /alert /cancel /help
  // and multi-step form replies. Falls through for free-text nursing notes.
  try {
    const cmdResult = await dispatchCommandOrFormStep(String(text), chatId, {
      nurseName: nurseDisplayName,
      username,
    })
    if (cmdResult.handled) {
      console.log('[telegram] command workflow handled:', String(text).split(' ')[0])
      const emptyParsed = {
        originalText: String(text),
        patientRoom: null,
        patientNameGuess: null,
        nursingNoteText: String(text),
        riskKeywords: [],
        suggestedLoopCategory: 'command_workflow',
        loopScores: {},
        loopCategoryLabel: 'Command Workflow',
      }
      const cmdIntegration = buildTelegramProcessingErrorIntegration(emptyParsed)
      return {
        extracted,
        rawUpdate,
        nursingRecord: {
          room: null,
          patient: null,
          patientId: null,
          note: String(text),
          category: 'Command Workflow',
          loopKey: 'command_workflow',
          riskKeywords: [],
          nurseName: nurseDisplayName,
          symptoms: '',
          dashboardCategories: ['Command Workflow'],
          dashboardCategoryDisplay: 'Command Workflow',
          riskLevel: 'N/A',
          workflowRiskLabel: 'N/A',
          recommendedAction: '',
          nursingRiskScore: null,
          nursingRiskLevel: null,
          nursingRiskDetected: [],
        },
        brainSignals: buildBrainSignals(cmdIntegration.analysis, emptyParsed),
        replyText: cmdResult.reply,
        integration: cmdIntegration,
      }
    }
  } catch (cmdErr) {
    console.error('[telegram] command dispatcher error:', cmdErr?.message || cmdErr)
    // Fall through to nursing note pipeline on dispatcher error
  }
  // ── end command workflow dispatcher ──────────────────────────────────────

  // ── /handover command intercept ──────────────────────────────────────────
  if (isTelegramHandoverCommand(String(text))) {
    console.log('[telegram] /handover command detected — generating shift handover report')
    let handoverReply
    try {
      handoverReply = await handleHandoverCommand(String(text))
    } catch (err) {
      console.error('[telegram] /handover generation failed:', err)
      handoverReply = 'Could not generate handover report. Please try again in a moment.'
    }
    const handoverIntegration = buildTelegramProcessingErrorIntegration(
      parseTelegramNurseMessage(String(text)),
    )
    return {
      extracted,
      rawUpdate,
      nursingRecord: {
        room: null,
        patient: null,
        patientId: null,
        note: String(text),
        category: 'Shift Handover',
        loopKey: 'shift_handover',
        riskKeywords: [],
        nurseName: nurseDisplayName,
        symptoms: '',
        dashboardCategories: ['Shift Handover'],
        dashboardCategoryDisplay: 'Shift Handover',
        riskLevel: 'N/A',
        workflowRiskLabel: 'N/A',
        recommendedAction: '',
        nursingRiskScore: null,
        nursingRiskLevel: null,
        nursingRiskDetected: [],
      },
      brainSignals: buildBrainSignals(handoverIntegration.analysis, { riskKeywords: [], suggestedLoopCategory: 'shift_handover' }),
      replyText: handoverReply,
      integration: handoverIntegration,
    }
  }
  // ── end /handover intercept ───────────────────────────────────────────────

  // ── /timeline command intercept ──────────────────────────────────────────
  if (isTelegramTimelineCommand(String(text))) {
    console.log('[telegram] /timeline command detected — generating patient timeline report')
    let timelineReply
    try {
      timelineReply = await handleTimelineCommand(String(text))
    } catch (err) {
      console.error('[telegram] /timeline generation failed:', err)
      timelineReply = 'Could not generate timeline report. Please try again in a moment.'
    }
    const timelineIntegration = buildTelegramProcessingErrorIntegration(
      parseTelegramNurseMessage(String(text)),
    )
    return {
      extracted,
      rawUpdate,
      nursingRecord: {
        room: null,
        patient: null,
        patientId: null,
        note: String(text),
        category: 'Patient Timeline',
        loopKey: 'patient_timeline',
        riskKeywords: [],
        nurseName: nurseDisplayName,
        symptoms: '',
        dashboardCategories: ['Patient Timeline'],
        dashboardCategoryDisplay: 'Patient Timeline',
        riskLevel: 'N/A',
        workflowRiskLabel: 'N/A',
        recommendedAction: '',
        nursingRiskScore: null,
        nursingRiskLevel: null,
        nursingRiskDetected: [],
      },
      brainSignals: buildBrainSignals(timelineIntegration.analysis, { riskKeywords: [], suggestedLoopCategory: 'patient_timeline' }),
      replyText: timelineReply,
      integration: timelineIntegration,
    }
  }
  // ── end /timeline intercept ───────────────────────────────────────────────

  let parsed
  try {
    parsed = parseTelegramNurseMessage(extracted.text)
  } catch (parseErr) {
    console.error('[telegram] parseTelegramNurseMessage failed:', parseErr)
    const fallbackText = extracted.text
    parsed = {
      originalText: fallbackText,
      patientRoom: null,
      patientNameGuess: null,
      nursingNoteText: fallbackText,
      riskKeywords: [],
      suggestedLoopCategory: 'fall_risk',
      loopScores: {},
      loopCategoryLabel: 'Fall risk',
    }
  }

  console.log('[telegram] room detected:', parsed.patientRoom ?? '(none)')

  try {
    const rosterCtx = await loadTelegramSheetRoster(parsed)
    const res = rosterCtx.resolution
    if (res?.patient) {
      const nm = resolveAcknowledgedPatientName(parsed, res.patient)
      console.log('[telegram] patient resolved:', nm)
    } else if (res?.error === 'roster_unavailable') {
      console.log('[telegram] patient resolved: (roster unavailable)')
    } else {
      console.log(
        '[telegram] patient resolved: (not matched)',
        res?.error || rosterCtx.rosterLoadError || 'no patient',
      )
    }

    const integration = processTelegramNurseMessageForIntegration(parsed, {
      patients: rosterCtx.patients,
      nursingNotes: rosterCtx.nursingNotes,
      resolution: rosterCtx.resolution,
    })
    const { patientId, patientNameResolved, analysis, recommendedAction, riskScoringResult } = integration

    const dashCat = classifyDashboardCategories(parsed, integration)
    const dashRisk = dashboardRiskLevel(integration)

    const symptomsSummary =
      parsed.riskKeywords?.length > 0
        ? parsed.riskKeywords.join('; ')
        : String(parsed.nursingNoteText || '')
            .trim()
            .slice(0, 280)

    const nursingRecord = {
      room: integration.resolvedRoom ?? parsed.patientRoom ?? null,
      patient: patientNameResolved ?? null,
      patientId,
      note: parsed.nursingNoteText,
      category: parsed.loopCategoryLabel,
      loopKey: parsed.suggestedLoopCategory,
      riskKeywords: parsed.riskKeywords,
      nurseName: nurseDisplayName,
      symptoms: symptomsSummary,
      dashboardCategories: dashCat.labels,
      dashboardCategoryDisplay: dashCat.display,
      riskLevel: dashRisk.level,
      workflowRiskLabel:
        analysis.overallScore != null && Number.isFinite(Number(analysis.overallScore))
          ? mapOverallScoreToWorkflowRiskLabel(analysis.overallScore)
          : 'N/A',
      recommendedAction,
      nursingRiskScore: riskScoringResult?.score ?? null,
      nursingRiskLevel: riskScoringResult?.level ?? null,
      nursingRiskDetected: riskScoringResult?.detectedFactors?.map((f) => f.label) ?? [],
    }

    const brainSignals = buildBrainSignals(analysis, parsed, { production: isProductionNursingMode() })
    const replyText = buildTelegramWorkflowReply(integration)

    return {
      extracted,
      rawUpdate,
      nursingRecord,
      brainSignals,
      replyText,
      integration,
    }
  } catch (err) {
    console.error('[telegram] inbound handling failed:', err)
    const integration = buildTelegramProcessingErrorIntegration(parsed)
    const dashCat = classifyDashboardCategories(parsed, integration)
    const dashRisk = dashboardRiskLevel(integration)
    const nursingRecord = {
      room: parsed.patientRoom ?? null,
      patient: null,
      patientId: null,
      note: parsed.nursingNoteText,
      category: parsed.loopCategoryLabel,
      loopKey: parsed.suggestedLoopCategory,
      riskKeywords: parsed.riskKeywords || [],
      nurseName: nurseDisplayName,
      symptoms: String(parsed.nursingNoteText || '')
        .trim()
        .slice(0, 280),
      dashboardCategories: dashCat.labels,
      dashboardCategoryDisplay: dashCat.display,
      riskLevel: dashRisk.level,
      workflowRiskLabel: 'N/A',
      recommendedAction: '',
    }
    const brainSignals = buildBrainSignals(integration.analysis, parsed, { production: isProductionNursingMode() })
    const replyText = buildTelegramWorkflowReply(integration)
    return {
      extracted,
      rawUpdate,
      nursingRecord,
      brainSignals,
      replyText,
      integration,
    }
  }
}
