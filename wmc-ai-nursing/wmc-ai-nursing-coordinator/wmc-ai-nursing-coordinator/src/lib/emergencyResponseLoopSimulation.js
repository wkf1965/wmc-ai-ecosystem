import {
  mergeEmergencyResponseRecords,
  readEmergencyResponseLoopRaw,
  ensureEmergencyResponseBaseline,
} from '../db/emergencyResponseLoopStorage.js'

/** @typedef {'active_emergency'|'pending_doctor'|'ambulance_required'|'resolved'|'follow_up'} EmergencyBoardBucket */

/**
 * Mutually exclusive board placement (simulation).
 * @returns {EmergencyBoardBucket}
 */
export function emergencyBoardBucket(rec) {
  const st = String(rec.outcomeStatus || '').toLowerCase()
  if (st === 'resolved') return 'resolved'
  if (st === 'follow_up') return 'follow_up'
  if (rec.ambulanceCalled) return 'ambulance_required'
  if (rec.doctorNotified && !rec.doctorResponded) return 'pending_doctor'
  return 'active_emergency'
}

export function listEmergencyRecordsWithBuckets(patients) {
  const merged = mergeEmergencyResponseRecords(patients)
  return merged.map((r) => ({
    ...r,
    bucket: emergencyBoardBucket(r),
  }))
}

