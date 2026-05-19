import { MED_LOOP_ROOM_MAP } from '../data/medicationLoopSeed.js'
import { aggregateNotesText, analyzeAllPatientsFromNotes } from './aiRiskDetection.js'

/** @typedef {'pending_review'|'urgent_cases'|'reviewed_today'|'follow_up_needed'|'resolved_cases'} DoctorReviewBoardBucket */

function roomForPatient(id, idx = 1) {
  return MED_LOOP_ROOM_MAP[id] || `TBD-${String(idx).padStart(3, '0')}`
}

function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return `drv_${crypto.randomUUID()}`
  return `drv_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function sameLocalDay(iso, nowMs) {
  if (!iso) return false
  try {
    const a = new Date(iso)
    const b = new Date(nowMs)
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    )
  } catch {
    return false
  }
}

export function doctorReviewBucket(rec, nowMs = Date.now()) {
  const st = String(rec.reviewStatus || '')
  if (st === 'resolved') return 'resolved_cases'
  if (st === 'follow_up') return 'follow_up_needed'
  if (st === 'reviewed' && sameLocalDay(rec.reviewedAt, nowMs)) return 'reviewed_today'
  if (st === 'reviewed' && !sameLocalDay(rec.reviewedAt, nowMs)) return 'resolved_cases'
  if (st === 'urgent' || rec.escalatedUrgent || rec.severityLevel === 'critical') return 'urgent_cases'
  return 'pending_review'
}

export function severityDisplay(sev) {
  const s = String(sev || '').toLowerCase()
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '—'
}

export function deriveDoctorReviewBand(rec) {
  const s = String(rec.severityLevel || '').toLowerCase()
  if (s === 'critical' || rec.escalatedUrgent) {
    return { label: 'Critical review', variant: 'danger', field: 'criticalReview' }
  }
  if (s === 'high') {
    return { label: 'High risk', variant: 'danger', field: 'highRisk' }
  }
  if (s === 'moderate') {
    return { label: 'Moderate concern', variant: 'warning', field: 'moderateConcern' }
  }
  if (s === 'low') {
    return { label: 'Monitor', variant: 'info', field: 'monitor' }
  }
  return { label: 'Stable', variant: 'success', field: 'stable' }
}

export function listDoctorReviewRows(records, nowMs = Date.now()) {
  return records.map((r) => ({
    ...r,
    bucket: doctorReviewBucket(r, nowMs),
    riskBand: deriveDoctorReviewBand(r),
  }))
}

export function formatFlagged(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function notesByPatient(notes) {
  const by = {}
  for (const n of notes || []) {
    if (!n.patientId) continue
    if (!by[n.patientId]) by[n.patientId] = []
    by[n.patientId].push(n)
  }
  for (const id of Object.keys(by)) {
    by[id].sort((a, b) => {
      const da = a.date || ''
      const db = b.date || ''
      if (da !== db) return db.localeCompare(da)
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
    })
  }
  return by
}

function noteSnippet(list, patient, trigger) {
  const recent = list?.slice(0, 3) || []
  if (!recent.length) {
    return `Auto-queue (sim): ${trigger} — insufficient narrative snapshot; verify bedside record.`
  }
  const n = recent[0]
  const chunk = [n.nurseRemarks, n.abnormalEvents, n.appetite, n.mood].filter(Boolean).join(' · ')
  return chunk.slice(0, 220) || aggregateNotesText(recent).slice(0, 220)
}

function hasActiveQueue(rows, patientId, triggerReason) {
  return rows.some(
    (r) =>
      r.patientId === patientId &&
      r.triggerReason === triggerReason &&
      ['pending', 'urgent', 'follow_up'].includes(r.reviewStatus),
  )
}

function pushQueue(out, patch) {
  if (hasActiveQueue(out, patch.patientId, patch.triggerReason)) return
  out.unshift({
    id: newId(),
    doctorNotes: [],
    followUpActions: [],
    familyNotified: false,
    reviewedAt: null,
    unresolvedRepeats: 0,
    timeFlagged: new Date().toISOString(),
    doctorAssigned: 'Dr. Rivera (sim)',
    ...patch,
  })
}

/**
 * Append auto-detected review rows (simulation) — does not remove manual rows.
 */
export function syncDoctorReviewAutoQueue(patients, notes, records) {
  const out = [...records]
  const getPatientById = (id) => patients.find((p) => p.id === id) || null
  const byNotes = notesByPatient(notes)
  const analysisList = analyzeAllPatientsFromNotes(patients || [], notes || [], getPatientById)

  for (const a of analysisList) {
    if (a.insufficientData || !a.patientId) continue
    const patient = getPatientById(a.patientId)
    const pid = a.patientId
    const list = byNotes[pid] || []
    const t3 = aggregateNotesText(list.slice(0, 3))
    const t12 = aggregateNotesText(list.slice(0, 8))

    if (a.anyEscalation) {
      pushQueue(out, {
        patientId: pid,
        patientName: a.patientName || patient?.fullName,
        roomNumber: roomForPatient(pid),
        triggerReason: 'Emergency escalation',
        severityLevel: 'critical',
        latestNursingNote: noteSnippet(list, patient, 'Emergency escalation'),
        assignedNurse: patient?.assignedNurse || 'Charge RN',
        reviewStatus: 'urgent',
        escalatedUrgent: true,
      })
    } else if (a.overallScore >= 75) {
      pushQueue(out, {
        patientId: pid,
        patientName: a.patientName || patient?.fullName,
        roomNumber: roomForPatient(pid),
        triggerReason: 'High AI risk score',
        severityLevel: 'critical',
        latestNursingNote: noteSnippet(list, patient, 'High AI risk score'),
        assignedNurse: patient?.assignedNurse || 'Charge RN',
        reviewStatus: 'urgent',
        escalatedUrgent: false,
      })
    } else if (a.overallScore >= 55) {
      pushQueue(out, {
        patientId: pid,
        patientName: a.patientName || patient?.fullName,
        roomNumber: roomForPatient(pid),
        triggerReason: 'High AI risk score',
        severityLevel: 'high',
        latestNursingNote: noteSnippet(list, patient, 'High AI risk score'),
        assignedNurse: patient?.assignedNurse || 'Charge RN',
        reviewStatus: 'pending',
      })
    }

    const feverHits = (t3.match(/\bfever\b|\btemp\b|\btemperature\b|\bchills\b|\brigors\b/gi) || []).length
    if (feverHits >= 2) {
      pushQueue(out, {
        patientId: pid,
        patientName: a.patientName || patient?.fullName,
        roomNumber: roomForPatient(pid),
        triggerReason: 'Repeated fever',
        severityLevel: 'high',
        latestNursingNote: noteSnippet(list, patient, 'Repeated fever'),
        assignedNurse: patient?.assignedNurse || 'Charge RN',
        reviewStatus: 'urgent',
      })
    }

    if (/\bfall\b|near fall|syncope|slumped|collapsed/i.test(t12)) {
      pushQueue(out, {
        patientId: pid,
        patientName: a.patientName || patient?.fullName,
        roomNumber: roomForPatient(pid),
        triggerReason: 'Fall incident',
        severityLevel: 'high',
        latestNursingNote: noteSnippet(list, patient, 'Fall incident'),
        assignedNurse: patient?.assignedNurse || 'Charge RN',
        reviewStatus: 'urgent',
      })
    }

    if (/\bmissed dose\b|\bheld med\b|\bmedication error\b|\brefused med\b/i.test(t12)) {
      pushQueue(out, {
        patientId: pid,
        patientName: a.patientName || patient?.fullName,
        roomNumber: roomForPatient(pid),
        triggerReason: 'Medication concern',
        severityLevel: 'moderate',
        latestNursingNote: noteSnippet(list, patient, 'Medication concern'),
        assignedNurse: patient?.assignedNurse || 'Charge RN',
        reviewStatus: 'pending',
      })
    }

    if (/\bspo2\b|\bdesat\b|\bhypox\b|\bbp\b.*1[6-9]\d\b|\bblood sugar\b.*[234][0-9]{2}/i.test(t12)) {
      pushQueue(out, {
        patientId: pid,
        patientName: a.patientName || patient?.fullName,
        roomNumber: roomForPatient(pid),
        triggerReason: 'Worsening vitals',
        severityLevel: 'high',
        latestNursingNote: noteSnippet(list, patient, 'Worsening vitals'),
        assignedNurse: patient?.assignedNurse || 'Charge RN',
        reviewStatus: 'urgent',
      })
    }

    if (/\bconfus|\bdelirium\b|\bdisorient\b|\bsundown/i.test(t12)) {
      pushQueue(out, {
        patientId: pid,
        patientName: a.patientName || patient?.fullName,
        roomNumber: roomForPatient(pid),
        triggerReason: 'Confusion / delirium',
        severityLevel: 'high',
        latestNursingNote: noteSnippet(list, patient, 'Confusion / delirium'),
        assignedNurse: patient?.assignedNurse || 'Charge RN',
        reviewStatus: 'pending',
      })
    }

    if (/\bpoor appetite\b|\bminimal intake\b|\bdry mouth\b|\bdehydrat\b|\blow po\b/i.test(t12)) {
      pushQueue(out, {
        patientId: pid,
        patientName: a.patientName || patient?.fullName,
        roomNumber: roomForPatient(pid),
        triggerReason: 'Poor intake / dehydration',
        severityLevel: 'moderate',
        latestNursingNote: noteSnippet(list, patient, 'Poor intake / dehydration'),
        assignedNurse: patient?.assignedNurse || 'Charge RN',
        reviewStatus: 'pending',
      })
    }

    if (/\bstage\s*[12]\b|\bwound\b.*(?:odor|drainage)|\bbreakdown\b|\bsacrum\b.*red/i.test(t12)) {
      pushQueue(out, {
        patientId: pid,
        patientName: a.patientName || patient?.fullName,
        roomNumber: roomForPatient(pid),
        triggerReason: 'Wound deterioration',
        severityLevel: 'moderate',
        latestNursingNote: noteSnippet(list, patient, 'Wound deterioration'),
        assignedNurse: patient?.assignedNurse || 'Charge RN',
        reviewStatus: 'pending',
      })
    }

    if (/\bunable to tolerate pt\b|\bdeclined rehab\b|\btherapy intolerance\b|\bstop pt\b/i.test(t12)) {
      pushQueue(out, {
        patientId: pid,
        patientName: a.patientName || patient?.fullName,
        roomNumber: roomForPatient(pid),
        triggerReason: 'Rehabilitation decline',
        severityLevel: 'moderate',
        latestNursingNote: noteSnippet(list, patient, 'Rehabilitation decline'),
        assignedNurse: patient?.assignedNurse || 'Charge RN',
        reviewStatus: 'pending',
      })
    }

    for (const c of a.categories || []) {
      if (c.id === 'fall_risk' && c.score >= 52 && !hasActiveQueue(out, pid, 'Fall incident')) {
        pushQueue(out, {
          patientId: pid,
          patientName: a.patientName || patient?.fullName,
          roomNumber: roomForPatient(pid),
          triggerReason: 'Fall incident',
          severityLevel: c.score >= 62 ? 'high' : 'moderate',
          latestNursingNote: noteSnippet(list, patient, 'Fall incident'),
          assignedNurse: patient?.assignedNurse || 'Charge RN',
          reviewStatus: c.score >= 62 ? 'urgent' : 'pending',
        })
      }
    }
  }

  return out
}

const OVERDUE_FLAGGED_MS = 28 * 60 * 60 * 1000

export function buildDoctorReviewAiAlerts(rows, nowMs = Date.now()) {
  const alerts = []
  const seen = new Set()
  function add(id, severity, category, title, detail) {
    if (seen.has(id)) return
    seen.add(id)
    alerts.push({ id, severity, category, title, detail })
  }

  for (const row of rows) {
    const tag = `${row.patientName} · ${row.triggerReason}`
    if (row.severityLevel === 'critical' || row.reviewStatus === 'urgent') {
      add(`crit-${row.id}`, 'high', 'Critical deterioration', `${severityDisplay(row.severityLevel)} · ${row.triggerReason}`, tag)
    }

    const flaggedMs = new Date(row.timeFlagged).getTime()
    if (
      ['pending', 'urgent'].includes(row.reviewStatus) &&
      Number.isFinite(flaggedMs) &&
      nowMs - flaggedMs > OVERDUE_FLAGGED_MS
    ) {
      add(`ov-${row.id}`, 'high', 'Doctor review overdue', 'Flagged beyond demo SLA window', tag)
    }

    if (row.escalatedUrgent && row.reviewStatus !== 'resolved') {
      add(`esc-${row.id}`, 'high', 'Escalation required', 'Marked urgent escalation pathway', tag)
    }

    if ((row.unresolvedRepeats || 0) >= 2 && row.reviewStatus !== 'resolved') {
      add(`rep-${row.id}`, 'medium', 'Repeated unresolved issue', 'Repeat triggers logged on roster', tag)
    }

    if (row.severityLevel === 'high' || row.severityLevel === 'critical') {
      add(`hr-${row.id}`, 'medium', 'High-risk patient', `${severityDisplay(row.severityLevel)} surveillance`, tag)
    }
  }

  return alerts
}

export function doctorReviewLoopAiSummaryBlock(rec, allRows) {
  const peer = allRows.filter((r) => r.patientId === rec.patientId && r.id !== rec.id)
  const clinical = `${rec.patientName}: primary trigger ${rec.triggerReason} (${severityDisplay(rec.severityLevel)}). Cross-check MAR, vitals, and mobility orders before bedside discussion.`

  const recentChanges =
    peer.length > 0
      ? `${peer.length} related queue entr${peer.length === 1 ? 'y' : 'ies'} on file for this resident — review clustering before disposition.`
      : 'No sibling queue rows — isolated trigger instance on current ledger.'

  const nursingActions = `Assigned nurse ${rec.assignedNurse}; narrative snapshot: ${String(rec.latestNursingNote || '').slice(0, 180)}${String(rec.latestNursingNote || '').length > 180 ? '…' : ''}`

  const doctorFocus =
    rec.triggerReason === 'Medication concern'
      ? 'Medication reconciliation, renal/hepatic dosing, PRN effectiveness.'
      : rec.triggerReason === 'Wound deterioration'
        ? 'Tissue assessment image review, culture/abx stewardship, offloading orders.'
        : rec.triggerReason === 'Confusion / delirium'
          ? 'Delirium bundle, precipitant search (infection, pain, constipation), orientation.'
          : 'Targeted work-up aligned with trigger; prioritize stability before disposition.'

  const followUp =
    Array.isArray(rec.followUpActions) && rec.followUpActions.length
      ? rec.followUpActions.map((x) => x.text).join(' · ')
      : 'Document parameters for reassessment within shift; notify charge RN if trajectory worsens.'

  const familyDraft = rec.familyNotified
    ? `POA update drafted: team aware of ${rec.triggerReason.toLowerCase()}; MD review ${rec.reviewStatus === 'reviewed' ? 'completed' : 'scheduled'} — will advise on changes after rounds.`
    : `Draft outreach: ${rec.patientName} triggered ${rec.triggerReason}; care team coordinating provider review and will update preferred contact after evaluation.`

  return {
    clinicalConcernSummary: clinical,
    recentChanges,
    nursingActionsTaken: nursingActions,
    suggestedDoctorFocus: doctorFocus,
    followUpRecommendation: followUp,
    familyCommunicationDraft: familyDraft,
  }
}

export function doctorReviewMasterAiSummary(rows) {
  const urgentN = rows.filter((r) => r.bucket === 'urgent_cases').length
  const pendN = rows.filter((r) => r.bucket === 'pending_review').length
  return `Queue snapshot (sim): ${urgentN} urgent · ${pendN} pending — prioritize infectious/neuro declines first; reconcile overlapping triggers per resident before signing off.`
}

export function escapeCsvCell(v) {
  const s = String(v ?? '')
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function buildDoctorReviewReportCsv(rows, nowMs = Date.now()) {
  const headers = [
    'Patient',
    'Room',
    'Trigger',
    'Severity',
    'Latest nursing note',
    'Nurse',
    'Flagged',
    'Doctor',
    'Status',
    'Bucket',
    'Escalated',
    'Family notified',
  ]
  const lines = [headers.map(escapeCsvCell).join(',')]
  for (const r of rows) {
    lines.push(
      [
        r.patientName,
        r.roomNumber,
        r.triggerReason,
        r.severityLevel,
        r.latestNursingNote,
        r.assignedNurse,
        r.timeFlagged,
        r.doctorAssigned,
        r.reviewStatus,
        doctorReviewBucket(r, nowMs),
        r.escalatedUrgent ? 'yes' : 'no',
        r.familyNotified ? 'yes' : 'no',
      ]
        .map(escapeCsvCell)
        .join(','),
    )
  }
  return lines.join('\r\n')
}

export function buildPrintableDoctorReviewHtml(rows, title = 'Doctor review report') {
  const rowsHtml = rows
    .map(
      (r) => `
    <tr>
      <td>${escapeHtml(r.patientName)}</td>
      <td>${escapeHtml(r.roomNumber)}</td>
      <td>${escapeHtml(r.triggerReason)}</td>
      <td>${escapeHtml(r.severityLevel)}</td>
      <td>${escapeHtml(r.reviewStatus)}</td>
      <td>${escapeHtml(String(r.latestNursingNote || '').slice(0, 160))}</td>
    </tr>`,
    )
    .join('')
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title>
  <style>
    body{font-family:system-ui,sans-serif;padding:16px;color:#111}
    h1{font-size:18px}
    table{border-collapse:collapse;width:100%;margin-top:12px;font-size:11px}
    th,td{border:1px solid #ccc;padding:6px;text-align:left}
    th{background:#f4f4f5}
    .meta{font-size:11px;color:#555;margin-top:8px}
  </style></head><body>
  <h1>${escapeHtml(title)}</h1>
  <p class="meta">Generated ${escapeHtml(new Date().toLocaleString())} · Simulation only</p>
  <table><thead><tr><th>Patient</th><th>Room</th><th>Trigger</th><th>Severity</th><th>Status</th><th>Note excerpt</th></tr></thead><tbody>${rowsHtml}</tbody></table>
  </body></html>`
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
