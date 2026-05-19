/**
 * Simulation-only family update drafts from chart signals + loops — not real PHI transport.
 */

import { aggregateNotesText, analyzePatientNotes } from './aiRiskDetection.js'
import { mergeHydrationLoopRows } from '../db/hydrationLoopStorage.js'
import { mergeNutritionLoopRows } from '../db/nutritionLoopStorage.js'
import { mergeSleepMonitoringInstances } from '../db/sleepMonitoringLoopStorage.js'
import { mergeRehabilitationLoopRows } from '../db/rehabLoopStorage.js'
import { mergeMentalHealthLoopRows } from '../db/mentalHealthLoopStorage.js'
import { mergeMedicationLoopDoses } from '../db/medicationLoopStorage.js'
import { getPatientVitals } from '../db/vitalStorage.js'
import { getDoctorReviewRecordsSnapshot } from '../db/doctorReviewLoopStorage.js'
import { getAiRiskPredictionInstancesObject } from '../db/aiRiskPredictionLoopStorage.js'
import { aiAlerts } from '../data/dummyData.js'

export const FAMILY_UPDATE_TYPES = /** @type {const} */ ([
  'daily',
  'weekly',
  'urgent',
  'rehab_progress',
  'doctor_review',
])

/** @typedef {'professional'|'warm'|'short'|'detailed'} FamilyTone */
/** @typedef {'en'|'zh'|'ms'} FamilyLang */