export function formatDetected(iso) {
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

export function severityDisplay(sev) {
  const s = String(sev || '').toLowerCase()
  if (s === 'code_red') return 'Code Red'
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '—'
}

export function severityBadgeVariant(sev) {
  const s = String(sev || '').toLowerCase()
  if (s === 'code_red' || s === 'critical') return 'danger'
  if (s === 'severe') return 'warning'
  if (s === 'moderate') return 'info'
  return 'success'
}

export function buildEmergencyLoopAiAlerts(records) {
  const alerts = []
  const seen = new Set()
  function add(id, severity, category, title, detail) {
    if (seen.has(id)) return
    seen.add(id)
    alerts.push({ id, severity, category, title, detail })
  }

  for (const row of records) {
    if (String(row.outcomeStatus).toLowerCase() === 'resolved') continue
    const tag = `${row.patientName} · Rm ${row.roomNumber}`
    const sev = String(row.severityLevel || '').toLowerCase()
    const ot = row.emergencyType

    if (sev === 'critical' || sev === 'code_red') {
      add(`crit-${row.id}`, 'high', 'Critical emergency', `${severityDisplay(row.severityLevel)} event`, tag)
    }

    if (ot === 'Stroke symptoms') {
      add(`stroke-${row.id}`, 'critical', 'Stroke warning', 'FAST narrative · prioritize EMS/neuro pathway', tag)
    }

    if (ot === 'Fall incident' && (row.injuryRiskFlag || ['moderate', 'severe', 'critical', 'code_red'].includes(sev))) {
      add(`fall-${row.id}`, 'high', 'Fall with injury risk', 'Neuro checks · mobility precautions · provider awareness', tag)
    }

    if (ot === 'Low oxygen' || (String(row.actionTaken).toLowerCase().includes('o₂') && sev !== 'mild')) {
      add(`o2-${row.id}`, 'high', 'Low oxygen warning', 'SpO₂ trend · escalate per facility protocol', tag)
    }

    if (row.sepsisRiskFlag || (ot === 'High fever' && ['severe', 'critical', 'code_red'].includes(sev))) {
      add(`sep-${row.id}`, 'high', 'Sepsis warning', 'Source assessment · vitals package · MD engagement', tag)
    }

    if (ot === 'Medication reaction') {
      add(`rx-${row.id}`, 'high', 'Medication reaction concern', 'MAR review · hold suspect agents · monitor airway', tag)
    }
  }

  return alerts
}

export function emergencyScoreTotalsDisplay() {
  const raw = readEmergencyResponseLoopRaw()
  ensureEmergencyResponseBaseline()
  const b = raw.baseline || { mild: 0, moderate: 0, severe: 0, critical: 0, codeRed: 0 }
  const s = raw.scores || {}
  return {
    mild: b.mild + (s.mild ?? 0),
    moderate: b.moderate + (s.moderate ?? 0),
    severe: b.severe + (s.severe ?? 0),
    critical: b.critical + (s.critical ?? 0),
    codeRed: b.codeRed + (s.codeRed ?? 0),
  }
}

export function emergencyLoopAiSummary(records) {
  const open = records.filter((r) => r.outcomeStatus === 'active')
  const pendingMd = records.filter((r) => r.doctorNotified && !r.doctorResponded && r.outcomeStatus === 'active')
  const ems = records.filter((r) => r.ambulanceCalled && r.outcomeStatus === 'active')

  const hot = [...records].sort((a, b) => {
    const rank = { code_red: 5, critical: 4, severe: 3, moderate: 2, mild: 1 }
    return (rank[String(b.severityLevel)] || 0) - (rank[String(a.severityLevel)] || 0)
  })[0]

  const immediateChecklist =
    open.length === 0
      ? 'No active emergencies on board — keep assignment radios charged and crash cart checks current.'
      : [
          `Scene safety & staffing backup (${open.length} active row${open.length === 1 ? '' : 's'})`,
          pendingMd.length ? `Close MD loop on ${pendingMd.length} pending response${pendingMd.length === 1 ? '' : 's'}` : 'Confirm MD awareness on critical tiers',
          ems.length ? `${ems.length} EMS pathway — designate intercept nurse & clear egress` : 'Verify facility EMS staging route',
          'Repeat vitals · update observer sheet · document times accurately',
        ].join(' · ')

  const doctorHandover = hot
    ? `${hot.patientName} (${hot.roomNumber}): ${hot.emergencyType}, ${severityDisplay(hot.severityLevel)} since ${formatDetected(hot.timeDetected)}. Actions: ${hot.actionTaken}. Notifications — MD:${hot.doctorNotified ? 'Y' : 'N'} Fam:${hot.familyNotified ? 'Y' : 'N'} EMS:${hot.ambulanceCalled ? 'Y' : 'N'}`
    : 'No incidents queued for handover.'

  const familyDraft = hot
    ? `Update for POA: We initiated emergency protocols for ${hot.emergencyType.toLowerCase()}. ${hot.familyNotified ? 'Your family contact was notified.' : 'We are reaching your preferred contact now.'} Care team is monitoring ${hot.patientName} closely; we will share changes as they occur.`
    : 'No open incident requiring an outbound family script — standby messaging below applies when events resume.'

  const incidentNarrative = hot
    ? `Incident summary (sim): ${hot.emergencyType} · Severity ${severityDisplay(hot.severityLevel)} · Nurse ${hot.nurseInCharge} · Timeline ${formatDetected(hot.timeDetected)} — ${hot.actionTaken}`
    : 'No primary incident selected — export CSV for full ledger.'

  const followUpCare =
    records.filter((r) => r.outcomeStatus === 'follow_up').length > 0
      ? `${records.filter((r) => r.outcomeStatus === 'follow_up').length} case(s) flagged for follow-up: neuro checks, wound/skin surveillance, pharmacy review for reactions, and reassessment within 24h per policy (demo guidance).`
      : 'No explicit follow-up queue — after resolution, document education and mobility precautions.'

  return {
    immediateActionChecklist: immediateChecklist,
    doctorHandoverSummary: doctorHandover,
    familyUpdateDraft: familyDraft,
    incidentReportSummary: incidentNarrative,
    followUpCareRecommendation: followUpCare,
  }
}

export function escapeCsvCell(v) {
  const s = String(v ?? '')
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function buildIncidentReportCsv(records) {
  const headers = [
    'Patient',
    'Room',
    'Emergency type',
    'Severity',
    'Time detected',
    'Nurse',
    'Actions',
    'Doctor notified',
    'Doctor responded',
    'Family notified',
    'Ambulance',
    'Supervisor notified',
    'Outcome',
    'Board bucket',
  ]
  const lines = [headers.map(escapeCsvCell).join(',')]
  for (const r of records) {
    lines.push(
      [
        r.patientName,
        r.roomNumber,
        r.emergencyType,
        r.severityLevel,
        r.timeDetected,
        r.nurseInCharge,
        r.actionTaken,
        r.doctorNotified ? 'yes' : 'no',
        r.doctorResponded ? 'yes' : 'no',
        r.familyNotified ? 'yes' : 'no',
        r.ambulanceCalled ? 'yes' : 'no',
        r.supervisorNotified ? 'yes' : 'no',
        r.outcomeStatus,
        emergencyBoardBucket(r),
      ]
        .map(escapeCsvCell)
        .join(','),
    )
  }
  return lines.join('\r\n')
}
