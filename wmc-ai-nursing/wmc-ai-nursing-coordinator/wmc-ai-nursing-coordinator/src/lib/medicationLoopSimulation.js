import { mergeMedicationLoopDoses, readMedicationLoopRaw, ensureMedLoopBaseline } from '../db/medicationLoopStorage.js'
import { medLoopHighRisk } from '../data/medicationLoopSeed.js'

const DUE_BEFORE_MS = 30 * 60 * 1000
const DUE_AFTER_MS = 45 * 60 * 1000
const DELAY_GRACE_MS = 90 * 60 * 1000

function todayLocalStr(nowMs = Date.now()) {
  const d = new Date(nowMs)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function dueMsToday(timeDue, nowMs = Date.now()) {
  const parts = String(timeDue || '').trim().match(/^(\d{1,2}):(\d{2})/)
  if (!parts) return NaN
  const hh = Number(parts[1])
  const mm = Number(parts[2])
  const d = new Date(nowMs)
  d.setHours(hh, mm, 0, 0)
  return d.getTime()
}

function noteTimeMs(note) {
  if (note.createdAt) return new Date(note.createdAt).getTime()
  if (note.date) return new Date(`${note.date}T15:00:00`).getTime()
  return 0
}

function vitalsConcerning(note) {
  if (!note) return false
  const bp = String(note.bloodPressure || '').match(/(\d{2,3})\s*\/\s*(\d{2,3})/)
  if (bp) {
    const sys = Number(bp[1])
    if (sys < 90 || sys > 180) return true
  }
  const bs = String(note.bloodSugar || '').match(/(\d{2,3})/)
  if (bs) {
    const g = Number(bs[1])
    if (g < 60 || g > 300) return true
  }
  const text = `${note.abnormalEvents || ''} ${note.nurseRemarks || ''}`.toLowerCase()
  return ['desat', 'hypoxia', 'vomit', 'rash', 'anaphyl', 'wheeze', 'tachy'].some((w) => text.includes(w))
}

/** @returns {'due_now'|'upcoming'|'missed'|'completed'} */
export function medicationBoardBucket(row, nowMs = Date.now()) {
  const today = todayLocalStr(nowMs)
  if (row.adminStatus === 'given' && row.lastGivenDay === today) return 'completed'

  if (row.adminStatus === 'missed' || row.adminStatus === 'refused') return 'missed'

  const due = dueMsToday(row.timeDue, nowMs)
  if (!Number.isFinite(due)) return 'upcoming'

  if (row.adminStatus === 'delayed') {
    if (nowMs > due + DELAY_GRACE_MS) return 'missed'
    return 'due_now'
  }

  if (row.adminStatus === 'pending') {
    if (nowMs > due + DUE_AFTER_MS) return 'missed'
    if (nowMs >= due - DUE_BEFORE_MS) return 'due_now'
    return 'upcoming'
  }

  return 'upcoming'
}

/** Clinical MAR-style status for badges */
export function displayMedLoopStatus(row, bucket, nowMs = Date.now()) {
  if (row.adminStatus === 'given') return 'given'
  if (row.adminStatus === 'missed') return 'missed'
  if (row.adminStatus === 'refused') return 'refused'
  if (row.adminStatus === 'delayed') return 'delayed'

  const due = dueMsToday(row.timeDue, nowMs)
  if (row.adminStatus === 'pending' && Number.isFinite(due)) {
    if (nowMs > due + DUE_AFTER_MS) return 'missed'
    if (nowMs > due) return 'delayed'
    if (bucket === 'due_now') return 'due'
  }

  return 'due'
}

export function listMedicationLoopRows(patients) {
  const merged = mergeMedicationLoopDoses(patients)
  const now = Date.now()
  return merged.map((row) => {
    const bucket = medicationBoardBucket(row, now)
    const displayStatus = displayMedLoopStatus(row, bucket, now)
    const dueMs = dueMsToday(row.timeDue, now)
    const highRisk = medLoopHighRisk(row.medicationName)
    return {
      ...row,
      bucket,
      displayStatus,
      dueMs,
      highRiskMed: highRisk,
    }
  })
}

export function buildMedicationLoopAiAlerts(rows, notes = []) {
  const alerts = []
  const seen = new Set()
  function add(id, severity, category, title, detail) {
    if (seen.has(id)) return
    seen.add(id)
    alerts.push({ id, severity, category, title, detail })
  }

  const byPatient = {}
  notes.forEach((n) => {
    const pid = n.patientId
    if (!pid) return
    byPatient[pid] = byPatient[pid] || []
    byPatient[pid].push(n)
  })

  for (const row of rows) {
    const tag = `${row.patientName} · ${row.medicationName} (${row.room})`

    if (row.bucket === 'missed' && row.adminStatus !== 'refused') {
      const detail =
        row.adminStatus === 'missed'
          ? `MAR marked missed — ${row.medicationName}`
          : `Dose not administered — ${row.medicationName}`
      add(`miss-${row.id}`, 'high', 'Missed medication', detail, tag)
    }

    if ((row.delayCount || 0) >= 2) {
      add(`repeat-${row.id}`, 'medium', 'Repeated delay', `Multiple delay cycles logged`, tag)
    }

    if (row.highRiskMed && row.bucket !== 'completed') {
      add(`hr-${row.id}`, 'high', 'High-risk medication', `${row.medicationName} needs verification`, tag)
    }

    if (row.adminStatus === 'refused') {
      add(`ref-${row.id}`, 'medium', 'Medication refused', `Patient declined dose`, tag)
    }

    if (row.adminStatus === 'given' && row.lastGivenAt) {
      const t0 = new Date(row.lastGivenAt).getTime()
      const patientNotes = byPatient[row.patientId] || []
      const followUps = patientNotes.filter((n) => {
        const nt = noteTimeMs(n)
        return nt >= t0 && nt <= t0 + 4 * 60 * 60 * 1000
      })
      if (followUps.some(vitalsConcerning) || row.simAbnormalPostDose) {
        add(`vit-${row.id}`, 'high', 'Abnormal vitals after medication', `Post-admin surveillance signal`, tag)
      }
    }

    if (row.doctorEscalated || (row.highRiskMed && row.bucket === 'missed')) {
      add(`doc-${row.id}`, row.doctorEscalated ? 'high' : 'medium', 'Doctor review needed', `Escalation / high-risk gap`, tag)
    }
  }

  return alerts
}

export function scoreTotalsDisplay() {
  const raw = readMedicationLoopRaw()
  ensureMedLoopBaseline()
  const b = raw.baseline || { onTime: 0, late: 0, missed: 0, refused: 0, escalated: 0 }
  const s = raw.scores || {}
  return {
    onTime: b.onTime + (s.onTime ?? 0),
    late: b.late + (s.late ?? 0),
    missed: b.missed + (s.missed ?? 0),
    refused: b.refused + (s.refused ?? 0),
    escalated: b.escalated + (s.escalated ?? 0),
  }
}

export function medicationLoopAiSummary(rows) {
  const missedPatients = new Set()
  rows.forEach((r) => {
    if (r.bucket === 'missed') missedPatients.add(r.patientId)
  })

  const highRiskOpen = rows.filter((r) => r.highRiskMed && r.bucket !== 'completed').length

  const sc = scoreTotalsDisplay()
  const denom = sc.onTime + sc.late + sc.missed + sc.refused
  const compliancePct = denom > 0 ? Math.round((100 * (sc.onTime + sc.late * 0.5)) / denom) : 88

  const docLines = []
  rows.forEach((r) => {
    if (r.doctorEscalated) docLines.push(`${r.patientName}: escalated · ${r.medicationName}`)
    else if (r.highRiskMed && r.bucket === 'missed') docLines.push(`${r.patientName}: high-risk missed · ${r.medicationName}`)
  })
  const doctorReviewRecommendations =
    docLines.length > 0 ? docLines.slice(0, 6).join(' · ') : 'No queued recommendations — continue MAR audits.'

  return {
    patientsWithMissedMed: missedPatients.size,
    highRiskMedicationCases: highRiskOpen,
    nurseCompliancePct: Math.min(99, Math.max(55, compliancePct)),
    doctorReviewRecommendations,
  }
}

export function buildMedicationLoopPrintText(rows) {
  const lines = [
    'Medication Loop Report (simulation)',
    `Generated ${new Date().toLocaleString()}`,
    '',
    'Patient | Room | Medication | Due | Status | Nurse',
    '-'.repeat(72),
  ]
  rows.forEach((r) => {
    lines.push(
      `${r.patientName} | ${r.room} | ${r.medicationName} ${r.dosage} | ${r.timeDue} | ${r.displayStatus} | ${r.nurseAssigned}`,
    )
  })
  return lines.join('\n')
}