function hashStr(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function parseFamilyContact(patient, pid, idx) {
  const raw = String(patient?.familyContact || '').trim()
  const h = hashStr(`${pid}|fc`)
  if (!raw) {
    return {
      familyContactName: ['Sarah Lim', 'James Wong', 'Priya Nair', 'Ahmad Razak'][idx % 4],
      whatsAppNumber: `+601${(h % 9) + 1}${String(h).padStart(8, '0').slice(0, 8)}`,
    }
  }
  const parts = raw.split(/[—\-–|]/).map((x) => x.trim()).filter(Boolean)
  const familyContactName = parts[0] || 'Family contact'
  let whatsAppNumber = parts.slice(1).join(' ') || ''
  if (!/\d{3,}/.test(whatsAppNumber)) {
    whatsAppNumber = `+601${(h % 9) + 1}${String(h).padStart(8, '0').slice(0, 8)}`
  } else {
    whatsAppNumber = whatsAppNumber.replace(/[^\d+]/g, '')
    if (!whatsAppNumber.startsWith('+')) whatsAppNumber = `+${whatsAppNumber}`
  }
  return { familyContactName, whatsAppNumber }
}

function doctorSnippetForPatient(patientId, doctorRecords) {
  const rec = doctorRecords.find((r) => r.patientId === patientId)
  if (!rec) return 'No open doctor-review queue item tied to this resident on the simulation snapshot.'
  return `${rec.triggerReason} (${rec.severityLevel}) · MD ${rec.doctorAssigned} · status ${String(rec.reviewStatus).replace(/_/g, ' ')}`
}

function riskSnippetForPatient(patientId, riskMap) {
  const r = riskMap[patientId]
  if (!r) return 'AI risk loop: no prediction row yet — generate AI risk snapshot if needed.'
  return `${r.predictedRisk} · score ${r.riskScore} · trend ${r.trend}`
}

function aiAlertsForPatient(patientId) {
  const hits = aiAlerts.filter((a) => a.patientId === patientId)
  if (!hits.length) return 'No curated AI alerts matched this roster id in demo data.'
  return hits
    .slice(0, 2)
    .map((a) => `${a.title} (${a.severity})`)
    .join(' · ')
}

/**
 * @param {object} ctx
 * @param {FamilyTone} tone
 * @param {FamilyLang} lang
 */
export function buildFamilyMessageDraft(ctx, tone = 'professional', lang = 'en') {
  const name = ctx.patientName
  const room = ctx.roomNumber
  const lines = [
    ctx.noteLine,
    ctx.vitalsLine,
    ctx.medLine,
    ctx.mealLine,
    ctx.fluidLine,
    ctx.sleepLine,
    ctx.rehabLine,
    ctx.moodLine,
    ctx.doctorLine,
    ctx.riskLine,
    ctx.alertLine,
  ].filter(Boolean)

  const bodyEn =
    tone === 'short'
      ? `Hi — quick update on ${name} (Rm ${room}): ${lines.slice(0, 4).join(' ')} Care team is monitoring; reply any time.`
      : tone === 'warm'
        ? `Hello — thank you for trusting us with ${name} (Rm ${room}). Today: ${lines.join(' ')} We're here if you have questions.`
        : tone === 'detailed'
          ? `Clinical summary (simulation) — ${name}, room ${room}. Observations: ${lines.join(' ')} This message is auto-drafted; please verify before sending.`
          : `Update — ${name} (Rm ${room}): ${lines.join(' ')} Nursing & therapy teams continuing routine monitoring per plan.`

  if (lang === 'zh') {
    const core = `${name}（房间 ${room}）：${lines.slice(0, 5).join('；')}`
    if (tone === 'short') return `您好 — ${core} 医护团队持续关注中，欢迎回复。`
    if (tone === 'warm') return `您好，感谢您信任我们的照护团队。${core} 如有疑问随时联系。`
    if (tone === 'detailed') return `临床摘要（模拟）：${core} 发送前请人工核对。`
    return `家属告知（模拟）：${core} 护理与治疗团队按方案持续观察。`
  }
  if (lang === 'ms') {
    const core = `${name} (Bilik ${room}): ${lines.slice(0, 5).join('; ')}`
    if (tone === 'short') return `Helo — ringkas: ${core} Pasukan kejururawatan memantau; hubungi kami jika ada soalan.`
    if (tone === 'warm') return `Salam — terima kasih atas kepercayaan anda. ${core} Kami sedia membantu.`
    if (tone === 'detailed') return `Ringkasan klinikal (simulasi): ${core} Sila semak sebelum dihantar.`
    return `Kemaskini (sim): ${core} Pemantauan berterusan oleh pasukan penjagaan.`
  }
  return bodyEn
}

export function communicationBandForRow(row, nowMs) {
  const riskHigh =
    typeof row.riskScoreSnap === 'number' ? row.riskScoreSnap >= 72 : row.updateType === 'urgent'
  if (row.updateType === 'urgent' || riskHigh) return 'urgent'
  const lastSent = row.lastSentAt ? new Date(row.lastSentAt).getTime() : 0
  const daysSinceSent = lastSent ? (nowMs - lastSent) / 86400000 : 999
  if (!row.sentStatus && daysSinceSent > 2.2 && row.updateType === 'daily') return 'overdue'
  if (row.needsSupervisorApproval && row.nurseApprovedBy && !row.supervisorApprovedBy)
    return 'supervisorReviewNeeded'
  if (
    !row.nurseApprovedBy ||
    (row.needsSupervisorApproval && !row.supervisorApprovedBy && row.approvalStatus !== 'sent')
  )
    return 'pending'
  if (row.sentStatus || row.approvalStatus === 'sent') return 'upToDate'
  return 'pending'
}

export function familyUpdateBoardBucket(row, nowMs = Date.now()) {
  if (row.sentStatus || row.approvalStatus === 'sent') return 'sent_simulation'

  const urgentLane =
    row.updateType === 'urgent' ||
    row.urgentFamilyFlag ||
    (typeof row.riskScoreSnap === 'number' && row.riskScoreSnap >= 78) ||
    (row.doctorSeveritySnap === 'critical' && !row.familyDraftSyncedDoctor)

  if (urgentLane) return 'urgent_family_alerts'

  const fullyApproved =
    row.nurseApprovedBy && (!row.needsSupervisorApproval || row.supervisorApprovedBy)

  if (fullyApproved && !row.sentStatus) return 'ready_to_send'

  if (row.nurseApprovedBy && row.needsSupervisorApproval && !row.supervisorApprovedBy) {
    return 'pending_approval'
  }

  return 'draft_updates'
}

function inferUpdateType(ctx, h) {
  if (ctx.doctorSeverity === 'critical' || ctx.doctorSeverity === 'high') return 'doctor_review'
  if (ctx.rehabTrend === 'declining' || ctx.rehabTrend === 'improving') return 'rehab_progress'
  if (h % 17 === 0) return 'urgent'
  if (h % 11 === 0) return 'weekly'
  return 'daily'
}

function tallyBands(rows, nowMs) {
  const t = {
    upToDate: 0,
    pending: 0,
    overdue: 0,
    urgent: 0,
    supervisorReviewNeeded: 0,
  }
  for (const row of rows) {
    const b = row.communicationBand || communicationBandForRow(row, nowMs)
    if (t[b] !== undefined) t[b] += 1
  }
  return t
}

export function listFamilyUpdateRows(instanceMap, nowMs = Date.now()) {
  const rows = Object.values(instanceMap || {}).map((r) => {
    const communicationBand = communicationBandForRow(r, nowMs)
    const boardBucket = familyUpdateBoardBucket({ ...r, communicationBand }, nowMs)
    const approvalStatus =
      r.sentStatus || r.approvalStatus === 'sent'
        ? 'sent'
        : r.nurseApprovedBy && (!r.needsSupervisorApproval || r.supervisorApprovedBy)
          ? 'approved'
          : r.nurseApprovedBy && r.needsSupervisorApproval && !r.supervisorApprovedBy
            ? 'pending_approval'
            : 'draft'
    return { ...r, communicationBand, boardBucket, approvalStatus }
  })
  rows.sort((a, b) => {
    if (Boolean(b.urgentFamilyFlag) !== Boolean(a.urgentFamilyFlag))
      return Number(b.urgentFamilyFlag) - Number(a.urgentFamilyFlag)
    return a.patientName.localeCompare(b.patientName)
  })
  return rows
}

export function scoreTotalsWithRows(instanceMap, nowMs = Date.now()) {
  const rows = listFamilyUpdateRows(instanceMap, nowMs)
  const tallies = tallyBands(rows, nowMs)
  return { rows, tallies }
}

/**
 * @returns {Record<string, object>}
 */
export function computeFamilyUpdateSnapshots(patients, notes, prevInstances, nowMs = Date.now()) {
  const roster = patients?.length
    ? patients
    : [
        {
          id: 'demo',
          fullName: 'Demo Resident',
          assignedNurse: 'Demo Nurse',
          room: '100A',
          familyContact: 'Jamie Chen — +60123456789',
        },
      ]

  const doctorRecords = getDoctorReviewRecordsSnapshot()
  const riskMap = getAiRiskPredictionInstancesObject()

  const hyd = mergeHydrationLoopRows(roster)
  const nut = mergeNutritionLoopRows(roster, nowMs)
  const sleep = mergeSleepMonitoringInstances(roster)
  const rehab = mergeRehabilitationLoopRows(roster, nowMs)
  const mental = mergeMentalHealthLoopRows(roster, nowMs)
  const med = mergeMedicationLoopDoses(roster)

  const ix = (rows, pid) => rows.find((r) => r.patientId === pid) || {}

  const out = {}

  for (let idx = 0; idx < roster.length; idx++) {
    const p = roster[idx]
    const pid = p.id
    const h = hashStr(`${pid}|ful`)
    const prev = prevInstances[pid] || {}

    const notesSorted = (notes || [])
      .filter((n) => n.patientId === pid)
      .sort((a, b) => {
        const da = a.date || ''
        const db = b.date || ''
        if (da !== db) return db.localeCompare(da)
        return (b.createdAt || '').localeCompare(a.createdAt || '')
      })

    const analysis = analyzePatientNotes(notesSorted, p)
    const noteText = aggregateNotesText(notesSorted.slice(0, 10))
    const noteLine = noteText
      ? `Notes highlight: ${noteText.slice(0, 160)}${noteText.length > 160 ? '…' : ''}`
      : 'No recent nursing notes on file for this simulation pass.'

    const vitals = getPatientVitals(pid, 2)[0]
    const vitalsLine = vitals
      ? `Vitals snapshot: risk band ${vitals.overallRiskLevel || 'n/a'} recorded ${new Date(vitals.recordedAt || nowMs).toLocaleDateString()}.`
      : 'Vitals: no recent nurse-entered vitals in simulation storage.'

    const medRow = ix(med, pid)
    const medLine = `Medications: ${medRow.medicationName || 'scheduled meds'} — status ${medRow.adminStatus || 'per chart'}${medRow.simAbnormalPostDose ? '; flagged post-dose check (sim)' : ''}.`

    const nutRow = ix(nut, pid)
    const mealLine = `Meals: ~${nutRow.foodIntakePercent ?? '—'}% meal intake; appetite ${nutRow.appetiteLevel ?? 'documented'}.`

    const hydRow = ix(hyd, pid)
    const fluidLine = `Fluids: ${hydRow.intakeSoFarMl ?? '—'} ml vs target ${hydRow.fluidTargetMl ?? '—'} (${hydRow.dehydrationRiskLevel ?? 'risk'} hydration flag).`

    const sleepRow = ix(sleep, pid)
    const sleepLine = `Sleep: ~${sleepRow.totalSleepHours ?? '—'} h rest; ${sleepRow.nightWakingEpisodes ?? 0} wakings (sim).`

    const rehabRow = ix(rehab, pid)
    const rehabTrend = rehabRow.progressTrend || 'stable'
    const rehabLine = `Rehab: ${rehabRow.rehabType || 'therapy'} trend ${rehabTrend}; ADL index ~${rehabRow.adlIndependence ?? '—'}.`

    const mentalRow = ix(mental, pid)
    const moodLine = `Mood/mental health check: mood ${mentalRow.moodStatus ?? '—'}; anxiety ${mentalRow.anxietyLevel ?? '—'}; confusion ${mentalRow.confusionLevel ?? 'none'}.`

    const drv = doctorRecords.find((r) => r.patientId === pid)
    const doctorSeverity = drv?.severityLevel || 'low'
    const doctorLine = `Doctor review: ${doctorSnippetForPatient(pid, doctorRecords)}`

    const riskLine = `AI risk prediction: ${riskSnippetForPatient(pid, riskMap)}`
    const alertLine = `AI alerts feed: ${aiAlertsForPatient(pid)}`

    const riskSnap = riskMap[pid]?.riskScore ?? null

    const ctx = {
      patientName: p.fullName || analysis.patientName || 'Resident',
      roomNumber: p.room || hydRow.room || nutRow.room || rehabRow.room || sleepRow.roomNumber || `Rm ${idx + 101}`,
      noteLine,
      vitalsLine,
      medLine,
      mealLine,
      fluidLine,
      sleepLine,
      rehabLine,
      moodLine,
      doctorLine,
      riskLine,
      alertLine,
      rehabTrend,
      doctorSeverity,
    }

    const { familyContactName, whatsAppNumber } = parseFamilyContact(p, pid, idx)

    const updateType =
      prev.updateType && prev.updateTypeLocked ? prev.updateType : inferUpdateType(ctx, h)

    const latestConditionSummary = [
      noteLine,
      vitalsLine,
      mealLine,
      fluidLine,
      sleepLine,
      rehabLine,
      moodLine.substring(0, 120),
    ].join(' ')

    const needsSupervisorApproval =
      updateType === 'urgent' ||
      updateType === 'doctor_review' ||
      (typeof riskSnap === 'number' && riskSnap >= 68) ||
      doctorSeverity === 'critical'

    const urgentFamilyFlag =
      updateType === 'urgent' || doctorSeverity === 'critical' || (typeof riskSnap === 'number' && riskSnap >= 80)

    let familyMessageDraft = prev.familyMessageDraft
    const regen = !familyMessageDraft || prev.forceRegenerateOnNextMerge
    if (regen) {
      const tone = prev.tonePreference || 'professional'
      const lang = prev.languagePreference || 'en'
      familyMessageDraft = buildFamilyMessageDraft(ctx, tone, lang)
    }

    const merged = {
      patientId: pid,
      patientName: ctx.patientName,
      roomNumber: ctx.roomNumber,
      familyContactName,
      whatsAppNumber,
      updateType,
      latestConditionSummary,
      familyMessageDraft,
      approvalStatus: prev.approvalStatus || 'draft',
      sentStatus: Boolean(prev.sentStatus),
      nurseApprovedBy: prev.nurseApprovedBy ?? null,
      supervisorApprovedBy: prev.supervisorApprovedBy ?? null,
      needsSupervisorApproval,
      urgentFamilyFlag,
      familyDraftSyncedDoctor: Boolean(prev.familyDraftSyncedDoctor),
      lastSentAt: prev.lastSentAt ?? null,
      whatsAppSimulatedAt: prev.whatsAppSimulatedAt ?? null,
      tonePreference: prev.tonePreference || 'professional',
      languagePreference: prev.languagePreference || 'en',
      doctorSeveritySnap: doctorSeverity,
      riskScoreSnap: riskSnap,
      riskPredictedSnap: riskMap[pid]?.predictedRisk ?? null,
      doctorReviewPendingSnap: Boolean(drv && drv.reviewStatus !== 'resolved' && drv.reviewStatus !== 'reviewed'),
      updateTypeLocked: Boolean(prev.updateTypeLocked),
      forceRegenerateOnNextMerge: false,
      generatedAt: prev.generatedAt || new Date(nowMs).toISOString(),
    }

    merged.communicationBand = communicationBandForRow(merged, nowMs)
    merged.boardBucket = familyUpdateBoardBucket(merged, nowMs)

    out[pid] = merged
  }

  return out
}

export function buildFamilyUpdateAiAlerts(rows, nowMs = Date.now()) {
  const alerts = []
  for (const row of rows) {
    const pid = row.patientId
    if (row.communicationBand === 'overdue') {
      alerts.push({
        id: `${pid}-overdue`,
        category: 'Family update overdue',
        title: `Routine family update overdue — ${row.patientName}`,
        detail: `Rm ${row.roomNumber} · last simulated send ${row.lastSentAt ? new Date(row.lastSentAt).toLocaleString() : 'never'}`,
        severity: 'moderate',
      })
    }
    if (row.updateType === 'urgent' || row.urgentFamilyFlag) {
      alerts.push({
        id: `${pid}-urgent`,
        category: 'Urgent update needed',
        title: `Urgent family channel — ${row.patientName}`,
        detail: `Risk/doctor flags suggest proactive family reassurance.`,
        severity: 'high',
      })
    }
    if (row.doctorReviewPendingSnap && row.updateType !== 'doctor_review') {
      alerts.push({
        id: `${pid}-drv`,
        category: 'Doctor review update needed',
        title: `Align family message with MD queue — ${row.patientName}`,
        detail: 'Open doctor-review item still pending closure in simulation.',
        severity: 'moderate',
      })
    }
    if (row.updateType === 'rehab_progress') {
      alerts.push({
        id: `${pid}-rehab`,
        category: 'Rehab progress update available',
        title: `Therapy milestone worth sharing — ${row.patientName}`,
        detail: 'Rehab trend suggests a proactive progress note for loved ones.',
        severity: 'low',
      })
    }
    if (typeof row.riskScoreSnap === 'number' && row.riskScoreSnap >= 70) {
      alerts.push({
        id: `${pid}-risk`,
        category: 'Risk escalation update needed',
        title: `AI risk elevation — ${row.patientName}`,
        detail: `${row.riskPredictedSnap || 'Risk'} score ${row.riskScoreSnap}`,
        severity: row.riskScoreSnap >= 85 ? 'critical' : 'high',
      })
    }
  }
  const seen = new Set()
  return alerts.filter((a) => {
    if (seen.has(a.id)) return false
    seen.add(a.id)
    return true
  })
}

export function familyUpdateMasterAiSummary(rows, nowMs = Date.now()) {
  const today = new Date(nowMs).toDateString()
  const urgent = rows.filter((r) => r.urgentFamilyFlag || r.updateType === 'urgent')
  const overdue = rows.filter((r) => r.communicationBand === 'overdue')
  return [
    `Today's family communication snapshot (${today}): ${rows.length} roster-linked drafts in the simulation loop.`,
    `Urgent attention shortlist (${urgent.length}): ${urgent.map((r) => r.patientName).join(', ') || 'none flagged.'}`,
    `Overdue cadence (${overdue.length}): ${overdue.map((r) => `${r.patientName} (Rm ${r.roomNumber})`).join('; ') || 'all within demo window.'}`,
    `Suggested WhatsApp posture: lead with reassurance, cite intake/sleep/rehab specifics, and invite questions — always scrub identifiers before real send.`,
    `Family reassurance snippet: "Your loved one is stable under nursing supervision; we will update you if anything changes materially."`,
    `Supervisor checklist: verify tone · verify PHI scrub · confirm MD-sensitive lines when doctor_review type fires · log simulated send timestamp.`,
  ].join(' ')
}

export function familyUpdateAiSummaryBlocks(rows) {
  const urgent = rows.filter((r) => r.urgentFamilyFlag || r.updateType === 'urgent')
  const overdue = rows.filter((r) => r.communicationBand === 'overdue')
  return {
    todaysUpdates: rows
      .filter((r) => r.familyMessageDraft)
      .map((r) => `${r.patientName}: ${r.updateType}`)
      .join('\n'),
    urgentList: urgent.map((r) => `${r.patientName} (Rm ${r.roomNumber}) · ${r.updateType}`).join('\n') || 'None.',
    suggestedWhatsApp: rows
      .slice(0, 4)
      .map((r) => `• ${r.patientName}: ${String(r.familyMessageDraft || '').slice(0, 120)}…`)
      .join('\n'),
    reassuranceDraft:
      'We want you to know our team is watching closely, meals and fluids are being encouraged, and therapy will adjust pacing for comfort. Happy to arrange a call.',
    supervisorChecklist:
      '□ Tone matches policy\n□ HIPAA-style scrub complete\n□ Doctor-review conflicts resolved\n□ WhatsApp number verified (sim)\n□ Simulation send logged',
  }
}

export function exportWeeklyFamilyReport(rows, generatedIso) {
  const header = `Weekly family communication bundle (SIMULATION) · ${generatedIso}\n${'='.repeat(60)}\n`
  const blocks = rows.map((r) => {
    return [
      `${r.patientName} · Rm ${r.roomNumber} · Contact ${r.familyContactName} · WA ${r.whatsAppNumber}`,
      `Type: ${r.updateType} · Band: ${r.communicationBand}`,
      `Summary: ${r.latestConditionSummary}`,
      `Draft:\n${r.familyMessageDraft || '—'}`,
      '',
    ].join('\n')
  })
  return header + blocks.join('\n')
}

export function regenerateDraftForPatient(prevRow, tone, language, patients, notes, nowMs = Date.now()) {
  const roster = patients?.length ? patients : [{ id: 'demo', fullName: 'Demo', room: '100A' }]
  const p = roster.find((x) => x.id === prevRow.patientId) || roster[0]
  const pid = p.id
  const idx = roster.findIndex((x) => x.id === pid)

  const doctorRecords = getDoctorReviewRecordsSnapshot()
  const riskMap = getAiRiskPredictionInstancesObject()
  const hyd = mergeHydrationLoopRows(roster)
  const nut = mergeNutritionLoopRows(roster, nowMs)
  const sleep = mergeSleepMonitoringInstances(roster)
  const rehab = mergeRehabilitationLoopRows(roster, nowMs)
  const mental = mergeMentalHealthLoopRows(roster, nowMs)
  const med = mergeMedicationLoopDoses(roster)

  const ix = (rows, id) => rows.find((r) => r.patientId === id) || {}
  const notesSorted = (notes || [])
    .filter((n) => n.patientId === pid)
    .sort((a, b) => {
      const da = a.date || ''
      const db = b.date || ''
      if (da !== db) return db.localeCompare(da)
      return (b.createdAt || '').localeCompare(a.createdAt || '')
    })

  const analysis = analyzePatientNotes(notesSorted, p)
  const noteText = aggregateNotesText(notesSorted.slice(0, 10))
  const noteLine = noteText
    ? `Notes highlight: ${noteText.slice(0, 160)}${noteText.length > 160 ? '…' : ''}`
    : 'No recent nursing notes on file for this simulation pass.'
  const vitals = getPatientVitals(pid, 2)[0]
  const vitalsLine = vitals
    ? `Vitals snapshot: risk band ${vitals.overallRiskLevel || 'n/a'}.`
    : 'Vitals: none recent in simulation.'
  const medRow = ix(med, pid)
  const medLine = `Medications: ${medRow.medicationName || 'scheduled meds'} — ${medRow.adminStatus || 'per chart'}.`
  const nutRow = ix(nut, pid)
  const mealLine = `Meals: ~${nutRow.foodIntakePercent ?? '—'}% intake; appetite ${nutRow.appetiteLevel ?? 'ok'}.`
  const hydRow = ix(hyd, pid)
  const fluidLine = `Fluids: ${hydRow.intakeSoFarMl ?? '—'} ml / ${hydRow.fluidTargetMl ?? '—'} target.`
  const sleepRow = ix(sleep, pid)
  const sleepLine = `Sleep: ~${sleepRow.totalSleepHours ?? '—'} h; wakings ${sleepRow.nightWakingEpisodes ?? 0}.`
  const rehabRow = ix(rehab, pid)
  const rehabTrend = rehabRow.progressTrend || 'stable'
  const rehabLine = `Rehab trend ${rehabTrend}; ADL ~${rehabRow.adlIndependence ?? '—'}.`
  const mentalRow = ix(mental, pid)
  const moodLine = `Mood ${mentalRow.moodStatus ?? '—'}; anxiety ${mentalRow.anxietyLevel ?? '—'}.`
  const drv = doctorRecords.find((r) => r.patientId === pid)
  const doctorSeverity = drv?.severityLevel || 'low'

  const ctx = {
    patientName: p.fullName || analysis.patientName || 'Resident',
    roomNumber: p.room || hydRow.room || nutRow.room || rehabRow.room || sleepRow.roomNumber || `Rm ${idx + 101}`,
    noteLine,
    vitalsLine,
    medLine,
    mealLine,
    fluidLine,
    sleepLine,
    rehabLine,
    moodLine,
    doctorLine: `Doctor review: ${doctorSnippetForPatient(pid, doctorRecords)}`,
    riskLine: `AI risk prediction: ${riskSnippetForPatient(pid, riskMap)}`,
    alertLine: `AI alerts feed: ${aiAlertsForPatient(pid)}`,
    rehabTrend,
    doctorSeverity,
  }

  const draft = buildFamilyMessageDraft(ctx, tone, language)
  const latestConditionSummary = [
    noteLine,
    vitalsLine,
    mealLine,
    fluidLine,
    sleepLine,
    rehabLine,
    moodLine,
  ].join(' ')

  return {
    familyMessageDraft: draft,
    latestConditionSummary,
    tonePreference: tone,
    languagePreference: language,
    generatedAt: new Date(nowMs).toISOString(),
  }
}
